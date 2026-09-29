
create table if not exists public.isabella_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.isabella_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, name),
  unique (id, user_id),
  constraint isabella_projects_category_owner_fk
    foreign key (category_id, user_id)
    references public.isabella_categories(id, user_id)
    on delete cascade
);

create table if not exists public.isabella_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null,
  completed_at timestamptz,
  category_id uuid,
  project_id uuid,
  recurrence jsonb not null default '{}'::jsonb,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint isabella_tasks_category_owner_fk
    foreign key (category_id, user_id)
    references public.isabella_categories(id, user_id)
    on delete set null,
  constraint isabella_tasks_project_owner_fk
    foreign key (project_id, user_id)
    references public.isabella_projects(id, user_id)
    on delete set null
);

create table if not exists public.isabella_task_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','dismissed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint isabella_task_reminders_task_owner_fk
    foreign key (task_id, user_id)
    references public.isabella_tasks(id, user_id)
    on delete cascade
);

create table if not exists public.isabella_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  category_id uuid,
  project_id uuid,
  recurrence jsonb not null default '{}'::jsonb,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint isabella_events_time_check check (ends_at > starts_at),
  constraint isabella_events_category_owner_fk
    foreign key (category_id, user_id)
    references public.isabella_categories(id, user_id)
    on delete set null,
  constraint isabella_events_project_owner_fk
    foreign key (project_id, user_id)
    references public.isabella_projects(id, user_id)
    on delete set null
);

create table if not exists public.isabella_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact','person','routine','episodic','preference','context')),
  subject text,
  content text not null,
  status text not null default 'active' check (status in ('active','corrected','rejected','archived')),
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  source text not null default 'conversation',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.isabella_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  preference_key text not null,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'inferred' check (status in ('inferred','confirmed','rejected')),
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, preference_key)
);

create table if not exists public.isabella_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  relationship text,
  birthday date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.isabella_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists isabella_categories_user_idx on public.isabella_categories(user_id);
create index if not exists isabella_projects_user_idx on public.isabella_projects(user_id);
create index if not exists isabella_tasks_user_date_idx on public.isabella_tasks(user_id, due_date);
create index if not exists isabella_task_reminders_user_time_idx on public.isabella_task_reminders(user_id, remind_at);
create index if not exists isabella_events_user_start_idx on public.isabella_events(user_id, starts_at);
create index if not exists isabella_memories_user_kind_idx on public.isabella_memories(user_id, kind);
create index if not exists isabella_preferences_user_idx on public.isabella_preferences(user_id);
create index if not exists isabella_people_user_idx on public.isabella_people(user_id);
create index if not exists isabella_followups_user_due_idx on public.isabella_followups(user_id, due_at);

grant select, insert, update, delete on
  public.isabella_categories,
  public.isabella_projects,
  public.isabella_tasks,
  public.isabella_task_reminders,
  public.isabella_events,
  public.isabella_memories,
  public.isabella_preferences,
  public.isabella_people,
  public.isabella_followups
to authenticated;

alter table public.isabella_categories enable row level security;
alter table public.isabella_projects enable row level security;
alter table public.isabella_tasks enable row level security;
alter table public.isabella_task_reminders enable row level security;
alter table public.isabella_events enable row level security;
alter table public.isabella_memories enable row level security;
alter table public.isabella_preferences enable row level security;
alter table public.isabella_people enable row level security;
alter table public.isabella_followups enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'isabella_categories','isabella_projects','isabella_tasks',
    'isabella_task_reminders','isabella_events','isabella_memories',
    'isabella_preferences','isabella_people','isabella_followups'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id) with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_delete_own', t
    );
  end loop;
end $$;
