-- Projeto Capilar | finalizações
--
-- Uma finalização é um dia de lavagem com um produto: o cabelo molhado logo depois
-- de finalizar, o mesmo cabelo seco e no dia seguinte. Fica entre o produto
-- (experimento) e os momentos (etapas):
--
--   experimento -> finalização -> etapa (Molhado / Seco / Dia seguinte) -> fotos
--
-- Cada finalização tem no máximo um momento de cada tipo.
--
-- Registros que já existem são agrupados assim, por produto e em ordem de horário:
--   * cada Molhado começa uma finalização nova (refazer a finalização = lavar de novo);
--   * Seco e Dia seguinte entram na finalização em andamento do mesmo produto, se ela
--     ainda não tiver esse momento e tiver começado há no máximo 48 horas;
--   * senão, começam uma finalização própria.

create table public.finalizations (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint finalizations_experiment_owner_fk foreign key (experiment_id, user_id)
    references public.experiments (id, user_id) on delete cascade,
  constraint finalizations_id_user_unique unique (id, user_id),
  -- A etapa aponta para (finalização, experimento): não dá para pendurar a etapa
  -- numa finalização de outro produto.
  constraint finalizations_id_experiment_unique unique (id, experiment_id)
);

create index finalizations_experiment_idx on public.finalizations (experiment_id);

alter table public.finalizations enable row level security;
revoke all on public.finalizations from anon, authenticated;
grant select, insert, delete on public.finalizations to authenticated;

create policy finalizations_select_own on public.finalizations
  for select to authenticated using (user_id = (select auth.uid()));
create policy finalizations_insert_own on public.finalizations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy finalizations_delete_own on public.finalizations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Agrupa os registros existentes ------------------------------------------------
alter table public.stages add column finalization_id uuid;

do $$
declare
  r record;
  v_experiment uuid;
  v_fin uuid;
  v_start timestamptz;
  v_types text[];
begin
  for r in
    select s.id, s.experiment_id, s.user_id, s.stage_type, s.captured_at
    from public.stages s
    order by s.experiment_id, s.captured_at, s.created_at, s.id
  loop
    if v_experiment is distinct from r.experiment_id then
      v_experiment := r.experiment_id;
      v_fin := null;
    end if;

    if v_fin is null
       or r.stage_type = 'wet'
       or r.stage_type = any (v_types)
       or r.captured_at - v_start > interval '48 hours' then
      v_fin := gen_random_uuid();
      v_start := r.captured_at;
      v_types := '{}';
      insert into public.finalizations (id, experiment_id, user_id, created_at)
      values (v_fin, r.experiment_id, r.user_id, r.captured_at);
    end if;

    update public.stages s set finalization_id = v_fin where s.id = r.id;
    v_types := v_types || r.stage_type;
  end loop;
end;
$$;

alter table public.stages alter column finalization_id set not null;
alter table public.stages add constraint stages_finalization_fk foreign key (finalization_id, experiment_id)
  references public.finalizations (id, experiment_id) on delete cascade;
alter table public.stages add constraint stages_finalization_type_unique unique (finalization_id, stage_type);

-- finalize_stage: a etapa nova entra numa finalização ----------------------------
-- p_new_stage.finalization_id escolhe a finalização (o app sempre manda: uma nova ao
-- começar uma finalização, a existente ao registrar o próximo momento). Se ela ainda
-- não existe, é criada aqui, na mesma transação. Versões antigas do app não mandam:
-- aí vale a mesma regra do agrupamento acima, com o id da própria etapa como id da
-- finalização nova (repetir a chamada não cria outra).
create or replace function public.finalize_stage(
  p_experiment_id uuid,
  p_stage_id uuid,
  p_photos jsonb,
  p_new_experiment jsonb default null,
  p_new_stage jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_photo_id uuid;
  v_angle text;
  v_mime text;
  v_size bigint;
  v_ext text;
  v_path text;
  v_stage_experiment uuid;
  v_existing record;
  v_mode text;
  v_name text;
  v_brand text;
  v_fin uuid;
  v_type text;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 4 then
    raise exception 'photos_required' using errcode = '22023',
      detail = 'Envie de 1 a 4 fotos confirmadas.';
  end if;

  -- 1. Experimento -----------------------------------------------------------
  if p_new_experiment is not null then
    v_mode := coalesce(p_new_experiment ->> 'product_mode', 'unspecified');
    v_name := nullif(btrim(coalesce(p_new_experiment ->> 'product_name', '')), '');
    if v_mode = 'named' and v_name is null then
      v_mode := 'unspecified';
    end if;
    v_brand := nullif(btrim(coalesce(p_new_experiment ->> 'brand', '')), '');
    if v_mode <> 'named' then
      v_name := null;
      v_brand := null;
    end if;

    insert into public.experiments (id, user_id, product_mode, product_name, brand)
    values (p_experiment_id, v_uid, v_mode, v_name, v_brand)
    on conflict do nothing;
  end if;

  if not exists (select 1 from public.experiments e where e.id = p_experiment_id and e.user_id = v_uid) then
    raise exception 'experiment_not_found' using errcode = 'P0002';
  end if;

  -- 2. Etapa (e finalização) ---------------------------------------------------
  select s.experiment_id into v_stage_experiment
  from public.stages s
  where s.id = p_stage_id and s.user_id = v_uid;

  if not found then
    if p_new_stage is null then
      raise exception 'stage_not_found' using errcode = 'P0002';
    end if;

    v_type := p_new_stage ->> 'stage_type';
    v_at := (p_new_stage ->> 'captured_at')::timestamptz;

    -- Serializa a escolha da finalização no mesmo produto.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || p_experiment_id::text, 0));

    v_fin := nullif(p_new_stage ->> 'finalization_id', '')::uuid;
    if v_fin is null and v_type <> 'wet' then
      select f.id into v_fin
      from public.finalizations f
      join public.stages s on s.finalization_id = f.id
      where f.experiment_id = p_experiment_id and f.user_id = v_uid
      group by f.id
      having not bool_or(s.stage_type = v_type)
         and min(s.captured_at) >= v_at - interval '48 hours'
      order by max(s.captured_at) desc
      limit 1;
    end if;
    v_fin := coalesce(v_fin, p_stage_id);

    insert into public.finalizations (id, experiment_id, user_id)
    values (v_fin, p_experiment_id, v_uid)
    on conflict do nothing;

    if not exists (
      select 1 from public.finalizations f
      where f.id = v_fin and f.experiment_id = p_experiment_id and f.user_id = v_uid
    ) then
      raise exception 'finalization_not_found' using errcode = 'P0002';
    end if;

    if exists (
      select 1 from public.stages s
      where s.finalization_id = v_fin and s.stage_type = v_type and s.id <> p_stage_id
    ) then
      raise exception 'moment_taken' using errcode = '23505', detail = v_type;
    end if;

    insert into public.stages (id, experiment_id, finalization_id, user_id, stage_type, captured_at, notes)
    values (
      p_stage_id,
      p_experiment_id,
      v_fin,
      v_uid,
      v_type,
      v_at,
      nullif(btrim(coalesce(p_new_stage ->> 'notes', '')), '')
    )
    on conflict do nothing;

    select s.experiment_id into v_stage_experiment
    from public.stages s
    where s.id = p_stage_id and s.user_id = v_uid;

    if not found then
      raise exception 'stage_not_found' using errcode = 'P0002';
    end if;
  end if;

  if v_stage_experiment <> p_experiment_id then
    raise exception 'stage_experiment_mismatch' using errcode = '22023';
  end if;

  -- 3. Fotos -----------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_photos) loop
    v_photo_id := (v_item ->> 'id')::uuid;
    v_angle := v_item ->> 'angle';
    v_mime := v_item ->> 'mime_type';
    v_size := nullif(v_item ->> 'size_bytes', '')::bigint;
    v_path := v_item ->> 'storage_path';

    v_ext := case v_mime
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
      else null
    end;
    if v_ext is null then
      raise exception 'invalid_mime_type' using errcode = '22023', detail = coalesce(v_mime, '');
    end if;

    if v_path is distinct from (v_uid::text || '/' || p_stage_id::text || '/' || v_photo_id::text || '.' || v_ext) then
      raise exception 'invalid_storage_path' using errcode = '22023', detail = coalesce(v_path, '');
    end if;

    select p.stage_id, p.angle, p.storage_path into v_existing
    from public.photos p
    where p.id = v_photo_id;

    if found then
      if v_existing.stage_id <> p_stage_id or v_existing.angle <> v_angle or v_existing.storage_path <> v_path then
        raise exception 'photo_conflict' using errcode = '23505', detail = v_photo_id::text;
      end if;
      continue;
    end if;

    if exists (select 1 from public.photos p where p.stage_id = p_stage_id and p.angle = v_angle) then
      raise exception 'angle_taken' using errcode = '23505', detail = v_angle;
    end if;

    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'capilar-photos' and o.name = v_path
    ) then
      raise exception 'object_missing' using errcode = 'P0002', detail = v_path;
    end if;

    insert into public.photos (id, stage_id, user_id, angle, storage_path, mime_type, size_bytes)
    values (v_photo_id, p_stage_id, v_uid, v_angle, v_path, v_mime, v_size)
    on conflict (id) do nothing;
  end loop;

  return jsonb_build_object(
    'experiment_id', p_experiment_id,
    'stage_id', p_stage_id,
    'finalization_id', (select s.finalization_id from public.stages s where s.id = p_stage_id),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'angle', p.angle, 'storage_path', p.storage_path) order by p.angle)
      from public.photos p
      where p.stage_id = p_stage_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.finalize_stage(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.finalize_stage(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

-- delete_stage: finalização que fica vazia também sai ------------------------------
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
  v_experiment_deleted boolean := false;
  v_finalization_deleted boolean := false;
  v_product_photo text;
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

  if not exists (select 1 from public.stages s where s.experiment_id = v_experiment_id) then
    delete from public.experiments e where e.id = v_experiment_id and e.user_id = v_uid
    returning e.photo_path into v_product_photo;
    v_experiment_deleted := true;
    if v_product_photo is not null then
      v_paths := v_paths || jsonb_build_array(v_product_photo);
    end if;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'experiment_id', v_experiment_id,
    'finalization_id', v_fin,
    'experiment_deleted', v_experiment_deleted,
    'finalization_deleted', v_finalization_deleted,
    'paths', v_paths
  );
end;
$$;

revoke all on function public.delete_stage(uuid) from public, anon;
grant execute on function public.delete_stage(uuid) to authenticated;
