create table public.minds_capability_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('general_execution','image_generation')),
  origin_kind text not null default 'chat' check (origin_kind in ('chat','work_thread','mission','system')),
  conversation_id uuid null references public.conversations(id) on delete set null,
  project_id uuid null references public.isabella_projects(id) on delete set null,
  work_thread_id uuid null references public.minds_work_threads(id) on delete set null,
  title text not null,
  request text not null,
  status text not null default 'queued' check (status in ('queued','in_progress','completed','failed','cancelled')),
  provider text not null default 'openai_responses' check (provider='openai_responses'),
  provider_response_id text null,
  provider_container_id text null,
  artifact_ids uuid[] not null default '{}'::uuid[],
  summary text not null default '',
  error text null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) between 1 and 240),
  check (length(trim(request)) between 1 and 20000),
  check (jsonb_typeof(metadata)='object')
);

create index minds_capability_runs_user_status_idx on public.minds_capability_runs(user_id,status,updated_at desc);
create index minds_capability_runs_conversation_idx on public.minds_capability_runs(conversation_id) where conversation_id is not null;
create index minds_capability_runs_project_idx on public.minds_capability_runs(project_id,updated_at desc) where project_id is not null;
create index minds_capability_runs_thread_idx on public.minds_capability_runs(work_thread_id,updated_at desc) where work_thread_id is not null;
create unique index minds_capability_runs_provider_response_uidx on public.minds_capability_runs(provider_response_id) where provider_response_id is not null;

alter table public.minds_capability_runs enable row level security;
create policy "capability_runs_select_own" on public.minds_capability_runs for select to authenticated using ((select auth.uid())=user_id);
revoke all on table public.minds_capability_runs from authenticated;
grant select on table public.minds_capability_runs to authenticated;
revoke all on table public.minds_capability_runs from anon;

alter table public.minds_artifacts drop constraint if exists minds_artifacts_kind_check;
alter table public.minds_artifacts add constraint minds_artifacts_kind_check check (kind = any(array[
  'image'::text,'docx'::text,'pdf'::text,'markdown'::text,'xlsx'::text,'pptx'::text,'csv'::text,'zip'::text,'html'::text,'txt'::text,'json'::text
]));

update storage.buckets set allowed_mime_types=array[
  'image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf','text/markdown','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','application/csv','application/zip',
  'text/html','text/plain','application/json'
]::text[] where id='minds-artifacts';
