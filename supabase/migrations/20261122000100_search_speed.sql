-- Projeto Capilar | busca do catálogo mais rápida
--
-- Mesmo resultado de antes, menos trabalho:
--   * busca exata: "todas as palavras aparecem" vira um único LIKE ALL (antes, uma subconsulta
--     por produto);
--   * busca com erro de digitação ("todecaxo"): antes media a semelhança de cada palavra com os
--     19 mil produtos (~1 s). Agora o índice de trigramas já separa os candidatos parecidos com a
--     primeira palavra (limite 0,5, o mesmo de antes) e só eles passam pela conta (~15 ms).
--
-- E a regra de "editar o enquadramento" das fotos passa a calcular o dono uma vez por consulta,
-- e não uma vez por linha (aviso de performance do Supabase).

create or replace function public.search_catalog(
  p_query text,
  p_brand text default null,
  p_audience text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id text,
  name text,
  brand text,
  brand_id text,
  line text,
  category text,
  audience text,
  image_path text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_raw text := btrim(regexp_replace(extensions.unaccent(lower(coalesce(p_query, ''))), '\s+', ' ', 'g'));
  v_words text[] := case when v_raw = '' then '{}'::text[] else string_to_array(v_raw, ' ') end;
  v_likes text[] := array(select '%' || w || '%' from unnest(v_words) w);
  v_long text[] := array(select w from unnest(v_words) w where length(w) >= 3);
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_found boolean := false;
begin
  for id, name, brand, brand_id, line, category, audience, image_path in
    select p.id, p.name, b.name, p.brand_id, p.line, p.category, p.audience, p.image_path
    from public.catalog_products p
    join public.catalog_brands b on b.id = p.brand_id
    where (p_brand is null or p.brand_id = p_brand)
      and (p_audience is null or p.audience = p_audience or (p_audience = 'masculino' and p.category in ('pomada', 'cera', 'pasta')))
      and p.search_text like all (v_likes)
    order by
      case when v_raw = '' then 0 else extensions.word_similarity(v_raw, p.search_text) end desc,
      p.popularity desc,
      p.name
    limit v_limit offset v_offset
  loop
    v_found := true;
    return next;
  end loop;

  if v_found or v_raw = '' or v_offset > 0 or cardinality(v_long) = 0 then
    return;
  end if;

  -- Cada palavra (de 3 letras ou mais) precisa aparecer pelo menos parecida. O limite do operador
  -- <% (usado pelo índice) vale só nesta transação; o mesmo 0,5 de sempre.
  perform pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  return query
    select p.id, p.name, b.name, p.brand_id, p.line, p.category, p.audience, p.image_path
    from public.catalog_products p
    join public.catalog_brands b on b.id = p.brand_id
    where (p_brand is null or p.brand_id = p_brand)
      and (p_audience is null or p.audience = p_audience or (p_audience = 'masculino' and p.category in ('pomada', 'cera', 'pasta')))
      -- usa o índice: candidatos parecidos com a primeira palavra (semelhança >= 0,5)
      and v_long[1] operator(extensions.<%) p.search_text
      and not exists (
        select 1 from unnest(v_long) w
        where extensions.word_similarity(w, p.search_text) < 0.5
      )
    order by
      (select sum(extensions.word_similarity(w, p.search_text)) from unnest(v_long) w) desc,
      p.popularity desc
    limit v_limit;
end;
$$;

revoke all on function public.search_catalog(text, text, text, integer, integer) from public, anon;
grant execute on function public.search_catalog(text, text, text, integer, integer) to authenticated;

alter policy photos_update_own on public.photos
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
