-- Knowledge Coverage 0.6: document text segments are evidence, not authoritative Claims.
-- Canonical originals remain in minds-work Storage / minds_work_files.
create table if not exists public.minds_work_source_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  file_id uuid not null references public.minds_work_files(id) on delete cascade,
  source_version text not null check(length(source_version)=64),
  segment_no integer not null check(segment_no between 0 and 249),
  segment_kind text not null check(segment_kind in ('sheet_rows','page_text','unpaged_text')),
  locator jsonb not null default '{}'::jsonb check(jsonb_typeof(locator)='object'),
  content text not null check(length(content) between 1 and 6500),
  extractor text not null,
  created_at timestamptz not null default now(),
  unique(file_id,source_version,segment_no)
);
create index if not exists minds_work_source_segments_project_idx
 on public.minds_work_source_segments(user_id,project_id,file_id,segment_no);
create index if not exists minds_work_source_segments_text_idx
 on public.minds_work_source_segments using gin(to_tsvector('simple',content));
alter table public.minds_work_source_segments enable row level security;
revoke all on public.minds_work_source_segments from public,anon,authenticated;
grant select on public.minds_work_source_segments to authenticated;
grant select,insert,update,delete on public.minds_work_source_segments to service_role;
create policy minds_work_source_segments_owner_select
 on public.minds_work_source_segments for select to authenticated
 using(user_id=(select auth.uid()));

create table if not exists public.minds_work_source_text_receipts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.isabella_projects(id) on delete cascade,
 file_id uuid not null references public.minds_work_files(id) on delete cascade,
 source_version text not null check(length(source_version)=64),
 extractor text not null,
 coverage text not null check(coverage in ('complete_text','partial_text')),
 segment_count integer not null check(segment_count between 1 and 250),
 content_chars integer not null check(content_chars>0),
 locator_class text not null check(locator_class in ('worksheet_rows','pdf_page','unverified_page')),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now(),
 unique(file_id,source_version)
);
alter table public.minds_work_source_text_receipts enable row level security;
revoke all on public.minds_work_source_text_receipts from public,anon,authenticated;
grant select on public.minds_work_source_text_receipts to authenticated;
grant select,insert,update,delete on public.minds_work_source_text_receipts to service_role;
create policy minds_work_source_text_receipts_owner_select
 on public.minds_work_source_text_receipts for select to authenticated
 using(user_id=(select auth.uid()));

