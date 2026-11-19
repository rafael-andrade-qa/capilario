-- Projeto Capilar | foto do produto
--
-- Cada experimento (produto) pode ter uma foto da embalagem. Ela aparece como
-- miniatura no histórico. Fica no mesmo bucket privado, em
-- <user_id>/produto-<experiment_id>/<foto_id>.<ext>.

alter table public.experiments add column photo_path text;

alter table public.experiments add constraint experiments_photo_path_format check (
  photo_path is null
  or photo_path ~ ('^' || user_id::text || '/produto-' || id::text || '/[0-9a-f-]{36}.(jpg|png|webp)$')
);

-- Só a foto do produto pode ser alterada no experimento.
grant update (photo_path) on public.experiments to authenticated;
create policy experiments_update_own on public.experiments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Exclusão no Storage: além das fotos de etapas, a foto de produto em uso também fica protegida.
drop policy capilar_photos_delete_own_unlinked on storage.objects;
create policy capilar_photos_delete_own_unlinked on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'capilar-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.photos p where p.storage_path = storage.objects.name)
    and not exists (select 1 from public.experiments e where e.photo_path = storage.objects.name)
  );

-- Define (ou remove, com p_path nulo) a foto do produto. Confere dono, formato e
-- existência do arquivo. Devolve o caminho anterior para o app apagar o arquivo antigo.
create or replace function public.set_experiment_photo(p_experiment_id uuid, p_path text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.photo_path into v_old
  from public.experiments e
  where e.id = p_experiment_id and e.user_id = v_uid;
  if not found then
    raise exception 'experiment_not_found' using errcode = 'P0002';
  end if;

  if p_path is not null then
    if p_path !~ ('^' || v_uid::text || '/produto-' || p_experiment_id::text || '/[0-9a-f-]{36}.(jpg|png|webp)$') then
      raise exception 'invalid_storage_path' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'capilar-photos' and o.name = p_path) then
      raise exception 'object_missing' using errcode = 'P0002';
    end if;
  end if;

  update public.experiments e set photo_path = p_path
  where e.id = p_experiment_id and e.user_id = v_uid;

  return jsonb_build_object(
    'photo_path', p_path,
    'old_path', case when v_old is distinct from p_path then v_old end
  );
end;
$$;

revoke all on function public.set_experiment_photo(uuid, text) from public, anon;
grant execute on function public.set_experiment_photo(uuid, text) to authenticated;

-- delete_stage: ao remover o último registro, devolve também a foto do produto.
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
  v_product_photo text;
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
    delete from public.experiments e where e.id = v_experiment_id and e.user_id = v_uid
    returning e.photo_path into v_product_photo;
    v_experiment_deleted := true;
    -- A foto do produto também fica sem uso: o app a remove junto.
    if v_product_photo is not null then
      v_paths := v_paths || jsonb_build_array(v_product_photo);
    end if;
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

-- finalize_stage: duas finalizações idênticas ao mesmo tempo podiam esbarrar na
-- restrição única (id, user_id) do experimento/etapa (só o id era tratado). Agora
-- qualquer conflito de chave na criação é tratado como "já existe", e a conferência
-- de dono logo abaixo continua valendo.
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

  -- 2. Etapa -----------------------------------------------------------------
  select s.experiment_id into v_stage_experiment
  from public.stages s
  where s.id = p_stage_id and s.user_id = v_uid;

  if not found then
    if p_new_stage is null then
      raise exception 'stage_not_found' using errcode = 'P0002';
    end if;

    insert into public.stages (id, experiment_id, user_id, stage_type, captured_at, notes)
    values (
      p_stage_id,
      p_experiment_id,
      v_uid,
      p_new_stage ->> 'stage_type',
      (p_new_stage ->> 'captured_at')::timestamptz,
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

    -- Repetição de uma finalização já confirmada: mesma foto, mesmo lugar.
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
