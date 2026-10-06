-- Resolve obsolete waiting_for_user interruptions when a Persistent Work mission resumes.
create or replace function public.minds_resume_mission_run(
  p_run_id uuid,
  p_instruction text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_run public.minds_mission_runs%rowtype;
  v_input text:=nullif(trim(coalesce(p_instruction,'')),'');
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if v_input is not null and length(v_input)>6000 then return jsonb_build_object('status','invalid_instruction'); end if;

  update public.minds_mission_runs
  set status='queued',
      phase='resumed',
      next_attempt_at=now(),
      lease_token=null,
      lease_until=null,
      wait_kind=null,
      wait_ref=null,
      wake_at=null,
      blocker_question=null,
      last_error=null,
      completed_at=null,
      max_iterations=least(32,greatest(max_iterations,iteration+6)),
      metadata=(metadata-'pause_requested'-'wait')
        || case when v_input is null then '{}'::jsonb
                else jsonb_build_object('last_user_input',v_input,'last_user_input_at',now()) end,
      updated_at=now()
  where id=p_run_id
    and user_id=v_uid
    and status in ('waiting','waiting_for_user','paused','failed')
  returning * into v_run;

  if not found then return jsonb_build_object('status','unavailable'); end if;

  update public.minds_attention_events
  set status='resolved',
      consumed_at=coalesce(consumed_at,now()),
      updated_at=now()
  where user_id=v_uid
    and source_type='mission'
    and source_id=v_run.id::text
    and requires_user=true
    and status in ('pending','delivered')
    and coalesce(metadata->>'mission_event','')='waiting_for_user';

  if v_input is not null then
    insert into public.minds_commitment_workspace_items(
      workspace_id,user_id,kind,status,content,provenance_class,source_kind,metadata
    )
    values(
      v_run.workspace_id,v_uid,'note','working',v_input,'user','user',
      jsonb_build_object('mission_run_id',v_run.id,'resume_input',true)
    );

    insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
    values(v_run.id,v_uid,'user_input',jsonb_build_object('content',v_input));
  end if;

  insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
  values(v_run.id,v_uid,'resumed',jsonb_build_object('max_iterations',v_run.max_iterations));

  return jsonb_build_object('status','ok','run',to_jsonb(v_run));
end
$function$;

-- Repair already-completed/cancelled missions whose old decision card remained delivered.
update public.minds_attention_events e
set status='resolved',
    consumed_at=coalesce(e.consumed_at,now()),
    updated_at=now()
where e.source_type='mission'
  and e.requires_user=true
  and e.status in ('pending','delivered')
  and coalesce(e.metadata->>'mission_event','')='waiting_for_user'
  and exists (
    select 1
    from public.minds_mission_runs r
    where r.id::text=e.source_id
      and r.user_id=e.user_id
      and r.status in ('completed','cancelled')
  );
