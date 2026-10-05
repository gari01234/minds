-- Build 82 · Persistent Work / Dot-like Continuations v0.1
-- Evolves durable Mission Runs; no second job system.

alter table public.minds_mission_runs
  add column if not exists wait_kind text null,
  add column if not exists wait_ref text null,
  add column if not exists wake_at timestamptz null;

alter table public.minds_mission_runs drop constraint if exists minds_mission_runs_status_check;
alter table public.minds_mission_runs add constraint minds_mission_runs_status_check
  check (status in ('queued','running','waiting','waiting_for_user','paused','completed','failed','cancelled'));

alter table public.minds_mission_runs drop constraint if exists minds_mission_runs_iteration_check;
alter table public.minds_mission_runs add constraint minds_mission_runs_iteration_check
  check (iteration between 0 and 64);

alter table public.minds_mission_runs drop constraint if exists minds_mission_runs_max_iterations_check;
alter table public.minds_mission_runs add constraint minds_mission_runs_max_iterations_check
  check (max_iterations between 1 and 32);

alter table public.minds_mission_runs drop constraint if exists minds_mission_runs_wait_kind_check;
alter table public.minds_mission_runs add constraint minds_mission_runs_wait_kind_check
  check (wait_kind is null or wait_kind in ('time','capability','expectation'));

alter table public.minds_mission_run_events drop constraint if exists minds_mission_run_events_event_type_check;
alter table public.minds_mission_run_events add constraint minds_mission_run_events_event_type_check
  check (event_type in ('queued','claimed','checkpoint','waiting','reactivated','waiting_for_user','completed','failed','retry_scheduled','paused','resumed','cancelled','user_input','delivered'));

drop index if exists public.minds_mission_runs_one_live_per_workspace;
create unique index minds_mission_runs_one_live_per_workspace
  on public.minds_mission_runs(workspace_id)
  where status in ('queued','running','waiting','waiting_for_user','paused');

create index if not exists minds_mission_runs_wait_idx
  on public.minds_mission_runs(status,wait_kind,wake_at,updated_at)
  where status='waiting';

create or replace function public.minds_start_mission_run(
  p_workspace_id uuid,
  p_instruction text,
  p_request_id uuid,
  p_max_iterations integer default 12
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
  v_max integer:=greatest(1,least(coalesce(p_max_iterations,12),32));
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
    and status in ('queued','running','waiting','waiting_for_user','paused')
  order by created_at desc limit 1;
  if found then return jsonb_build_object('status','already_active','run',to_jsonb(v_existing)); end if;

  insert into public.minds_mission_runs(
    user_id,workspace_id,request_id,instruction,max_iterations,status,phase,metadata
  ) values (
    v_uid,p_workspace_id,p_request_id,trim(p_instruction),v_max,
    'queued','queued',
    jsonb_build_object(
      'origin','isabella',
      'commitment_id',v_workspace.commitment_id,
      'persistent_work',true,
      'persistent_work_version','persistent-work-v0.1',
      'notify_mode',coalesce(nullif(v_commitment.metadata->>'notify_mode',''),'policy'),
      'skill_trace',coalesce(v_commitment.metadata->'skill_trace','[]'::jsonb)
    )
  ) returning * into v_run;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'queued',jsonb_build_object('instruction',v_run.instruction,'max_iterations',v_run.max_iterations,'persistent_work',true));

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_apply_mission_step_v2(
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
  v_wait jsonb:=case when jsonb_typeof(p_result->'wait')='object' then p_result->'wait' else '{}'::jsonb end;
  v_wait_kind text:=nullif(v_wait->>'kind','');
  v_wait_ref text:=nullif(left(trim(coalesce(v_wait->>'ref','')),120),'');
  v_wake_at timestamptz:=null;
  v_event text;
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
  elsif v_outcome not in ('continue','waiting','waiting_for_user','completed') then
    v_outcome:='continue';
  end if;

  if v_outcome='waiting' then
    if v_wait_kind='time' then
      begin v_wake_at:=(v_wait->>'wake_at')::timestamptz; exception when others then v_wake_at:=null; end;
      if v_wake_at is null or v_wake_at<=now()+interval '15 seconds' or v_wake_at>now()+interval '90 days' then
        v_outcome:='waiting_for_user';v_blocker:='Necesito una fecha u hora futura válida para poder retomar este trabajo.';
      end if;
      v_wait_ref:=null;
    elsif v_wait_kind='capability' then
      if v_wait_ref is null or not exists(
        select 1 from public.minds_capability_runs c where c.id::text=v_wait_ref and c.user_id=v_run.user_id
      ) then
        v_outcome:='waiting_for_user';v_blocker:='No pude identificar el trabajo material que debía esperar.';
      end if;
    elsif v_wait_kind='expectation' then
      if v_wait_ref is null or not exists(
        select 1 from public.minds_expectations e where e.id::text=v_wait_ref and e.user_id=v_run.user_id and e.status in ('active','due_unconfirmed')
      ) then
        v_outcome:='waiting_for_user';v_blocker:='No pude identificar la expectativa que debía mantener pendiente.';
      end if;
    else
      v_outcome:='waiting_for_user';v_blocker:='No tengo una condición de espera válida para continuar este trabajo.';
    end if;
  end if;

  if v_outcome='continue' and v_run.iteration>=v_run.max_iterations then
    v_outcome:='waiting_for_user';
    v_blocker:=coalesce(v_blocker,'He alcanzado el límite acotado de checkpoints de este trabajo. Puedo seguir si quieres.');
  end if;

  update public.minds_mission_runs
  set status=case
        when v_outcome='continue' then 'queued'
        when v_outcome='waiting' then 'waiting'
        when v_outcome='waiting_for_user' then 'waiting_for_user'
        when v_outcome='completed' then 'completed'
        else 'paused'
      end,
      phase=case
        when v_outcome='continue' then 'checkpointed'
        when v_outcome='waiting' then 'waiting_'||v_wait_kind
        when v_outcome='waiting_for_user' then 'waiting_for_user'
        when v_outcome='completed' then 'completed'
        else 'paused'
      end,
      result_summary=case when v_summary<>'' then v_summary else result_summary end,
      blocker_question=case when v_outcome='waiting_for_user' then v_blocker else null end,
      sources=(select coalesce(jsonb_agg(distinct x),'[]'::jsonb) from jsonb_array_elements(coalesce(sources,'[]'::jsonb)||v_sources) x),
      next_attempt_at=case when v_outcome='continue' then now()+interval '5 seconds' else null end,
      wait_kind=case when v_outcome='waiting' then v_wait_kind else null end,
      wait_ref=case when v_outcome='waiting' then v_wait_ref else null end,
      wake_at=case when v_outcome='waiting' then v_wake_at else null end,
      lease_token=null,lease_until=null,last_error=null,
      metadata=(metadata-'pause_requested'-'wait')||
        case when v_outcome='waiting'
          then jsonb_build_object('wait',jsonb_build_object('kind',v_wait_kind,'ref',v_wait_ref,'wake_at',v_wake_at))
          else '{}'::jsonb end,
      completed_at=case when v_outcome='completed' then now() else completed_at end,
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  v_event:=case v_run.status
    when 'queued' then 'checkpoint'
    when 'waiting' then 'waiting'
    when 'waiting_for_user' then 'waiting_for_user'
    when 'completed' then 'completed'
    else 'paused' end;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(
    v_run.id,v_run.user_id,v_event,
    jsonb_build_object(
      'iteration',v_run.iteration,'summary',v_run.result_summary,'blocker_question',v_run.blocker_question,
      'wait_kind',v_run.wait_kind,'wait_ref',v_run.wait_ref,'wake_at',v_run.wake_at
    )
  );

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_reactivate_mission_waits(p_limit integer default 12)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.minds_mission_runs%rowtype;
  v_ready boolean;
  v_dep_status text;
  n integer:=0;
begin
  for r in
    select * from public.minds_mission_runs
    where status='waiting'
    order by updated_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,12),48))
  loop
    v_ready:=false;v_dep_status:=null;
    if r.wait_kind='time' then
      v_ready:=r.wake_at is not null and r.wake_at<=now();
      if v_ready then v_dep_status:='time_elapsed'; end if;
    elsif r.wait_kind='capability' then
      select status into v_dep_status from public.minds_capability_runs
      where id::text=r.wait_ref and user_id=r.user_id;
      v_ready:=v_dep_status in ('completed','failed','cancelled');
    elsif r.wait_kind='expectation' then
      select status into v_dep_status from public.minds_expectations
      where id::text=r.wait_ref and user_id=r.user_id;
      v_ready:=v_dep_status in ('fulfilled','not_occurred','cancelled');
    end if;
    if not v_ready then continue; end if;

    update public.minds_mission_runs
    set status='queued',phase='reactivated',next_attempt_at=now(),
        metadata=(metadata-'wait')||jsonb_build_object('last_wake',jsonb_build_object(
          'kind',r.wait_kind,'ref',r.wait_ref,'status',v_dep_status,'wake_at',r.wake_at,'reactivated_at',now()
        )),
        wait_kind=null,wait_ref=null,wake_at=null,updated_at=now()
    where id=r.id and status='waiting';

    if found then
      insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
      values(r.id,r.user_id,'reactivated',jsonb_build_object('wait_kind',r.wait_kind,'wait_ref',r.wait_ref,'dependency_status',v_dep_status));
      n:=n+1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.minds_pause_mission_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_uid uuid:=auth.uid();v_run public.minds_mission_runs%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  update public.minds_mission_runs
  set status=case when status in ('queued','waiting','waiting_for_user') then 'paused' else status end,
      phase=case when status in ('queued','waiting','waiting_for_user') then 'paused' else phase end,
      metadata=metadata||jsonb_build_object('pause_requested',true),
      next_attempt_at=case when status in ('queued','waiting','waiting_for_user') then null else next_attempt_at end,
      wait_kind=case when status in ('queued','waiting','waiting_for_user') then null else wait_kind end,
      wait_ref=case when status in ('queued','waiting','waiting_for_user') then null else wait_ref end,
      wake_at=case when status in ('queued','waiting','waiting_for_user') then null else wake_at end,
      updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('queued','running','waiting','waiting_for_user')
  returning * into v_run;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'paused',jsonb_build_object('requested',true,'effective',v_run.status='paused'));
  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end $$;

create or replace function public.minds_resume_mission_run(p_run_id uuid,p_instruction text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_uid uuid:=auth.uid();v_run public.minds_mission_runs%rowtype;v_input text:=nullif(trim(coalesce(p_instruction,'')),'');
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if v_input is not null and length(v_input)>6000 then return jsonb_build_object('status','invalid_instruction'); end if;
  update public.minds_mission_runs
  set status='queued',phase='resumed',next_attempt_at=now(),lease_token=null,lease_until=null,
      wait_kind=null,wait_ref=null,wake_at=null,blocker_question=null,last_error=null,completed_at=null,
      max_iterations=least(32,greatest(max_iterations,iteration+6)),
      metadata=(metadata-'pause_requested'-'wait')||case when v_input is null then '{}'::jsonb else jsonb_build_object('last_user_input',v_input,'last_user_input_at',now()) end,
      updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('waiting','waiting_for_user','paused','failed')
  returning * into v_run;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if v_input is not null then
    insert into public.minds_commitment_workspace_items(workspace_id,user_id,kind,status,content,provenance_class,source_kind,metadata)
    values(v_run.workspace_id,v_uid,'note','working',v_input,'user','user',jsonb_build_object('mission_run_id',v_run.id,'resume_input',true));
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
declare v_uid uuid:=auth.uid();v_run public.minds_mission_runs%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  update public.minds_mission_runs
  set status='cancelled',phase='cancelled',lease_token=null,lease_until=null,next_attempt_at=null,
      wait_kind=null,wait_ref=null,wake_at=null,completed_at=now(),updated_at=now()
  where id=p_run_id and user_id=v_uid and status in ('queued','running','waiting','waiting_for_user','paused','failed')
  returning * into v_run;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'cancelled','{}'::jsonb);
  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
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
as $
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
end $;

revoke all on function public.minds_start_mission_run_with_attention(uuid,text,uuid,integer,text) from public,anon;
grant execute on function public.minds_start_mission_run_with_attention(uuid,text,uuid,integer,text) to authenticated;

revoke all on function public.minds_apply_mission_step_v2(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.minds_reactivate_mission_waits(integer) from public,anon,authenticated;
grant execute on function public.minds_apply_mission_step_v2(uuid,uuid,jsonb) to service_role;
grant execute on function public.minds_reactivate_mission_waits(integer) to service_role;

revoke all on function public.minds_start_mission_run(uuid,text,uuid,integer) from public,anon;
revoke all on function public.minds_pause_mission_run(uuid) from public,anon;
revoke all on function public.minds_resume_mission_run(uuid,text) from public,anon;
revoke all on function public.minds_cancel_mission_run(uuid) from public,anon;
grant execute on function public.minds_start_mission_run(uuid,text,uuid,integer) to authenticated;
grant execute on function public.minds_pause_mission_run(uuid) to authenticated;
grant execute on function public.minds_resume_mission_run(uuid,text) to authenticated;
grant execute on function public.minds_cancel_mission_run(uuid) to authenticated;

update public.minds_action_policies
set reason='Persistent internal work inside an approved Commitment workspace; may wait on time, a bounded capability run, or a user-reviewed Expectation; no external side effects.',
    metadata=coalesce(metadata,'{}'::jsonb)||'{"runtime":"persistent_work_v01","internal_only":true,"bounded":true,"waits":["time","capability","expectation"]}'::jsonb,
    updated_at=now()
where user_id is null and app_scope='isabella' and action='start_mission_run' and enabled;
