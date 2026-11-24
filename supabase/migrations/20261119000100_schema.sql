-- Capilário | esquema principal
-- Experimentos -> etapas -> fotos. Cada linha pertence a um usuário do Auth.
-- A posse é garantida por chaves estrangeiras compostas (id, user_id),
-- de modo que uma etapa só pode apontar para um experimento do mesmo dono
-- e uma foto só pode apontar para uma etapa do mesmo dono.

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_mode text not null default 'unspecified'
    check (product_mode in ('unspecified', 'none', 'named')),
  product_name text,
  created_at timestamptz not null default now(),
  constraint experiments_product_name_matches_mode check (
    (product_mode = 'named' and product_name is not null and length(btrim(product_name)) between 1 and 200)
    or (product_mode <> 'named' and product_name is null)
  ),
  constraint experiments_id_user_unique unique (id, user_id)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null,
  user_id uuid not null default auth.uid(),
  stage_type text not null check (stage_type in ('wet', 'dry', 'next_day')),
  captured_at timestamptz not null,
  notes text check (notes is null or length(notes) <= 4000),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  constraint stages_experiment_owner_fk foreign key (experiment_id, user_id)
    references public.experiments (id, user_id) on delete cascade,
  constraint stages_id_user_unique unique (id, user_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null,
  user_id uuid not null default auth.uid(),
  angle text not null check (angle in ('front', 'left', 'right', 'back')),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 15728640),
  created_at timestamptz not null default now(),
  constraint photos_stage_owner_fk foreign key (stage_id, user_id)
    references public.stages (id, user_id) on delete cascade,
  constraint photos_stage_angle_unique unique (stage_id, angle),
  constraint photos_storage_path_unique unique (storage_path),
  -- O caminho precisa ser <user_id>/<stage_id>/<photo_id>.<ext>
  constraint photos_storage_path_format check (
    storage_path ~ ('^' || user_id::text || '/' || stage_id::text || '/' || id::text || '\.(jpg|png|webp)$')
  )
);

create index experiments_user_created_idx on public.experiments (user_id, created_at desc);
create index stages_user_captured_idx on public.stages (user_id, captured_at desc);
create index stages_experiment_captured_idx on public.stages (experiment_id, captured_at);
create index photos_user_idx on public.photos (user_id);
-- photos_stage_angle_unique já cobre consultas por stage_id.

-- ---------------------------------------------------------------------------
-- RLS: cada usuário autenticado enxerga e grava apenas os próprios registros.
-- ---------------------------------------------------------------------------
alter table public.experiments enable row level security;
alter table public.stages enable row level security;
alter table public.photos enable row level security;

-- Privilégios mínimos. anon não acessa nada.
revoke all on public.experiments, public.stages, public.photos from anon, authenticated;
grant select, insert on public.experiments to authenticated;
grant select, insert on public.stages to authenticated;
grant update (notes, is_favorite) on public.stages to authenticated;
grant select, insert on public.photos to authenticated;

create policy experiments_select_own on public.experiments
  for select to authenticated using (user_id = (select auth.uid()));
create policy experiments_insert_own on public.experiments
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy stages_select_own on public.stages
  for select to authenticated using (user_id = (select auth.uid()));
create policy stages_insert_own on public.stages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy stages_update_own on public.stages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy photos_select_own on public.photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy photos_insert_own on public.photos
  for insert to authenticated with check (user_id = (select auth.uid()));
