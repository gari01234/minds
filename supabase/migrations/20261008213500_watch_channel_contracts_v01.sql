-- Build 86.2 — Watch channel contracts.
-- A Watch is only armable when MINDS has an enabled, recently verified autonomous observation channel.

create table if not exists public.minds_watch_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_key text not null,
  label text not null,
  provider text not null,
  adapter_kind text not null check (adapter_kind in ('connector','http','database','internal')),
  observation_mode text not null default 'autonomous' check (observation_mode='autonomous'),
  status text not null default 'disabled' check (status in ('enabled','disabled','degraded')),
  freshness_minutes integer not null check (freshness_minutes between 1 and 5256000),
  verification_status text not null default 'never' check (verification_status in ('verified','never','stale','failed')),
  last_verified_at timestamptz null,
  condition_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(condition_schema)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minds_watch_channels_key_check check (length(trim(channel_key)) between 1 and 120),
  constraint minds_watch_channels_label_check check (length(trim(label)) between 1 and 240),
  unique(user_id,channel_key)
);

create index if not exists minds_watch_channels_user_status_idx
  on public.minds_watch_channels(user_id,status,verification_status,channel_key);

alter table public.minds_watch_channels enable row level security;

drop policy if exists "watch_channels_select_own" on public.minds_watch_channels;
create policy "watch_channels_select_own"
on public.minds_watch_channels for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_watch_channels from anon,authenticated;
grant select on public.minds_watch_channels to authenticated;
grant select,insert,update,delete on public.minds_watch_channels to service_role;

create or replace function public.minds_watch_capabilities()
returns table(
  channel_key text,
  label text,
  provider text,
  adapter_kind text,
  freshness_minutes integer,
  last_verified_at timestamptz,
  available boolean,
  reason text
)
language sql
stable
security invoker
set search_path=public
as $$
  select
    c.channel_key,c.label,c.provider,c.adapter_kind,c.freshness_minutes,c.last_verified_at,
    (
      c.status='enabled'
      and c.verification_status='verified'
      and c.last_verified_at is not null
      and c.last_verified_at >= now() - make_interval(mins=>greatest(c.freshness_minutes*2,60))
    ) as available,
    case
      when c.status<>'enabled' then 'channel_disabled'
      when c.verification_status<>'verified' then 'channel_not_verified'
      when c.last_verified_at is null then 'channel_never_verified'
      when c.last_verified_at < now() - make_interval(mins=>greatest(c.freshness_minutes*2,60)) then 'channel_verification_stale'
      else 'available'
    end as reason
  from public.minds_watch_channels c
  where c.user_id=auth.uid()
  order by c.label,c.channel_key;
$$;

grant execute on function public.minds_watch_capabilities() to authenticated;

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
  ch public.minds_watch_channels;
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

  if v_expires is null then v_expires:=now()+interval '90 days'; end if;
  if v_expires<=now() then raise exception 'Prospective memory expiry must be future'; end if;
  if v_expires>now()+interval '365 days' then raise exception 'Prospective memory expiry too far'; end if;

  if v_mode='watch' then
    if v_observation<>'autonomous' or v_channel='conversation' or v_condition='{}'::jsonb or v_return='{}'::jsonb then
      raise exception 'Watch requires autonomous channel, condition and return rule';
    end if;

    select * into ch
    from public.minds_watch_channels
    where user_id=u and channel_key=v_channel
    for share;

    if not found then raise exception 'Watch channel unavailable'; end if;
    if ch.status<>'enabled' then raise exception 'Watch channel disabled'; end if;
    if ch.verification_status<>'verified' or ch.last_verified_at is null then raise exception 'Watch channel not verified'; end if;
    if ch.last_verified_at < now()-make_interval(mins=>greatest(ch.freshness_minutes*2,60)) then
      raise exception 'Watch channel verification stale';
    end if;
    if v_fresh is null then v_fresh:=ch.freshness_minutes; end if;
    if v_fresh<ch.freshness_minutes then raise exception 'Requested Watch freshness exceeds channel contract'; end if;
    v_observation:='autonomous';
  else
    v_observation:='via_user';
    v_channel:='conversation';
    v_fresh:=null;
    if v_condition='{}'::jsonb then
      v_condition:=jsonb_build_object('type','conversation_terms','terms',to_jsonb(v_terms));
    end if;
  end if;

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
      'coverage_label',case when v_mode='watch' then 'observed_autonomously' else 'observed_through_user' end,
      'monitoring_claim',v_mode='watch',
      'channel_contract_id',case when v_mode='watch' then ch.id else null end
    ),
    p_request_id,
    v_mode,v_observation,v_channel,case when v_mode='watch' then ch.id::text else null end,
    v_fresh,null,null,v_condition,v_return,now()
  )
  returning * into x;

  return jsonb_build_object(
    'status','created',
    'item',to_jsonb(x),
    'human_kind',v_mode,
    'coverage',v_observation,
    'monitoring',v_mode='watch'
  );
end $$;

revoke all on function public.minds_create_prospective_memory(jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.minds_create_prospective_memory(jsonb,uuid,boolean) to authenticated;
