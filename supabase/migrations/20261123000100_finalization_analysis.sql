-- Capilário | análise da finalização pela IA
--
-- A função analyze-finalization manda as fotos de uma finalização (molhado, seco, dia
-- seguinte) para a IA e guarda aqui a leitura: tipo de cabelo, notas de 0 a 10, um resumo e
-- uma observação sugerida para cada momento. Uma análise por finalização: analisar de novo
-- substitui a anterior. Nada vai para as observações sozinho: a pessoa usa ou descarta
-- (notes_state).

create table public.finalization_analyses (
  finalization_id uuid primary key,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  model text not null check (length(model) <= 80),
  -- { hair_type, tendency, traits[], scores{definition,frizz_control,volume,day2}, summary, notes{wet,dry,next_day} }
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 20000),
  -- { input_tokens, output_tokens, cost_usd }
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  notes_state text not null default 'pending' check (notes_state in ('pending', 'applied', 'dismissed')),
  constraint finalization_analyses_owner_fk foreign key (finalization_id, user_id)
    references public.finalizations (id, user_id) on delete cascade
);

alter table public.finalization_analyses enable row level security;
revoke all on public.finalization_analyses from anon, authenticated;
grant select, insert, update, delete on public.finalization_analyses to authenticated;

create policy finalization_analyses_select_own on public.finalization_analyses
  for select to authenticated using (user_id = (select auth.uid()));
create policy finalization_analyses_insert_own on public.finalization_analyses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy finalization_analyses_update_own on public.finalization_analyses
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy finalization_analyses_delete_own on public.finalization_analyses
  for delete to authenticated using (user_id = (select auth.uid()));

create index finalization_analyses_user_idx on public.finalization_analyses (user_id, created_at desc);

-- Limite diário (horário de Brasília), como o de "Identificar pela foto": cada análise custa
-- centavos na conta de quem mantém o app. Só a função abaixo mexe no contador.
create table public.analyze_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.analyze_usage enable row level security;
revoke all on table public.analyze_usage from public, anon, authenticated;

-- Consome uma análise do dia. Devolve quantas ainda restam hoje.
create or replace function public.consume_analyze_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 10;
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.analyze_usage as u (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1
    where u.count < v_limit
  returning u.count into v_count;

  if v_count is null then
    raise exception 'analyze_limit' using errcode = 'P0001';
  end if;

  delete from public.analyze_usage u where u.user_id = v_uid and u.day < v_day - 30;

  return v_limit - v_count;
end;
$$;

revoke all on function public.consume_analyze_quota() from public, anon;
grant execute on function public.consume_analyze_quota() to authenticated;

-- Quantas análises ainda restam hoje (só leitura, para a tela mostrar).
create or replace function public.analyze_quota_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 10 - coalesce((
    select u.count from public.analyze_usage u
    where u.user_id = (select auth.uid())
      and u.day = (pg_catalog.now() at time zone 'America/Sao_Paulo')::date
  ), 0)
$$;

revoke all on function public.analyze_quota_left() from public, anon;
grant execute on function public.analyze_quota_left() to authenticated;
