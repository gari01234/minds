-- Synthetic, isolated PostgreSQL 17 fixture. NO production data.
create schema if not exists auth;
create role authenticated nologin;
create role anon nologin;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.minds_work_buckets (
 id uuid primary key, user_id uuid not null,project_id uuid not null,
 name text not null,sort_order integer not null default 0,
 archived boolean not null default false,updated_at timestamptz not null default now()
);
create table public.isabella_tasks (
 id uuid primary key,user_id uuid not null,project_id uuid not null,
 work_bucket_id uuid null references public.minds_work_buckets(id),
 work_sort_order integer,updated_at timestamptz not null default now(),
 title text not null,completed_at timestamptz,archived_at timestamptz
);
alter table public.minds_work_buckets enable row level security;
alter table public.isabella_tasks enable row level security;
create policy owned_buckets on public.minds_work_buckets for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy owned_tasks on public.isabella_tasks for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant usage on schema auth,public to authenticated;
grant select,update on public.minds_work_buckets to authenticated;
grant select,update on public.isabella_tasks to authenticated;
insert into public.minds_work_buckets(id,user_id,project_id,name,sort_order) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','A',10),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','B',20),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','C',30),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','D',10),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','E',10);
insert into public.isabella_tasks(id,user_id,project_id,work_bucket_id,work_sort_order,title,completed_at,archived_at) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',10,'open',null,null),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',20,'archived',now(),now()),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',10,'another project',null,null);
