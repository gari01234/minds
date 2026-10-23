-- Synthetic fixture matching the relevant existing Supabase 17 tables/keys.
-- No production credentials, data, RPC endpoints, or Supabase project connection.
create schema auth;
create role anon nologin;
create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.isabella_projects (
  id uuid primary key,
  user_id uuid not null,
  name text not null default '',
  unique (id,user_id)
);
create table public.isabella_people (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  unique (id,user_id)
);
create table public.minds_work_project_people (
  project_id uuid not null,
  person_id uuid not null,
  user_id uuid not null default auth.uid(),
  primary key(project_id,person_id),
  foreign key(project_id,user_id) references public.isabella_projects(id,user_id) on delete cascade,
  foreign key(person_id,user_id) references public.isabella_people(id,user_id) on delete cascade
);
create table public.isabella_tasks (
  id uuid primary key,
  user_id uuid not null,
  project_id uuid,
  updated_at timestamptz not null default now(),
  assignee_person_id uuid,
  assignee text,
  unique(id,user_id),
  foreign key(project_id,user_id) references public.isabella_projects(id,user_id),
  foreign key(project_id,assignee_person_id)
    references public.minds_work_project_people(project_id,person_id) on delete restrict,
  check (assignee_person_id is null or project_id is not null)
);
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
alter table public.isabella_tasks enable row level security;
alter table public.isabella_people enable row level security;
alter table public.isabella_projects enable row level security;
alter table public.minds_work_project_people enable row level security;
create policy tasks_owner on public.isabella_tasks to authenticated
  using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy people_owner on public.isabella_people to authenticated
  using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy projects_owner on public.isabella_projects to authenticated
  using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy membership_owner on public.minds_work_project_people to authenticated
  using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Existing primary relationship must be backfilled by the Build 99C migration.
insert into public.isabella_projects(id,user_id,name) values
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','Project A'),
 ('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000001','Project B');
insert into public.isabella_people(id,user_id,name) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001','Primary'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','00000000-0000-4000-8000-000000000001','Secondary'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','00000000-0000-4000-8000-000000000001','Other project');
insert into public.minds_work_project_people(project_id,person_id,user_id) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000001'),
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','00000000-0000-4000-8000-000000000001'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','00000000-0000-4000-8000-000000000001');
insert into public.isabella_tasks(id,user_id,project_id,assignee_person_id,assignee) values
 ('99999999-9999-4999-8999-999999999991','00000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Primary'),
 ('99999999-9999-4999-8999-999999999992','00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',null,null);
