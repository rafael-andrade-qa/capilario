-- Capilário | rotina da finalização
--
-- Uma finalização deixa de ser "um produto" e passa a guardar a rotina inteira do dia, por
-- etapa: lavar, condicionar, máscara, preparar, pentear e definir, fixar, finalizar. A
-- finalização continua pendurada no produto principal (o finalizador, ou "Sem finalizador"),
-- e esse produto também entra na rotina, na etapa dele.
--
-- Etapas (as mesmas do app, src/lib/routine.ts):
--   wash = lavar · condition = condicionar · mask = máscara · prep = preparar
--   shape = pentear e definir · hold = fixar · finish = finalizar
-- Máscara leva o tipo do cronograma capilar: H (hidratação), N (nutrição), R (reconstrução).

create table public.routine_items (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null,
  user_id uuid not null default auth.uid(),
  step text not null check (step in ('wash', 'condition', 'mask', 'prep', 'shape', 'hold', 'finish')),
  position smallint not null default 0 check (position between 0 and 20),
  experiment_id uuid not null,
  mask_kind text check (mask_kind is null or (step = 'mask' and mask_kind in ('H', 'N', 'R'))),
  created_at timestamptz not null default now(),
  constraint routine_items_finalization_fk foreign key (finalization_id, user_id)
    references public.finalizations (id, user_id) on delete cascade,
  constraint routine_items_experiment_fk foreign key (experiment_id, user_id)
    references public.experiments (id, user_id) on delete cascade,
  constraint routine_items_unique unique (finalization_id, experiment_id)
);

create index routine_items_finalization_idx on public.routine_items (finalization_id);
create index routine_items_experiment_idx on public.routine_items (experiment_id);

alter table public.routine_items enable row level security;
revoke all on public.routine_items from anon, authenticated;
grant select on public.routine_items to authenticated;

create policy routine_items_select_own on public.routine_items
  for select to authenticated using (user_id = (select auth.uid()));

-- Etapa de um produto pelo tipo dele (o mesmo mapa do app).
create or replace function public.routine_step_of(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category in ('shampoo', 'shampoo_seco', 'co_wash', 'pre_shampoo') then 'wash'
    when p_category = 'condicionador' then 'condition'
    when p_category in ('mascara', 'ampola', 'tratamento') then 'mask'
    when p_category in ('leave_in', 'protetor_termico', 'tonico', 'acidificante') then 'prep'
    when p_category in ('creme_pentear', 'ativador', 'manteiga', 'finalizador') then 'shape'
    when p_category in ('gelatina', 'geleia', 'gel', 'mousse') then 'hold'
    when p_category in ('oleo', 'serum', 'spray', 'pomada', 'cera', 'pasta', 'reativador') then 'finish'
    else 'hold'
  end
$$;

-- Finalizações que já existem: a rotina começa só com o produto principal.
insert into public.routine_items (finalization_id, user_id, step, position, experiment_id)
select f.id, f.user_id, public.routine_step_of(e.category), 0, e.id
from public.finalizations f
join public.experiments e on e.id = f.experiment_id
where e.product_mode = 'named'
on conflict do nothing;

-- set_routine: grava a rotina inteira de uma finalização (troca a anterior).
-- p_items: [{ "experiment_id": uuid, "step": text, "mask_kind": "H"|"N"|"R"|null }, ...], na
-- ordem em que aparecem. O produto principal da finalização sempre fica (se não vier, entra
-- na etapa dele). Só produtos da própria pessoa; no máximo 20 itens.
create or replace function public.set_routine(p_finalization_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_principal uuid;
  v_mode text;
  v_category text;
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

  select f.experiment_id, e.product_mode, e.category into v_principal, v_mode, v_category
  from public.finalizations f
  join public.experiments e on e.id = f.experiment_id
  where f.id = p_finalization_id and f.user_id = v_uid
  for update of f;
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

  -- O principal não sai da rotina.
  if v_mode = 'named' and not (v_principal = any (v_seen)) then
    insert into public.routine_items (finalization_id, user_id, step, position, experiment_id)
    values (p_finalization_id, v_uid, public.routine_step_of(v_category), v_pos, v_principal);
    v_pos := v_pos + 1;
  end if;

  return jsonb_build_object('finalization_id', p_finalization_id, 'items', v_pos);
end;
$$;

revoke all on function public.set_routine(uuid, jsonb) from public, anon;
grant execute on function public.set_routine(uuid, jsonb) to authenticated;
revoke all on function public.routine_step_of(text) from public, anon;
grant execute on function public.routine_step_of(text) to authenticated;

-- Produto novo numa finalização nova: o principal entra na rotina sozinho (versões do app
-- que ainda não mandam a rotina continuam com ela certa).
create or replace function public.routine_add_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.routine_items (finalization_id, user_id, step, position, experiment_id)
  select new.id, new.user_id, public.routine_step_of(e.category), 0, e.id
  from public.experiments e
  where e.id = new.experiment_id and e.product_mode = 'named'
  on conflict do nothing;
  return new;
end;
$$;

create trigger finalizations_routine_principal
  after insert on public.finalizations
  for each row execute function public.routine_add_principal();
