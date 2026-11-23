-- Projeto Capilar | limites para mais gente usar
--
-- Análise com IA: 3 por pessoa por dia e 20 por dia somando todas as contas (horário de
-- Brasília). O teto geral segura a conta de quem mantém o app mesmo com muitas pessoas.
-- Fotos: até 1.000 por pessoa (no banco e no armazenamento, que guarda foto + miniatura).

-- Consome uma análise do dia. Devolve quantas ainda restam hoje para esta pessoa (no máximo o
-- que sobra no total do app).
create or replace function public.consume_analyze_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 3;
  v_total_limit constant integer := 20;
  v_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_count integer;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Uma de cada vez: duas análises ao mesmo tempo não passam juntas do teto geral.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analyze_quota', 0));

  select coalesce(sum(u.count), 0) into v_total from public.analyze_usage u where u.day = v_day;
  if v_total >= v_total_limit then
    raise exception 'analyze_app_limit' using errcode = 'P0001';
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

  return least(v_limit - v_count, v_total_limit - v_total - 1);
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
  with today as (select (pg_catalog.now() at time zone 'America/Sao_Paulo')::date as day)
  select greatest(0, least(
    3 - coalesce((select u.count from public.analyze_usage u, today t where u.user_id = (select auth.uid()) and u.day = t.day), 0),
    20 - coalesce((select sum(u.count)::integer from public.analyze_usage u, today t where u.day = t.day), 0)
  ))
$$;

revoke all on function public.analyze_quota_left() from public, anon;
grant execute on function public.analyze_quota_left() to authenticated;

-- Fotos por pessoa: a 1.001ª não entra (vale para salvar momento e para pôr foto em ângulo
-- vazio; trocar uma foto apaga a antiga antes, então continua funcionando no limite).
create or replace function public.photos_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photos_limit:' || new.user_id::text, 0));
  if (select count(*) from public.photos p where p.user_id = new.user_id) >= 1000 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.photos_limit() from public, anon, authenticated;

create trigger photos_limit before insert on public.photos
  for each row execute function public.photos_limit();

-- No armazenamento, o mesmo teto com folga: foto + miniatura de cada uma, as fotos dos
-- produtos e envios que ainda não viraram foto. Sem isso, dava para encher o bucket direto
-- pela API, sem passar pelo banco.
create or replace function public.can_store_photo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 2500 from storage.objects o
  where o.bucket_id = 'capilar-photos'
    and (storage.foldername(o.name))[1] = (select auth.uid())::text
$$;

revoke all on function public.can_store_photo() from public, anon;
grant execute on function public.can_store_photo() to authenticated;

drop policy capilar_photos_insert_own on storage.objects;
create policy capilar_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'capilar-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and (select public.can_store_photo())
  );
