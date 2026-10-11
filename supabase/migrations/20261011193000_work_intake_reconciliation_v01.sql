-- Knowledge Coverage 0.7: unattended, bounded Work intake with honest parser deferral.
-- Uploads are already enqueued by a database trigger. This stage progressively
-- discovers historical originals and retains unprocessable documents as pending.
-- It never manufactures knowledge, alters claims, or silently accepts project truth.
alter table public.minds_work_ingest_queue
  drop constraint if exists minds_work_ingest_queue_status_check;
alter table public.minds_work_ingest_queue
  add constraint minds_work_ingest_queue_status_check
  check (status in ('queued','processing','completed','failed','skipped','waiting_parser'));

alter table public.minds_work_files
  drop constraint if exists minds_work_files_index_status_check;
alter table public.minds_work_files
  add constraint minds_work_files_index_status_check
  check (index_status in ('stored','queued','indexed','failed','waiting_parser'));

alter table public.minds_work_ingest_queue
  add column if not exists is_backfill boolean not null default false;

-- Only the service role may reconcile. SECURITY INVOKER keeps row authority
-- with the service caller rather than introducing an exposed definer.
create or replace function public.minds_reconcile_work_ingest(
  p_limit integer default 1,p_docling_ready boolean default false
) returns jsonb language plpgsql security invoker
set search_path to 'public','pg_temp' as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,1),2));
  v_resumed integer:=0;
  v_found integer:=0;
  v_waiting integer:=0;
begin
  if p_docling_ready then
    with ready as (
      select q.id,q.file_id from public.minds_work_ingest_queue q
      join public.minds_work_files f on f.id=q.file_id
      where q.status='waiting_parser'
        and q.last_error in ('docling_required_large_source','needs_private_docling_image')
        and f.size_bytes<=50331648
      order by q.updated_at,q.id
      for update of q skip locked limit v_limit
    ), resumed as (
      update public.minds_work_ingest_queue q
      set status='queued',attempts=0,last_error=null,locked_at=null,
        completed_at=null,next_attempt_at=now(),updated_at=now()
      from ready where q.id=ready.id returning q.file_id
    ), updated as (
      update public.minds_work_files f set index_status='queued',updated_at=now()
      from resumed where f.id=resumed.file_id returning f.id
    )
    select count(*)::integer into v_resumed from resumed;
  end if;

  -- Never requeue a completed source merely because it is historic.
  -- Only originals without any receipt are discovered; this is bounded.
  with candidates as (
    select f.id,f.project_id,f.user_id,f.name,f.size_bytes
    from public.minds_work_files f
    where f.index_status='stored'
      and not exists(select 1 from public.minds_work_ingest_queue q where q.file_id=f.id)
    order by f.created_at,f.id
    for update of f skip locked
    limit v_limit
  ), classified as (
    select c.*,
      case
        when c.size_bytes>50331648 then 'needs_larger_worker'
        when lower(c.name) !~ '[.](pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|rtf|eml|png|jpg|jpeg)$'
          then 'needs_format_reader'
        when c.size_bytes>20971520 then 'docling_required_large_source'
        when lower(c.name) ~ '[.](png|jpg|jpeg)$' and c.size_bytes>8388608
          then 'needs_private_docling_image'
        else null
      end as deferred_reason
    from candidates c
  ), inserted as (
    insert into public.minds_work_ingest_queue(
      file_id,project_id,user_id,status,is_backfill,last_error
    )
    select id,project_id,user_id,
      case when deferred_reason is null then 'queued' else 'waiting_parser' end,
      true,deferred_reason from classified
    on conflict(file_id) do nothing
    returning file_id,status
  ), updated as (
    update public.minds_work_files f
    set index_status=i.status,updated_at=now()
    from inserted i where f.id=i.file_id returning f.id
  )
  select count(*)::integer,
     count(*) filter(where status='waiting_parser')::integer
  into v_found,v_waiting from inserted;

  return jsonb_build_object('discovered',v_found,'waiting_parser',v_waiting,'resumed',v_resumed);
end $$;
revoke all on function public.minds_reconcile_work_ingest(integer,boolean)
  from public,anon,authenticated;
grant execute on function public.minds_reconcile_work_ingest(integer,boolean)
  to service_role;

-- A weekly new upload must take priority over the one-time historical backlog.
create or replace function public.minds_claim_work_ingest(p_limit integer default 2)
returns setof public.minds_work_ingest_queue
language sql security definer set search_path to 'public','pg_temp'
as $$
  with candidates as (
    select q.id from public.minds_work_ingest_queue q
    where q.attempts<4 and q.next_attempt_at<=now()
      and (q.status='queued'
        or (q.status='processing' and q.locked_at<now()-interval '8 minutes'))
    order by q.is_backfill asc,q.created_at,q.id
    for update of q skip locked
    limit greatest(1,least(coalesce(p_limit,2),3))
  )
  update public.minds_work_ingest_queue q
  set status='processing',attempts=q.attempts+1,locked_at=now(),updated_at=now()
  from candidates c where q.id=c.id returning q.*;
$$;
revoke all on function public.minds_claim_work_ingest(integer)
  from public,anon,authenticated;
grant execute on function public.minds_claim_work_ingest(integer)
  to service_role;
