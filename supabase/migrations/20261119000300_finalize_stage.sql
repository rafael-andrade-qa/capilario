-- Projeto Capilar | finalização atômica de uma etapa
--
-- Fluxo do app:
--   1. o navegador reserva IDs (experimento, etapa, fotos) e caminhos;
--   2. envia as imagens direto ao Storage;
--   3. chama esta função com os itens confirmados.
--
-- A função roda com as permissões do chamador (SECURITY INVOKER), portanto
-- todas as políticas de RLS continuam valendo. Em uma única transação ela:
--   * cria o experimento (se p_new_experiment vier preenchido);
--   * cria a etapa (se ainda não existir e p_new_stage vier preenchido);
--   * registra as fotos, conferindo caminho, dono e existência do objeto.
--
-- É idempotente: repetir a mesma chamada devolve o mesmo resultado, sem duplicar.

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
    if v_mode <> 'named' then
      v_name := null;
    end if;

    insert into public.experiments (id, user_id, product_mode, product_name)
    values (p_experiment_id, v_uid, v_mode, v_name)
    on conflict (id) do nothing;
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
    on conflict (id) do nothing;

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
