create table public.minds_mission_runtime_executions (
  id uuid primary key default gen_random_uuid(),
  mission_run_id uuid not null references public.minds_mission_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('native_minds','openai_agents')),
  mode text not null check (mode in ('primary','shadow')),
  lifecycle text not null default 'created'
    check (lifecycle in ('created','running','succeeded','action_required','failed','stopped')),
  provider_session_id text null check (provider_session_id is null or length(provider_session_id)<=500),
  provider_turn_id text null check (provider_turn_id is null or length(provider_turn_id)<=500),
  snapshot_hash text null check (snapshot_hash is null or length(snapshot_hash)<=128),
  result_status text null check (result_status is null or result_status in ('continue','waiting_for_user','completed','failed')),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  last_error text null check (last_error is null or length(last_error)<=8000),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mission_run_id,provider,mode)
);

create unique index minds_mission_runtime_provider_session_unique
  on public.minds_mission_runtime_executions(provider,provider_session_id)
  where provider_session_id is not null;
create index minds_mission_runtime_user_idx
  on public.minds_mission_runtime_executions(user_id,updated_at desc);
create index minds_mission_runtime_run_idx
  on public.minds_mission_runtime_executions(mission_run_id,created_at desc);

create or replace function public.minds_mission_runtime_execution_guard()
returns trigger language plpgsql set search_path=public as $$
declare v_user uuid;
begin
  if tg_op='UPDATE' then
    if new.mission_run_id<>old.mission_run_id or new.provider<>old.provider or new.mode<>old.mode then
      raise exception 'mission_runtime_execution_identity_immutable';
    end if;
  end if;
  select user_id into v_user from public.minds_mission_runs where id=new.mission_run_id;
  if v_user is null then raise exception 'mission_runtime_run_missing'; end if;
  new.user_id:=v_user;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.minds_mission_runtime_execution_guard() from public,anon,authenticated;

drop trigger if exists minds_mission_runtime_execution_guard_trg on public.minds_mission_runtime_executions;
create trigger minds_mission_runtime_execution_guard_trg
before insert or update on public.minds_mission_runtime_executions
for each row execute function public.minds_mission_runtime_execution_guard();

alter table public.minds_mission_runtime_executions enable row level security;
create policy "mission runtime executions select own"
on public.minds_mission_runtime_executions for select to authenticated
using ((select auth.uid())=user_id);
revoke all on public.minds_mission_runtime_executions from anon,authenticated;
grant select on public.minds_mission_runtime_executions to authenticated;
grant select,insert,update,delete on public.minds_mission_runtime_executions to service_role;

create table public.minds_mission_runtime_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.minds_mission_runtime_executions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) between 1 and 120),
  provider_turn_id text null check (provider_turn_id is null or length(provider_turn_id)<=500),
  provider_event_id text null check (provider_event_id is null or length(provider_event_id)<=500),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now()
);

create unique index minds_mission_runtime_provider_event_unique
  on public.minds_mission_runtime_events(execution_id,provider_event_id)
  where provider_event_id is not null;
create index minds_mission_runtime_events_execution_idx
  on public.minds_mission_runtime_events(execution_id,created_at asc);
create index minds_mission_runtime_events_user_idx
  on public.minds_mission_runtime_events(user_id,created_at desc);

create or replace function public.minds_mission_runtime_event_guard()
returns trigger language plpgsql set search_path=public as $$
declare v_user uuid;
begin
  select user_id into v_user from public.minds_mission_runtime_executions where id=new.execution_id;
  if v_user is null then raise exception 'mission_runtime_execution_missing'; end if;
  new.user_id:=v_user;
  return new;
end $$;
revoke all on function public.minds_mission_runtime_event_guard() from public,anon,authenticated;

drop trigger if exists minds_mission_runtime_event_guard_trg on public.minds_mission_runtime_events;
create trigger minds_mission_runtime_event_guard_trg
before insert or update on public.minds_mission_runtime_events
for each row execute function public.minds_mission_runtime_event_guard();

alter table public.minds_mission_runtime_events enable row level security;
create policy "mission runtime events select own"
on public.minds_mission_runtime_events for select to authenticated
using ((select auth.uid())=user_id);
revoke all on public.minds_mission_runtime_events from anon,authenticated;
grant select on public.minds_mission_runtime_events to authenticated;
grant select,insert,update,delete on public.minds_mission_runtime_events to service_role;
