
create extension if not exists pg_cron;
create extension if not exists pg_net;

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
  check ((schedule->>'kind') in ('daily','weekly')),
  check ((schedule->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

alter table public.isabella_routines enable row level security;

drop policy if exists "isabella_routines_select_own" on public.isabella_routines;
create policy "isabella_routines_select_own" on public.isabella_routines
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "isabella_routines_insert_own" on public.isabella_routines;
create policy "isabella_routines_insert_own" on public.isabella_routines
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "isabella_routines_update_own" on public.isabella_routines;
create policy "isabella_routines_update_own" on public.isabella_routines
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "isabella_routines_delete_own" on public.isabella_routines;
create policy "isabella_routines_delete_own" on public.isabella_routines
for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.isabella_runtime_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.isabella_runtime_secrets enable row level security;

insert into public.isabella_runtime_secrets(key,value)
values ('routine_runner', encode(gen_random_bytes(32),'hex'))
on conflict (key) do nothing;

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
  return (v_local_after + interval '1 day') at time zone p_timezone;
exception when others then
  return date_trunc('day', p_after) + interval '1 day 8 hours';
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

create or replace function public.claim_due_isabella_routines(p_limit integer default 20)
returns setof public.isabella_routines
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.isabella_routines
    where enabled = true
      and next_run_at is not null
      and next_run_at <= now()
    order by next_run_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  )
  update public.isabella_routines r
     set last_run_at = now(),
         next_run_at = public.isabella_next_routine_run(r.schedule,r.timezone,now() + interval '5 seconds'),
         last_error = null,
         updated_at = now()
    from due
   where r.id = due.id
  returning r.*;
end;
$$;

revoke all on function public.claim_due_isabella_routines(integer) from public, anon, authenticated;
grant execute on function public.claim_due_isabella_routines(integer) to service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='isabella-routines-runner' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'isabella-routines-runner',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-routine-runner',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'secret',
      (select value from public.isabella_runtime_secrets where key='routine_runner')
    )
  );
  $cron$
);
