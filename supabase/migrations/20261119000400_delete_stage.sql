-- Capilário | exclusão de uma etapa
--
-- Apaga a etapa e as fotos dela numa transação. Se era a última etapa do
-- experimento, o experimento também sai (não fica produto vazio no histórico).
-- Os arquivos do Storage são removidos depois pelo app: assim que a linha em
-- public.photos some, a política capilar_photos_delete_own_unlinked libera o
-- objeto para o dono. Se essa remoção falhar, scripts/clean-orphans.mjs resolve.
--
-- SECURITY INVOKER: o RLS continua valendo; só o dono enxerga e apaga.
-- Idempotente: apagar de novo uma etapa que já não existe devolve deleted = false.

grant delete on public.experiments, public.stages, public.photos to authenticated;

create policy experiments_delete_own on public.experiments
  for delete to authenticated using (user_id = (select auth.uid()));
create policy stages_delete_own on public.stages
  for delete to authenticated using (user_id = (select auth.uid()));
create policy photos_delete_own on public.photos
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.delete_stage(p_stage_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_experiment_id uuid;
  v_paths jsonb;
  v_experiment_deleted boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select s.experiment_id into v_experiment_id
  from public.stages s
  where s.id = p_stage_id and s.user_id = v_uid;

  if v_experiment_id is null then
    return jsonb_build_object('deleted', false, 'experiment_deleted', false, 'paths', '[]'::jsonb);
  end if;

  -- Serializa exclusões no mesmo experimento: duas abas apagando as duas últimas
  -- etapas ao mesmo tempo não deixam um experimento vazio para trás.
  -- (Trava consultiva: SELECT ... FOR UPDATE exigiria UPDATE na tabela.)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment_id::text, 0));

  with gone as (
    delete from public.photos p
    where p.stage_id = p_stage_id and p.user_id = v_uid
    returning p.storage_path
  )
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from gone;

  delete from public.stages s where s.id = p_stage_id and s.user_id = v_uid;

  if not exists (select 1 from public.stages s where s.experiment_id = v_experiment_id) then
    delete from public.experiments e where e.id = v_experiment_id and e.user_id = v_uid;
    v_experiment_deleted := true;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'experiment_id', v_experiment_id,
    'experiment_deleted', v_experiment_deleted,
    'paths', v_paths
  );
end;
$$;

revoke all on function public.delete_stage(uuid) from public, anon;
grant execute on function public.delete_stage(uuid) to authenticated;
