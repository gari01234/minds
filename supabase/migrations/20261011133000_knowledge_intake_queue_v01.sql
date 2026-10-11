-- MINDS Knowledge Intake 0.1 — reliable queue, not a second knowledge authority.
-- Every newly registered Work/Desktop file creates exactly one server-owned job.
-- Existing originals are not reprocessed until the worker is accepted.
create table if not exists public.minds_work_ingest_queue (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.minds_work_files(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','processing','completed','failed','skipped')),
  attempts integer not null default 0 check(attempts between 0 and 20),
  last_error text,
  source_version text,
  parser_name text,
  locked_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists minds_work_ingest_claim_idx
  on public.minds_work_ingest_queue(status,next_attempt_at,created_at)
  where status in ('queued','processing');
alter table public.minds_work_ingest_queue enable row level security;
revoke all on public.minds_work_ingest_queue from public,anon,authenticated;
grant select on public.minds_work_ingest_queue to authenticated;
grant select,insert,update,delete on public.minds_work_ingest_queue to service_role;
create policy minds_work_ingest_owner_read on public.minds_work_ingest_queue
  for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.minds_enqueue_new_work_file()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  -- A queue receipt does not mean the document has been parsed or indexed.
  insert into public.minds_work_ingest_queue(file_id,project_id,user_id)
  values(new.id,new.project_id,new.user_id)
  on conflict (file_id) do nothing;
  update public.minds_work_files
    set index_status='queued', updated_at=now()
    where id=new.id and index_status='stored';
  return new;
end $$;
revoke all on function public.minds_enqueue_new_work_file() from public,anon,authenticated;
drop trigger if exists minds_enqueue_work_file_on_insert on public.minds_work_files;
create trigger minds_enqueue_work_file_on_insert
after insert on public.minds_work_files
for each row execute function public.minds_enqueue_new_work_file();

-- The claim RPC is service-only and uses row locks; browser closure is irrelevant.
create or replace function public.minds_claim_work_ingest(p_limit integer default 2)
returns setof public.minds_work_ingest_queue
language sql security definer set search_path to 'public','pg_temp'
as $$
  with candidates as (
    select id from public.minds_work_ingest_queue
    where attempts < 4 and next_attempt_at <= now()
      and (status='queued'
        or (status='processing' and locked_at < now()-interval '8 minutes'))
    order by created_at, id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),3))
  )
  update public.minds_work_ingest_queue q
  set status='processing',attempts=q.attempts+1,locked_at=now(),updated_at=now()
  from candidates c where q.id=c.id returning q.*;
$$;
revoke all on function public.minds_claim_work_ingest(integer) from public,anon,authenticated;
grant execute on function public.minds_claim_work_ingest(integer) to service_role;

-- No destructive backfill; the first real pilot is deliberately explicit.
