-- Projeto Capilar | casar o rótulo lido pela IA com o catálogo
--
-- A busca da tela (search_catalog) exige todas as palavras; o nome lido no rótulo costuma vir
-- com frases de embalagem a mais ("Definição e Muito Brilho") e aí nada bate. Esta função
-- filtra pela marca e ordena pela semelhança do nome; quem decide se é o mesmo produto é a
-- função identify-product (compara as palavras).

create or replace function public.match_catalog(p_brand text, p_name text, p_limit integer default 10)
returns table (id text, name text, brand text, image_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      btrim(extensions.unaccent(lower(coalesce(p_brand, '')))) as brand,
      btrim(extensions.unaccent(lower(coalesce(p_name, '')))) as name
  )
  select p.id, p.name, b.name, p.image_path
  from public.catalog_products p
  join public.catalog_brands b on b.id = p.brand_id
  cross join q
  where q.brand <> '' and q.name <> ''
    and (
      extensions.word_similarity(q.brand, extensions.unaccent(lower(b.name))) >= 0.6
      or extensions.unaccent(lower(p.retail_name)) like '%' || q.brand || '%'
    )
  order by extensions.word_similarity(extensions.unaccent(lower(p.name)), q.name) desc, p.popularity desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

revoke all on function public.match_catalog(text, text, integer) from public, anon;
grant execute on function public.match_catalog(text, text, integer) to authenticated;
