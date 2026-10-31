-- Apply to the same isolated PostgreSQL fixture AFTER v1 acceptance and v2 migration.
-- Contains no production/user data, and never deletes tasks.
insert into public.minds_work_buckets(id,user_id,project_id,name,sort_order)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
'11111111-1111-4111-8111-111111111111',
'33333333-3333-4333-8333-333333333333','Completed-only history',50);

insert into public.isabella_tasks
(id,user_id,project_id,work_bucket_id,work_sort_order,title,completed_at,archived_at)
values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8',
'11111111-1111-4111-8111-111111111111',
'33333333-3333-4333-8333-333333333333',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',10,'finished',now(),null),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9',
'11111111-1111-4111-8111-111111111111',
'33333333-3333-4333-8333-333333333333',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',20,'pending',null,null);
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  moved integer; restored boolean;
  v_project uuid := '33333333-3333-4333-8333-333333333333';
  v_bucket uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
begin
  select public.minds_work_bucket_archive(v_project,v_bucket) into moved;
  if moved<>1 then raise exception 'Only pending task must move (got %)', moved; end if;
  if not (select archived from public.minds_work_buckets where id=v_bucket)
  then raise exception 'Bucket must be archived'; end if;
  if (select work_bucket_id from public.isabella_tasks where title='finished')<>v_bucket
  then raise exception 'Completed task lost its history Bucket'; end if;
  if (select work_bucket_id from public.isabella_tasks where title='pending') is not null
  then raise exception 'Unfinished task was orphaned'; end if;
  if (select count(*) from public.isabella_tasks)<>5
  then raise exception 'Task records lost'; end if;
  select public.minds_work_bucket_restore(v_project,v_bucket) into restored;
  if not restored or (select archived from public.minds_work_buckets where id=v_bucket)
  then raise exception 'Bucket restore failed'; end if;
  if (select work_bucket_id from public.isabella_tasks where title='finished')<>v_bucket
  then raise exception 'Restore changed completed task'; end if;
  if (select work_bucket_id from public.isabella_tasks where title='pending') is not null
  then raise exception 'Restore incorrectly moved pending task'; end if;
  select public.minds_work_bucket_archive(v_project,v_bucket) into moved;
  if moved<>0 then raise exception 'Completed-only Bucket must move zero tasks'; end if;
  if (select work_bucket_id from public.isabella_tasks where title='finished')<>v_bucket
  then raise exception 'Completed-only archive rewrote history'; end if;
end
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.minds_work_bucket_restore(
      '33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9');
    raise exception 'Foreign user unexpectedly restored Bucket';
  exception when sqlstate '42501' then null;
  end;
end
$$;
reset role;

do $$
begin
  if pg_catalog.has_function_privilege('anon','public.minds_work_bucket_restore(uuid,uuid)','EXECUTE')
  then raise exception 'Restore callable by anon'; end if;
end
$$;
select 'Bucket completed-history v2 acceptance PASS' result;
