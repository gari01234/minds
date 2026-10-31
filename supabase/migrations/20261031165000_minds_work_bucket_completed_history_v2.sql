-- MINDS Work · completed-task bucket history · 2026-10-31
-- Change archive semantics without rewriting any existing row during installation.
-- A visually empty Bucket (only completed tasks) can leave the board without
-- relocating completed tasks to "Ohne Bucket". Pending tasks remain accessible.
-- Both procedures run as caller under existing row-level security.

create or replace function public.minds_work_bucket_archive(
  p_project_id uuid,
  p_bucket_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_moved integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_project_id is null or p_bucket_id is null then
    raise exception 'Invalid Work bucket' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_project_id::text || ':work-buckets', 0)
  );

  if not exists (
    select 1 from public.minds_work_buckets
    where id = p_bucket_id and project_id = p_project_id
      and user_id = v_uid and archived = false
    for update
  ) then
    raise exception 'Work bucket does not exist or is not accessible'
      using errcode = '42501';
  end if;

  -- Only unfinished tasks need a new active home. Includes unfinished tasks
  -- archived independently from Planner, if any, to avoid orphaning work.
  update public.isabella_tasks
     set work_bucket_id = null, updated_at = now()
   where user_id = v_uid and project_id = p_project_id
     and work_bucket_id = p_bucket_id
     and completed_at is null;
  get diagnostics v_moved = row_count;

  -- Finished tasks stay linked to the archived Bucket for audit/history.
  update public.minds_work_buckets
     set archived = true, updated_at = now()
   where id = p_bucket_id and user_id = v_uid
     and project_id = p_project_id and archived = false;

  return v_moved;
end;
$$;

create or replace function public.minds_work_bucket_restore(
  p_project_id uuid,
  p_bucket_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sort integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_project_id is null or p_bucket_id is null then
    raise exception 'Invalid Work bucket' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_project_id::text || ':work-buckets', 0)
  );

  if not exists (
    select 1 from public.minds_work_buckets
    where id = p_bucket_id and project_id = p_project_id
      and user_id = v_uid and archived = true
    for update
  ) then
    raise exception 'Archived Bucket does not exist or is not accessible'
      using errcode = '42501';
  end if;

  select coalesce(max(sort_order),0) + 10 into v_sort
    from public.minds_work_buckets
   where project_id = p_project_id and user_id = v_uid and archived = false;

  update public.minds_work_buckets
     set archived = false, sort_order = v_sort, updated_at = now()
   where id = p_bucket_id and user_id = v_uid
     and project_id = p_project_id and archived = true;

  return true;
end;
$$;

revoke all on function public.minds_work_bucket_restore(uuid,uuid) from public, anon;
grant execute on function public.minds_work_bucket_restore(uuid,uuid) to authenticated;

comment on function public.minds_work_bucket_archive(uuid,uuid) is
'Archive an owned Bucket; move only unfinished tasks to Ohne Bucket and retain completed tasks in the archived Bucket.';
comment on function public.minds_work_bucket_restore(uuid,uuid) is
'Restore an owned archived Work Bucket, retaining its completed-task history and appending it to the active board.';
