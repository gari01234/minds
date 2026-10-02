-- Build 72.5A behavioral contract. All runtime fixtures roll back.
begin;

insert into auth.users(id,aud,role,email) values
 ('f2000000-0000-4000-8000-000000000071','authenticated','authenticated','runtime-a@example.invalid'),
 ('f2000000-0000-4000-8000-000000000072','authenticated','authenticated','runtime-b@example.invalid');

insert into public.isabella_categories(user_id,name,client_key)
values ('f2000000-0000-4000-8000-000000000071','RUNTIME TEST','runtime-test');

select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000071',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare cat uuid;project uuid;c jsonb;w jsonb;r jsonb;
begin
  select id into cat from public.isabella_categories where user_id=auth.uid() and client_key='runtime-test';
  insert into public.isabella_projects(category_id,name,client_key) values(cat,'Runtime Project','runtime-project') returning id into project;
  c:=public.minds_create_commitment(
    jsonb_build_object('title','Runtime Contract','objective','Test runtime mapping','scope','project','project_id',project),
    gen_random_uuid(),true
  );
  w:=public.minds_ensure_commitment_workspace((c->>'id')::uuid);
  r:=public.minds_start_mission_run((w->'workspace'->>'id')::uuid,'Test runtime adapter',gen_random_uuid(),2);
  perform set_config('minds.runtime_test_run',r->'run'->>'id',true);
end $$;
reset role;

set local role service_role;
do $$
declare run_id uuid:=current_setting('minds.runtime_test_run')::uuid;e public.minds_mission_runtime_executions;
begin
  insert into public.minds_mission_runtime_executions(
    mission_run_id,user_id,provider,mode,lifecycle,provider_session_id,snapshot_hash,metadata
  ) values (
    run_id,'f2000000-0000-4000-8000-000000000072','native_minds','primary','running',null,'sha256:test','{"contract":"72.5A"}'
  ) returning * into e;

  if e.user_id<>'f2000000-0000-4000-8000-000000000071' then
    raise exception 'TEST execution owner not derived from run';
  end if;

  insert into public.minds_mission_runtime_events(execution_id,user_id,event_type,payload)
  values(e.id,'f2000000-0000-4000-8000-000000000072','created','{"test":true}');

  if (select user_id from public.minds_mission_runtime_events where execution_id=e.id limit 1)<>e.user_id then
    raise exception 'TEST event owner not derived from execution';
  end if;

  begin
    insert into public.minds_mission_runtime_executions(mission_run_id,user_id,provider,mode)
    values(run_id,e.user_id,'native_minds','primary');
    raise exception 'TEST duplicate runtime mapping accepted';
  exception when unique_violation then null; end;

  begin
    update public.minds_mission_runtime_executions set provider='openai_agents' where id=e.id;
    raise exception 'TEST runtime identity mutation accepted';
  exception when others then
    if SQLERRM='TEST runtime identity mutation accepted' then raise;end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000071',true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.minds_mission_runtime_executions)<>1 then raise exception 'TEST own execution read';end if;
  if (select count(*) from public.minds_mission_runtime_events)<>1 then raise exception 'TEST own event read';end if;
  if has_table_privilege('authenticated','public.minds_mission_runtime_executions','INSERT') then raise exception 'TEST direct execution write exposed';end if;
  if has_table_privilege('authenticated','public.minds_mission_runtime_events','UPDATE') then raise exception 'TEST direct event write exposed';end if;
  if has_function_privilege('authenticated','public.minds_mission_runtime_execution_guard()','EXECUTE') then raise exception 'TEST execution guard exposed';end if;
  if has_function_privilege('authenticated','public.minds_mission_runtime_event_guard()','EXECUTE') then raise exception 'TEST event guard exposed';end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000072',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.minds_mission_runtime_executions) then raise exception 'TEST cross-user execution read';end if;
  if exists(select 1 from public.minds_mission_runtime_events) then raise exception 'TEST cross-user event read';end if;
end $$;
reset role;

select 'PASS: runtime ownership, immutable mapping, RLS and service-only writes' as result;
rollback;
