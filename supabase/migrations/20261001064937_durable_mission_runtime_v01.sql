create table if not exists public.minds_mission_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.minds_commitment_workspaces(id) on delete cascade,
  request_id uuid not null,
  instruction text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_for_user','paused','completed','failed','cancelled')),
  phase text not null default 'queued',
  iteration integer not null default 0 check (iteration between 0 and 12),
  max_iterations integer not null default 4 check (max_iterations between 1 and 12),
  retry_count integer not null default 0 check (retry_count between 0 and 8),
  next_attempt_at timestamptz null default now(),
  lease_token uuid null,
  lease_until timestamptz null,
  result_summary text not null default '',
  blocker_question text null,
  last_error text null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources)='array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  started_at timestamptz null,
  completed_at timestamptz null,
  notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minds_mission_runs_instruction_check check (length(trim(instruction)) between 1 and 6000),
  constraint minds_mission_runs_summary_check check (length(result_summary) <= 12000),
  constraint minds_mission_runs_blocker_check check (blocker_question is null or length(blocker_question) <= 4000),
  unique(user_id,request_id)
);

create unique index if not exists minds_mission_runs_one_live_per_workspace
  on public.minds_mission_runs(workspace_id)
  where status in ('queued','running','waiting_for_user','paused');

create index if not exists minds_mission_runs_claim_idx
  on public.minds_mission_runs(status,next_attempt_at,lease_until,created_at)
  where status in ('queued','running');

create index if not exists minds_mission_runs_user_status_idx
  on public.minds_mission_runs(user_id,status,updated_at desc);

alter table public.minds_mission_runs enable row level security;
drop policy if exists "mission runs select own" on public.minds_mission_runs;
create policy "mission runs select own"
on public.minds_mission_runs for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_mission_runs from authenticated,anon;
grant select on public.minds_mission_runs to authenticated;

create table if not exists public.minds_mission_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.minds_mission_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('queued','claimed','checkpoint','waiting_for_user','completed','failed','retry_scheduled','paused','resumed','cancelled','user_input','delivered')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now()
);
create index if not exists minds_mission_run_events_run_idx
  on public.minds_mission_run_events(run_id,created_at asc);
create index if not exists minds_mission_run_events_user_idx
  on public.minds_mission_run_events(user_id,created_at desc);

alter table public.minds_mission_run_events enable row level security;
drop policy if exists "mission run events select own" on public.minds_mission_run_events;
create policy "mission run events select own"
on public.minds_mission_run_events for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_mission_run_events from authenticated,anon;
grant select on public.minds_mission_run_events to authenticated;

create or replace function public.minds_start_mission_run(
  p_workspace_id uuid,
  p_instruction text,
  p_request_id uuid,
  p_max_iterations integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_workspace public.minds_commitment_workspaces%rowtype;
  v_commitment public.minds_commitments%rowtype;
  v_existing public.minds_mission_runs%rowtype;
  v_run public.minds_mission_runs%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if p_request_id is null then return jsonb_build_object('status','invalid_request_id'); end if;
  if length(trim(coalesce(p_instruction,'')))<1 or length(trim(coalesce(p_instruction,'')))>6000 then return jsonb_build_object('status','invalid_instruction'); end if;

  select * into v_existing from public.minds_mission_runs
  where user_id=v_uid and request_id=p_request_id;
  if found then return jsonb_build_object('status','ok','run',to_jsonb(v_existing),'idempotent',true); end if;

  select * into v_workspace from public.minds_commitment_workspaces
  where id=p_workspace_id and user_id=v_uid and status='active';
  if not found then return jsonb_build_object('status','workspace_unavailable'); end if;

  select * into v_commitment from public.minds_commitments
  where id=v_workspace.commitment_id and user_id=v_uid and status in ('active','waiting');
  if not found then return jsonb_build_object('status','commitment_unavailable'); end if;

  select * into v_existing from public.minds_mission_runs
  where workspace_id=p_workspace_id and user_id=v_uid
    and status in ('queued','running','waiting_for_user','paused')
  order by created_at desc limit 1;
  if found then return jsonb_build_object('status','already_active','run',to_jsonb(v_existing)); end if;

  insert into public.minds_mission_runs(
    user_id,workspace_id,request_id,instruction,max_iterations,status,phase,metadata
  ) values (
    v_uid,p_workspace_id,p_request_id,trim(p_instruction),greatest(1,least(coalesce(p_max_iterations,4),8)),
    'queued','queued',jsonb_build_object('origin','isabella','commitment_id',v_workspace.commitment_id)
  ) returning * into v_run;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'queued',jsonb_build_object('instruction',v_run.instruction,'max_iterations',v_run.max_iterations));

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_pause_mission_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.minds_mission_runs%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;

  update public.minds_mission_runs
  set
    status=case when status in ('queued','waiting_for_user') then 'paused' else status end,
    phase=case when status in ('queued','waiting_for_user') then 'paused' else phase end,
    metadata=metadata||jsonb_build_object('pause_requested',true),
    next_attempt_at=case when status in ('queued','waiting_for_user') then null else next_attempt_at end,
    updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('queued','running','waiting_for_user')
  returning * into v_run;

  if not found then return jsonb_build_object('status','unavailable'); end if;
  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'paused',jsonb_build_object('requested',true,'effective',v_run.status='paused'));
  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_resume_mission_run(
  p_run_id uuid,
  p_instruction text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.minds_mission_runs%rowtype;
  v_input text:=nullif(trim(coalesce(p_instruction,'')),'');
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if v_input is not null and length(v_input)>6000 then return jsonb_build_object('status','invalid_instruction'); end if;

  update public.minds_mission_runs
  set status='queued',phase='resumed',next_attempt_at=now(),lease_token=null,lease_until=null,
      blocker_question=null,last_error=null,completed_at=null,
      max_iterations=least(12,greatest(max_iterations,iteration+3)),
      metadata=(metadata-'pause_requested')||case when v_input is null then '{}'::jsonb else jsonb_build_object('last_user_input',v_input,'last_user_input_at',now()) end,
      updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('waiting_for_user','paused','failed')
  returning * into v_run;

  if not found then return jsonb_build_object('status','unavailable'); end if;

  if v_input is not null then
    insert into public.minds_commitment_workspace_items(
      workspace_id,user_id,kind,status,content,provenance_class,source_kind,metadata
    ) values (
      v_run.workspace_id,v_uid,'note','working',v_input,'user','user',jsonb_build_object('mission_run_id',v_run.id,'resume_input',true)
    );
    insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
    values(v_run.id,v_uid,'user_input',jsonb_build_object('content',v_input));
  end if;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'resumed',jsonb_build_object('max_iterations',v_run.max_iterations));
  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_cancel_mission_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_run public.minds_mission_runs%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  update public.minds_mission_runs
  set status='cancelled',phase='cancelled',lease_token=null,lease_until=null,next_attempt_at=null,
      completed_at=now(),updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('queued','running','waiting_for_user','paused','failed')
  returning * into v_run;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'cancelled','{}'::jsonb);
  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_claim_mission_runs(p_limit integer default 6)
returns setof public.minds_mission_runs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with due as (
    select id
    from public.minds_mission_runs
    where (
      status='queued' and coalesce(next_attempt_at,now())<=now()
    ) or (
      status='running' and lease_until is not null and lease_until<now()
    )
    order by coalesce(next_attempt_at,created_at),created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,6),12))
  ),
  claimed as (
    update public.minds_mission_runs r
    set status='running',phase='working',iteration=r.iteration+1,
        lease_token=gen_random_uuid(),lease_until=now()+interval '4 minutes',
        started_at=coalesce(r.started_at,now()),updated_at=now()
    from due where r.id=due.id
    returning r.*
  ),
  logged as (
    insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
    select id,user_id,'claimed',jsonb_build_object('iteration',iteration,'lease_until',lease_until)
    from claimed
    returning run_id
  )
  select c.* from claimed c;
end $$;

create or replace function public.minds_apply_mission_step(
  p_run_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.minds_mission_runs%rowtype;
  v_workspace public.minds_commitment_workspaces%rowtype;
  v_item jsonb;
  v_kind text;
  v_source text;
  v_provenance text;
  v_outcome text:=coalesce(p_result->>'status','continue');
  v_summary text:=left(coalesce(p_result->>'summary',''),12000);
  v_blocker text:=nullif(left(coalesce(p_result->>'blocker_question',''),4000),'');
  v_sources jsonb:=case when jsonb_typeof(p_result->'sources')='array' then p_result->'sources' else '[]'::jsonb end;
  v_pause boolean:=false;
begin
  select * into v_run from public.minds_mission_runs
  where id=p_run_id and status='running' and lease_token=p_lease_token and lease_until>=now()
  for update;
  if not found then return jsonb_build_object('status','stale'); end if;

  select * into v_workspace from public.minds_commitment_workspaces
  where id=v_run.workspace_id and user_id=v_run.user_id for update;
  if not found then return jsonb_build_object('status','workspace_missing'); end if;

  v_pause:=coalesce((v_run.metadata->>'pause_requested')::boolean,false);

  if jsonb_typeof(p_result->'items')='array' then
    for v_item in select value from jsonb_array_elements(p_result->'items') limit 12 loop
      v_kind:=coalesce(v_item->>'kind','note');
      if v_kind not in ('plan','finding','source','question','decision','note') then v_kind:='note'; end if;
      if length(trim(coalesce(v_item->>'content','')))<1 then continue; end if;
      v_source:=coalesce(v_item->>'source_kind','system');
      if v_source not in ('user','conversation','work','document','web','specialist','system') then v_source:='system'; end if;
      v_provenance:=case
        when v_source='user' then 'user'
        when v_source in ('work','document') then 'project_source'
        when v_source='web' then 'external'
        when v_item->>'provenance_class' in ('user','project_source','external','inferred','agent') then v_item->>'provenance_class'
        else 'agent'
      end;
      insert into public.minds_commitment_workspace_items(
        workspace_id,user_id,kind,status,content,provenance_class,source_kind,source_ref,metadata
      ) values (
        v_run.workspace_id,v_run.user_id,v_kind,case when v_kind='decision' then 'proposed' else 'working' end,
        left(trim(v_item->>'content'),16000),v_provenance,v_source,nullif(left(trim(coalesce(v_item->>'source_ref','')),2000),''),
        jsonb_build_object('mission_run_id',v_run.id,'iteration',v_run.iteration)
      );
    end loop;
  end if;

  update public.minds_commitment_workspaces
  set summary=case when v_summary<>'' then v_summary else summary end,updated_at=now()
  where id=v_run.workspace_id;

  if v_pause then
    v_outcome:='paused';
  elsif v_outcome not in ('continue','waiting_for_user','completed') then
    v_outcome:='continue';
  elsif v_outcome='continue' and v_run.iteration>=v_run.max_iterations then
    v_outcome:='waiting_for_user';
    v_blocker:=coalesce(v_blocker,'He llegado al límite acotado de esta ejecución autónoma. Puedo seguir avanzando si quieres.');
  end if;

  update public.minds_mission_runs
  set status=case
        when v_outcome='continue' then 'queued'
        when v_outcome='waiting_for_user' then 'waiting_for_user'
        when v_outcome='completed' then 'completed'
        else 'paused'
      end,
      phase=case
        when v_outcome='continue' then 'checkpointed'
        when v_outcome='waiting_for_user' then 'waiting_for_user'
        when v_outcome='completed' then 'completed'
        else 'paused'
      end,
      result_summary=case when v_summary<>'' then v_summary else result_summary end,
      blocker_question=case when v_outcome='waiting_for_user' then v_blocker else null end,
      sources=(select coalesce(jsonb_agg(distinct x),'[]'::jsonb) from jsonb_array_elements(coalesce(sources,'[]'::jsonb)||v_sources) x),
      next_attempt_at=case when v_outcome='continue' then now()+interval '5 seconds' else null end,
      lease_token=null,lease_until=null,last_error=null,
      metadata=metadata-'pause_requested',
      completed_at=case when v_outcome='completed' then now() else completed_at end,
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(
    v_run.id,v_run.user_id,
    case v_run.status when 'queued' then 'checkpoint' when 'waiting_for_user' then 'waiting_for_user' when 'completed' then 'completed' else 'paused' end,
    jsonb_build_object('iteration',v_run.iteration,'summary',v_run.result_summary,'blocker_question',v_run.blocker_question)
  );

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_fail_mission_step(
  p_run_id uuid,
  p_lease_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.minds_mission_runs%rowtype;
  v_retry integer;
  v_terminal boolean;
begin
  select * into v_run from public.minds_mission_runs
  where id=p_run_id and status='running' and lease_token=p_lease_token
  for update;
  if not found then return jsonb_build_object('status','stale'); end if;

  v_retry:=v_run.retry_count+1;
  v_terminal:=v_retry>=4;

  update public.minds_mission_runs
  set status=case when v_terminal then 'failed' else 'queued' end,
      phase=case when v_terminal then 'failed' else 'retry_wait' end,
      retry_count=v_retry,last_error=left(coalesce(p_error,'mission_step_failed'),8000),
      next_attempt_at=case when v_terminal then null else now()+(array[2,5,15]::int[])[least(v_retry,3)]*interval '1 minute' end,
      lease_token=null,lease_until=null,
      completed_at=case when v_terminal then now() else completed_at end,
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_run.user_id,case when v_terminal then 'failed' else 'retry_scheduled' end,
         jsonb_build_object('retry_count',v_retry,'error',v_run.last_error,'next_attempt_at',v_run.next_attempt_at));

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_mark_mission_notified(
  p_run_id uuid,
  p_event text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_run public.minds_mission_runs%rowtype;
begin
  update public.minds_mission_runs set notified_at=coalesce(notified_at,now()),updated_at=now()
  where id=p_run_id returning * into v_run;
  if not found then return jsonb_build_object('status','missing'); end if;
  if not exists(select 1 from public.minds_mission_run_events where run_id=p_run_id and event_type='delivered' and payload->>'event'=p_event) then
    insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
    values(v_run.id,v_run.user_id,'delivered',jsonb_build_object('event',p_event));
  end if;
  return jsonb_build_object('status','ok');
end $$;

revoke all on function public.minds_start_mission_run(uuid,text,uuid,integer) from public,anon;
revoke all on function public.minds_pause_mission_run(uuid) from public,anon;
revoke all on function public.minds_resume_mission_run(uuid,text) from public,anon;
revoke all on function public.minds_cancel_mission_run(uuid) from public,anon;
grant execute on function public.minds_start_mission_run(uuid,text,uuid,integer) to authenticated;
grant execute on function public.minds_pause_mission_run(uuid) to authenticated;
grant execute on function public.minds_resume_mission_run(uuid,text) to authenticated;
grant execute on function public.minds_cancel_mission_run(uuid) to authenticated;

revoke all on function public.minds_claim_mission_runs(integer) from public,anon,authenticated;
revoke all on function public.minds_apply_mission_step(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.minds_fail_mission_step(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.minds_mark_mission_notified(uuid,text) from public,anon,authenticated;
grant execute on function public.minds_claim_mission_runs(integer) to service_role;
grant execute on function public.minds_apply_mission_step(uuid,uuid,jsonb) to service_role;
grant execute on function public.minds_fail_mission_step(uuid,uuid,text) to service_role;
grant execute on function public.minds_mark_mission_notified(uuid,text) to service_role;

insert into public.isabella_runtime_secrets(key,value)
values ('mission_runner',encode(gen_random_bytes(32),'hex'))
on conflict(key) do nothing;

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','start_mission_run','allow','Durable internal work inside an already approved Commitment workspace; cannot perform external mutations',10,true,
       '{"runtime":"durable_mission_v1","internal_only":true,"bounded":true}'::jsonb
where not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='start_mission_run' and enabled);

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','control_mission_run','allow','User-directed pause, resume or cancellation of durable internal work',10,true,
       '{"runtime":"durable_mission_v1","user_controlled":true}'::jsonb
where not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='control_mission_run' and enabled);

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='minds-mission-runner' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'minds-mission-runner',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-mission-runner',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'secret',
      (select value from public.isabella_runtime_secrets where key='mission_runner')
    )
  );
  $cron$
);