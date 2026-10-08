-- Build 86.1 — prospective memory constitution and deterministic Reminder lifecycle.
-- Reuse minds_standing_intents as the canonical store. Do not create a second reminder database.

alter table public.minds_standing_intents
  add column if not exists mode text not null default 'reminder',
  add column if not exists observation_mode text not null default 'via_user',
  add column if not exists channel_kind text not null default 'conversation',
  add column if not exists channel_ref text null,
  add column if not exists freshness_minutes integer null,
  add column if not exists last_checked_at timestamptz null,
  add column if not exists last_observed_at timestamptz null,
  add column if not exists condition_json jsonb not null default '{}'::jsonb,
  add column if not exists return_rule jsonb not null default '{"route":"conversation"}'::jsonb,
  add column if not exists armed_at timestamptz null,
  add column if not exists fired_at timestamptz null,
  add column if not exists done_at timestamptz null,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists expired_at timestamptz null;

update public.minds_standing_intents
set
  mode='reminder',
  observation_mode='via_user',
  channel_kind='conversation',
  condition_json=case
    when jsonb_typeof(condition_json)='object' and condition_json<>'{}'::jsonb then condition_json
    else jsonb_build_object('type','conversation_terms','terms',to_jsonb(trigger_terms))
  end,
  return_rule=case
    when jsonb_typeof(return_rule)='object' and return_rule<>'{}'::jsonb then return_rule
    else '{"route":"conversation"}'::jsonb
  end,
  status=case status
    when 'active' then 'armed'
    when 'snoozed' then 'pending'
    when 'completed' then 'done'
    when 'expired' then 'expired'
    else status
  end,
  armed_at=case when status='active' then coalesce(armed_at,created_at) else armed_at end,
  done_at=case when status='completed' then coalesce(done_at,updated_at) else done_at end,
  expired_at=case when status='expired' then coalesce(expired_at,updated_at) else expired_at end;

alter table public.minds_standing_intents
  alter column status set default 'armed';

alter table public.minds_standing_intents
  drop constraint if exists minds_standing_intents_status_check,
  drop constraint if exists minds_standing_intents_mode_check,
  drop constraint if exists minds_standing_intents_observation_mode_check,
  drop constraint if exists minds_standing_intents_channel_kind_check,
  drop constraint if exists minds_standing_intents_freshness_check,
  drop constraint if exists minds_standing_intents_condition_json_check,
  drop constraint if exists minds_standing_intents_return_rule_check,
  drop constraint if exists minds_standing_intents_watch_contract_check;

alter table public.minds_standing_intents
  add constraint minds_standing_intents_status_check
    check (status in ('pending','armed','fired','done','cancelled','expired')),
  add constraint minds_standing_intents_mode_check
    check (mode in ('reminder','watch')),
  add constraint minds_standing_intents_observation_mode_check
    check (observation_mode in ('autonomous','via_user','unobserved')),
  add constraint minds_standing_intents_channel_kind_check
    check (length(trim(channel_kind)) between 1 and 80),
  add constraint minds_standing_intents_freshness_check
    check (freshness_minutes is null or freshness_minutes between 1 and 5256000),
  add constraint minds_standing_intents_condition_json_check
    check (jsonb_typeof(condition_json)='object'),
  add constraint minds_standing_intents_return_rule_check
    check (jsonb_typeof(return_rule)='object'),
  add constraint minds_standing_intents_watch_contract_check
    check (
      mode='reminder'
      or (
        observation_mode='autonomous'
        and channel_kind<>'conversation'
        and freshness_minutes is not null
        and condition_json<>'{}'::jsonb
        and return_rule<>'{}'::jsonb
      )
    );

create index if not exists minds_standing_intents_mode_status_idx
  on public.minds_standing_intents(user_id,mode,status,expires_at);

alter table public.minds_intent_deliveries
  add column if not exists mode text not null default 'reminder',
  add column if not exists channel_kind text not null default 'conversation',
  add column if not exists fired_at timestamptz not null default now();

-- Creation and cancellation are explicit reviewed owner acts.
drop policy if exists minds_standing_intents_own on public.minds_standing_intents;
drop policy if exists "minds_standing_intents_own" on public.minds_standing_intents;
create policy "minds_standing_intents_select_own"
on public.minds_standing_intents for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_standing_intents from anon,authenticated;
grant select on public.minds_standing_intents to authenticated;
grant select,insert,update,delete on public.minds_standing_intents to service_role;

drop policy if exists minds_intent_deliveries_own on public.minds_intent_deliveries;
drop policy if exists "minds_intent_deliveries_own" on public.minds_intent_deliveries;
create policy "minds_intent_deliveries_select_own"
on public.minds_intent_deliveries for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_intent_deliveries from anon,authenticated;
grant select on public.minds_intent_deliveries to authenticated;
grant select,insert,update,delete on public.minds_intent_deliveries to service_role;

create or replace function public.minds_create_prospective_memory(
  p_spec jsonb,
  p_request_id uuid,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  u uuid:=auth.uid();
  x public.minds_standing_intents;
  v_mode text:=lower(trim(coalesce(p_spec->>'mode','reminder')));
  v_observation text:=lower(trim(coalesce(p_spec->>'observation_mode','via_user')));
  v_channel text:=lower(trim(coalesce(p_spec->>'channel_kind','conversation')));
  v_trigger text:=trim(coalesce(p_spec->>'trigger_text',''));
  v_reminder text:=trim(coalesce(p_spec->>'reminder_text',''));
  v_project uuid:=nullif(trim(coalesce(p_spec->>'project_id','')),'')::uuid;
  v_terms text[]:=array[]::text[];
  v_condition jsonb:=coalesce(p_spec->'condition','{}'::jsonb);
  v_return jsonb:=coalesce(p_spec->'return_rule','{"route":"conversation"}'::jsonb);
  v_fresh integer:=nullif(p_spec->>'freshness_minutes','')::integer;
  v_cooldown integer:=greatest(0,least(525600,coalesce(nullif(p_spec->>'cooldown_minutes','')::integer,1440)));
  v_max integer:=greatest(1,least(12,coalesce(nullif(p_spec->>'max_triggers','')::integer,3)));
  v_expires timestamptz:=nullif(p_spec->>'expires_at','')::timestamptz;
  v_source_conversation uuid:=nullif(trim(coalesce(p_spec->>'source_conversation_id','')),'')::uuid;
begin
  if u is null or p_request_id is null or p_confirmed is distinct from true then
    raise exception 'Explicit prospective-memory confirmation required';
  end if;
  if jsonb_typeof(coalesce(p_spec,'{}'::jsonb))<>'object' then raise exception 'Prospective memory payload invalid'; end if;
  if v_mode not in ('reminder','watch') then raise exception 'Prospective memory mode invalid'; end if;
  if v_observation not in ('autonomous','via_user','unobserved') then raise exception 'Observation mode invalid'; end if;
  if length(v_trigger) not between 1 and 1200 then raise exception 'Trigger text invalid'; end if;
  if length(v_reminder) not between 1 and 4000 then raise exception 'Reminder text invalid'; end if;
  if jsonb_typeof(v_condition)<>'object' or jsonb_typeof(v_return)<>'object' then raise exception 'Condition/return rule invalid'; end if;

  if jsonb_typeof(p_spec->'trigger_terms')='array' then
    select coalesce(array_agg(left(trim(value),120)) filter (where length(trim(value))>0),array[]::text[])
    into v_terms
    from jsonb_array_elements_text(p_spec->'trigger_terms');
  end if;
  v_terms:=(coalesce(v_terms,array[]::text[]))[1:12];

  if v_project is not null and not exists(
    select 1 from public.isabella_projects where id=v_project and user_id=u and archived=false
  ) then raise exception 'Project unavailable'; end if;

  if v_source_conversation is not null and not exists(
    select 1 from public.conversations where id=v_source_conversation and user_id=u
  ) then raise exception 'Conversation unavailable'; end if;

  -- Build 86.1 supports deterministic conversation Reminders.
  -- A true Watch cannot be silently created before its autonomous channel contract exists.
  if v_mode='watch' then
    if v_observation<>'autonomous' or v_channel='conversation' or v_fresh is null
       or v_condition='{}'::jsonb or v_return='{}'::jsonb then
      raise exception 'Watch requires an autonomous channel, freshness, condition and return rule';
    end if;
    raise exception 'Watch channel contract must be registered before arming';
  end if;

  v_observation:='via_user';
  v_channel:='conversation';
  v_fresh:=null;
  if v_condition='{}'::jsonb then
    v_condition:=jsonb_build_object('type','conversation_terms','terms',to_jsonb(v_terms));
  end if;
  if v_expires is null then v_expires:=now()+interval '90 days'; end if;
  if v_expires<=now() then raise exception 'Prospective memory expiry must be future'; end if;
  if v_expires>now()+interval '365 days' then raise exception 'Prospective memory expiry too far'; end if;

  perform pg_advisory_xact_lock(hashtextextended('prospective:'||u::text||':'||p_request_id::text,0));
  select * into x
  from public.minds_standing_intents
  where user_id=u and request_id=p_request_id;
  if found then return jsonb_build_object('status','already_created','item',to_jsonb(x)); end if;

  insert into public.minds_standing_intents(
    user_id,trigger_text,reminder_text,trigger_terms,project_id,status,cooldown_minutes,
    max_triggers,trigger_count,last_trigger_at,expires_at,source_conversation_id,metadata,request_id,
    mode,observation_mode,channel_kind,channel_ref,freshness_minutes,last_checked_at,last_observed_at,
    condition_json,return_rule,armed_at
  ) values (
    u,v_trigger,v_reminder,v_terms,v_project,'armed',v_cooldown,
    v_max,0,null,v_expires,v_source_conversation,
    coalesce(p_spec->'metadata','{}'::jsonb)||jsonb_build_object(
      'prospective_memory_version','v0.2',
      'coverage_label','observed_through_user',
      'monitoring_claim',false
    ),
    p_request_id,
    'reminder','via_user','conversation',null,null,null,null,
    v_condition,v_return,now()
  )
  returning * into x;

  return jsonb_build_object(
    'status','created',
    'item',to_jsonb(x),
    'human_kind','reminder',
    'coverage','via_user',
    'monitoring',false
  );
end $$;

create or replace function public.minds_cancel_prospective_memory(
  p_id uuid,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  u uuid:=auth.uid();
  x public.minds_standing_intents;
begin
  if u is null or p_id is null or p_confirmed is distinct from true then
    raise exception 'Explicit prospective-memory cancellation required';
  end if;
  select * into x from public.minds_standing_intents where id=p_id and user_id=u for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if x.status='cancelled' then return jsonb_build_object('status','already_cancelled','item',to_jsonb(x)); end if;
  if x.status in ('done','expired') then return jsonb_build_object('status','already_terminal','item',to_jsonb(x)); end if;

  update public.minds_standing_intents
  set status='cancelled',cancelled_at=now(),updated_at=now()
  where id=x.id
  returning * into x;

  return jsonb_build_object('status','cancelled','item',to_jsonb(x));
end $$;

create or replace function public.minds_ack_standing_intents(p_ids uuid[], p_run_key text)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  u uuid:=auth.uid();
  x public.minds_standing_intents;
  n integer:=0;
  inserted integer:=0;
  next_count integer:=0;
begin
  if u is null or length(trim(coalesce(p_run_key,'')))=0 then raise exception 'Authenticated delivery required'; end if;

  for x in
    select *
    from public.minds_standing_intents
    where user_id=u and id=any(coalesce(p_ids,array[]::uuid[]))
      and mode='reminder' and status='armed'
    order by id
    for update
  loop
    if x.expires_at is not null and x.expires_at<=now() then
      update public.minds_standing_intents
      set status='expired',expired_at=coalesce(expired_at,now()),updated_at=now()
      where id=x.id;
      continue;
    end if;
    if x.trigger_count>=x.max_triggers then
      update public.minds_standing_intents
      set status='done',done_at=coalesce(done_at,now()),updated_at=now()
      where id=x.id;
      continue;
    end if;
    if x.last_trigger_at is not null and x.last_trigger_at+make_interval(mins=>x.cooldown_minutes)>now() then
      continue;
    end if;

    insert into public.minds_intent_deliveries(user_id,intent_id,run_key,mode,channel_kind,fired_at)
    values(u,x.id,p_run_key,'reminder','conversation',now())
    on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted<>1 then continue; end if;

    next_count:=x.trigger_count+1;

    update public.minds_standing_intents
    set status='fired',fired_at=now(),last_observed_at=now(),updated_at=now()
    where id=x.id;

    update public.minds_standing_intents
    set
      trigger_count=next_count,
      last_trigger_at=now(),
      status=case when next_count>=max_triggers then 'done' else 'armed' end,
      done_at=case when next_count>=max_triggers then now() else null end,
      armed_at=case when next_count<max_triggers then now() else armed_at end,
      updated_at=now()
    where id=x.id;
    n:=n+1;
  end loop;

  return n;
end $$;

create or replace view public.minds_prospective_memory_v1
with (security_invoker=true)
as
select
  id,user_id,request_id,project_id,
  mode,trigger_text,reminder_text,trigger_terms,status,
  observation_mode,channel_kind,channel_ref,freshness_minutes,
  last_checked_at,last_observed_at,condition_json,return_rule,
  cooldown_minutes,max_triggers,trigger_count,last_trigger_at,expires_at,
  armed_at,fired_at,done_at,cancelled_at,expired_at,
  source_conversation_id,metadata,created_at,updated_at
from public.minds_standing_intents;

grant select on public.minds_prospective_memory_v1 to authenticated;

revoke all on function public.minds_create_prospective_memory(jsonb,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.minds_cancel_prospective_memory(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.minds_ack_standing_intents(uuid[],text) from public,anon,authenticated,service_role;

grant execute on function public.minds_create_prospective_memory(jsonb,uuid,boolean) to authenticated;
grant execute on function public.minds_cancel_prospective_memory(uuid,boolean) to authenticated;
grant execute on function public.minds_ack_standing_intents(uuid[],text) to authenticated;
