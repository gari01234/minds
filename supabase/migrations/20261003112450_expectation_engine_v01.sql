create table public.minds_expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  project_id uuid null references public.isabella_projects(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 500),
  expected_event text not null check (length(trim(expected_event)) between 1 and 4000),
  expectation_type text not null default 'other'
    check (expectation_type in ('reply','delivery','decision','document','external_event','other')),
  due_at timestamptz not null,
  due_precision text not null default 'date'
    check (due_precision in ('date','datetime')),
  timezone text not null default 'Europe/Berlin' check (length(timezone) between 1 and 100),
  observability text not null default 'manual' check (observability in ('manual')),
  status text not null default 'active'
    check (status in ('active','due_unconfirmed','fulfilled','missed','cancelled')),
  source_kind text not null default 'conversation'
    check (source_kind in ('conversation','work','external','manual','system')),
  source_ref text null,
  due_detected_at timestamptz null,
  fulfilled_at timestamptz null,
  missed_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);

create index minds_expectations_due_idx on public.minds_expectations(user_id,status,due_at)
where status in ('active','due_unconfirmed');
create index minds_expectations_project_idx on public.minds_expectations(project_id) where project_id is not null;

create table public.minds_expectation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expectation_id uuid not null references public.minds_expectations(id) on delete cascade,
  request_id uuid not null,
  decision text not null check (decision in ('fulfilled','missed','cancel','reschedule')),
  from_status text not null,
  to_status text not null,
  previous_due_at timestamptz not null,
  next_due_at timestamptz null,
  occurred_at timestamptz null,
  note text null check (length(coalesce(note,''))<=4000),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index minds_expectation_reviews_expectation_idx on public.minds_expectation_reviews(expectation_id,created_at desc);

alter table public.minds_expectations enable row level security;
alter table public.minds_expectation_reviews enable row level security;
create policy "expectations own read" on public.minds_expectations for select to authenticated using ((select auth.uid())=user_id);
create policy "expectation reviews own read" on public.minds_expectation_reviews for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_expectations from anon,authenticated;
revoke all on public.minds_expectation_reviews from anon,authenticated;
grant select on public.minds_expectations to authenticated;
grant select on public.minds_expectation_reviews to authenticated;
grant all on public.minds_expectations to service_role;
grant all on public.minds_expectation_reviews to service_role;

create or replace function minds_private.expectation_due_at(p_date text,p_time text,p_precision text,p_timezone text)
returns timestamptz language plpgsql stable set search_path=''
as $$
declare
  v_date date; v_time time;
  v_tz text:=coalesce(nullif(trim(p_timezone),''),'Europe/Berlin');
  v_precision text:=case when p_precision='datetime' then 'datetime' else 'date' end;
begin
  begin v_date:=p_date::date; exception when others then raise exception 'Expectation date invalid'; end;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then raise exception 'Expectation timezone invalid'; end if;
  if v_precision='datetime' then
    if nullif(trim(coalesce(p_time,'')),'') is null then raise exception 'Expectation time required'; end if;
    begin v_time:=p_time::time; exception when others then raise exception 'Expectation time invalid'; end;
  else
    v_time:='23:59:59'::time;
  end if;
  return (v_date+v_time) at time zone v_tz;
end $$;

create or replace function minds_private.create_expectation(p_expectation jsonb,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  u uuid:=auth.uid(); e public.minds_expectations;
  v_project uuid:=nullif(p_expectation->>'project_id','')::uuid;
  v_due timestamptz;
  v_precision text:=case when p_expectation->>'due_precision'='datetime' then 'datetime' else 'date' end;
  v_tz text:=coalesce(nullif(trim(p_expectation->>'timezone'),''),'Europe/Berlin');
  v_type text:=coalesce(nullif(trim(p_expectation->>'expectation_type'),''),'other');
  v_source text:=coalesce(nullif(trim(p_expectation->>'source_kind'),''),'conversation');
begin
  if u is null or p_request_id is null or p_confirmed is distinct from true then raise exception 'Explicit expectation confirmation required'; end if;
  if jsonb_typeof(coalesce(p_expectation,'{}'::jsonb))<>'object' then raise exception 'Expectation payload invalid'; end if;
  if length(trim(coalesce(p_expectation->>'title',''))) not between 1 and 500 then raise exception 'Expectation title invalid'; end if;
  if length(trim(coalesce(p_expectation->>'expected_event',''))) not between 1 and 4000 then raise exception 'Expectation event invalid'; end if;
  if v_type not in ('reply','delivery','decision','document','external_event','other') then raise exception 'Expectation type invalid'; end if;
  if v_source not in ('conversation','work','external','manual','system') then raise exception 'Expectation source invalid'; end if;
  if jsonb_typeof(coalesce(p_expectation->'metadata','{}'::jsonb))<>'object' then raise exception 'Expectation metadata invalid'; end if;

  select * into e from public.minds_expectations where user_id=u and request_id=p_request_id;
  if found then return jsonb_build_object('status','already_created','expectation',to_jsonb(e)); end if;

  if v_project is not null and not exists(select 1 from public.isabella_projects where id=v_project and user_id=u)
  then raise exception 'Expectation project unavailable'; end if;

  v_due:=minds_private.expectation_due_at(p_expectation->>'due_date',p_expectation->>'due_time',v_precision,v_tz);

  insert into public.minds_expectations(
    user_id,request_id,project_id,title,expected_event,expectation_type,due_at,due_precision,timezone,
    observability,status,source_kind,source_ref,due_detected_at,metadata
  ) values (
    u,p_request_id,v_project,trim(p_expectation->>'title'),trim(p_expectation->>'expected_event'),
    v_type,v_due,v_precision,v_tz,'manual',
    case when v_due<=now() then 'due_unconfirmed' else 'active' end,
    v_source,nullif(trim(coalesce(p_expectation->>'source_ref','')),''),
    case when v_due<=now() then now() else null end,
    coalesce(p_expectation->'metadata','{}'::jsonb)
  ) returning * into e;
  return jsonb_build_object('status','created','expectation',to_jsonb(e));
end $$;

create or replace function minds_private.review_expectation(
  p_expectation_id uuid,p_decision text,p_note text default null,p_occurred_at timestamptz default null,
  p_next_date text default null,p_next_time text default null,p_next_precision text default null,p_timezone text default null,
  p_request_id uuid default null,p_confirmed boolean default false
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  u uuid:=auth.uid(); e public.minds_expectations; r public.minds_expectation_reviews;
  v_prev text; v_next text; v_previous_due timestamptz; v_due timestamptz; v_precision text; v_tz text;
begin
  if u is null or p_expectation_id is null or p_request_id is null or p_confirmed is distinct from true then raise exception 'Explicit expectation review required'; end if;
  if p_decision not in ('fulfilled','missed','cancel','reschedule') then raise exception 'Expectation decision invalid'; end if;
  if length(coalesce(p_note,''))>4000 then raise exception 'Expectation review note too long'; end if;

  select * into r from public.minds_expectation_reviews where user_id=u and request_id=p_request_id;
  if found then
    if r.expectation_id<>p_expectation_id or r.decision<>p_decision then raise exception 'Expectation request id already used'; end if;
    select * into e from public.minds_expectations where id=r.expectation_id and user_id=u;
    return jsonb_build_object('status','already_reviewed','expectation',to_jsonb(e),'review',to_jsonb(r));
  end if;

  select * into e from public.minds_expectations where id=p_expectation_id and user_id=u for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if e.status not in ('active','due_unconfirmed') then raise exception 'Expectation already resolved'; end if;
  v_prev:=e.status; v_previous_due:=e.due_at;

  if p_decision='fulfilled' then
    if p_occurred_at is not null and p_occurred_at>now()+interval '5 minutes' then raise exception 'Expectation occurrence cannot be future'; end if;
    update public.minds_expectations set status='fulfilled',fulfilled_at=coalesce(p_occurred_at,now()),updated_at=now()
    where id=e.id returning * into e;
  elsif p_decision='missed' then
    if e.status<>'due_unconfirmed' or e.due_at>now() then raise exception 'Expectation is not due'; end if;
    update public.minds_expectations set status='missed',missed_at=now(),updated_at=now()
    where id=e.id returning * into e;
  elsif p_decision='cancel' then
    update public.minds_expectations set status='cancelled',cancelled_at=now(),updated_at=now()
    where id=e.id returning * into e;
  else
    v_precision:=case when p_next_precision='datetime' then 'datetime' else 'date' end;
    v_tz:=coalesce(nullif(trim(p_timezone),''),e.timezone);
    v_due:=minds_private.expectation_due_at(p_next_date,p_next_time,v_precision,v_tz);
    update public.minds_expectations
    set due_at=v_due,due_precision=v_precision,timezone=v_tz,
        status=case when v_due<=now() then 'due_unconfirmed' else 'active' end,
        due_detected_at=case when v_due<=now() then now() else null end,
        fulfilled_at=null,missed_at=null,cancelled_at=null,updated_at=now()
    where id=e.id returning * into e;
  end if;

  v_next:=e.status;
  insert into public.minds_expectation_reviews(
    user_id,expectation_id,request_id,decision,from_status,to_status,previous_due_at,next_due_at,occurred_at,note
  ) values (
    u,e.id,p_request_id,p_decision,v_prev,v_next,v_previous_due,
    case when p_decision='reschedule' then e.due_at else null end,
    case when p_decision='fulfilled' then e.fulfilled_at else p_occurred_at end,
    nullif(trim(coalesce(p_note,'')),'')
  ) returning * into r;

  return jsonb_build_object('status','reviewed','expectation',to_jsonb(e),'review',to_jsonb(r));
end $$;

create or replace function public.minds_create_expectation(p_expectation jsonb,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language sql set search_path=''
as $$ select minds_private.create_expectation(p_expectation,p_request_id,p_confirmed); $$;

create or replace function public.minds_review_expectation(
  p_expectation_id uuid,p_decision text,p_note text default null,p_occurred_at timestamptz default null,
  p_next_date text default null,p_next_time text default null,p_next_precision text default null,p_timezone text default null,
  p_request_id uuid default null,p_confirmed boolean default false
) returns jsonb language sql set search_path=''
as $$ select minds_private.review_expectation(
  p_expectation_id,p_decision,p_note,p_occurred_at,p_next_date,p_next_time,p_next_precision,p_timezone,p_request_id,p_confirmed
); $$;

revoke all on function minds_private.expectation_due_at(text,text,text,text) from public,anon,service_role;
revoke all on function minds_private.create_expectation(jsonb,uuid,boolean) from public,anon,service_role;
revoke all on function minds_private.review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) from public,anon,service_role;
grant usage on schema minds_private to authenticated;
grant execute on function minds_private.expectation_due_at(text,text,text,text) to authenticated;
grant execute on function minds_private.create_expectation(jsonb,uuid,boolean) to authenticated;
grant execute on function minds_private.review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) to authenticated;
revoke all on function public.minds_create_expectation(jsonb,uuid,boolean) from public,anon,service_role;
revoke all on function public.minds_review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) from public,anon,service_role;
grant execute on function public.minds_create_expectation(jsonb,uuid,boolean) to authenticated;
grant execute on function public.minds_review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) to authenticated;

create or replace function public.minds_heartbeat_users()
returns table(user_id uuid, timezone text)
language sql set search_path to 'public','pg_temp'
as $$
  with ids as (
    select user_id from public.isabella_routines where enabled
    union select user_id from public.isabella_tasks where archived_at is null
    union select user_id from public.isabella_events where starts_at>=now()-interval '1 hour'
    union select user_id from public.isabella_projects where not archived
    union select user_id from public.minds_expectations where status in ('active','due_unconfirmed')
  )
  select i.user_id,
         coalesce(
           (select r.timezone from public.isabella_routines r where r.user_id=i.user_id and r.enabled order by r.created_at limit 1),
           (select e.timezone from public.minds_expectations e where e.user_id=i.user_id and e.status in ('active','due_unconfirmed') order by e.created_at limit 1),
           'Europe/Berlin'
         )
  from ids i;
$$;

create or replace function public.minds_route_attention(p_user uuid, p_candidate jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_profile jsonb:=public.minds_attention_profile(p_user);
  v_type text:=coalesce(p_candidate->>'event_type','unknown');
  v_route text:='silent'; v_base_route text:='silent';
  v_reason text:='default_silent'; v_base_reason text:='default_silent';
  v_hard boolean:=false; v_tz text:=nullif(p_candidate->>'timezone','');
  v_local_time time; v_quiet_start time; v_quiet_end time; v_quiet boolean:=false;
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
      when 'expectation_due' then v_route:='ambient';v_reason:='expectation_due';
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
      select count(*) into v_recent from public.minds_attention_events
      where user_id=p_user and route='interrupt' and delivered_at>=now()-interval '1 hour';
      if v_recent>=v_max then v_route:='briefing';v_reason:='interruption_budget'; end if;
    end if;
  end if;

  return jsonb_build_object(
    'route',v_route,'reason_code',v_reason,
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
      when 'expectation_due' then 'Algo que esperabas alcanzó su fecha límite y todavía no está confirmado.'
      when 'quiet_hours' then 'La señal no era bloqueante y cayó dentro de las horas silenciosas.'
      when 'interruption_budget' then 'Ya hubo suficientes interrupciones no bloqueantes durante la última hora.'
      else 'No existe una razón suficiente para ocupar tu atención ahora.'
    end,
    'base_route',v_base_route,'base_reason_code',v_base_reason,'hard_interrupt',v_hard,
    'quiet_hours_applied',v_quiet,'recent_interruptions',v_recent,
    'max_interruptions_per_hour',v_max,'policy_version','attention_v1'
  );
end $$;
