-- Capilário | planos Grátis e Pro
--
-- Cada conta é Grátis até ter uma assinatura Pro válida (dada à mão ou, na fase de pagamento,
-- pelo aviso do gateway). Os limites seguem o plano (horário de Brasília):
--   Grátis: 1 análise com IA por mês, 3 identificações pela foto por semana (segunda a domingo),
--           até 300 fotos.
--   Pro:    1 análise por dia, 10 identificações por dia, até 1.000 fotos.
-- O teto geral de análises por dia (somando todas as contas) continua como trava de custo.
-- Quem perde o Pro não perde nada: só não guarda fotos acima do limite do Grátis.

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'pro')),
  -- Até quando vale o Pro; vazio = sem prazo (dado à mão).
  pro_until timestamptz,
  source text not null default 'manual' check (source in ('manual', 'payment')),
  updated_at timestamptz not null default pg_catalog.now()
);

-- Só o servidor mexe: ninguém se dá Pro pela API. O app lê o próprio plano por my_plan().
alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from public, anon, authenticated;

-- Plano em vigor de uma conta.
create or replace function public.plan_of(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid and s.plan = 'pro' and (s.pro_until is null or s.pro_until > pg_catalog.now())
  ) then 'pro' else 'free' end
$$;

revoke all on function public.plan_of(uuid) from public, anon, authenticated;

-- Limites de cada plano (um lugar só).
create or replace function public.plan_limits(p_plan text)
returns table (analyses integer, analyses_period text, identify integer, identify_period text, photos integer, files integer)
language sql
immutable
set search_path = ''
as $$
  select l.analyses, l.analyses_period, l.identify, l.identify_period, l.photos, l.files from (values
    ('free', 1, 'month', 3, 'week', 300, 800),
    ('pro', 1, 'day', 10, 'day', 1000, 2500)
  ) as l (plan, analyses, analyses_period, identify, identify_period, photos, files)
  where l.plan = p_plan
$$;

revoke all on function public.plan_limits(text) from public, anon;
grant execute on function public.plan_limits(text) to authenticated;

-- Hoje em Brasília e o começo do período (dia, semana a partir da segunda, mês).
create or replace function public.period_start(p_period text, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then pg_catalog.date_trunc('week', p_day::timestamp)::date
    when 'month' then pg_catalog.date_trunc('month', p_day::timestamp)::date
    else p_day
  end
$$;

create or replace function public.period_end(p_period text, p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then (pg_catalog.date_trunc('week', p_day::timestamp) + interval '7 days')::date
    when 'month' then (pg_catalog.date_trunc('month', p_day::timestamp) + interval '1 month')::date
    else p_day + 1
  end
$$;

revoke all on function public.period_start(text, date) from public, anon;
revoke all on function public.period_end(text, date) from public, anon;

-- Análises -----------------------------------------------------------------------------------

create or replace function public.consume_analyze_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_total_limit constant integer := 20;
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_limit integer;
  v_period text;
  v_used integer;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select l.analyses, l.analyses_period into v_limit, v_period from public.plan_limits(public.plan_of(v_uid)) l;

  -- Uma de cada vez: duas análises ao mesmo tempo não passam juntas dos tetos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analyze_quota', 0));

  select coalesce(sum(u.count), 0) into v_total from public.analyze_usage u where u.day = v_day;
  if v_total >= v_total_limit then
    raise exception 'analyze_app_limit' using errcode = 'P0001';
  end if;

  select coalesce(sum(u.count), 0) into v_used from public.analyze_usage u
  where u.user_id = v_uid and u.day >= public.period_start(v_period, v_day);
  if v_used >= v_limit then
    raise exception 'analyze_limit' using errcode = 'P0001';
  end if;

  insert into public.analyze_usage as u (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1;

  -- O mês inteiro precisa ficar; o resto é limpeza.
  delete from public.analyze_usage u where u.user_id = v_uid and u.day < v_day - 40;

  return least(v_limit - v_used - 1, v_total_limit - v_total - 1);
end;
$$;

create or replace function public.analyze_quota_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select (pg_catalog.now() at time zone 'America/Sao_Paulo')::date as day),
  l as (select * from public.plan_limits(public.plan_of((select auth.uid()))))
  select greatest(0, least(
    (select l.analyses from l) - coalesce((
      select sum(u.count)::integer from public.analyze_usage u, t, l
      where u.user_id = (select auth.uid()) and u.day >= public.period_start(l.analyses_period, t.day)
    ), 0),
    20 - coalesce((select sum(u.count)::integer from public.analyze_usage u, t where u.day = t.day), 0)
  ))
$$;

-- Identificar pela foto ----------------------------------------------------------------------

create or replace function public.consume_identify_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_limit integer;
  v_period text;
  v_used integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select l.identify, l.identify_period into v_limit, v_period from public.plan_limits(public.plan_of(v_uid)) l;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identify_quota:' || v_uid::text, 0));
  select coalesce(sum(u.count), 0) into v_used from public.identify_usage u
  where u.user_id = v_uid and u.day >= public.period_start(v_period, v_day);
  if v_used >= v_limit then
    raise exception 'identify_limit' using errcode = 'P0001';
  end if;

  insert into public.identify_usage as u (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1;

  delete from public.identify_usage u where u.user_id = v_uid and u.day < v_day - 40;

  return v_limit - v_used - 1;
end;
$$;

-- Fotos --------------------------------------------------------------------------------------

create or replace function public.photos_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photos_limit:' || new.user_id::text, 0));
  if (select count(*) from public.photos p where p.user_id = new.user_id)
     >= (select l.photos from public.plan_limits(public.plan_of(new.user_id)) l) then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- No armazenamento, o mesmo teto com folga (foto + miniatura, fotos dos produtos, envios em curso).
create or replace function public.can_store_photo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < (select l.files from public.plan_limits(public.plan_of((select auth.uid()))) l)
  from storage.objects o
  where o.bucket_id = 'capilar-photos'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;

-- O plano para o app -------------------------------------------------------------------------

-- Plano, limites, quanto já foi usado e quando renova (para "Seu plano" e os avisos).
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_plan text;
  l record;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_plan := public.plan_of(v_uid);
  select * into l from public.plan_limits(v_plan);
  select s.pro_until into v_until from public.subscriptions s where s.user_id = v_uid and v_plan = 'pro';
  return jsonb_build_object(
    'plan', v_plan,
    'pro_until', v_until,
    'analyses', jsonb_build_object(
      'limit', l.analyses,
      'period', l.analyses_period,
      'used', coalesce((select sum(u.count) from public.analyze_usage u where u.user_id = v_uid and u.day >= public.period_start(l.analyses_period, v_day)), 0),
      'renews_on', public.period_end(l.analyses_period, v_day)
    ),
    'identify', jsonb_build_object(
      'limit', l.identify,
      'period', l.identify_period,
      'used', coalesce((select sum(u.count) from public.identify_usage u where u.user_id = v_uid and u.day >= public.period_start(l.identify_period, v_day)), 0),
      'renews_on', public.period_end(l.identify_period, v_day)
    ),
    'photos', jsonb_build_object(
      'limit', l.photos,
      'used', (select count(*) from public.photos p where p.user_id = v_uid)
    )
  );
end;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
