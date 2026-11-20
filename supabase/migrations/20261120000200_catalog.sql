-- Projeto Capilar | catálogo de produtos de cabelo
--
-- Um catálogo compartilhado (o mesmo para todas as contas) com marcas e produtos já com foto
-- padronizada. Quem está logado só lê; quem grava é o script de carga (chave secreta, fora do
-- app). O produto do histórico guarda de qual item do catálogo veio, mas copia nome, marca e
-- foto: mudar o catálogo não mexe no histórico de ninguém.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table public.catalog_brands (
  id text primary key,                     -- slug estável (ex.: widi-care)
  name text not null,
  -- Para onde a marca puxa: masculino quando a maior parte da linha é masculina.
  audience text not null default 'geral' check (audience in ('geral', 'masculino', 'feminino')),
  product_count integer not null default 0
);

create table public.catalog_products (
  id text primary key,                     -- slug estável: marca + nome
  brand_id text not null references public.catalog_brands (id) on delete cascade,
  name text not null,                      -- sem a marca e sem tamanho
  retail_name text not null,               -- como a loja escreve (entra na busca)
  line text,
  category text not null,                  -- shampoo, condicionador, pomada... (ver o script)
  audience text not null default 'unissex' check (audience in ('unissex', 'masculino', 'feminino')),
  hair_types text[] not null default '{}',
  eans text[] not null default '{}',       -- códigos de barras (para ler com a câmera no futuro)
  sizes text[] not null default '{}',
  image_path text,                         -- no bucket público "catalog"
  source text not null,                    -- loja de onde vieram os dados
  source_url text,
  search_text text not null,               -- marca, nome, linha e tipo, minúsculo e sem acento
  popularity integer not null default 0,
  updated_at timestamptz not null default now()
);

create index catalog_products_brand on public.catalog_products (brand_id);
create index catalog_products_search on public.catalog_products using gin (search_text extensions.gin_trgm_ops);
create index catalog_products_eans on public.catalog_products using gin (eans);

alter table public.catalog_brands enable row level security;
alter table public.catalog_products enable row level security;
revoke all on table public.catalog_brands, public.catalog_products from public, anon, authenticated;
grant select on table public.catalog_brands, public.catalog_products to authenticated;
create policy "catalogo: leitura para quem entrou" on public.catalog_brands for select to authenticated using (true);
create policy "catalogo: leitura para quem entrou" on public.catalog_products for select to authenticated using (true);

-- Fotos do catálogo: bucket público (são fotos de vitrine, não pessoais), só WebP pequeno.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- De qual item do catálogo o produto do histórico veio (opcional).
alter table public.experiments
  add column catalog_product_id text references public.catalog_products (id) on delete set null;

-- Busca: todas as palavras precisam aparecer (sem acento); se nada aparecer, tenta por
-- semelhança, para aguentar erro de digitação ("todecaxo" acha "Todecacho").
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
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_found boolean := false;
begin
  for id, name, brand, brand_id, line, category, audience, image_path in
    select p.id, p.name, b.name, p.brand_id, p.line, p.category, p.audience, p.image_path
    from public.catalog_products p
    join public.catalog_brands b on b.id = p.brand_id
    where (p_brand is null or p.brand_id = p_brand)
      and (p_audience is null or p.audience = p_audience)
      and not exists (select 1 from unnest(v_words) w where p.search_text not like '%' || w || '%')
    order by
      case when v_raw = '' then 0 else extensions.word_similarity(v_raw, p.search_text) end desc,
      p.popularity desc,
      p.name
    limit v_limit offset v_offset
  loop
    v_found := true;
    return next;
  end loop;

  if v_found or v_raw = '' or v_offset > 0 then
    return;
  end if;

  -- Cada palavra (de 3 letras ou mais) precisa aparecer pelo menos parecida.
  return query
    select p.id, p.name, b.name, p.brand_id, p.line, p.category, p.audience, p.image_path
    from public.catalog_products p
    join public.catalog_brands b on b.id = p.brand_id
    where (p_brand is null or p.brand_id = p_brand)
      and (p_audience is null or p.audience = p_audience)
      and exists (select 1 from unnest(v_words) w where length(w) >= 3)
      and not exists (
        select 1 from unnest(v_words) w
        where length(w) >= 3 and extensions.word_similarity(w, p.search_text) < 0.5
      )
    order by
      (select sum(extensions.word_similarity(w, p.search_text)) from unnest(v_words) w where length(w) >= 3) desc,
      p.popularity desc
    limit v_limit;
end;
$$;

revoke all on function public.search_catalog(text, text, text, integer, integer) from public, anon;
grant execute on function public.search_catalog(text, text, text, integer, integer) to authenticated;

-- create_product passa a aceitar o item do catálogo (opcional). A regra de "sem produto
-- repetido" continua igual.
drop function if exists public.create_product(uuid, text, text);

create or replace function public.create_product(p_experiment_id uuid, p_name text, p_brand text, p_catalog_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_catalog text := null;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'product_name_required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_product:' || v_uid::text, 0));

  if exists (select 1 from public.experiments e where e.id = p_experiment_id) then
    if exists (select 1 from public.experiments e where e.id = p_experiment_id and e.user_id = v_uid) then
      return jsonb_build_object('experiment_id', p_experiment_id, 'created', false);
    end if;
    raise exception 'experiment_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.experiments e
    where e.user_id = v_uid and e.product_mode = 'named'
      and lower(e.product_name) = lower(v_name)
      and lower(coalesce(e.brand, '')) = lower(coalesce(v_brand, ''))
  ) then
    raise exception 'product_exists' using errcode = '23505';
  end if;

  if p_catalog_id is not null then
    select c.id into v_catalog from public.catalog_products c where c.id = p_catalog_id;
  end if;

  insert into public.experiments (id, user_id, product_mode, product_name, brand, catalog_product_id)
  values (p_experiment_id, v_uid, 'named', v_name, v_brand, v_catalog);

  return jsonb_build_object('experiment_id', p_experiment_id, 'created', true);
end;
$$;

revoke all on function public.create_product(uuid, text, text, text) from public, anon;
grant execute on function public.create_product(uuid, text, text, text) to authenticated;
