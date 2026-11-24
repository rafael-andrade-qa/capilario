-- Capilário | edição
--
-- * Produto: corrigir nome e marca (a foto da embalagem já tem set_experiment_photo).
-- * Momento: trocar a foto de um ângulo, pôr foto num ângulo vazio ou remover uma foto.
--
-- Fotos: SECURITY INVOKER, o RLS continua valendo e só o dono altera. Os arquivos antigos
-- são removidos depois pelo app (a política do Storage só libera objetos sem ligação).

-- Produto ---------------------------------------------------------------------
-- Nome e marca continuam sem permissão de UPDATE direto: só esta função altera, para a
-- regra de "sem produto repetido" valer sempre. SECURITY DEFINER com search_path vazio;
-- toda consulta filtra pelo dono (auth.uid()), então ninguém altera produto alheio.
create or replace function public.update_experiment(p_experiment_id uuid, p_name text, p_brand text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_mode text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select e.product_mode into v_mode
  from public.experiments e
  where e.id = p_experiment_id and e.user_id = v_uid;
  if not found then
    raise exception 'experiment_not_found' using errcode = 'P0002';
  end if;
  if v_mode <> 'named' then
    raise exception 'product_not_editable' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'product_name_required' using errcode = '22023';
  end if;

  -- Não deixa dois produtos iguais (mesmo nome e marca) no histórico.
  if exists (
    select 1 from public.experiments e
    where e.user_id = v_uid and e.id <> p_experiment_id and e.product_mode = 'named'
      and lower(e.product_name) = lower(v_name)
      and lower(coalesce(e.brand, '')) = lower(coalesce(v_brand, ''))
  ) then
    raise exception 'product_exists' using errcode = '23505';
  end if;

  update public.experiments e set product_name = v_name, brand = v_brand
  where e.id = p_experiment_id and e.user_id = v_uid;

  return jsonb_build_object('product_name', v_name, 'brand', v_brand);
end;
$$;

revoke all on function public.update_experiment(uuid, text, text) from public, anon;
grant execute on function public.update_experiment(uuid, text, text) to authenticated;

-- Foto de um momento: trocar ou pôr num ângulo vazio --------------------------------
-- p_photo = { id, storage_path, mime_type, size_bytes }; o arquivo já precisa estar no
-- Storage, no caminho <user_id>/<stage_id>/<photo_id>.<ext>. Devolve o caminho da foto
-- que saiu (para o app apagar o arquivo). Repetir a mesma chamada não muda nada.
create or replace function public.replace_photo(p_stage_id uuid, p_angle text, p_photo jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_photo ->> 'id')::uuid;
  v_path text := p_photo ->> 'storage_path';
  v_mime text := p_photo ->> 'mime_type';
  v_size bigint := nullif(p_photo ->> 'size_bytes', '')::bigint;
  v_ext text;
  v_experiment uuid;
  v_old text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_angle not in ('front', 'left', 'right', 'back') then
    raise exception 'invalid_angle' using errcode = '22023';
  end if;

  select s.experiment_id into v_experiment
  from public.stages s
  where s.id = p_stage_id and s.user_id = v_uid;
  if not found then
    raise exception 'stage_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment::text, 0));

  -- Repetição de uma troca já feita.
  if exists (select 1 from public.photos p where p.id = v_id and p.stage_id = p_stage_id and p.angle = p_angle) then
    return jsonb_build_object('photo_id', v_id, 'old_path', null);
  end if;

  v_ext := case v_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
  if v_ext is null then
    raise exception 'invalid_mime_type' using errcode = '22023';
  end if;
  if v_path is distinct from (v_uid::text || '/' || p_stage_id::text || '/' || v_id::text || '.' || v_ext) then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'capilar-photos' and o.name = v_path) then
    raise exception 'object_missing' using errcode = 'P0002';
  end if;

  delete from public.photos p
  where p.stage_id = p_stage_id and p.angle = p_angle and p.user_id = v_uid
  returning p.storage_path into v_old;

  insert into public.photos (id, stage_id, user_id, angle, storage_path, mime_type, size_bytes)
  values (v_id, p_stage_id, v_uid, p_angle, v_path, v_mime, v_size);

  return jsonb_build_object('photo_id', v_id, 'old_path', v_old);
end;
$$;

revoke all on function public.replace_photo(uuid, text, jsonb) from public, anon;
grant execute on function public.replace_photo(uuid, text, jsonb) to authenticated;

-- Remover uma foto do momento. A última não sai: para apagar tudo, exclua o momento.
create or replace function public.delete_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_stage uuid;
  v_experiment uuid;
  v_path text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.stage_id, s.experiment_id into v_stage, v_experiment
  from public.photos p
  join public.stages s on s.id = p.stage_id
  where p.id = p_photo_id and p.user_id = v_uid;
  if not found then
    return jsonb_build_object('deleted', false, 'path', null);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment::text, 0));

  if (select count(*) from public.photos p where p.stage_id = v_stage) <= 1 then
    raise exception 'last_photo' using errcode = '22023';
  end if;

  delete from public.photos p where p.id = p_photo_id and p.user_id = v_uid
  returning p.storage_path into v_path;

  return jsonb_build_object('deleted', true, 'path', v_path);
end;
$$;

revoke all on function public.delete_photo(uuid) from public, anon;
grant execute on function public.delete_photo(uuid) to authenticated;
