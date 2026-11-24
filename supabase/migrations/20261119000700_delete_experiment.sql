-- Capilário | exclusão de um produto inteiro (experimento)
--
-- Apaga o experimento com todas as etapas e fotos numa transação e devolve os
-- caminhos dos arquivos (fotos das etapas e foto do produto) para o app remover
-- do Storage. Sem a linha no banco, a política de exclusão libera esses arquivos.
-- SECURITY INVOKER (RLS vale) e idempotente: repetir devolve deleted = false.

create or replace function public.delete_experiment(p_experiment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_product_photo text;
  v_paths jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select e.photo_path into v_product_photo
  from public.experiments e
  where e.id = p_experiment_id and e.user_id = v_uid;
  if not found then
    return jsonb_build_object('deleted', false, 'paths', '[]'::jsonb);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || p_experiment_id::text, 0));

  with gone as (
    delete from public.photos p
    using public.stages s
    where p.stage_id = s.id and s.experiment_id = p_experiment_id and p.user_id = v_uid
    returning p.storage_path
  )
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from gone;

  delete from public.stages s where s.experiment_id = p_experiment_id and s.user_id = v_uid;
  delete from public.experiments e where e.id = p_experiment_id and e.user_id = v_uid;

  if v_product_photo is not null then
    v_paths := v_paths || jsonb_build_array(v_product_photo);
  end if;

  return jsonb_build_object('deleted', true, 'paths', v_paths);
end;
$$;

revoke all on function public.delete_experiment(uuid) from public, anon;
grant execute on function public.delete_experiment(uuid) to authenticated;
