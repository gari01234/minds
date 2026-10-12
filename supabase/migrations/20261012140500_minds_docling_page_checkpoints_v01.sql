-- Knowledge Coverage 1.7: durable private staging of bounded Docling PDF conversions.
-- Never a second source of truth: the canonical original stays in minds-work
-- Storage; only a finalized set enters minds_work_source_segments.
create table if not exists public.minds_work_docling_page_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  file_id uuid not null references public.minds_work_files(id) on delete cascade,
  source_version text not null check (source_version ~ '^[0-9a-f]{64}$'),
  page_start integer not null check(page_start between 1 and 2000),
  page_end integer not null check(page_end between 1 and 2000 and page_end>=page_start),
  total_pages integer not null check(total_pages between 1 and 2000 and total_pages>=page_end),
  status text not null default 'queued'
    check(status in ('queued','submitted','completed','needs_review')),
  docling_task_id text null
    check(docling_task_id is null or
      (length(docling_task_id) between 8 and 192 and docling_task_id ~ '^[A-Za-z0-9_-]+$')),
  attempts integer not null default 0 check(attempts between 0 and 4),
  segments jsonb not null default '[]'::jsonb
    check(jsonb_typeof(segments)='array' and jsonb_array_length(segments)<=250),
  markdown text not null default '' check(length(markdown)<=48000),
  reason text null check(reason is null or length(reason)<=120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(file_id,source_version,page_start,page_end),
  check((status='completed' and docling_task_id is null and jsonb_array_length(segments)>0)
     or (status<>'completed' and jsonb_array_length(segments)=0))
);
create index if not exists minds_work_docling_page_chunks_lookup
  on public.minds_work_docling_page_chunks(file_id,source_version,page_start);
create index if not exists minds_work_docling_page_chunks_pending
  on public.minds_work_docling_page_chunks(status,updated_at)
  where status in ('queued','submitted');
alter table public.minds_work_docling_page_chunks enable row level security;
-- No client policy: the worker uses the existing service role after authenticating.
revoke all on table public.minds_work_docling_page_chunks from public,anon,authenticated;
grant select,insert,update,delete on public.minds_work_docling_page_chunks to service_role;
comment on table public.minds_work_docling_page_chunks is
 'Private, versioned, per-range conversion checkpoints; never exposed as complete evidence until canonical source receipt commits.';
