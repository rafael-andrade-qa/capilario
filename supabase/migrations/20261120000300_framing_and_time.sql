-- Projeto Capilar | enquadramento das fotos e horário do momento
--
-- Enquadramento: cada foto pode guardar um recorte 3:4 (x, y, largura e altura, de 0 a 1, em
-- relação à imagem original). O arquivo nunca muda; o app só mostra o recorte. Vem do
-- enquadramento automático pelo rosto ou do ajuste à mão (zoom e posição).
-- Horário: o dono pode corrigir a data e o horário de um momento.

alter table public.photos
  add column crop jsonb,
  add constraint photos_crop_valid check (
    crop is null or (
      jsonb_typeof(crop) = 'object'
      and jsonb_typeof(crop -> 'x') = 'number'
      and jsonb_typeof(crop -> 'y') = 'number'
      and jsonb_typeof(crop -> 'w') = 'number'
      and jsonb_typeof(crop -> 'h') = 'number'
      and (crop ->> 'x')::numeric >= 0
      and (crop ->> 'y')::numeric >= 0
      and (crop ->> 'w')::numeric > 0.02
      and (crop ->> 'h')::numeric > 0.02
      and (crop ->> 'x')::numeric + (crop ->> 'w')::numeric <= 1.001
      and (crop ->> 'y')::numeric + (crop ->> 'h')::numeric <= 1.001
    )
  );

-- Só o recorte pode mudar numa foto (caminho, ângulo e dono continuam fixos).
grant update (crop) on public.photos to authenticated;
create policy photos_update_own on public.photos
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Corrigir data e horário do momento.
grant update (captured_at) on public.stages to authenticated;
