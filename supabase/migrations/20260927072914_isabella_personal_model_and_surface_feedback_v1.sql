
create table if not exists public.isabella_model_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_type text not null check (claim_type in ('preference','habit','pattern','goal','priority','value','working_style','interaction','constraint','other')),
  claim text not null,
  status text not null default 'hypothesis' check (status in ('hypothesis','confirmed','contradicted','stale')),
  confidence numeric not null default 0.6 check (confidence >= 0 and confidence <= 1),
  source_type text not null default 'inferred' check (source_type in ('explicit','observed','inferred','system')),
  evidence jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  confirmed_at timestamptz,
  superseded_by uuid references public.isabella_model_claims(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.isabella_model_claims enable row level security;
drop policy if exists isabella_model_claims_own on public.isabella_model_claims;
create policy isabella_model_claims_own on public.isabella_model_claims
for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists isabella_model_claims_user_status_idx
on public.isabella_model_claims(user_id,status,last_seen_at desc);

create index if not exists isabella_model_claims_user_type_idx
on public.isabella_model_claims(user_id,claim_type,last_seen_at desc);

create table if not exists public.minds_surface_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.minds_surface_items(id) on delete cascade,
  surface text not null,
  action text not null check (action in ('liked','not_relevant','dismissed','seen','saved')),
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.minds_surface_feedback enable row level security;
drop policy if exists minds_surface_feedback_own on public.minds_surface_feedback;
create policy minds_surface_feedback_own on public.minds_surface_feedback
for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists minds_surface_feedback_user_created_idx
on public.minds_surface_feedback(user_id,created_at desc);

create table if not exists public.isabella_research_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  question text not null,
  rationale text,
  status text not null default 'queued' check (status in ('queued','running','ready','dismissed')),
  priority numeric not null default 0.5 check (priority >= 0 and priority <= 1),
  result jsonb not null default '{}'::jsonb,
  source_item_id uuid references public.minds_surface_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.isabella_research_queue enable row level security;
drop policy if exists isabella_research_queue_own on public.isabella_research_queue;
create policy isabella_research_queue_own on public.isabella_research_queue
for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists isabella_research_queue_user_status_idx
on public.isabella_research_queue(user_id,status,priority desc,created_at desc);

create table if not exists public.isabella_return_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'idea',
  reference_id text,
  title text not null,
  reason text not null,
  status text not null default 'waiting' check (status in ('waiting','ready','returned','dismissed')),
  reactivate_after timestamptz,
  last_trigger_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.isabella_return_queue enable row level security;
drop policy if exists isabella_return_queue_own on public.isabella_return_queue;
create policy isabella_return_queue_own on public.isabella_return_queue
for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists isabella_return_queue_user_status_idx
on public.isabella_return_queue(user_id,status,coalesce(reactivate_after,created_at));

alter table public.minds_surface_items
  add column if not exists lifecycle_state text not null default 'new',
  add column if not exists user_feedback text,
  add column if not exists seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='minds_surface_items_lifecycle_state_check'
  ) then
    alter table public.minds_surface_items
      add constraint minds_surface_items_lifecycle_state_check
      check (lifecycle_state in ('new','seen','changed','pending','resolved','dismissed'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname='minds_surface_items_user_feedback_check'
  ) then
    alter table public.minds_surface_items
      add constraint minds_surface_items_user_feedback_check
      check (user_feedback is null or user_feedback in ('liked','not_relevant'));
  end if;
end $$;
