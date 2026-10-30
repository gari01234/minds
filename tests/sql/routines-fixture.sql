-- Synthetic owners only; this fixture never connects to production.
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated;
grant execute on function auth.uid() to authenticated;
create table if not exists public.isabella_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  instruction text not null,
  schedule jsonb not null default '{"kind":"daily","time":"08:00"}'::jsonb,
  timezone text not null default 'Europe/Berlin',
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_output text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  client_key text not null default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_key),
  check ((schedule->>'kind') in ('once','daily','weekly')),
  check ((schedule->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

create or replace function public.isabella_next_routine_run(
  p_schedule jsonb,
  p_timezone text,
  p_after timestamptz default now()
) returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_kind text := coalesce(p_schedule->>'kind','daily');
  v_time time := coalesce(nullif(p_schedule->>'time','')::time,'08:00'::time);
  v_weekdays int[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_schedule->'weekdays','[]'::jsonb))::int), '{}'::int[]);
  v_local_after timestamp;
  v_date date;
  v_candidate timestamp;
  i int;
begin
  v_local_after := p_after at time zone p_timezone;

  if v_kind = 'once' then
    v_date := nullif(p_schedule->>'date','')::date;
    if v_date is null then return null; end if;
    v_candidate := v_date + v_time;
    if v_candidate > v_local_after then
      return v_candidate at time zone p_timezone;
    end if;
    return null;
  end if;

  for i in 0..14 loop
    v_date := v_local_after::date + i;
    if v_kind = 'daily'
       or (v_kind = 'weekly' and extract(dow from v_date)::int = any(v_weekdays)) then
      v_candidate := v_date + v_time;
      if v_candidate > v_local_after then
        return v_candidate at time zone p_timezone;
      end if;
    end if;
  end loop;
  return null;
exception when others then
  return null;
end;
$$;
create or replace function public.isabella_routines_set_next_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.enabled then
    new.next_run_at := public.isabella_next_routine_run(new.schedule,new.timezone,now());
  else
    new.next_run_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists isabella_routines_schedule_trigger on public.isabella_routines;
create trigger isabella_routines_schedule_trigger
before insert or update of schedule, timezone, enabled
on public.isabella_routines
for each row execute function public.isabella_routines_set_next_run();

create table public.minds_shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null default 'isabella' check (agent in ('isabella','sofia','minds')),
  request_id uuid not null,
  action text not null check (length(trim(action)) between 1 and 120),
  proposal_kind text not null check (length(trim(proposal_kind)) between 1 and 120),
  policy_mode text not null default 'confirm' check (policy_mode='confirm'),
  candidate jsonb not null check (jsonb_typeof(candidate)='object'),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context)='object'),
  status text not null default 'pending' check (status in ('pending','accepted','edited','rejected','expired')),
  reviewed_candidate jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create table if not exists public.minds_action_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  app_scope text not null default 'isabella',
  action text not null,
  mode text not null check (mode in ('allow','confirm','deny')),
  reason text not null default '',
  priority integer not null default 100,
  enabled boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.isabella_routines enable row level security;
grant select,insert,update,delete on public.isabella_routines to authenticated;
create policy routines_owner on public.isabella_routines to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
