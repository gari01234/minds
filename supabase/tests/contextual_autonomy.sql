-- Build 70 behavioral contract. All users, observations, permissions and tasks roll back.
begin;
insert into auth.users(id,aud,role,email) values
 ('f0000000-0000-4000-8000-000000000071','authenticated','authenticated','autonomy-a@example.invalid'),
 ('f0000000-0000-4000-8000-000000000072','authenticated','authenticated','autonomy-b@example.invalid');
insert into public.isabella_categories(user_id,name,client_key) values
 ('f0000000-0000-4000-8000-000000000071','TEST PERSONAL70','autonomy-test'),
 ('f0000000-0000-4000-8000-000000000071','TEST OTHER70','autonomy-other');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000071',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare u uuid:='f0000000-0000-4000-8000-000000000071';r uuid;p jsonb;c jsonb;x jsonb;
begin
 p:='{"kind":"task","action":"create","title":"Explicit task","category":"TEST PERSONAL70","date":null}';
 c:='{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}';
 perform set_config('minds.test70_candidate',p::text,true);perform set_config('minds.test70_context',c::text,true);
 for i in 1..12 loop
  r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p,c);
  x:=public.minds_resolve_shadow_decision(r,'accepted',p);
  if x->>'status'<>'accepted' then raise exception 'TEST unchanged classification';end if;
  update public.minds_shadow_decisions set created_at=now()-(i%3)*interval '1 day',resolved_at=now()-(i%3)*interval '1 day' where user_id=u and request_id=r;
 end loop;
 -- A different category, dated task, source-derived request and legacy request must not pool.
 foreach c in array array[
  current_setting('minds.test70_context')::jsonb||'{"source_tainted":true}'::jsonb,
  '{"fast_path":true,"one_round":true,"source_tainted":false}'::jsonb,
  current_setting('minds.test70_context')::jsonb||'{"background":true}'::jsonb
 ] loop
  r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p,c);perform public.minds_resolve_shadow_decision(r,'accepted',p);
 end loop;
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p||'{"category":"TEST OTHER70"}',current_setting('minds.test70_context')::jsonb);
 perform public.minds_resolve_shadow_decision(r,'accepted',p||'{"category":"TEST OTHER70"}');
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'delete_task',p,current_setting('minds.test70_context')::jsonb||'{"autonomy_class":{"eligible_class":true}}');
 if (select context->'autonomy_class'->>'eligible_class' from public.minds_shadow_decisions where request_id=r)<>'false' then raise exception 'TEST forged class stamp';end if;
end $$;
set local role authenticated;
do $$
declare x jsonb;e jsonb;g jsonb;req uuid:=gen_random_uuid();n integer;
begin
 x:=public.minds_get_contextual_autonomy();
 select a into e from jsonb_array_elements(x->'units') a where a->>'context_key'='fast_task_undated_v1' and a->>'scope_label'='TEST PERSONAL70 · sin proyecto';
 if e->>'eligibility'<>'eligible' or (e->>'accepted_unchanged')::int<>12 or (e->>'review_days')::int<>3 then raise exception 'TEST contextual evidence grouping';end if;
 if jsonb_array_length(x->'permissions')<>0 then raise exception 'TEST evidence auto-promoted permission';end if;
 if exists(select 1 from jsonb_array_elements(x->'units') a where a->>'context_key' in('source_derived','fast_unverified','background') and a->>'eligibility'<>'excluded') then raise exception 'TEST excluded contexts';end if;
 if not exists(select 1 from jsonb_array_elements(x->'units') a where a->>'scope_label'='TEST OTHER70 · sin proyecto' and a->>'eligibility'='insufficient_evidence') then raise exception 'TEST sparse class';end if;
 perform set_config('minds.test70_evidence',e::text,true);perform set_config('minds.test70_grant_req',req::text,true);
 for g in select a from jsonb_array_elements(x->'units') a where a->>'eligibility'<>'eligible' loop
  begin
   perform public.minds_review_contextual_permission(g->>'action',g->>'context_key',g->>'scope_key','allow',g->>'evidence_version',0,gen_random_uuid(),true);
   raise exception 'TEST insufficient or excluded class granted';
  exception when others then if SQLERRM='TEST insufficient or excluded class granted' then raise;end if;end;
 end loop;
 begin
  perform public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow',e->>'evidence_version',0,req,false);
  raise exception 'TEST missing confirmation accepted';
 exception when others then if SQLERRM='TEST missing confirmation accepted' then raise;end if;end;
 begin
  perform public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow','stale',0,req,true);
  raise exception 'TEST stale evidence accepted';
 exception when others then if SQLERRM='TEST stale evidence accepted' then raise;end if;end;
 begin
  perform public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow',e->>'evidence_version',8,req,true);
  raise exception 'TEST stale revision accepted';
 exception when others then if SQLERRM='TEST stale revision accepted' then raise;end if;end;
 g:=public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow',e->>'evidence_version',0,req,true);
 x:=public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow',e->>'evidence_version',0,req,true);
 if x->>'status'<>'already_reviewed' or g->'permission'->>'mode'<>'allow' then raise exception 'TEST explicit grant/idempotency';end if;
 if (select count(*) from public.minds_permission_reviews)<>1 then raise exception 'TEST duplicate review receipt';end if;
 if has_table_privilege('authenticated','public.minds_contextual_permissions','INSERT') or has_table_privilege('service_role','public.minds_contextual_permissions','UPDATE') then raise exception 'TEST permission writes exposed';end if;
 if has_function_privilege('service_role','public.minds_review_contextual_permission(text,text,text,text,text,integer,uuid,boolean)','EXECUTE') then raise exception 'TEST service can grant';end if;
 if has_function_privilege('anon','public.minds_get_contextual_autonomy()','EXECUTE') then raise exception 'TEST anonymous evidence';end if;
 perform set_config('minds.test70_permission',g->'permission'->>'id',true);
end $$;
reset role;
do $$
declare r uuid:=gen_random_uuid();p jsonb:=current_setting('minds.test70_candidate')::jsonb;c jsonb:=current_setting('minds.test70_context')::jsonb;u uuid:='f0000000-0000-4000-8000-000000000071';
begin
 perform public.minds_record_shadow_decision(u,r,'create_task',p,c);perform set_config('minds.test70_execute',r::text,true);
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p||'{"category":"TEST OTHER70"}',c);perform set_config('minds.test70_other',r::text,true);
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p,c||'{"source_tainted":true}');perform set_config('minds.test70_tainted',r::text,true);
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p||'{"date":"2030-01-01"}',c);perform set_config('minds.test70_dated',r::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000072',true);
do $$
declare x jsonb;
begin
 x:=public.minds_get_contextual_autonomy();
 if jsonb_array_length(x->'units')+jsonb_array_length(x->'permissions')+jsonb_array_length(x->'reviews')<>0 then raise exception 'TEST cross-user read';end if;
 x:=public.minds_try_contextual_task(current_setting('minds.test70_execute')::uuid);
 if x->>'status'<>'confirm' then raise exception 'TEST cross-user execution';end if;
 if (select count(*) from public.minds_contextual_permissions)<>0 then raise exception 'TEST permission RLS';end if;
 begin
  perform public.minds_review_contextual_permission('create_task','fast_task_undated_v1',current_setting('minds.test70_evidence')::jsonb->>'scope_key','confirm',null,1,gen_random_uuid(),true);
  raise exception 'TEST cross-user revoke';
 exception when others then if SQLERRM='TEST cross-user revoke' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000071',true);
do $$
declare x jsonb;e jsonb;r uuid:=current_setting('minds.test70_execute')::uuid;key text;
begin
 foreach key in array array['minds.test70_other','minds.test70_tainted','minds.test70_dated'] loop
  x:=public.minds_try_contextual_task(current_setting(key)::uuid);
  if x->>'status'<>'confirm' then raise exception 'TEST mismatched scope/context executed';end if;
 end loop;
 x:=public.minds_try_contextual_task(r);
 if x->>'status'<>'executed' then raise exception 'TEST approved task execution: %',x;end if;
 perform public.minds_try_contextual_task(r);
 if (select count(*) from public.isabella_tasks)<>1 or (select count(*) from public.minds_autonomy_executions)<>1 then raise exception 'TEST duplicate task/receipt';end if;
 x:=public.minds_get_contextual_autonomy();select a into e from jsonb_array_elements(x->'units') a where a->>'context_key'='fast_task_undated_v1' and a->>'scope_label'='TEST PERSONAL70 · sin proyecto';
 if (e->>'accepted_unchanged')::int<>12 or (e->>'executed')::int<>1 then raise exception 'TEST execution became approval evidence';end if;
end $$;
reset role;
do $$
declare u uuid:='f0000000-0000-4000-8000-000000000071';r uuid:=gen_random_uuid();x jsonb;p jsonb:=current_setting('minds.test70_candidate')::jsonb;c jsonb:=current_setting('minds.test70_context')::jsonb;
begin
 -- Expiry and a base deny override a stored grant without creating a task.
 perform public.minds_record_shadow_decision(u,r,'create_task',p,c);
 update public.minds_contextual_permissions set expires_at=now()-interval '1 second' where user_id=u;
 x:=public.minds_try_contextual_task(r);
 if x->>'reason'<>'no_current_user_permission' then raise exception 'TEST expired grant executes';end if;
 update public.minds_contextual_permissions set expires_at=now()+interval '30 days' where user_id=u;
 insert into public.minds_action_policies(user_id,app_scope,action,mode,enabled) values(u,'isabella','create_task','deny',true);
 x:=public.minds_try_contextual_task(r);
 if x->>'reason'<>'base_policy_denied' then raise exception 'TEST base deny overridden';end if;
 delete from public.minds_action_policies where user_id=u and action='create_task';
 -- Old approval evidence must become stale; a new explicit review is needed.
 update public.minds_shadow_decisions set resolved_at=resolved_at-interval '8 days' where user_id=u and status='accepted';
 x:=public.minds_try_contextual_task(r);
 if x->>'reason'<>'evidence_requires_review' then raise exception 'TEST stale evidence executes';end if;
 update public.minds_shadow_decisions set resolved_at=resolved_at+interval '8 days' where user_id=u and status='accepted';
 r:=gen_random_uuid();
 perform public.minds_record_shadow_decision(u,r,'create_task',p,c);
 x:=public.minds_resolve_shadow_decision(r,'accepted',p||'{"date":"2030-01-02"}');
 if x->>'status'<>'edited' then raise exception 'TEST actual edit ignored without client annotation';end if;
 r:=gen_random_uuid();perform public.minds_record_shadow_decision(u,r,'create_task',p,c);perform set_config('minds.test70_after_edit',r::text,true);
end $$;
set local role authenticated;
do $$
declare x jsonb;e jsonb:=current_setting('minds.test70_evidence')::jsonb;
begin
 x:=public.minds_try_contextual_task(current_setting('minds.test70_after_edit')::uuid);
 if x->>'status'<>'confirm' or x->>'reason'<>'evidence_requires_review' then raise exception 'TEST contradictory evidence still executes';end if;
 x:=public.minds_get_contextual_autonomy();
 if not exists(select 1 from jsonb_array_elements(x->'units') a where a->>'eligibility'='needs_review' and a->'changed_fields'->>'date'='1') then raise exception 'TEST changed fields evidence';end if;
 x:=public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','confirm',null,1,gen_random_uuid(),true);
 if x->'permission'->>'mode'<>'confirm' then raise exception 'TEST revoke';end if;
 x:=public.minds_review_contextual_permission('create_task',e->>'context_key',e->>'scope_key','allow',e->>'evidence_version',0,current_setting('minds.test70_grant_req')::uuid,true);
 if x->'permission'->>'mode'<>'confirm' then raise exception 'TEST old approval replay resurrected permission';end if;
 x:=public.minds_try_contextual_task(current_setting('minds.test70_after_edit')::uuid);
 if x->>'status'<>'confirm' or x->>'reason'<>'no_current_user_permission' then raise exception 'TEST revoked permission executed';end if;
 if (select count(*) from public.isabella_tasks)<>1 then raise exception 'TEST revoked request wrote task';end if;
end $$;
reset role;
select 'PASS: contextual grouping, sparse evidence, actual edits, explicit review, stale review, idempotency, RLS, service denial, bounded execution, fail-closed, revocation and replay' as result;
rollback;
