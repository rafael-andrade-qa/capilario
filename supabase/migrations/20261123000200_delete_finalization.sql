-- Projeto Capilar | excluir uma finalização inteira
--
-- O lixinho da barra do produto agora escolhe a finalização: saem os momentos dela (molhado,
-- seco, dia seguinte), as fotos e a análise da IA (em cascata). O produto fica, mesmo sem
-- nenhuma finalização. Devolve os caminhos das fotos para o app apagar os arquivos depois (a
-- política do Storage só libera objetos que já não estão ligados a uma foto).

create or replace function public.delete_finalization(p_finalization_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_experiment_id uuid;
  v_paths jsonb;
  v_stages integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select s.experiment_id into v_experiment_id
  from public.stages s
  where s.finalization_id = p_finalization_id and s.user_id = v_uid
  limit 1;

  if v_experiment_id is null then
    -- Já não existe (ou não é da pessoa): nada a fazer. Uma finalização sem momentos sai também.
    delete from public.finalizations f where f.id = p_finalization_id and f.user_id = v_uid;
    return jsonb_build_object('deleted', false, 'paths', '[]'::jsonb);
  end if;

  -- Mesma trava do delete_stage: não corre junto com outra exclusão no mesmo produto.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment_id::text, 0));

  with gone as (
    delete from public.photos p
    using public.stages s
    where p.stage_id = s.id and s.finalization_id = p_finalization_id and s.user_id = v_uid and p.user_id = v_uid
    returning p.storage_path
  )
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from gone;

  delete from public.stages s where s.finalization_id = p_finalization_id and s.user_id = v_uid;
  get diagnostics v_stages = row_count;

  delete from public.finalizations f where f.id = p_finalization_id and f.user_id = v_uid;

  return jsonb_build_object(
    'deleted', true,
    'experiment_id', v_experiment_id,
    'stages', v_stages,
    'paths', v_paths
  );
end;
$$;

revoke all on function public.delete_finalization(uuid) from public, anon;
grant execute on function public.delete_finalization(uuid) to authenticated;
