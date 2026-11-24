-- Capilário | bucket privado de fotos
-- Objetos ficam em <user_id>/<stage_id>/<photo_id>.<ext>.
-- Limite de 15 MiB por arquivo, coerente com a validação da interface.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capilar-photos',
  'capilar-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Leitura (inclui gerar URL assinada) só dentro do próprio prefixo.
create policy capilar_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'capilar-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Envio só dentro do próprio prefixo, com estrutura <uid>/<stage>/<arquivo>.
create policy capilar_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'capilar-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
  );

-- Exclusão só de objetos próprios que NÃO foram associados a uma foto salva.
-- Usado para limpar envios descartados; fotos publicadas ficam protegidas.
create policy capilar_photos_delete_own_unlinked on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'capilar-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.photos p where p.storage_path = storage.objects.name
    )
  );

-- Não há política de UPDATE: arquivos enviados não são sobrescritos (upsert desativado).
