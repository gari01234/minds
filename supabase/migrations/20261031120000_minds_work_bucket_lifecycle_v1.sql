-- MINDS Work · owner-scoped Bucket lifecycle and ordering (2026-10-31).
-- The "delete" action archives the bucket, detaches its tasks atomically
-- into "Ohne Bucket", and never deletes the tasks or their content.
-- Existing Work/Calendar task ordering remains independent.

create or replace function public.minds_work_bucket_reorder(
  p_project_id uuid,
  p_bucket_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_project_id is null or p_bucket_ids is null
     or cardinality(p_bucket_ids) > 200 then
    raise exception 'Invalid Work bucket order' using errcode = '22023';
  end if;

  -- Serialize ordering operations for this owner and project, without elevating privileges.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_uid::text || ':' || p_project_id::text || ':work-buckets', 0)
  );

  select count(*) into v_count
    from public.minds_work_buckets
   where user_id = v_uid and project_id = p_project_id and archived = false;

  -- No missing/duplicate/foreign/archived IDs can ever enter this update.
  if cardinality(p_bucket_ids) <> v_count
     or (select count(distinct id) from unnest(p_bucket_ids) as ids(id)) <> v_count
     or exists(
       select 1 from unnest(p_bucket_ids) as ids(id)
       where ids.id is null or not exists(
         select 1 from public.minds_work_buckets b
         where b.id = ids.id and b.user_id = v_uid
           and b.project_id = p_project_id and b.archived = false
       )
     ) then
    raise exception 'Work buckets changed. Reload before reordering.' using errcode = '22023';
  end if;

  update public.minds_work_buckets b
     set sort_order = (ordered.ordinality - 1) * 10,
         updated_at = now()
    from unnest(p_bucket_ids) with ordinality as ordered(id, ordinality)
   where b.id = ordered.id and b.user_id = v_uid
     and b.project_id = p_project_id and b.archived = false;
  return v_count;
end;
$$;

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

  -- Row ownership and project identity must both be true. Also respects RLS.
  if not exists (
    select 1 from public.minds_work_buckets
    where id = p_bucket_id and project_id = p_project_id
      and user_id = v_uid and archived = false
    for update
  ) then
    raise exception 'Work bucket does not exist or is not accessible' using errcode = '42501';
  end if;

  -- Keep all tasks, including completed/archived tasks, with existing task ordering.
  update public.isabella_tasks
     set work_bucket_id = null, updated_at = now()
   where user_id = v_uid and project_id = p_project_id
     and work_bucket_id = p_bucket_id;
  get diagnostics v_moved = row_count;

  update public.minds_work_buckets
     set archived = true, updated_at = now()
   where id = p_bucket_id and user_id = v_uid
     and project_id = p_project_id and archived = false;

  return v_moved;
end;
$$;

revoke all on function public.minds_work_bucket_reorder(uuid,uuid[]) from public, anon;
revoke all on function public.minds_work_bucket_archive(uuid,uuid) from public, anon;
grant execute on function public.minds_work_bucket_reorder(uuid,uuid[]) to authenticated;
grant execute on function public.minds_work_bucket_archive(uuid,uuid) to authenticated;

comment on function public.minds_work_bucket_archive(uuid,uuid) is
'Archive a user-owned Work bucket and move its tasks to Ohne Bucket atomically; no task is deleted.';
comment on function public.minds_work_bucket_reorder(uuid,uuid[]) is
'Atomically reorder exactly the active user-owned Work buckets within one project.';
