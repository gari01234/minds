
alter table public.isabella_tasks
  add column if not exists archived_at timestamptz,
  add column if not exists sort_order integer not null default 0;

create index if not exists isabella_tasks_user_date_sort_idx
  on public.isabella_tasks(user_id,due_date,archived_at,sort_order);

create table if not exists public.isabella_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  entity_type text not null check (entity_type in ('task','event')),
  entity_key text not null,
  action text not null check (action in ('create','update','delete','complete','uncomplete','archive','restore','reorder')),
  source text not null default 'manual' check (source in ('manual','assistant')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists isabella_activity_log_user_created_idx
  on public.isabella_activity_log(user_id,created_at desc);

alter table public.isabella_activity_log enable row level security;

drop policy if exists "isabella_activity_select_own" on public.isabella_activity_log;
create policy "isabella_activity_select_own"
  on public.isabella_activity_log for select
  using (auth.uid() = user_id);

drop policy if exists "isabella_activity_insert_own" on public.isabella_activity_log;
create policy "isabella_activity_insert_own"
  on public.isabella_activity_log for insert
  with check (auth.uid() = user_id);

drop policy if exists "isabella_activity_delete_own" on public.isabella_activity_log;
create policy "isabella_activity_delete_own"
  on public.isabella_activity_log for delete
  using (auth.uid() = user_id);

grant select,insert,delete on public.isabella_activity_log to authenticated;
