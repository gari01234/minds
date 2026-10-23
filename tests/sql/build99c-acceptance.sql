-- The exact Build 99C migration was applied before this script.
-- Every test runs against synthetic fixtures inside ephemeral PostgreSQL 17.
\set ON_ERROR_STOP on
do $$
begin
 if (select count(*) from public.minds_work_task_assignees
      where task_id='99999999-9999-4999-8999-999999999991'
        and person_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        and project_id='11111111-1111-4111-8111-111111111111') <> 1 then
   raise exception 'Legacy primary backfill failed';
 end if;
 if not exists(select 1 from pg_constraint where conname='minds_work_task_assignees_membership_fk'
               and contype='f' and confdeltype='r') then
   raise exception 'Restrictive membership FK missing';
 end if;
 if not exists(select 1 from pg_constraint where conname='minds_work_task_allocations_assignee_fk'
               and contype='f' and condeferrable and condeferred and confdeltype='a') then
   raise exception 'Deferred NO ACTION on team allocations missing';
 end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.minds_work_set_task_assignees(
 '99999999-9999-4999-8999-999999999991',
 array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2']::uuid[],
 (select updated_at from public.isabella_tasks where id='99999999-9999-4999-8999-999999999991')
);
insert into public.minds_work_task_allocations(task_id,person_id,work_date,planned_minutes)
values('99999999-9999-4999-8999-999999999991','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','2026-10-27',120);

-- Membership of a secondary responsible must not disappear while assigned.
do $$
begin
 begin
   delete from public.minds_work_project_people
    where project_id='11111111-1111-4111-8111-111111111111'
      and person_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
   raise exception 'Unexpected membership removal succeeded';
 exception when foreign_key_violation then null;
 end;
 if (select count(*) from public.minds_work_task_allocations
     where task_id='99999999-9999-4999-8999-999999999991') <> 1 then
   raise exception 'Planned minutes were deleted after rejected membership removal';
 end if;
end $$;

-- Direct deletion of a responsibility must not erase planned minutes.
-- Forcing deferred checks here simulates the transaction commit boundary.
do $$
begin
 begin
   delete from public.minds_work_task_assignees
    where task_id='99999999-9999-4999-8999-999999999991'
      and person_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
   set constraints minds_work_task_allocations_assignee_fk immediate;
   raise exception 'Unexpected direct unassignment succeeded';
 exception when foreign_key_violation then null;
 end;
 if (select count(*) from public.minds_work_task_allocations
     where task_id='99999999-9999-4999-8999-999999999991') <> 1 then
   raise exception 'Planned minutes lost on direct unassignment';
 end if;
end $$;

-- RPC must reject removing a responsible who has scheduled team allocations.
do $$
declare message text;
begin
 begin
   perform public.minds_work_set_task_assignees(
      '99999999-9999-4999-8999-999999999991',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']::uuid[],
      (select updated_at from public.isabella_tasks where id='99999999-9999-4999-8999-999999999991'));
   raise exception 'Unexpected RPC unassignment succeeded';
 exception when raise_exception then
   get stacked diagnostics message=message_text;
   if message <> 'Remove planned team days before unassigning this person' then raise; end if;
 end;
end $$;

-- Non-member of the task's project cannot be assigned.
do $$
declare message text;
begin
 begin
   perform public.minds_work_set_task_assignees(
      '99999999-9999-4999-8999-999999999991',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3']::uuid[],
      (select updated_at from public.isabella_tasks where id='99999999-9999-4999-8999-999999999991'));
   raise exception 'Unexpected nonmember assignment succeeded';
 exception when raise_exception then
   get stacked diagnostics message=message_text;
   if message <> 'Responsible is not a member of this project' then raise; end if;
 end;
end $$;

-- CAS mismatch cannot silently overwrite another editor's change.
do $$
declare message text;
begin
 begin
   perform public.minds_work_set_task_assignees(
      '99999999-9999-4999-8999-999999999991',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']::uuid[],
      '2000-01-01T00:00:00+00'::timestamptz);
   raise exception 'Unexpected stale CAS success';
 exception when raise_exception then
   get stacked diagnostics message=message_text;
   if message <> 'Task changed since it was opened' then raise; end if;
 end;
end $$;

-- A secondary cannot be assigned against a valid-but-wrong project ID.
do $$
declare message text;
begin
 begin
   insert into public.minds_work_task_assignees(task_id,person_id,project_id)
   values ('99999999-9999-4999-8999-999999999991',
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
           '22222222-2222-4222-8222-222222222222');
   raise exception 'Unexpected cross-project direct assignment succeeded';
 exception when raise_exception then
   get stacked diagnostics message=message_text;
   if message <> 'Responsible must belong to the task project' then raise; end if;
 end;
end $$;

-- RLS: a different authenticated owner cannot read the team's rows.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
begin
 if exists(select 1 from public.minds_work_task_assignees)
    or exists(select 1 from public.minds_work_task_allocations) then
   raise exception 'Team data leaked to another authenticated owner';
 end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

-- Explicit removal path: first clear allocations, then remove team responsibility
-- through the atomic RPC, then remove the former project member.
delete from public.minds_work_task_allocations
 where task_id='99999999-9999-4999-8999-999999999991'
   and person_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
select public.minds_work_set_task_assignees(
 '99999999-9999-4999-8999-999999999991',
 array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']::uuid[],
 (select updated_at from public.isabella_tasks where id='99999999-9999-4999-8999-999999999991'));
delete from public.minds_work_project_people
 where project_id='11111111-1111-4111-8111-111111111111'
   and person_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

-- Project moves cannot silently drop planned team days; after clearing them,
-- the existing AFTER UPDATE trigger may clear old-project assignees safely.
select public.minds_work_set_task_assignees(
 '99999999-9999-4999-8999-999999999992',
 array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3']::uuid[],
 (select updated_at from public.isabella_tasks where id='99999999-9999-4999-8999-999999999992')
);
insert into public.minds_work_task_allocations(task_id,person_id,work_date,planned_minutes)
values ('99999999-9999-4999-8999-999999999992','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','2026-10-29',90);
do $build99c$
declare message text;
begin
 begin
   update public.isabella_tasks
     set project_id='11111111-1111-4111-8111-111111111111',
         assignee_person_id=null,assignee=null
     where id='99999999-9999-4999-8999-999999999992';
   raise exception 'Unexpected move with team allocations succeeded';
 exception when raise_exception then
   get stacked diagnostics message=message_text;
   if message <> 'Remove planned team days before moving the task to another project' then raise; end if;
 end;
 if (select project_id from public.isabella_tasks where id='99999999-9999-4999-8999-999999999992')
      <> '22222222-2222-4222-8222-222222222222'::uuid then
   raise exception 'Rejected project move changed original task';
 end if;
 if (select count(*) from public.minds_work_task_allocations
    where task_id='99999999-9999-4999-8999-999999999992') <> 1 then
   raise exception 'Rejected project move discarded planned days';
 end if;
end $build99c$;
delete from public.minds_work_task_allocations
 where task_id='99999999-9999-4999-8999-999999999992';
update public.isabella_tasks
 set project_id='11111111-1111-4111-8111-111111111111',
     assignee_person_id=null,assignee=null
 where id='99999999-9999-4999-8999-999999999992';
do $build99c$
begin
 if exists(select 1 from public.minds_work_task_assignees
           where task_id='99999999-9999-4999-8999-999999999992')
  then raise exception 'Old-project responsibility survived an approved project move';
 end if;
end $build99c$;

-- Invalid allocation durations must fail the table-level CHECK constraint.
do $build99c$
begin
 begin
  insert into public.minds_work_task_allocations(task_id,person_id,work_date,planned_minutes)
  values ('99999999-9999-4999-8999-999999999991',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','2026-10-30',17);
  raise exception 'Unexpected non-15-minute allocation accepted';
 exception when check_violation then null;
 end;
end $build99c$;

-- A full canonical task deletion may still cascade its allocations and assignments.
insert into public.minds_work_task_allocations(task_id,person_id,work_date,planned_minutes)
values ('99999999-9999-4999-8999-999999999991','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','2026-10-28',60);
delete from public.isabella_tasks where id='99999999-9999-4999-8999-999999999991';
set constraints all immediate;
do $$
begin
 if exists(select 1 from public.minds_work_task_assignees
             where task_id='99999999-9999-4999-8999-999999999991')
    or exists(select 1 from public.minds_work_task_allocations
              where task_id='99999999-9999-4999-8999-999999999991') then
   raise exception 'Canonical task deletion left orphaned assignment or allocation';
 end if;
end $$;
select 'BUILD_99C_EPHEMERAL_SQL_ACCEPTANCE_OK' as result;
