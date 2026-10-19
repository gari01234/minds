-- Build 96C · Private project-team directory. No invitation, user or access grant.
-- Existing isabella_people rows are owner-only; teams are *references* to them.
alter table public.isabella_people
  add constraint isabella_people_id_user_id_key unique (id,user_id);

create table public.minds_work_project_people (
  project_id uuid not null,
  person_id uuid not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint minds_work_project_people_pkey primary key (project_id,person_id),
  constraint minds_work_project_people_project_owner_fk
    foreign key (project_id,user_id) references public.isabella_projects(id,user_id)
    on delete cascade,
  constraint minds_work_project_people_person_owner_fk
    foreign key (person_id,user_id) references public.isabella_people(id,user_id)
    on delete cascade
);
create index minds_work_project_people_user_project_idx
  on public.minds_work_project_people(user_id,project_id);
alter table public.minds_work_project_people enable row level security;
create policy minds_work_project_people_select_own
  on public.minds_work_project_people for select to authenticated
  using ((select auth.uid()) is not null and user_id=(select auth.uid()));
create policy minds_work_project_people_insert_own
  on public.minds_work_project_people for insert to authenticated
  with check ((select auth.uid()) is not null and user_id=(select auth.uid()));
create policy minds_work_project_people_update_own
  on public.minds_work_project_people for update to authenticated
  using ((select auth.uid()) is not null and user_id=(select auth.uid()))
  with check ((select auth.uid()) is not null and user_id=(select auth.uid()));
create policy minds_work_project_people_delete_own
  on public.minds_work_project_people for delete to authenticated
  using ((select auth.uid()) is not null and user_id=(select auth.uid()));
grant select,insert,update,delete
  on public.minds_work_project_people to authenticated;

-- Preserve free-text assignee for legacy tasks; no automatic name matching.
-- A structured assignment must refer to a member of the task's project.
alter table public.isabella_tasks
  add column assignee_person_id uuid null;
alter table public.isabella_tasks
  add constraint isabella_tasks_assignee_requires_project_ck
  check (assignee_person_id is null or project_id is not null);
alter table public.isabella_tasks
  add constraint isabella_tasks_assignee_project_member_fk
  foreign key (project_id,assignee_person_id)
  references public.minds_work_project_people(project_id,person_id)
  on delete restrict;
create index isabella_tasks_assignee_person_idx
  on public.isabella_tasks(user_id,project_id,assignee_person_id)
  where assignee_person_id is not null;

comment on table public.minds_work_project_people is
  'Private owner-scoped project/team association; no MINDS user accounts or access permissions.';
comment on column public.isabella_tasks.assignee_person_id is
  'Optional verified member of the task project. Legacy assignee text remains untouched.';
