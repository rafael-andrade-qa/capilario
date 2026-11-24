-- Capilário | limite diário de "Identificar pela foto"
--
-- Cada identificação chama a IA e custa centavos na conta de quem mantém o app. A função
-- identify-product consome uma unidade antes de chamar a IA; passou do limite do dia
-- (horário de Brasília), ela recusa. A tabela não tem acesso direto: só a função abaixo
-- mexe nela, então ninguém zera o próprio contador pela API.

create table public.identify_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.identify_usage enable row level security;
revoke all on table public.identify_usage from public, anon, authenticated;

-- Consome uma identificação do dia. Devolve quantas ainda restam hoje.
create or replace function public.consume_identify_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 20;
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.identify_usage as u (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1
    where u.count < v_limit
  returning u.count into v_count;

  if v_count is null then
    raise exception 'identify_limit' using errcode = 'P0001';
  end if;

  -- Limpeza leve: dias antigos não servem para nada.
  delete from public.identify_usage u where u.user_id = v_uid and u.day < v_day - 30;

  return v_limit - v_count;
end;
$$;

revoke all on function public.consume_identify_quota() from public, anon;
grant execute on function public.consume_identify_quota() to authenticated;
