
create table if not exists public.minds_feed_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null unique,
  preference_signature text,
  force boolean not null default false,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.minds_feed_jobs enable row level security;

drop policy if exists minds_feed_jobs_own on public.minds_feed_jobs;
create policy minds_feed_jobs_own
on public.minds_feed_jobs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists minds_feed_jobs_user_created_idx
on public.minds_feed_jobs(user_id, created_at desc);

create index if not exists minds_feed_jobs_status_idx
on public.minds_feed_jobs(status, created_at desc);
