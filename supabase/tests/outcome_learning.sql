-- Build 73 behavioral contract. All fixtures roll back.
begin;

insert into auth.users(id,aud,role,email)
values ('f7330000-0000-4000-8000-000000000001','authenticated','authenticated','outcome73-test@example.invalid');

insert into public.isabella_categories(user_id,name,client_key)
values ('f7330000-0000-4000-8000-000000000001','TEST OUTCOME73','outcome73');

select set_config('request.jwt.claim.sub','f7330000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
 u uuid:='f7330000-0000-4000-8000-000000000001';
 req uuid;p jsonb;c jsonb;x jsonb;e jsonb;
 perm public.minds_contextual_permissions;
 task public.isabella_tasks;
 exec public.minds_autonomy_executions;
 candidate uuid;
 fields text[];
begin
 p:='{"kind":"task","action":"create","title":"Outcome test","category":"TEST OUTCOME73","date":null,"notes":""}';
 c:='{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}';

 for i in 1..12 loop
  req:=gen_random_uuid();
  perform public.minds_record_shadow_decision(u,req,'create_task',p,c);
  perform public.minds_resolve_shadow_decision(req,'accepted',p);
  update public.minds_shadow_decisions
  set created_at=now()-(i%3)*interval '1 day',
      resolved_at=now()-(i%3)*interval '1 day'
  where user_id=u and request_id=req;
 end loop;

 select z into e from minds_private.contextual_evidence(u) z
 where z->>'context_key'='fast_task_undated_v1'
   and z->>'scope_label'='TEST OUTCOME73 · sin proyecto';
 if e->>'eligibility'<>'eligible' then raise exception 'TEST73 evidence precondition';end if;

 insert into public.minds_contextual_permissions(
  user_id,action,context_key,scope_key,scope_label,mode,revision,evidence,reviewed_at,expires_at
 ) values (
  u,'create_task',e->>'context_key',e->>'scope_key',e->>'scope_label',
  'allow',1,e,now()-interval '1 minute',now()+interval '30 days'
 ) returning * into perm;

 -- First manual edit within 48h creates only a candidate.
 req:=gen_random_uuid();
 insert into public.isabella_tasks(user_id,title,due_date,category_id,client_key,sort_order,metadata)
 values(
  u,'Outcome test',null,
  (select id from public.isabella_categories where user_id=u and name='TEST OUTCOME73'),
  'autonomy:'||req::text,10,jsonb_build_object('source','contextual_autonomy','request_id',req)
 ) returning * into task;

 insert into public.minds_autonomy_executions(user_id,request_id,permission_id,permission_revision,task_id,candidate)
 values(u,req,perm.id,perm.revision,task.id,p) returning * into exec;

 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(
  u,'task','autonomy:'||req::text,'update','manual',
  '{"title":"Outcome test","date":null,"categoryId":"outcome73","notes":""}',
  '{"title":"Outcome test","date":"2030-02-01","categoryId":"outcome73","notes":""}'
 );

 select id,changed_fields into candidate,fields
 from public.minds_post_action_feedback_candidates
 where autonomy_execution_id=exec.id;
 if candidate is null or not ('date'=any(fields)) then raise exception 'TEST73 first edit candidate';end if;

 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(
  u,'task','autonomy:'||req::text,'update','manual',
  '{"title":"Outcome test","date":"2030-02-01","categoryId":"outcome73","notes":""}',
  '{"title":"Outcome test revised","date":"2030-02-01","categoryId":"outcome73","notes":""}'
 );
 if (select count(*) from public.minds_post_action_feedback_candidates where autonomy_execution_id=exec.id)<>1 then
  raise exception 'TEST73 duplicate candidate';
 end if;
 perform set_config('minds.test73_noncausal',candidate::text,true);

 -- Completion is normal outcome, not correction evidence.
 req:=gen_random_uuid();
 insert into public.isabella_tasks(user_id,title,due_date,category_id,client_key,sort_order,metadata)
 values(
  u,'Completion test',null,
  (select id from public.isabella_categories where user_id=u and name='TEST OUTCOME73'),
  'autonomy:'||req::text,20,jsonb_build_object('source','contextual_autonomy','request_id',req)
 ) returning * into task;
 insert into public.minds_autonomy_executions(user_id,request_id,permission_id,permission_revision,task_id,candidate)
 values(u,req,perm.id,perm.revision,task.id,p) returning * into exec;
 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(u,'task','autonomy:'||req::text,'complete','manual','{"done":false}','{"done":true}');
 if exists(select 1 from public.minds_post_action_feedback_candidates where autonomy_execution_id=exec.id) then
  raise exception 'TEST73 completion classified as correction';
 end if;

 -- Completing the task does not consume later correction attribution.
 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(
  u,'task','autonomy:'||req::text,'update','manual',
  '{"title":"Completion test","date":null,"categoryId":"outcome73","notes":"","done":true}',
  '{"title":"Completion test","date":"2030-02-15","categoryId":"outcome73","notes":"","done":true}'
 );
 if not exists(select 1 from public.minds_post_action_feedback_candidates where autonomy_execution_id=exec.id) then
  raise exception 'TEST73 completion consumed later relevant correction';
 end if;

 -- An edit after the bounded 48h attribution window is ignored.
 req:=gen_random_uuid();
 insert into public.isabella_tasks(user_id,title,due_date,category_id,client_key,sort_order,metadata)
 values(
  u,'Old test',null,
  (select id from public.isabella_categories where user_id=u and name='TEST OUTCOME73'),
  'autonomy:'||req::text,30,jsonb_build_object('source','contextual_autonomy','request_id',req)
 ) returning * into task;
 insert into public.minds_autonomy_executions(user_id,request_id,permission_id,permission_revision,task_id,candidate,created_at)
 values(u,req,perm.id,perm.revision,task.id,p,now()-interval '49 hours') returning * into exec;
 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(
  u,'task','autonomy:'||req::text,'update','manual',
  '{"title":"Old test","date":null,"categoryId":"outcome73","notes":""}',
  '{"title":"Old test","date":"2030-03-01","categoryId":"outcome73","notes":""}'
 );
 if exists(select 1 from public.minds_post_action_feedback_candidates where autonomy_execution_id=exec.id) then
  raise exception 'TEST73 stale edit classified as correction';
 end if;

 -- A separate candidate is explicitly confirmed as causal by the user.
 req:=gen_random_uuid();
 insert into public.isabella_tasks(user_id,title,due_date,category_id,client_key,sort_order,metadata)
 values(
  u,'Correction test',null,
  (select id from public.isabella_categories where user_id=u and name='TEST OUTCOME73'),
  'autonomy:'||req::text,40,jsonb_build_object('source','contextual_autonomy','request_id',req)
 ) returning * into task;
 insert into public.minds_autonomy_executions(user_id,request_id,permission_id,permission_revision,task_id,candidate)
 values(u,req,perm.id,perm.revision,task.id,p) returning * into exec;
 insert into public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
 values(
  u,'task','autonomy:'||req::text,'update','manual',
  '{"title":"Correction test","date":null,"categoryId":"outcome73","notes":""}',
  '{"title":"Correction test","date":"2030-04-01","categoryId":"outcome73","notes":""}'
 );
 select id into candidate from public.minds_post_action_feedback_candidates where autonomy_execution_id=exec.id;
 perform set_config('minds.test73_causal',candidate::text,true);
 perform set_config('minds.test73_permission',perm.id::text,true);
end $$;

set local role authenticated;
do $$
declare x jsonb;e jsonb;pid uuid:=current_setting('minds.test73_permission')::uuid;
begin
 -- User says first edit was unrelated: no learning, no authority change.
 x:=public.minds_review_post_action_feedback(
  current_setting('minds.test73_noncausal')::uuid,'later_change',null,true
 );
 if x->>'causal'<>'false' then raise exception 'TEST73 later change causality';end if;
 if exists(select 1 from public.minds_outcome_feedback where candidate_id=current_setting('minds.test73_noncausal')::uuid) then
  raise exception 'TEST73 later change created feedback';
 end if;
 if (select mode from public.minds_contextual_permissions where id=pid)<>'allow' then
  raise exception 'TEST73 later change reduced authority';
 end if;

 -- Explicit correction creates one causal receipt and reduces authority.
 x:=public.minds_review_post_action_feedback(
  current_setting('minds.test73_causal')::uuid,'correction','Fecha equivocada',true
 );
 if x->>'causal'<>'true' or x->>'permission_downgraded'<>'true' then
  raise exception 'TEST73 causal confirmation';
 end if;
 if (select mode from public.minds_contextual_permissions where id=pid)<>'confirm'
    or (select revision from public.minds_contextual_permissions where id=pid)<>2 then
  raise exception 'TEST73 permission downgrade';
 end if;
 if (select count(*) from public.minds_outcome_feedback)<>1 then raise exception 'TEST73 receipt count';end if;

 x:=public.minds_review_post_action_feedback(
  current_setting('minds.test73_causal')::uuid,'correction',null,true
 );
 if x->>'status'<>'already_reviewed' or (select count(*) from public.minds_outcome_feedback)<>1 then
  raise exception 'TEST73 idempotency';
 end if;

 x:=public.minds_get_contextual_autonomy();
 select z into e from jsonb_array_elements(x->'units') z
 where z->>'context_key'='fast_task_undated_v1'
   and z->>'scope_label'='TEST OUTCOME73 · sin proyecto';
 if e->>'eligibility'<>'needs_review' or (e->>'outcome_corrections')::int<>1 then
  raise exception 'TEST73 correction absent from evidence';
 end if;
 if jsonb_array_length(x->'post_action_candidates')<2
    or jsonb_array_length(x->'outcome_feedback')<>1 then
  raise exception 'TEST73 review payload';
 end if;

 if has_table_privilege('authenticated','public.minds_outcome_feedback','INSERT')
    or has_table_privilege('authenticated','public.minds_post_action_feedback_candidates','UPDATE') then
  raise exception 'TEST73 direct writes exposed';
 end if;
 if has_function_privilege(
  'service_role','public.minds_review_post_action_feedback(uuid,text,text,boolean)','EXECUTE'
 ) then raise exception 'TEST73 service can assert causal feedback';end if;
end $$;
reset role;

select 'PASS: candidate correlation, explicit causality, bounded attribution, authority reduction and RLS' as result;
rollback;
