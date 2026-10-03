create table if not exists public.minds_expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  project_id uuid null references public.isabella_projects(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 500),
  expected_event text not null check (length(trim(expected_event)) between 1 and 4000),
  expectation_type text not null default 'other'
    check (expectation_type in ('reply','delivery','decision','document','external_event','other')),
  due_at timestamptz not null,
  due_precision text not null default 'date' check (due_precision in ('date','datetime')),
  timezone text not null default 'Europe/Berlin' check (length(timezone) between 1 and 100),
  observability text not null default 'manual' check (observability='manual'),
  status text not null default 'active'
    check (status in ('active','due_unconfirmed','fulfilled','not_occurred','cancelled')),
  source_kind text not null default 'conversation'
    check (source_kind in ('conversation','work','external','manual','system')),
  source_ref text null,
  due_detected_at timestamptz null,
  fulfilled_at timestamptz null,
  not_occurred_at timestamptz null,
  cancelled_at timestamptz null,
  resolution_source text null
    check (resolution_source is null or resolution_source in ('user','observable_source')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);

do $$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='minds_expectations' and column_name='missed_at'
  ) and not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='minds_expectations' and column_name='not_occurred_at'
  ) then
    alter table public.minds_expectations rename column missed_at to not_occurred_at;
  end if;
end $$;

alter table public.minds_expectations
  add column if not exists resolution_source text null;

alter table public.minds_expectations
  drop constraint if exists minds_expectations_resolution_source_check;
alter table public.minds_expectations
  add constraint minds_expectations_resolution_source_check
  check (resolution_source is null or resolution_source in ('user','observable_source'));

alter table public.minds_expectations drop constraint if exists minds_expectations_status_check;
alter table public.minds_expectations add constraint minds_expectations_status_check
  check (status in ('active','due_unconfirmed','fulfilled','not_occurred','cancelled'));

create table if not exists public.minds_expectation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expectation_id uuid not null references public.minds_expectations(id) on delete cascade,
  request_id uuid not null,
  decision text not null check (decision in ('fulfilled','not_occurred','cancel','reschedule')),
  from_status text not null,
  to_status text not null,
  previous_due_at timestamptz not null,
  next_due_at timestamptz null,
  occurred_at timestamptz null,
  note text null check (length(coalesce(note,''))<=4000),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

alter table public.minds_expectation_reviews
  drop constraint if exists minds_expectation_reviews_decision_check;
alter table public.minds_expectation_reviews
  add constraint minds_expectation_reviews_decision_check
  check (decision in ('fulfilled','not_occurred','cancel','reschedule'));

create index if not exists minds_expectations_due_idx
  on public.minds_expectations(user_id,status,due_at)
  where status in ('active','due_unconfirmed');
create index if not exists minds_expectations_project_idx
  on public.minds_expectations(project_id) where project_id is not null;
create index if not exists minds_expectation_reviews_expectation_idx
  on public.minds_expectation_reviews(expectation_id,created_at desc);

alter table public.minds_expectations enable row level security;
alter table public.minds_expectation_reviews enable row level security;

drop policy if exists "expectations own read" on public.minds_expectations;
create policy "expectations own read"
on public.minds_expectations for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists "expectation reviews own read" on public.minds_expectation_reviews;
create policy "expectation reviews own read"
on public.minds_expectation_reviews for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_expectations from anon,authenticated;
revoke all on public.minds_expectation_reviews from anon,authenticated;
grant select on public.minds_expectations to authenticated;
grant select on public.minds_expectation_reviews to authenticated;
grant select,insert,update,delete on public.minds_expectations to service_role;
grant select,insert,update,delete on public.minds_expectation_reviews to service_role;

create or replace function minds_private.expectation_due_at(
  p_date text,
  p_time text,
  p_precision text,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
set search_path=''
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

create or replace function minds_private.create_expectation(
  p_expectation jsonb,
  p_request_id uuid,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
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

  perform pg_advisory_xact_lock(hashtextextended('expectation:'||u::text||':'||p_request_id::text,0));
  select * into e from public.minds_expectations where user_id=u and request_id=p_request_id;
  if found then return jsonb_build_object('status','already_created','expectation',to_jsonb(e)); end if;

  if v_project is not null and not exists(
    select 1 from public.isabella_projects where id=v_project and user_id=u and archived=false
  ) then raise exception 'Expectation project unavailable'; end if;

  v_due:=minds_private.expectation_due_at(
    p_expectation->>'due_date',p_expectation->>'due_time',v_precision,v_tz
  );
  if v_due<=now() then raise exception 'Expectation must describe a future proposition'; end if;

  insert into public.minds_expectations(
    user_id,request_id,project_id,title,expected_event,expectation_type,due_at,due_precision,timezone,
    observability,status,source_kind,source_ref,due_detected_at,resolution_source,metadata
  ) values (
    u,p_request_id,v_project,trim(p_expectation->>'title'),trim(p_expectation->>'expected_event'),
    v_type,v_due,v_precision,v_tz,'manual','active',
    v_source,nullif(trim(coalesce(p_expectation->>'source_ref','')),''),
    null,null,coalesce(p_expectation->'metadata','{}'::jsonb)
  ) returning * into e;

  return jsonb_build_object('status','created','expectation',to_jsonb(e));
end $$;

create or replace function minds_private.review_expectation(
  p_expectation_id uuid,
  p_decision text,
  p_note text default null,
  p_occurred_at timestamptz default null,
  p_next_date text default null,
  p_next_time text default null,
  p_next_precision text default null,
  p_timezone text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid(); e public.minds_expectations; r public.minds_expectation_reviews;
  v_prev text; v_previous_due timestamptz; v_due timestamptz; v_precision text; v_tz text;
begin
  if u is null or p_expectation_id is null or p_request_id is null or p_confirmed is distinct from true then raise exception 'Explicit expectation review required'; end if;
  if p_decision not in ('fulfilled','not_occurred','cancel','reschedule') then raise exception 'Expectation decision invalid'; end if;
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
    update public.minds_expectations
    set status='fulfilled',fulfilled_at=coalesce(p_occurred_at,now()),
        not_occurred_at=null,cancelled_at=null,resolution_source='user',updated_at=now()
    where id=e.id returning * into e;
  elsif p_decision='not_occurred' then
    if e.status<>'due_unconfirmed' or e.due_at>now() then raise exception 'Expectation is not due and unconfirmed'; end if;
    update public.minds_expectations
    set status='not_occurred',not_occurred_at=now(),
        fulfilled_at=null,cancelled_at=null,resolution_source='user',updated_at=now()
    where id=e.id returning * into e;
  elsif p_decision='cancel' then
    update public.minds_expectations
    set status='cancelled',cancelled_at=now(),
        fulfilled_at=null,not_occurred_at=null,resolution_source='user',updated_at=now()
    where id=e.id returning * into e;
  else
    v_precision:=case when p_next_precision='datetime' then 'datetime' else 'date' end;
    v_tz:=coalesce(nullif(trim(p_timezone),''),e.timezone);
    v_due:=minds_private.expectation_due_at(p_next_date,p_next_time,v_precision,v_tz);
    if v_due<=now() then raise exception 'Rescheduled expectation must be future'; end if;
    update public.minds_expectations
    set due_at=v_due,due_precision=v_precision,timezone=v_tz,status='active',
        due_detected_at=null,fulfilled_at=null,not_occurred_at=null,cancelled_at=null,
        resolution_source=null,updated_at=now()
    where id=e.id returning * into e;
  end if;

  insert into public.minds_expectation_reviews(
    user_id,expectation_id,request_id,decision,from_status,to_status,previous_due_at,next_due_at,occurred_at,note
  ) values (
    u,e.id,p_request_id,p_decision,v_prev,e.status,v_previous_due,
    case when p_decision='reschedule' then e.due_at else null end,
    case when p_decision='fulfilled' then e.fulfilled_at else p_occurred_at end,
    nullif(trim(coalesce(p_note,'')),'')
  ) returning * into r;

  update public.minds_attention_events
  set status='resolved',updated_at=now()
  where user_id=u and source_type='expectation' and source_id=e.id::text
    and status in ('pending','delivered','suppressed');

  return jsonb_build_object('status','reviewed','expectation',to_jsonb(e),'review',to_jsonb(r));
end $$;

create or replace function minds_private.sweep_expectations()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.minds_expectations;
  n integer:=0;
begin
  for e in
    select * from public.minds_expectations
    where status='active' and due_at<=now()
    order by due_at
    for update skip locked
  loop
    begin
      update public.minds_expectations
      set status='due_unconfirmed',due_detected_at=coalesce(due_detected_at,now()),updated_at=now()
      where id=e.id and status='active'
      returning * into e;
      if not found then continue; end if;

      perform public.minds_publish_attention(
        e.user_id,
        jsonb_build_object(
          'event_key','expectation:'||e.id::text||':due:'||extract(epoch from e.due_at)::bigint::text,
          'source_type','expectation',
          'source_id',e.id::text,
          'event_type','expectation_due_unconfirmed',
          'title','Algo que esperabas ya debería haber ocurrido',
          'body','“'||left(e.expected_event,900)||'” ya alcanzó la fecha acordada. No tengo evidencia suficiente para decir si ocurrió. Está pendiente de comprobar.',
          'urgency','attention',
          'requires_user',true,
          'user_requested',false,
          'deadline_at',e.due_at,
          'metadata',jsonb_build_object(
            'expectation_id',e.id,
            'epistemic_state','unknown',
            'human_label','Pendiente de comprobar'
          )
        )
      );
      n:=n+1;
    exception when others then
      raise warning 'Expectation sweep failed for %: %',e.id,sqlerrm;
    end;
  end loop;
  return n;
end $$;

create or replace function public.minds_create_expectation(
  p_expectation jsonb,
  p_request_id uuid,
  p_confirmed boolean default false
)
returns jsonb
language sql
set search_path=''
as $$
  select minds_private.create_expectation(p_expectation,p_request_id,p_confirmed);
$$;

create or replace function public.minds_review_expectation(
  p_expectation_id uuid,
  p_decision text,
  p_note text default null,
  p_occurred_at timestamptz default null,
  p_next_date text default null,
  p_next_time text default null,
  p_next_precision text default null,
  p_timezone text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
)
returns jsonb
language sql
set search_path=''
as $$
  select minds_private.review_expectation(
    p_expectation_id,p_decision,p_note,p_occurred_at,p_next_date,p_next_time,p_next_precision,p_timezone,p_request_id,p_confirmed
  );
$$;

grant usage on schema minds_private to authenticated;
revoke all on function minds_private.expectation_due_at(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function minds_private.create_expectation(jsonb,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function minds_private.review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function minds_private.sweep_expectations() from public,anon,authenticated,service_role;
grant execute on function minds_private.expectation_due_at(text,text,text,text) to authenticated;
grant execute on function minds_private.create_expectation(jsonb,uuid,boolean) to authenticated;
grant execute on function minds_private.review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) to authenticated;

revoke all on function public.minds_create_expectation(jsonb,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.minds_review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.minds_create_expectation(jsonb,uuid,boolean) to authenticated;
grant execute on function public.minds_review_expectation(uuid,text,text,timestamptz,text,text,text,text,uuid,boolean) to authenticated;

alter table public.minds_attention_events
  drop constraint if exists minds_attention_events_source_type_check;
alter table public.minds_attention_events
  add constraint minds_attention_events_source_type_check
  check (source_type in ('mission','heartbeat','routine','system','expectation'));

select cron.schedule(
  'minds-expectation-sweep',
  '*/15 * * * *',
  $$select minds_private.sweep_expectations();$$
);
