-- Build 86.3 — Watch observation receipts + Heartbeat return path.
-- No Watch adapter is enabled by this migration. runtime_supported is an explicit code/provider contract.

alter table public.minds_watch_channels
  add column if not exists runtime_supported boolean not null default false,
  add column if not exists last_error text null;

create table if not exists public.minds_watch_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watch_id uuid not null references public.minds_standing_intents(id) on delete cascade,
  channel_id uuid not null references public.minds_watch_channels(id) on delete cascade,
  checked_at timestamptz not null default now(),
  observation_status text not null check (observation_status in ('ok','stale','error')),
  condition_state text not null check (condition_state in ('matched','not_matched','unknown')),
  observed_at timestamptz null,
  freshness_minutes integer null check (freshness_minutes is null or freshness_minutes>=0),
  result_fingerprint text null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists minds_watch_checks_watch_idx
  on public.minds_watch_checks(user_id,watch_id,checked_at desc);

alter table public.minds_watch_checks enable row level security;
drop policy if exists "watch_checks_select_own" on public.minds_watch_checks;
create policy "watch_checks_select_own"
on public.minds_watch_checks for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_watch_checks from anon,authenticated;
grant select on public.minds_watch_checks to authenticated;
grant select,insert,update,delete on public.minds_watch_checks to service_role;

create or replace function public.minds_watch_runtime_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  ch public.minds_watch_channels;
begin
  if new.mode<>'watch' then return new; end if;
  if new.channel_ref is null then raise exception 'Watch channel contract missing'; end if;
  begin
    select * into ch
    from public.minds_watch_channels
    where id=new.channel_ref::uuid and user_id=new.user_id;
  exception when invalid_text_representation then
    raise exception 'Watch channel reference invalid';
  end;
  if not found then raise exception 'Watch channel contract unavailable'; end if;
  if ch.runtime_supported is distinct from true then raise exception 'Watch channel runtime adapter unavailable'; end if;
  if ch.status<>'enabled' or ch.verification_status<>'verified' then raise exception 'Watch channel not ready'; end if;
  if ch.last_verified_at is null
     or ch.last_verified_at < now()-make_interval(mins=>greatest(ch.freshness_minutes*2,60)) then
    raise exception 'Watch channel verification stale';
  end if;
  return new;
end $$;

drop trigger if exists minds_watch_runtime_guard on public.minds_standing_intents;
create trigger minds_watch_runtime_guard
before insert or update of mode,channel_ref,status
on public.minds_standing_intents
for each row execute function public.minds_watch_runtime_guard();

create or replace function public.minds_record_watch_check(
  p_user uuid,
  p_watch uuid,
  p_channel uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  w public.minds_standing_intents;
  ch public.minds_watch_channels;
  ck public.minds_watch_checks;
  v_status text:=lower(trim(coalesce(p_result->>'observation_status','error')));
  v_state text:=lower(trim(coalesce(p_result->>'condition_state','unknown')));
  v_observed timestamptz:=nullif(p_result->>'observed_at','')::timestamptz;
  v_fresh integer:=nullif(p_result->>'freshness_minutes','')::integer;
begin
  select * into w from public.minds_standing_intents
  where id=p_watch and user_id=p_user and mode='watch'
  for update;
  if not found then raise exception 'Watch unavailable'; end if;

  select * into ch from public.minds_watch_channels
  where id=p_channel and user_id=p_user
  for update;
  if not found then raise exception 'Watch channel unavailable'; end if;
  if w.channel_ref is distinct from ch.id::text then raise exception 'Watch/channel mismatch'; end if;

  if v_status not in ('ok','stale','error') then v_status:='error'; end if;
  if v_state not in ('matched','not_matched','unknown') then v_state:='unknown'; end if;
  if v_status<>'ok' then v_state:='unknown'; end if;
  if v_status='ok' and v_observed is null then v_observed:=now(); end if;
  if v_status='ok' and v_fresh is null then
    v_fresh:=greatest(0,ceil(extract(epoch from (now()-v_observed))/60.0)::integer);
  end if;
  if v_status='ok' and v_fresh>w.freshness_minutes then
    v_status:='stale';v_state:='unknown';
  end if;

  insert into public.minds_watch_checks(
    user_id,watch_id,channel_id,observation_status,condition_state,observed_at,
    freshness_minutes,result_fingerprint,evidence,error
  ) values (
    p_user,w.id,ch.id,v_status,v_state,v_observed,v_fresh,
    nullif(trim(coalesce(p_result->>'result_fingerprint','')),''),
    case when jsonb_typeof(p_result->'evidence')='object' then p_result->'evidence' else '{}'::jsonb end,
    nullif(left(trim(coalesce(p_result->>'error','')),1600),'')
  ) returning * into ck;

  update public.minds_standing_intents
  set
    last_checked_at=ck.checked_at,
    last_observed_at=case when v_status='ok' then v_observed else last_observed_at end,
    status=case when status='armed' and v_status='ok' and v_state='matched' then 'fired' else status end,
    fired_at=case when status='armed' and v_status='ok' and v_state='matched' then now() else fired_at end,
    updated_at=now()
  where id=w.id and user_id=p_user;

  update public.minds_watch_channels
  set
    last_error=case when v_status='error' then ck.error when v_status='stale' then 'watch_check_stale' else null end,
    updated_at=now()
  where id=ch.id and user_id=p_user;

  return jsonb_build_object(
    'status',v_status,
    'condition_state',v_state,
    'check_id',ck.id,
    'watch_id',w.id,
    'fire_ready',(v_status='ok' and v_state='matched')
  );
end $$;

create or replace function public.minds_finalize_watch_fire(
  p_user uuid,
  p_watch uuid,
  p_check uuid,
  p_publication jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  w public.minds_standing_intents;
  ck public.minds_watch_checks;
  v_count integer;
begin
  select * into w from public.minds_standing_intents
  where id=p_watch and user_id=p_user and mode='watch'
  for update;
  if not found then raise exception 'Watch unavailable'; end if;

  select * into ck from public.minds_watch_checks
  where id=p_check and watch_id=w.id and user_id=p_user
    and observation_status='ok' and condition_state='matched';
  if not found then raise exception 'Matched Watch check unavailable'; end if;

  if w.status<>'fired' then
    return jsonb_build_object('status','already_finalized','watch_id',w.id,'trigger_count',w.trigger_count);
  end if;

  v_count:=w.trigger_count+1;
  update public.minds_standing_intents
  set
    trigger_count=v_count,
    last_trigger_at=now(),
    status=case when v_count>=max_triggers then 'done' else 'armed' end,
    done_at=case when v_count>=max_triggers then now() else null end,
    armed_at=case when v_count<max_triggers then now() else armed_at end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'last_watch_check_id',ck.id,
      'last_attention_publication',coalesce(p_publication,'{}'::jsonb)
    ),
    updated_at=now()
  where id=w.id;

  return jsonb_build_object(
    'status',case when v_count>=w.max_triggers then 'done' else 'armed' end,
    'watch_id',w.id,
    'trigger_count',v_count,
    'check_id',ck.id
  );
end $$;

revoke all on function public.minds_record_watch_check(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.minds_finalize_watch_fire(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.minds_record_watch_check(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.minds_finalize_watch_fire(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.minds_heartbeat_users()
returns table(user_id uuid, timezone text)
language sql
set search_path=public,pg_temp
as $$
  with ids as (
    select user_id from public.isabella_routines where enabled
    union select user_id from public.isabella_tasks where archived_at is null
    union select user_id from public.isabella_events where starts_at>=now()-interval '1 hour'
    union select user_id from public.isabella_projects where not archived
    union select user_id from public.minds_expectations where status in ('active','due_unconfirmed')
    union select user_id from public.minds_standing_intents where mode='watch' and status in ('armed','fired')
  )
  select i.user_id,
         coalesce(
           (select r.timezone from public.isabella_routines r where r.user_id=i.user_id and r.enabled order by r.created_at limit 1),
           (select e.timezone from public.minds_expectations e where e.user_id=i.user_id and e.status in ('active','due_unconfirmed') order by e.created_at limit 1),
           'Europe/Berlin'
         )
  from ids i;
$$;
