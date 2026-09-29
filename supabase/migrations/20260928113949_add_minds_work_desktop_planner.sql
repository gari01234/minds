
create table if not exists public.minds_work_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  parent_id uuid null references public.minds_work_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 1 and 160)
);
create index if not exists minds_work_folders_project_parent_idx on public.minds_work_folders(user_id,project_id,parent_id,sort_order,name);

create table if not exists public.minds_work_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  folder_id uuid null references public.minds_work_folders(id) on delete set null,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_path text not null,
  source_kind text not null default 'file' check (source_kind in ('file','email','document','image','other')),
  index_status text not null default 'stored' check (index_status in ('stored','queued','indexed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,storage_path)
);
create index if not exists minds_work_files_project_folder_idx on public.minds_work_files(user_id,project_id,folder_id,created_at desc);
create index if not exists minds_work_files_name_idx on public.minds_work_files(user_id,project_id,name);

create table if not exists public.minds_work_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 1 and 120)
);
create index if not exists minds_work_buckets_project_idx on public.minds_work_buckets(user_id,project_id,archived,sort_order);

create table if not exists public.minds_work_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  memory_type text not null check (memory_type in ('fact','decision','open_question','commitment','deadline','person','document_state','other')),
  title text not null,
  body text not null default '',
  status text not null default 'proposed' check (status in ('proposed','confirmed','superseded','resolved','rejected')),
  source_file_ids uuid[] not null default '{}'::uuid[],
  provenance jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists minds_work_memory_project_idx on public.minds_work_memory(user_id,project_id,status,memory_type,updated_at desc);

alter table public.isabella_tasks
  add column if not exists work_bucket_id uuid null references public.minds_work_buckets(id) on delete set null,
  add column if not exists work_status text not null default 'not_started',
  add column if not exists priority text not null default 'normal',
  add column if not exists start_date date null,
  add column if not exists assignee text null,
  add column if not exists labels jsonb not null default '[]'::jsonb,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='isabella_tasks_work_status_check') then
    alter table public.isabella_tasks add constraint isabella_tasks_work_status_check
      check (work_status in ('not_started','in_progress','waiting','completed'));
  end if;
  if not exists (select 1 from pg_constraint where conname='isabella_tasks_priority_check') then
    alter table public.isabella_tasks add constraint isabella_tasks_priority_check
      check (priority in ('low','normal','important','urgent'));
  end if;
end $$;

alter table public.minds_work_folders enable row level security;
alter table public.minds_work_files enable row level security;
alter table public.minds_work_buckets enable row level security;
alter table public.minds_work_memory enable row level security;

drop policy if exists "work_folders_own" on public.minds_work_folders;
create policy "work_folders_own" on public.minds_work_folders for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "work_files_own" on public.minds_work_files;
create policy "work_files_own" on public.minds_work_files for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "work_buckets_own" on public.minds_work_buckets;
create policy "work_buckets_own" on public.minds_work_buckets for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "work_memory_own" on public.minds_work_memory;
create policy "work_memory_own" on public.minds_work_memory for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id,name,public,file_size_limit)
values ('minds-work','minds-work',false,104857600)
on conflict (id) do update set public=false,file_size_limit=104857600;

drop policy if exists "minds_work_storage_select" on storage.objects;
create policy "minds_work_storage_select" on storage.objects for select to authenticated
using (bucket_id='minds-work' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "minds_work_storage_insert" on storage.objects;
create policy "minds_work_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id='minds-work' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "minds_work_storage_update" on storage.objects;
create policy "minds_work_storage_update" on storage.objects for update to authenticated
using (bucket_id='minds-work' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id='minds-work' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "minds_work_storage_delete" on storage.objects;
create policy "minds_work_storage_delete" on storage.objects for delete to authenticated
using (bucket_id='minds-work' and (storage.foldername(name))[1] = auth.uid()::text);
