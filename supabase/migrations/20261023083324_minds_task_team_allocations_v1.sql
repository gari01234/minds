-- Build 99C: accountable team planning without coworker accounts, calendars or inferred availability.
-- Existing isabella_tasks.assignee_person_id remains a derived first-assignee compatibility projection.
create table if not exists public.minds_work_task_assignees (
  task_id uuid not null,
  person_id uuid not null,
  project_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key(task_id,person_id),
  constraint minds_work_task_assignees_task_owner_fk
    foreign key(task_id,user_id) references public.isabella_tasks(id,user_id) on delete cascade,
  constraint minds_work_task_assignees_person_owner_fk
    foreign key(person_id,user_id) references public.isabella_people(id,user_id) on delete cascade,
  -- Never silently orphan or cascade responsibility when removing project membership.
  constraint minds_work_task_assignees_membership_fk
    foreign key(project_id,person_id) references public.minds_work_project_people(project_id,person_id) on delete restrict
);
create index if not exists minds_work_task_assignees_person_idx on public.minds_work_task_assignees(person_id,task_id);
create index if not exists minds_work_task_assignees_membership_idx on public.minds_work_task_assignees(project_id,person_id);
alter table public.minds_work_task_assignees enable row level security;
create policy minds_work_task_assignees_select_own on public.minds_work_task_assignees
  for select to authenticated using (user_id=(select auth.uid()));
create policy minds_work_task_assignees_insert_own on public.minds_work_task_assignees
  for insert to authenticated with check (user_id=(select auth.uid()));
create policy minds_work_task_assignees_delete_own on public.minds_work_task_assignees
  for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,delete on public.minds_work_task_assignees to authenticated;

create or replace function public.minds_work_validate_task_assignee()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not exists (
    select 1 from public.isabella_tasks t
    join public.minds_work_project_people m
      on m.project_id=t.project_id and m.person_id=new.person_id and m.user_id=t.user_id
    where t.id=new.task_id and t.user_id=new.user_id and t.project_id=new.project_id
  ) then
    raise exception 'Responsible must belong to the task project';
  end if;
  return new;
end $$;
create trigger minds_work_task_assignee_membership_guard
  before insert on public.minds_work_task_assignees
  for each row execute function public.minds_work_validate_task_assignee();

-- The planned amount for a colleague on a date is NOT a timestamped calendar event
-- and does NOT represent measured time worked or confirmed coworker availability.
create table if not exists public.minds_work_task_allocations (
  task_id uuid not null,
  person_id uuid not null,
  work_date date not null,
  user_id uuid not null default auth.uid(),
  planned_minutes integer not null check (planned_minutes between 15 and 720 and planned_minutes%15=0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key(task_id,person_id,work_date),
  constraint minds_work_task_allocations_assignee_fk
    -- Direct unassignment cannot silently erase planned team days. A full task
    -- deletion may still cascade both dependent tables before commit.
    foreign key(task_id,person_id) references public.minds_work_task_assignees(task_id,person_id)
      on delete no action deferrable initially deferred,
  constraint minds_work_task_allocations_task_owner_fk
    foreign key(task_id,user_id) references public.isabella_tasks(id,user_id) on delete cascade
);
create index if not exists minds_work_task_allocations_date_idx
  on public.minds_work_task_allocations(user_id,work_date,person_id);
alter table public.minds_work_task_allocations enable row level security;
create policy minds_work_task_allocations_select_own on public.minds_work_task_allocations
  for select to authenticated using (user_id=(select auth.uid()));
create policy minds_work_task_allocations_insert_own on public.minds_work_task_allocations
  for insert to authenticated with check (user_id=(select auth.uid()));
create policy minds_work_task_allocations_update_own on public.minds_work_task_allocations
  for update to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
create policy minds_work_task_allocations_delete_own on public.minds_work_task_allocations
  for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,update,delete on public.minds_work_task_allocations to authenticated;

-- Backfill legacy single-person assignments without changing the original task row.
insert into public.minds_work_task_assignees(task_id,person_id,project_id,user_id)
select t.id,t.assignee_person_id,t.project_id,t.user_id
from public.isabella_tasks t
join public.minds_work_project_people m
  on m.project_id=t.project_id and m.person_id=t.assignee_person_id and m.user_id=t.user_id
where t.assignee_person_id is not null
on conflict (task_id,person_id) do nothing;

create or replace function public.minds_work_clear_assignments_on_project_change()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.project_id is distinct from old.project_id then
    if exists(select 1 from public.minds_work_task_allocations where task_id=new.id) then
      raise exception 'Remove planned team days before moving the task to another project';
    end if;
    delete from public.minds_work_task_assignees where task_id=new.id and user_id=new.user_id;
  end if;
  return new;
end $$;
create trigger minds_work_clear_assignments_on_project_change
  after update of project_id on public.isabella_tasks
  for each row execute function public.minds_work_clear_assignments_on_project_change();

-- Atomic owner-approved assignee edit, with concurrency check and no loss of planned allocations.
create or replace function public.minds_work_set_task_assignees(
  p_task_id uuid, p_person_ids uuid[], p_expected_updated_at timestamptz
) returns uuid[] language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_project uuid;
  v_revision timestamptz;
  v_ids uuid[];
  v_count integer;
  v_owner uuid:=auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  select project_id,updated_at into v_project,v_revision
  from public.isabella_tasks where id=p_task_id and user_id=v_owner for update;
  if not found then raise exception 'Task not available'; end if;
  if v_revision is distinct from p_expected_updated_at then
    raise exception 'Task changed since it was opened';
  end if;
  select coalesce(array_agg(person_id order by first_pos),array[]::uuid[])
    into v_ids from (
      select p.person_id,min(p.ord) as first_pos
      from unnest(coalesce(p_person_ids,array[]::uuid[])) with ordinality p(person_id,ord)
      where p.person_id is not null
      group by p.person_id
    ) selected;
  if cardinality(v_ids)>16 then raise exception 'Maximum 16 task responsibles'; end if;
  select count(*) into v_count from public.minds_work_project_people
   where project_id=v_project and user_id=v_owner and person_id=any(v_ids);
  if v_count<>cardinality(v_ids) then raise exception 'Responsible is not a member of this project'; end if;
  if exists(
    select 1 from public.minds_work_task_allocations a
    join public.minds_work_task_assignees p on p.task_id=a.task_id and p.person_id=a.person_id
    where a.task_id=p_task_id and not(a.person_id=any(v_ids))
  ) then raise exception 'Remove planned team days before unassigning this person'; end if;
  delete from public.minds_work_task_assignees
   where task_id=p_task_id and user_id=v_owner and not(person_id=any(v_ids));
  insert into public.minds_work_task_assignees(task_id,person_id,project_id,user_id)
   select p_task_id,p,v_project,v_owner from unnest(v_ids) p
   on conflict(task_id,person_id) do nothing;
  update public.isabella_tasks
    set assignee_person_id=v_ids[1],
        assignee=(select name from public.isabella_people where id=v_ids[1] and user_id=v_owner),
        updated_at=clock_timestamp()
    where id=p_task_id and user_id=v_owner;
  return v_ids;
end $$;
revoke all on function public.minds_work_set_task_assignees(uuid,uuid[],timestamptz) from public,anon;
grant execute on function public.minds_work_set_task_assignees(uuid,uuid[],timestamptz) to authenticated;
