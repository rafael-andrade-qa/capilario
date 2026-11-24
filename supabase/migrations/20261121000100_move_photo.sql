-- Capilário | trocar o ângulo de uma foto
--
-- Cadastrou a foto no ângulo errado (ex.: esquerdo no lugar do direito)? move_photo leva a foto
-- para o ângulo certo: se ele estiver vazio, a foto só muda de lugar; se tiver foto, as duas
-- trocam de lugar. O arquivo, o enquadramento e o id continuam os mesmos.
--
-- SECURITY INVOKER: o RLS continua valendo e só o dono mexe. Como (stage_id, angle) é único e a
-- checagem é linha a linha, a troca apaga as duas linhas e insere de novo com os ângulos trocados
-- (na mesma transação; nada fica pela metade).
create or replace function public.move_photo(p_photo_id uuid, p_angle text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.photos;
  v_other public.photos;
  v_experiment uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_angle is null or p_angle not in ('front', 'left', 'right', 'back') then
    raise exception 'invalid_angle' using errcode = '22023';
  end if;

  select s.experiment_id into v_experiment
  from public.photos p
  join public.stages s on s.id = p.stage_id
  where p.id = p_photo_id and p.user_id = v_uid;
  if not found then
    raise exception 'photo_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delete_stage:' || v_experiment::text, 0));

  select * into v_me from public.photos p where p.id = p_photo_id and p.user_id = v_uid;
  if v_me.angle = p_angle then
    return jsonb_build_object('moved', false, 'swapped_with', null); -- já está lá (repetição)
  end if;

  select * into v_other from public.photos p
  where p.stage_id = v_me.stage_id and p.angle = p_angle and p.user_id = v_uid;

  delete from public.photos p where p.id in (v_me.id, v_other.id) and p.user_id = v_uid;

  insert into public.photos (id, stage_id, user_id, angle, storage_path, mime_type, size_bytes, created_at, crop)
  values (v_me.id, v_me.stage_id, v_uid, p_angle, v_me.storage_path, v_me.mime_type, v_me.size_bytes, v_me.created_at, v_me.crop);

  if v_other.id is not null then
    insert into public.photos (id, stage_id, user_id, angle, storage_path, mime_type, size_bytes, created_at, crop)
    values (v_other.id, v_other.stage_id, v_uid, v_me.angle, v_other.storage_path, v_other.mime_type, v_other.size_bytes, v_other.created_at, v_other.crop);
  end if;

  return jsonb_build_object('moved', true, 'swapped_with', v_other.id);
end;
$$;

revoke all on function public.move_photo(uuid, text) from public, anon;
grant execute on function public.move_photo(uuid, text) to authenticated;
