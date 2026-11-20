-- Projeto Capilar | produto primeiro
--
-- O produto passa a existir por conta própria: dá para cadastrar um produto sem nenhuma
-- foto e registrar as finalizações depois, dentro dele. Por isso:
--   * create_product cadastra nome e marca (sem repetir um produto do histórico);
--   * excluir o último momento não apaga mais o produto (ele só sai pela lixeira do produto).

-- Cadastrar produto. Idempotente pelo id (repetir a chamada não cria outro).
-- SECURITY DEFINER pelo mesmo motivo de update_experiment: a regra de "sem produto
-- repetido" vale sempre; toda consulta filtra pelo dono (auth.uid()).
create or replace function public.create_product(p_experiment_id uuid, p_name text, p_brand text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
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

  insert into public.experiments (id, user_id, product_mode, product_name, brand)
  values (p_experiment_id, v_uid, 'named', v_name, v_brand);

  return jsonb_build_object('experiment_id', p_experiment_id, 'created', true);
end;
$$;

revoke all on function public.create_product(uuid, text, text) from public, anon;
grant execute on function public.create_product(uuid, text, text) to authenticated;

-- delete_stage: o momento sai, a finalização vazia sai; o produto fica.
create or replace function public.delete_stage(p_stage_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_experiment_id uuid;
  v_fin uuid;
  v_paths jsonb;
  v_finalization_deleted boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select s.experiment_id, s.finalization_id into v_experiment_id, v_fin
  from public.stages s
  where s.id = p_stage_id and s.user_id = v_uid;

  if v_experiment_id is null then
    return jsonb_build_object('deleted', false, 'experiment_deleted', false, 'finalization_deleted', false, 'paths', '[]'::jsonb);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment_id::text, 0));

  with gone as (
    delete from public.photos p
    where p.stage_id = p_stage_id and p.user_id = v_uid
    returning p.storage_path
  )
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from gone;

  delete from public.stages s where s.id = p_stage_id and s.user_id = v_uid;

  if not exists (select 1 from public.stages s where s.finalization_id = v_fin) then
    delete from public.finalizations f where f.id = v_fin and f.user_id = v_uid;
    v_finalization_deleted := true;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'experiment_id', v_experiment_id,
    'finalization_id', v_fin,
    'experiment_deleted', false,
    'finalization_deleted', v_finalization_deleted,
    'paths', v_paths
  );
end;
$$;

revoke all on function public.delete_stage(uuid) from public, anon;
grant execute on function public.delete_stage(uuid) to authenticated;
