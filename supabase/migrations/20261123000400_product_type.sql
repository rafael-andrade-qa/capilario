-- Capilário | tipo do produto (geleia, creme de pentear, leave-in...)
--
-- O app explica cada tipo (o que é, pra que serve, em que etapa entra). O tipo vem do item do
-- catálogo quando o produto foi escolhido de lá; no cadastro à mão, a pessoa escolhe. Os
-- valores são os mesmos do catálogo (scripts/catalog/normalize.mjs).

alter table public.experiments add column category text;
alter table public.experiments add constraint experiments_category_check check (
  category is null or category in (
    'shampoo', 'shampoo_seco', 'co_wash', 'pre_shampoo', 'condicionador', 'mascara', 'ampola',
    'leave_in', 'creme_pentear', 'ativador', 'gelatina', 'geleia', 'gel', 'mousse', 'pomada', 'cera',
    'pasta', 'spray', 'oleo', 'serum', 'protetor_termico', 'reativador', 'tonico', 'acidificante',
    'manteiga', 'finalizador', 'tratamento'
  )
);

-- A pessoa pode trocar o tipo do próprio produto (a política experiments_update_own já
-- limita às linhas dela).
grant update (category) on public.experiments to authenticated;

-- Produtos que já existem: pelo item do catálogo ligado e, sem ele, pelo nome e marca iguais.
update public.experiments e set category = c.category
from public.catalog_products c
where e.category is null and e.catalog_product_id = c.id;

update public.experiments e set category = (
  select c.category
  from public.catalog_products c
  join public.catalog_brands b on b.id = c.brand_id
  where lower(c.name) = lower(e.product_name) and lower(b.name) = lower(coalesce(e.brand, ''))
  order by c.popularity desc nulls last
  limit 1
)
where e.category is null and e.product_mode = 'named';

-- create_product passa a gravar o tipo: o escolhido ou, sem ele, o do item do catálogo.
drop function if exists public.create_product(uuid, text, text, text);

create or replace function public.create_product(p_experiment_id uuid, p_name text, p_brand text, p_catalog_id text default null, p_category text default null)
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
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
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
    select c.id, coalesce(v_category, c.category) into v_catalog, v_category
    from public.catalog_products c where c.id = p_catalog_id;
    v_category := coalesce(v_category, nullif(btrim(coalesce(p_category, '')), ''));
  end if;

  insert into public.experiments (id, user_id, product_mode, product_name, brand, catalog_product_id, category)
  values (p_experiment_id, v_uid, 'named', v_name, v_brand, v_catalog, v_category);

  return jsonb_build_object('experiment_id', p_experiment_id, 'created', true);
end;
$$;

revoke all on function public.create_product(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_product(uuid, text, text, text, text) to authenticated;
