
create table if not exists public.minds_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  workspace_id uuid references public.minds_idea_workspaces(id) on delete cascade,
  source_kind text not null default 'chat',
  kind text not null check (kind in ('image','docx','pdf','markdown')),
  title text not null,
  mime_type text not null,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.minds_artifacts enable row level security;

drop policy if exists "minds_artifacts_select_own" on public.minds_artifacts;
create policy "minds_artifacts_select_own" on public.minds_artifacts for select to authenticated using (auth.uid()=user_id);
drop policy if exists "minds_artifacts_insert_own" on public.minds_artifacts;
create policy "minds_artifacts_insert_own" on public.minds_artifacts for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists "minds_artifacts_update_own" on public.minds_artifacts;
create policy "minds_artifacts_update_own" on public.minds_artifacts for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "minds_artifacts_delete_own" on public.minds_artifacts;
create policy "minds_artifacts_delete_own" on public.minds_artifacts for delete to authenticated using (auth.uid()=user_id);

create table if not exists public.minds_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.minds_ai_usage enable row level security;

drop policy if exists "minds_ai_usage_select_own" on public.minds_ai_usage;
create policy "minds_ai_usage_select_own" on public.minds_ai_usage for select to authenticated using (auth.uid()=user_id);
drop policy if exists "minds_ai_usage_insert_own" on public.minds_ai_usage;
create policy "minds_ai_usage_insert_own" on public.minds_ai_usage for insert to authenticated with check (auth.uid()=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'minds-artifacts','minds-artifacts',false,20971520,
  array['image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/pdf','text/markdown']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "minds_artifact_objects_select_own" on storage.objects;
create policy "minds_artifact_objects_select_own" on storage.objects
for select to authenticated using (
  bucket_id='minds-artifacts' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "minds_artifact_objects_insert_own" on storage.objects;
create policy "minds_artifact_objects_insert_own" on storage.objects
for insert to authenticated with check (
  bucket_id='minds-artifacts' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "minds_artifact_objects_delete_own" on storage.objects;
create policy "minds_artifact_objects_delete_own" on storage.objects
for delete to authenticated using (
  bucket_id='minds-artifacts' and (storage.foldername(name))[1]=auth.uid()::text
);
