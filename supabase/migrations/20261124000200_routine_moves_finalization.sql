-- Capilário | a rotina decide onde a finalização fica
--
-- A finalização é a unidade do app; o produto é um ingrediente dela. Ela continua guardada num
-- produto (o "principal", para a aba Produtos e o histórico antigo), mas a pessoa não escolhe nem
-- vê isso: ao gravar a rotina, o principal é o primeiro produto de fixar, senão o de definir,
-- senão o de finalizar; sem nenhum deles, "Sem finalizador". Se mudou, a finalização (e os
-- momentos dela) passam para o novo produto. Assim qualquer produto pode sair da rotina.

-- Os momentos acompanham a finalização quando ela muda de produto.
alter table public.stages drop constraint stages_finalization_fk;
alter table public.stages add constraint stages_finalization_fk foreign key (finalization_id, experiment_id)
  references public.finalizations (id, experiment_id) on delete cascade on update cascade;

create or replace function public.set_routine(p_finalization_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid;
  v_principal uuid;
  v_item jsonb;
  v_pos int := 0;
  v_exp uuid;
  v_step text;
  v_kind text;
  v_seen uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    raise exception 'routine_invalid' using errcode = '22023';
  end if;

  select f.experiment_id into v_current
  from public.finalizations f
  where f.id = p_finalization_id and f.user_id = v_uid
  for update;
  if not found then
    raise exception 'finalization_not_found' using errcode = 'P0002';
  end if;

  delete from public.routine_items r where r.finalization_id = p_finalization_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_exp := nullif(v_item ->> 'experiment_id', '')::uuid;
    v_step := v_item ->> 'step';
    v_kind := nullif(v_item ->> 'mask_kind', '');
    if v_exp is null or v_exp = any (v_seen) then
      continue;
    end if;
    if not exists (select 1 from public.experiments e where e.id = v_exp and e.user_id = v_uid and e.product_mode = 'named') then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
    if v_step is null or v_step not in ('wash', 'condition', 'mask', 'prep', 'shape', 'hold', 'finish') then
      raise exception 'routine_invalid' using errcode = '22023', detail = 'step';
    end if;
    if v_step <> 'mask' then
      v_kind := null;
    end if;
    insert into public.routine_items (finalization_id, user_id, step, position, experiment_id, mask_kind)
    values (p_finalization_id, v_uid, v_step, v_pos, v_exp, v_kind);
    v_seen := v_seen || v_exp;
    v_pos := v_pos + 1;
  end loop;

  -- Principal: fixar, senão definir, senão finalizar (o primeiro de cada); sem nenhum, Sem finalizador.
  select r.experiment_id into v_principal
  from public.routine_items r
  where r.finalization_id = p_finalization_id and r.step in ('hold', 'shape', 'finish')
  order by case r.step when 'hold' then 0 when 'shape' then 1 else 2 end, r.position
  limit 1;

  if v_principal is null then
    select e.id into v_principal
    from public.experiments e
    where e.user_id = v_uid and e.product_mode = 'none'
    order by e.created_at
    limit 1;
    if v_principal is null then
      v_principal := gen_random_uuid();
      insert into public.experiments (id, user_id, product_mode) values (v_principal, v_uid, 'none');
    end if;
  end if;

  if v_principal <> v_current then
    -- Mesma trava do registro de momentos nos dois produtos (evita corrida com finalize_stage).
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_current::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_principal::text, 0));
    update public.finalizations f set experiment_id = v_principal where f.id = p_finalization_id;
  end if;

  return jsonb_build_object('finalization_id', p_finalization_id, 'items', v_pos, 'experiment_id', v_principal, 'moved', v_principal <> v_current);
end;
$$;

revoke all on function public.set_routine(uuid, jsonb) from public, anon;
grant execute on function public.set_routine(uuid, jsonb) to authenticated;
