-- Build 84.2 — source-first project ingestion receipts.
-- A source may be read many times, but one material version is ingested only once unless explicitly re-read.

create table if not exists public.minds_project_source_ingestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  source_kind text not null check (source_kind in ('work_file','thread_message','manual')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 240),
  source_version text not null check (length(trim(source_version)) between 1 and 256),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  model text null,
  referent_count integer not null default 0 check (referent_count>=0),
  claim_count integer not null default 0 check (claim_count>=0),
  extraction_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_metadata)='object'),
  error text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(user_id,project_id,source_kind,source_ref,source_version)
);

create index if not exists minds_project_source_ingestions_project_idx
  on public.minds_project_source_ingestions(user_id,project_id,created_at desc);

alter table public.minds_project_source_ingestions enable row level security;

drop policy if exists "project_source_ingestions_select_own" on public.minds_project_source_ingestions;
create policy "project_source_ingestions_select_own" on public.minds_project_source_ingestions
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_project_source_ingestions from anon,authenticated;
grant select on public.minds_project_source_ingestions to authenticated;
grant select,insert,update,delete on public.minds_project_source_ingestions to service_role;
