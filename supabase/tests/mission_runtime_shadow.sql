-- Build 72.5B behavioral contract. All shadow fixtures roll back.
begin;

insert into auth.users(id,aud,role,email) values
 ('f3000000-0000-4000-8000-000000000071','authenticated','authenticated','shadow-a@example.invalid'),
 ('f3000000-0000-4000-8000-000000000072','authenticated','authenticated','shadow-b@example.invalid');

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000071',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare c jsonb;w jsonb;r jsonb;
begin
  c:=public.minds_create_commitment(
    '{"title":"Shadow comparison","objective":"Compare two read-only runtimes on one bounded snapshot","scope":"global"}'::jsonb,
    gen_random_uuid(),true
  );
  w:=public.minds_ensure_commitment_workspace((c->>'id')::uuid);
  perform public.minds_update_commitment_workspace_summary((w->'workspace'->>'id')::uuid,'Baseline summary');
  perform public.minds_append_commitment_workspace_item(
    (w->'workspace'->>'id')::uuid,'finding','Baseline evidence','user','user',null,'{}'::jsonb
  );
  r:=public.minds_start_mission_run(
    (w->'workspace'->>'id')::uuid,
    'Advance one checkpoint without mutating the workspace',
    gen_random_uuid(),2
  );
  perform set_config('minds.shadow_run',r->'run'->>'id',true);
  perform set_config('minds.shadow_workspace',(w->'workspace'->>'id'),true);
end $$;
reset role;

set local role service_role;
do $$
declare run_id uuid:=current_setting('minds.shadow_run')::uuid;
        native_id uuid;agents_id uuid;
begin
  insert into public.minds_mission_runtime_executions(
    mission_run_id,user_id,provider,mode,lifecycle,snapshot_hash,result_status,result_payload,metadata,started_at,completed_at
  ) values (
    run_id,'f3000000-0000-4000-8000-000000000072','native_minds','shadow','succeeded','same-hash','continue',
    '{"status":"continue","summary":"Native shadow","blocker_question":null,"items":[],"sources":[]}'::jsonb,
    '{"write_through":false}'::jsonb,now(),now()
  ) returning id into native_id;

  insert into public.minds_mission_runtime_executions(
    mission_run_id,user_id,provider,mode,lifecycle,snapshot_hash,result_status,result_payload,metadata,started_at,completed_at
  ) values (
    run_id,'f3000000-0000-4000-8000-000000000072','openai_agents','shadow','succeeded','same-hash','waiting_for_user',
    '{"status":"waiting_for_user","summary":"Agents shadow","blocker_question":"Choose A or B?","items":[{"kind":"decision","content":"Choose A","source_kind":"system","provenance_class":"inferred","source_ref":null}],"sources":[]}'::jsonb,
    '{"write_through":false}'::jsonb,now(),now()
  ) returning id into agents_id;

  insert into public.minds_mission_runtime_events(execution_id,user_id,event_type,payload)
  values
    (native_id,'f3000000-0000-4000-8000-000000000072','shadow.succeeded','{"result_status":"continue"}'),
    (agents_id,'f3000000-0000-4000-8000-000000000072','shadow.succeeded','{"result_status":"waiting_for_user"}');

  if (select count(*) from public.minds_mission_runtime_executions where mission_run_id=run_id and mode='shadow')<>2 then
    raise exception 'TEST paired shadows missing';
  end if;
  if (select count(distinct snapshot_hash) from public.minds_mission_runtime_executions where mission_run_id=run_id and mode='shadow')<>1 then
    raise exception 'TEST paired shadows did not share snapshot';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000071',true);
set local role authenticated;
do $$
declare run_id uuid:=current_setting('minds.shadow_run')::uuid;
        v_workspace_id uuid:=current_setting('minds.shadow_workspace')::uuid;
begin
  if (select count(*) from public.minds_mission_runtime_executions where mission_run_id=run_id)<>2 then
    raise exception 'TEST own paired shadow read';
  end if;
  if (select count(*) from public.minds_mission_runtime_events)<>2 then
    raise exception 'TEST own shadow event read';
  end if;
  if (select status from public.minds_mission_runs where id=run_id)<>'queued' then
    raise exception 'TEST shadow changed Mission Run status';
  end if;
  if (select w.summary from public.minds_commitment_workspaces w where w.id=v_workspace_id)<>'Baseline summary' then
    raise exception 'TEST shadow changed workspace summary';
  end if;
  if (select count(*) from public.minds_commitment_workspace_items i where i.workspace_id=v_workspace_id)<>1 then
    raise exception 'TEST shadow wrote workspace items';
  end if;
  if has_table_privilege('authenticated','public.minds_mission_runtime_executions','UPDATE') then
    raise exception 'TEST shadow result direct update exposed';
  end if;
  if has_table_privilege('authenticated','public.isabella_runtime_secrets','SELECT') then
    raise exception 'TEST shadow runner secret readable';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000072',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.minds_mission_runtime_executions) then raise exception 'TEST cross-user shadow read';end if;
  if exists(select 1 from public.minds_mission_runtime_events) then raise exception 'TEST cross-user shadow event read';end if;
end $$;
reset role;

select 'PASS: paired shadow isolation, shared snapshot, RLS and zero write-through' as result;
rollback;
