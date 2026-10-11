-- Docling Bridge 0.1: multi-run conversion, no long-lived Edge Function request.
-- The original file remains the source of truth; external task IDs are not claims.
alter table public.minds_work_ingest_queue
  add column if not exists docling_task_id text,
  add column if not exists docling_started_at timestamptz;

alter table public.minds_work_ingest_queue
  drop constraint if exists minds_work_ingest_queue_status_check;
alter table public.minds_work_ingest_queue
  add constraint minds_work_ingest_queue_status_check
  check(status in ('queued','processing','completed','failed','skipped',
                   'waiting_parser','docling_pending'));

alter table public.minds_work_ingest_queue
  add constraint minds_work_ingest_docling_task_check
  check(docling_task_id is null or
    (length(docling_task_id) between 8 and 192 and
     docling_task_id ~ '^[A-Za-z0-9_-]+$'));

create index if not exists minds_work_ingest_docling_pending_idx
 on public.minds_work_ingest_queue(next_attempt_at,created_at)
 where status='docling_pending';

-- Polling does not count as an extraction failure or spend the retry budget.
-- Interrupted leases are reclaimable; fresh Work uploads precede backfill.
create or replace function public.minds_claim_work_ingest(p_limit integer default 2)
returns setof public.minds_work_ingest_queue
language sql security definer set search_path to 'public','pg_temp'
as $$
  with candidates as (
    select q.id from public.minds_work_ingest_queue q
    where q.attempts<4 and q.next_attempt_at<=now()
      and (q.status in ('queued','docling_pending')
           or (q.status='processing' and q.locked_at<now()-interval '8 minutes'))
    order by q.is_backfill asc,q.created_at,q.id
    for update of q skip locked
    limit greatest(1,least(coalesce(p_limit,2),3))
  )
  update public.minds_work_ingest_queue q
  set status='processing',
    attempts=case when q.status='docling_pending' then q.attempts else q.attempts+1 end,
    locked_at=now(),updated_at=now()
  from candidates c where q.id=c.id returning q.*;
$$;
revoke all on function public.minds_claim_work_ingest(integer)
 from public,anon,authenticated;
grant execute on function public.minds_claim_work_ingest(integer) to service_role;
