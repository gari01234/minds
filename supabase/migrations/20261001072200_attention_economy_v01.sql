create table if not exists public.minds_attention_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  source_type text not null check (source_type in ('mission','heartbeat','routine','system')),
  source_id text null,
  event_type text not null,
  title text not null,
  body text not null default '',
  urgency text not null default 'info' check (urgency in ('info','attention','urgent')),
  requires_user boolean not null default false,
  user_requested boolean not null default false,
  deadline_at timestamptz null,
  route text not null check (route in ('interrupt','briefing','ambient','silent')),
  reason_code text not null,
  reason text not null,
  policy_version text not null default 'attention_v1',
  status text not null default 'pending' check (status in ('pending','delivered','consumed','dismissed','resolved','suppressed')),
  message_id uuid null references public.conversation_messages(id) on delete set null,
  surface_item_id uuid null references public.minds_surface_items(id) on delete set null,
  delivery_ref text null,
  factors jsonb not null default '{}'::jsonb check (jsonb_typeof(factors)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  delivered_at timestamptz null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minds_attention_events_key_check check (length(trim(event_key)) between 1 and 500),
  constraint minds_attention_events_title_check check (length(trim(title)) between 1 and 500),
  constraint minds_attention_events_body_check check (length(body)<=12000),
  unique(user_id,event_key)
);

create index if not exists minds_attention_events_user_status_idx
  on public.minds_attention_events(user_id,status,created_at desc);
create index if not exists minds_attention_events_user_route_idx
  on public.minds_attention_events(user_id,route,status,created_at desc);
create index if not exists minds_attention_events_source_idx
  on public.minds_attention_events(user_id,source_type,source_id,created_at desc);

alter table public.minds_attention_events enable row level security;
drop policy if exists "attention events select own" on public.minds_attention_events;
create policy "attention events select own"
on public.minds_attention_events for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_attention_events from authenticated,anon;
grant select on public.minds_attention_events to authenticated;

alter table public.minds_routine_deliveries
  add column if not exists attention_event_ids uuid[] not null default '{}'::uuid[];

create or replace function public.minds_attention_profile(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_pref jsonb:='{}'::jsonb;
  v_attention jsonb:='{}'::jsonb;
begin
  select value into v_pref
  from public.isabella_preferences
  where user_id=p_user and preference_key='assistant' and status<>'rejected'
  order by updated_at desc limit 1;

  if jsonb_typeof(v_pref->'attention')='object' then v_attention:=v_pref->'attention'; end if;

  return jsonb_build_object(
    'missionCompleted','briefing',
    'missionFailed','briefing',
    'imminentEvent','interrupt',
    'overdueTasks','ambient',
    'routineFailure','briefing',
    'maxInterruptionsPerHour',3,
    'quietHoursEnabled',false,
    'quietStart','22:00',
    'quietEnd','07:00'
  ) || v_attention;
end $$;

create or replace function public.minds_route_attention(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile jsonb:=public.minds_attention_profile(p_user);
  v_type text:=coalesce(p_candidate->>'event_type','unknown');
  v_route text:='silent';
  v_base_route text:='silent';
  v_reason text:='default_silent';
  v_base_reason text:='default_silent';
  v_hard boolean:=false;
  v_tz text:=nullif(p_candidate->>'timezone','');
  v_local_time time;
  v_quiet_start time;
  v_quiet_end time;
  v_quiet boolean:=false;
  v_max integer:=greatest(0,least(12,coalesce((v_profile->>'maxInterruptionsPerHour')::integer,3)));
  v_recent integer:=0;
begin
  if coalesce((p_candidate->>'requires_user')::boolean,false) then
    v_route:='interrupt';v_reason:='needs_user_input';v_hard:=true;
  elsif coalesce((p_candidate->>'user_requested')::boolean,false) then
    v_route:='interrupt';v_reason:='explicit_user_request';v_hard:=true;
  elsif coalesce((p_candidate->>'silent_requested')::boolean,false) then
    v_route:='silent';v_reason:='explicit_silence_request';
  elsif coalesce((p_candidate->>'suppress')::boolean,false) then
    v_route:='silent';v_reason:='source_suppressed';
  else
    case v_type
      when 'mission_completed' then v_route:=coalesce(nullif(v_profile->>'missionCompleted',''),'briefing');v_reason:='mission_completed';
      when 'mission_failed' then v_route:=coalesce(nullif(v_profile->>'missionFailed',''),'briefing');v_reason:='mission_failed';
      when 'mission_waiting_for_user' then v_route:='interrupt';v_reason:='needs_user_input';v_hard:=true;
      when 'upcoming_event' then v_route:=coalesce(nullif(v_profile->>'imminentEvent',''),'interrupt');v_reason:='imminent_event';
      when 'overdue_digest' then v_route:=coalesce(nullif(v_profile->>'overdueTasks',''),'ambient');v_reason:='overdue_tasks';
      when 'routine_failure' then v_route:=coalesce(nullif(v_profile->>'routineFailure',''),'briefing');v_reason:='routine_failure';
      else v_route:='silent';v_reason:='default_silent';
    end case;
  end if;

  if v_route not in ('interrupt','briefing','ambient','silent') then v_route:='briefing'; end if;
  v_base_route:=v_route;v_base_reason:=v_reason;

  if v_route='interrupt' and not v_hard then
    if v_tz is null then
      select timezone into v_tz from public.isabella_routines where user_id=p_user and enabled order by created_at asc limit 1;
    end if;
    v_tz:=coalesce(v_tz,'Europe/Berlin');

    if coalesce((v_profile->>'quietHoursEnabled')::boolean,false) then
      begin
        v_local_time:=(now() at time zone v_tz)::time;
        v_quiet_start:=coalesce(nullif(v_profile->>'quietStart','')::time,'22:00'::time);
        v_quiet_end:=coalesce(nullif(v_profile->>'quietEnd','')::time,'07:00'::time);
        if v_quiet_start=v_quiet_end then v_quiet:=true;
        elsif v_quiet_start<v_quiet_end then v_quiet:=v_local_time>=v_quiet_start and v_local_time<v_quiet_end;
        else v_quiet:=v_local_time>=v_quiet_start or v_local_time<v_quiet_end;
        end if;
      exception when others then v_quiet:=false;
      end;
      if v_quiet then v_route:='briefing';v_reason:='quiet_hours'; end if;
    end if;

    if v_route='interrupt' then
      select count(*) into v_recent
      from public.minds_attention_events
      where user_id=p_user and route='interrupt' and delivered_at>=now()-interval '1 hour';
      if v_recent>=v_max then v_route:='briefing';v_reason:='interruption_budget'; end if;
    end if;
  end if;

  return jsonb_build_object(
    'route',v_route,
    'reason_code',v_reason,
    'reason',case v_reason
      when 'needs_user_input' then 'El trabajo está bloqueado hasta que decidas algo.'
      when 'explicit_user_request' then 'Pediste explícitamente que Isabella te avisara.'
      when 'explicit_silence_request' then 'Pediste explícitamente no recibir aviso al terminar.'
      when 'source_suppressed' then 'La fuente aún no ha alcanzado el umbral para mostrarse.'
      when 'mission_completed' then 'El trabajo terminó, pero no requiere una decisión inmediata.'
      when 'mission_failed' then 'El trabajo se detuvo y conviene incluirlo en el próximo resumen.'
      when 'imminent_event' then 'Hay un evento próximo cuyo valor depende del tiempo.'
      when 'overdue_tasks' then 'Es una señal personal/productiva útil, pero no exige interrumpir.'
      when 'routine_failure' then 'Conviene conocer el fallo, pero normalmente puede esperar al briefing.'
      when 'quiet_hours' then 'La señal no era bloqueante y cayó dentro de las horas silenciosas.'
      when 'interruption_budget' then 'Ya hubo suficientes interrupciones no bloqueantes durante la última hora.'
      else 'No existe una razón suficiente para ocupar tu atención ahora.'
    end,
    'base_route',v_base_route,
    'base_reason_code',v_base_reason,
    'hard_interrupt',v_hard,
    'quiet_hours_applied',v_quiet,
    'recent_interruptions',v_recent,
    'max_interruptions_per_hour',v_max,
    'policy_version','attention_v1'
  );
end $$;

create or replace function public.minds_publish_attention(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_key text:=left(trim(coalesce(p_candidate->>'event_key','')),500);
  v_decision jsonb;
  v_event public.minds_attention_events;
  v_existing boolean:=false;
  v_route text;
  v_conv uuid;
  v_mid uuid;
  v_sid uuid;
  v_status text;
begin
  if p_user is null or v_key='' then raise exception 'attention candidate requires user and event_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||v_key,0));
  v_decision:=public.minds_route_attention(p_user,p_candidate);
  v_route:=v_decision->>'route';

  select * into v_event
  from public.minds_attention_events
  where user_id=p_user and event_key=v_key
  for update;

  if found then
    v_existing:=true;
    if v_event.status in ('delivered','consumed','dismissed','resolved') then
      return jsonb_build_object('status',v_event.status,'id',v_event.id,'route',v_event.route,'duplicate',true,'message_id',v_event.message_id,'surface_item_id',v_event.surface_item_id);
    end if;

    update public.minds_attention_events set
      source_type=coalesce(nullif(p_candidate->>'source_type',''),source_type),
      source_id=coalesce(nullif(p_candidate->>'source_id',''),source_id),
      event_type=coalesce(nullif(p_candidate->>'event_type',''),event_type),
      title=left(coalesce(nullif(p_candidate->>'title',''),title),500),
      body=left(coalesce(p_candidate->>'body',body),12000),
      urgency=case when p_candidate->>'urgency' in ('info','attention','urgent') then p_candidate->>'urgency' else urgency end,
      requires_user=coalesce((p_candidate->>'requires_user')::boolean,requires_user),
      user_requested=coalesce((p_candidate->>'user_requested')::boolean,user_requested),
      deadline_at=coalesce(nullif(p_candidate->>'deadline_at','')::timestamptz,deadline_at),
      route=v_route,
      reason_code=v_decision->>'reason_code',
      reason=v_decision->>'reason',
      policy_version='attention_v1',
      status=case when v_route='silent' then 'suppressed' else 'pending' end,
      factors=v_decision,
      metadata=metadata||coalesce(p_candidate->'metadata','{}'::jsonb),
      updated_at=now()
    where id=v_event.id
    returning * into v_event;
  else
    insert into public.minds_attention_events(
      user_id,event_key,source_type,source_id,event_type,title,body,urgency,requires_user,user_requested,deadline_at,
      route,reason_code,reason,policy_version,status,factors,metadata
    ) values (
      p_user,v_key,
      coalesce(nullif(p_candidate->>'source_type',''),'system'),
      nullif(p_candidate->>'source_id',''),
      coalesce(nullif(p_candidate->>'event_type',''),'unknown'),
      left(coalesce(nullif(p_candidate->>'title',''),'Actualización de Isabella'),500),
      left(coalesce(p_candidate->>'body',''),12000),
      case when p_candidate->>'urgency' in ('info','attention','urgent') then p_candidate->>'urgency' else 'info' end,
      coalesce((p_candidate->>'requires_user')::boolean,false),
      coalesce((p_candidate->>'user_requested')::boolean,false),
      nullif(p_candidate->>'deadline_at','')::timestamptz,
      v_route,v_decision->>'reason_code',v_decision->>'reason','attention_v1',
      case when v_route='silent' then 'suppressed' else 'pending' end,
      v_decision,coalesce(p_candidate->'metadata','{}'::jsonb)
    ) returning * into v_event;
  end if;

  if v_route='silent' then
    return jsonb_build_object('status','suppressed','id',v_event.id,'route',v_route,'duplicate',v_existing,'reason_code',v_event.reason_code);
  elsif v_route='briefing' then
    return jsonb_build_object('status','pending','id',v_event.id,'route',v_route,'duplicate',v_existing,'reason_code',v_event.reason_code);
  elsif v_route='ambient' then
    insert into public.minds_surface_items(user_id,surface,agent,title,body,status,lifecycle_state,icon,generated_at,expires_at,metadata)
    values(
      p_user,'feed','isabella',v_event.title,v_event.body,'active','new',
      case when v_event.urgency='urgent' then '!' else '·' end,now(),
      coalesce(v_event.deadline_at+interval '2 hours',now()+interval '18 hours'),
      jsonb_build_object(
        'source','attention_runtime','attention_event_id',v_event.id,'attention_route','ambient',
        'reason_code',v_event.reason_code,'source_type',v_event.source_type,'source_id',v_event.source_id
      )||v_event.metadata
    ) returning id into v_sid;
    update public.minds_attention_events
    set status='delivered',surface_item_id=v_sid,delivered_at=now(),updated_at=now()
    where id=v_event.id returning status into v_status;
    return jsonb_build_object('status',v_status,'id',v_event.id,'route',v_route,'surface_item_id',v_sid,'reason_code',v_event.reason_code);
  else
    select id into v_conv from public.conversations
    where user_id=p_user and app_scope='isabella'
    order by updated_at desc limit 1;

    if v_conv is null then
      insert into public.conversations(user_id,app_scope,origin_kind,origin_anchor,title,mode,metadata)
      values(p_user,'isabella','global','{"type":"assistant","id":"isabella","label":"Isabella"}','Isabella','memory','{"app":"isabella"}')
      returning id into v_conv;
    end if;

    insert into public.conversation_messages(user_id,conversation_id,role,content,provisional,citations,metadata,client_key)
    values(
      p_user,v_conv,'assistant',v_event.body,false,'[]'::jsonb,
      jsonb_build_object(
        'app','isabella','source','attention_runtime','attention_event_id',v_event.id,'attention_route','interrupt',
        'attention_reason',v_event.reason_code,'source_type',v_event.source_type,'source_id',v_event.source_id
      )||v_event.metadata,
      'attention:'||v_event.id
    )
    on conflict(user_id,conversation_id,client_key) do update set content=excluded.content
    returning id into v_mid;

    update public.conversations set updated_at=now() where id=v_conv and user_id=p_user;
    update public.minds_attention_events
    set status='delivered',message_id=v_mid,delivered_at=now(),updated_at=now()
    where id=v_event.id returning status into v_status;
    return jsonb_build_object('status',v_status,'id',v_event.id,'route',v_route,'message_id',v_mid,'reason_code',v_event.reason_code);
  end if;
end $$;

create or replace function public.minds_consume_attention_briefing(
  p_user uuid,
  p_event_ids uuid[],
  p_delivery_id uuid
)
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_count integer:=0;
begin
  update public.minds_attention_events
  set status='consumed',delivery_ref='routine:'||p_delivery_id::text,delivered_at=coalesce(delivered_at,now()),consumed_at=now(),updated_at=now()
  where user_id=p_user and id=any(coalesce(p_event_ids,'{}'::uuid[])) and route='briefing' and status='pending';
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.minds_start_mission_run_with_attention(
  p_workspace_id uuid,
  p_instruction text,
  p_request_id uuid,
  p_max_iterations integer,
  p_notify_mode text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_result jsonb;
  v_run public.minds_mission_runs%rowtype;
  v_mode text:=case when p_notify_mode in ('policy','interrupt_on_complete','silent_on_complete') then p_notify_mode else 'policy' end;
begin
  v_result:=public.minds_start_mission_run(p_workspace_id,p_instruction,p_request_id,p_max_iterations);
  if v_result->>'status' not in ('ok','already_active') then return v_result; end if;
  if v_result->'run'->>'id' is null then return v_result; end if;

  select * into v_run from public.minds_mission_runs
  where id=(v_result->'run'->>'id')::uuid and user_id=auth.uid()
  for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;

  if v_result->>'status'='ok' then
    update public.minds_mission_runs
    set metadata=metadata||jsonb_build_object('notify_mode',v_mode),updated_at=now()
    where id=v_run.id
    returning * into v_run;
  end if;

  return (v_result-'run')||jsonb_build_object('run',to_jsonb(v_run));
end $$;

revoke all on function public.minds_attention_profile(uuid) from public,anon,authenticated;
revoke all on function public.minds_route_attention(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.minds_publish_attention(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.minds_consume_attention_briefing(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.minds_attention_profile(uuid) to service_role;
grant execute on function public.minds_route_attention(uuid,jsonb) to service_role;
grant execute on function public.minds_publish_attention(uuid,jsonb) to service_role;
grant execute on function public.minds_consume_attention_briefing(uuid,uuid[],uuid) to service_role;

revoke all on function public.minds_start_mission_run_with_attention(uuid,text,uuid,integer,text) from public,anon;
grant execute on function public.minds_start_mission_run_with_attention(uuid,text,uuid,integer,text) to authenticated;

create or replace function public.minds_publish_heartbeat(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  e public.minds_heartbeat_events;
  fresh boolean:=false;
  a jsonb;
  suppress boolean:=false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||(p_candidate->>'fingerprint'),0));
  select * into e from public.minds_heartbeat_events
  where user_id=p_user and fingerprint=p_candidate->>'fingerprint'
  for update;

  if not found then
    insert into public.minds_heartbeat_events(user_id,event_type,fingerprint,severity,title,body,project_id,source,metadata)
    values(
      p_user,p_candidate->>'event_type',p_candidate->>'fingerprint',coalesce(p_candidate->>'severity','attention'),
      p_candidate->>'title',coalesce(p_candidate->>'body',''),nullif(p_candidate->>'project_id','')::uuid,
      coalesce(p_candidate->'source','{}'),coalesce(p_candidate->'metadata','{}')
    ) returning * into e;
    fresh:=true;
  else
    update public.minds_heartbeat_events set
      last_seen_at=now(),source=coalesce(p_candidate->'source','{}'),metadata=coalesce(p_candidate->'metadata','{}'),
      title=p_candidate->>'title',body=coalesce(p_candidate->>'body','')
    where id=e.id returning * into e;
  end if;

  suppress:=coalesce((p_candidate->>'surface')::boolean,true)=false;
  a:=public.minds_publish_attention(
    p_user,
    jsonb_build_object(
      'event_key','heartbeat:'||e.fingerprint,
      'source_type','heartbeat',
      'source_id',e.id::text,
      'event_type',e.event_type,
      'title',e.title,
      'body',e.body,
      'urgency',e.severity,
      'deadline_at',case when e.event_type='upcoming_event' then e.source->>'starts_at' else null end,
      'timezone',coalesce(p_candidate->>'timezone',''),
      'suppress',suppress,
      'metadata',jsonb_build_object('heartbeat_event_id',e.id,'fingerprint',e.fingerprint,'project_id',e.project_id)
    )
  );

  if a->>'status' in ('delivered','consumed') and a->>'route' in ('interrupt','ambient') then
    update public.minds_heartbeat_events set status='surfaced',surfaced_at=coalesce(surfaced_at,now()) where id=e.id;
  end if;

  return jsonb_build_object(
    'id',e.id,'created',fresh,'surfaced',(a->>'status')='delivered',
    'attention_event_id',a->>'id','attention_route',a->>'route','attention_status',a->>'status'
  );
end $$;

revoke all on function public.minds_publish_heartbeat(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_heartbeat(uuid,jsonb) to service_role;

create or replace function public.minds_surface_attention_feedback()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if new.metadata->>'attention_event_id' is not null and new.lifecycle_state in ('dismissed','resolved') then
    update public.minds_attention_events
    set status=new.lifecycle_state,updated_at=now()
    where id=(new.metadata->>'attention_event_id')::uuid and user_id=new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists minds_surface_attention_feedback on public.minds_surface_items;
create trigger minds_surface_attention_feedback
after update of lifecycle_state on public.minds_surface_items
for each row execute function public.minds_surface_attention_feedback();

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','attention_routing','allow','Explainable routing of proactive signals to interrupt, briefing, ambient or silent channels',10,true,
       '{"runtime":"attention_v1","routes":["interrupt","briefing","ambient","silent"],"explainable":true}'::jsonb
where not exists(
  select 1 from public.minds_action_policies
  where user_id is null and app_scope='isabella' and action='attention_routing' and enabled
);