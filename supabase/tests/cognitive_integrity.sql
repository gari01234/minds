-- Run on a Supabase database after migrations. Every fixture is rolled back.
begin;
insert into auth.users(id,aud,role,email) values
 ('f0000000-0000-4000-8000-000000000001','authenticated','authenticated','minds-test-a@example.invalid'),
 ('f0000000-0000-4000-8000-000000000002','authenticated','authenticated','minds-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare cat uuid;project uuid;conv uuid;ids uuid[];c jsonb;s jsonb;req uuid:=gen_random_uuid();intent uuid;before_n integer;
begin
 insert into public.isabella_categories(name,client_key) values('TEST','test-category') returning id into cat;
 insert into public.isabella_projects(category_id,name,client_key) values(cat,'TEST PROJECT','test-project') returning id into project;
 perform set_config('minds.test_project',project::text,true);
 select count(*) into before_n from public.minds_work_claims;
 begin
  perform public.minds_save_work_claim(jsonb_build_object('project_id',project,'statement','bad evidence','provenance_class','project_source'),'[{"source_file_id":"f0000000-0000-4000-8000-000000000099"}]',gen_random_uuid(),true);
  raise exception 'TEST expected evidence rejection';
 exception when others then if SQLERRM='TEST expected evidence rejection' then raise;end if;end;
 if (select count(*) from public.minds_work_claims)<>before_n then raise exception 'TEST orphaned claim after evidence failure';end if;
 begin
  perform public.minds_save_work_claim(jsonb_build_object('project_id',project,'statement','unapproved'),'[]',gen_random_uuid(),false);
  raise exception 'TEST expected confirmation rejection';
 exception when others then if SQLERRM='TEST expected confirmation rejection' then raise;end if;end;
 c:=public.minds_save_work_claim(jsonb_build_object('project_id',project,'statement','A source says X','status','confirmed','provenance_class','external'),'[{"source_kind":"external","excerpt":"X"}]',req,true);
 c:=public.minds_save_work_claim(jsonb_build_object('project_id',project,'statement','A source says X'),'[]',req,true);
 if (select count(*) from public.minds_work_claims)<>before_n+1 then raise exception 'TEST duplicate claim';end if;
 if (select trust_level from public.minds_work_evidence where claim_id=(c->>'id')::uuid limit 1)<>'untrusted' then raise exception 'TEST confirmed review promoted external source';end if;
 perform set_config('minds.test_claim',(c->>'id'),true);
 perform public.minds_save_work_claim(jsonb_build_object('id',c->>'id','project_id',project,'statement','Reviewed later','provenance_class','external'),'[]',gen_random_uuid(),true);
 c:=public.minds_save_work_claim(jsonb_build_object('project_id',project,'statement','A source says X'),'[]',req,true);
 if c->>'statement'<>'Reviewed later' or (select count(*) from public.minds_work_claims)<>before_n+1 then raise exception 'TEST old retry overwrote later review';end if;
 req:=gen_random_uuid();
 s:=public.minds_apply_personal_skill('{"agent":"sofia","slug":"test-skill","name":"Test","instructions":"Use evidence"}',req,true);
 s:=public.minds_apply_personal_skill('{"agent":"sofia","slug":"test-skill","name":"Test","instructions":"Use evidence"}',req,true);
 if (s->>'version')::int<>1 then raise exception 'TEST skill idempotency';end if;
 s:=public.minds_apply_personal_skill('{"agent":"sofia","slug":"test-skill","name":"Test","instructions":"Use cited evidence"}',gen_random_uuid(),true);
 if (s->>'version')::int<>2 or (select count(*) from public.minds_user_skill_versions where skill_id=(s->>'id')::uuid)<>2 then raise exception 'TEST skill versions';end if;
 insert into public.conversations(app_scope,origin_kind,origin_anchor,title,mode) values('isabella','global','{}','TEST','memory') returning id into conv;
 insert into public.conversation_messages(conversation_id,role,content,created_at,client_key) select conv,'user','Message '||i,'2026-01-01T00:00:00Z'::timestamptz,'test-message-'||i from generate_series(1,100) i;
 select array_agg(id order by created_at,id) into ids from public.conversation_messages where conversation_id=conv;
 begin
  perform public.minds_save_memory_checkpoint('isabella',conv,ids[2:100],'Incomplete','[]');raise exception 'TEST skipped oldest checkpoint message';
 exception when others then if SQLERRM='TEST skipped oldest checkpoint message' then raise;end if;end;
 c:=public.minds_save_memory_checkpoint('isabella',conv,ids,'All messages covered','["Open X"]');
 perform public.minds_save_memory_checkpoint('isabella',conv,ids,'Retry','[]');
 if (select count(*) from public.minds_memory_flushes where conversation_id=conv)<>1 or (select count(*) from public.isabella_memories where metadata->>'flush_id'=c->>'id')<>1 then raise exception 'TEST checkpoint atomicity/idempotency';end if;
 before_n:=(select count(*) from public.minds_commitments);
 begin
  perform public.minds_create_commitment(jsonb_build_object('title','Unreviewed','objective','Should fail'),gen_random_uuid(),false);
  raise exception 'TEST expected commitment confirmation rejection';
 exception when others then if SQLERRM='TEST expected commitment confirmation rejection' then raise;end if;end;
 begin
  perform public.minds_create_commitment(jsonb_build_object('title','Bad loop','objective','Should fail','source_flush_id',c->>'id','source_open_loop','Missing loop'),gen_random_uuid(),true);
  raise exception 'TEST expected open loop provenance rejection';
 exception when others then if SQLERRM='TEST expected open loop provenance rejection' then raise;end if;end;
 if (select count(*) from public.minds_commitments)<>before_n then raise exception 'TEST orphaned commitment after rejected provenance';end if;
 req:=gen_random_uuid();
 s:=public.minds_create_commitment(jsonb_build_object('title','Continuity','objective','Keep X alive','scope','project','project_id',project,'source_flush_id',c->>'id','source_open_loop','Open X'),req,true);
 perform set_config('minds.test_commitment',s->>'id',true);
 c:=public.minds_create_commitment(jsonb_build_object('title','Retry changed','objective','Must not overwrite'),req,true);
 if c->>'objective'<>'Keep X alive' or (select count(*) from public.minds_commitments)<>before_n+1 then raise exception 'TEST commitment idempotency';end if;
 if (select count(*) from public.minds_commitment_events where commitment_id=(s->>'id')::uuid)<>2 then raise exception 'TEST commitment provenance history';end if;
 s:=public.minds_ensure_commitment_workspace(current_setting('minds.test_commitment')::uuid);
 if s->>'status'<>'ok' then raise exception 'TEST commitment workspace create';end if;
 perform set_config('minds.test_workspace',s->'workspace'->>'id',true);
 c:=public.minds_append_commitment_workspace_item((s->'workspace'->>'id')::uuid,'decision','Use option A','agent','conversation',null,'{}');
 if c->'item'->>'status'<>'proposed' then raise exception 'TEST workspace decision auto-confirmed';end if;
 c:=public.minds_append_commitment_workspace_item((s->'workspace'->>'id')::uuid,'finding','Project source says X','external','work','source-1','{}');
 if c->'item'->>'provenance_class'<>'project_source' then raise exception 'TEST workspace provenance mapping';end if;
 c:=public.minds_update_commitment_workspace_summary((s->'workspace'->>'id')::uuid,'Working summary');
 if c->'workspace'->>'summary'<>'Working summary' then raise exception 'TEST workspace summary';end if;
 begin
  insert into public.minds_commitment_workspace_items(workspace_id,kind,content) values((s->'workspace'->>'id')::uuid,'note','Direct write');
  raise exception 'TEST expected direct workspace write rejection';
 exception when others then if SQLERRM='TEST expected direct workspace write rejection' then raise;end if;end;
 s:=public.minds_create_commitment(jsonb_build_object('title','Waiting continuity','objective','Keep Bernried coordination alive','scope','project','project_id',project,'status','waiting'),gen_random_uuid(),true);
 perform set_config('minds.test_waiting_commitment',s->>'id',true);
 s:=public.minds_create_commitment(jsonb_build_object('title','Paused continuity','objective','Keep Bernried coordination paused','scope','project','project_id',project,'status','paused'),gen_random_uuid(),true);
 perform set_config('minds.test_paused_commitment',s->>'id',true);
 if not public.minds_lock_conversation(conv,req) then raise exception 'TEST lease acquire';end if;
 if public.minds_lock_conversation(conv,gen_random_uuid()) then raise exception 'TEST overlapping lease';end if;
 perform public.minds_unlock_conversation(conv,req);
 insert into public.minds_standing_intents(trigger_text,reminder_text,trigger_terms,cooldown_minutes,max_triggers) values('test','test','{test}',0,2) returning id into intent;
 if public.minds_ack_standing_intents(array[intent],'delivery-1')<>1 then raise exception 'TEST first intent delivery';end if;
 if public.minds_ack_standing_intents(array[intent],'delivery-1')<>0 then raise exception 'TEST duplicate intent delivery';end if;
 perform public.minds_ack_standing_intents(array[intent],'delivery-2');
 if (select status from public.minds_standing_intents where id=intent)<>'completed' then raise exception 'TEST intent max';end if;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
do $$
begin
 if exists(select 1 from public.minds_work_claims where id=current_setting('minds.test_claim')::uuid) then raise exception 'TEST cross-user read';end if;
 if exists(select 1 from public.minds_commitments where id=current_setting('minds.test_commitment')::uuid) then raise exception 'TEST cross-user commitment read';end if;
 if exists(select 1 from public.minds_commitment_workspaces where id=current_setting('minds.test_workspace')::uuid) then raise exception 'TEST cross-user workspace read';end if;
 if (public.minds_ensure_commitment_workspace(current_setting('minds.test_commitment')::uuid)->>'status')<>'missing' then raise exception 'TEST cross-user workspace open';end if;
 if has_function_privilege('anon','public.minds_ensure_commitment_workspace(uuid)','EXECUTE') then raise exception 'TEST anonymous workspace open';end if;
 if not has_function_privilege('authenticated','public.minds_ensure_commitment_workspace(uuid)','EXECUTE') then raise exception 'TEST authenticated workspace open missing';end if;
 if not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='open_commitment_workspace' and mode='allow' and enabled) then raise exception 'TEST workspace open policy';end if;
 if not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='write_commitment_workspace' and mode='allow' and enabled) then raise exception 'TEST workspace write policy';end if;
 begin
  perform public.minds_create_commitment(jsonb_build_object('title','Other user','objective','No','scope','project','project_id',current_setting('minds.test_project')),gen_random_uuid(),true);raise exception 'TEST cross-user commitment project write';
 exception when others then if SQLERRM='TEST cross-user commitment project write' then raise;end if;end;
 if has_function_privilege('anon','public.minds_create_commitment(jsonb,uuid,boolean)','EXECUTE') then raise exception 'TEST anonymous commitment RPC';end if;
 if has_function_privilege('authenticated','public.minds_publish_continuity_signal(uuid,jsonb)','EXECUTE') then raise exception 'TEST continuity publisher exposed';end if;
 if not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='delegate_specialist' and mode='allow' and enabled) then raise exception 'TEST specialist delegation policy';end if;
 if not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='orchestrate_specialists' and mode='allow' and enabled) then raise exception 'TEST specialist orchestration policy';end if;
 if has_function_privilege('authenticated','public.minds_record_shadow_decision(uuid,uuid,text,jsonb,jsonb)','EXECUTE') then raise exception 'TEST shadow recorder exposed';end if;
 if has_function_privilege('anon','public.minds_resolve_shadow_decision(uuid,text,jsonb)','EXECUTE') then raise exception 'TEST anonymous shadow resolve';end if;
 begin
  update public.minds_shadow_decisions set status='accepted' where false;
  raise exception 'TEST expected direct shadow update rejection';
 exception when others then if SQLERRM='TEST expected direct shadow update rejection' then raise;end if;end;
 begin
  insert into public.minds_commitments(title,objective,request_id) values('Direct insert','Must be blocked',gen_random_uuid());
  raise exception 'TEST expected direct commitment insert rejection';
 exception when others then if SQLERRM='TEST expected direct commitment insert rejection' then raise;end if;end;
 begin
  perform public.minds_save_work_claim(jsonb_build_object('project_id',current_setting('minds.test_project'),'statement','Other user'),'[]',gen_random_uuid(),true);raise exception 'TEST cross-user project write';
 exception when others then if SQLERRM='TEST cross-user project write' then raise;end if;end;
 if has_function_privilege('anon','public.minds_save_memory_checkpoint(text,uuid,uuid[],text,jsonb)','EXECUTE') then raise exception 'TEST anonymous checkpoint';end if;
 if has_function_privilege('authenticated','public.minds_deliver_routine(uuid)','EXECUTE') then raise exception 'TEST privileged delivery exposed';end if;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare x jsonb;e uuid;r uuid;d uuid;c integer;u uuid:='f0000000-0000-4000-8000-000000000001';other_u uuid:='f0000000-0000-4000-8000-000000000002';shadow_req uuid:=gen_random_uuid();shadow_reject uuid:=gen_random_uuid();
begin
 x:=public.minds_record_shadow_decision(u,shadow_req,'update_task',jsonb_build_object('kind','task','action','update','title','Move task'),jsonb_build_object('project','TEST PROJECT'));
 perform public.minds_record_shadow_decision(u,shadow_req,'update_task',jsonb_build_object('kind','task','action','update','title','Retry must not duplicate'),'{}');
 if (select count(*) from public.minds_shadow_decisions where user_id=u and request_id=shadow_req)<>1 then raise exception 'TEST shadow idempotency';end if;
 perform public.minds_record_shadow_decision(u,shadow_reject,'create_event',jsonb_build_object('kind','event','action','create','title','Shadow event'),'{}');
 perform set_config('request.jwt.claim.sub',other_u::text,true);
 x:=public.minds_resolve_shadow_decision(shadow_req,'accepted',jsonb_build_object('kind','task'));
 if x->>'status'<>'missing' or (select status from public.minds_shadow_decisions where user_id=u and request_id=shadow_req)<>'pending' then raise exception 'TEST cross-user shadow resolve';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 x:=public.minds_resolve_shadow_decision(shadow_req,'accepted',jsonb_build_object('kind','task','_review',jsonb_build_object('changed_fields',jsonb_build_array('date'))));
 if x->>'status'<>'edited' then raise exception 'TEST shadow edited outcome';end if;
 x:=public.minds_resolve_shadow_decision(shadow_reject,'rejected',jsonb_build_object('kind','event'));
 if x->>'status'<>'rejected' then raise exception 'TEST shadow rejected outcome';end if;
 x:=public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":false}');e:=(x->>'id')::uuid;
 if (x->>'surfaced')::boolean then raise exception 'TEST first failure surfaced';end if;
 x:=public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":true}');
 if not (x->>'surfaced')::boolean then raise exception 'TEST failure escalation lost';end if;
 perform public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":true}');
 select count(*) into c from public.minds_surface_items where metadata->>'heartbeat_event_id'=e::text;
 if c<>1 then raise exception 'TEST duplicate heartbeat';end if;
 update public.minds_surface_items set lifecycle_state='dismissed',status='dismissed' where metadata->>'heartbeat_event_id'=e::text;
 if (select status from public.minds_heartbeat_events where id=e)<>'dismissed' then raise exception 'TEST feedback lifecycle';end if;
 x:=public.minds_publish_heartbeat(u,jsonb_build_object('fingerprint','test-continuity-project','event_type','upcoming_event','title','Bernried coordination changed','body','New coordination input','project_id',current_setting('minds.test_project'),'surface',false));
 if (select status from public.minds_commitments where id=current_setting('minds.test_waiting_commitment')::uuid)<>'active' then raise exception 'TEST continuity waiting reactivation';end if;
 if (select status from public.minds_commitments where id=current_setting('minds.test_paused_commitment')::uuid)<>'paused' then raise exception 'TEST continuity paused was reactivated';end if;
 if (select count(*) from public.minds_continuity_signals where user_id=u and fingerprint='heartbeat:test-continuity-project')<>1 then raise exception 'TEST continuity signal publication';end if;
 if (select count(*) from public.minds_commitment_events where commitment_id=current_setting('minds.test_waiting_commitment')::uuid and event_type='reactivated')<>1 then raise exception 'TEST continuity reactivation history';end if;
 perform public.minds_publish_heartbeat(u,jsonb_build_object('fingerprint','test-continuity-project','event_type','upcoming_event','title','Bernried coordination changed','body','New coordination input','project_id',current_setting('minds.test_project'),'surface',false));
 if (select count(*) from public.minds_commitment_events where commitment_id=current_setting('minds.test_waiting_commitment')::uuid and event_type='reactivated')<>1 then raise exception 'TEST continuity duplicate reactivation';end if;
 insert into public.isabella_routines(user_id,title,instruction,schedule) values(u,'TEST','TEST','{"kind":"once","date":"2099-01-01","time":"07:45"}') returning id into r;
 insert into public.minds_routine_deliveries(user_id,routine_id,scheduled_at,status,output,model) values(u,r,now(),'generated','TEST OUTPUT','test') returning id into d;
 x:=public.minds_deliver_routine(d);perform public.minds_deliver_routine(d);
 if (select count(*) from public.conversation_messages where metadata->>'delivery_id'=d::text)<>1 then raise exception 'TEST duplicate routine';end if;
 if (select enabled from public.isabella_routines where id=r) then raise exception 'TEST once routine remains enabled';end if;
end $$;
select 'PASS: RLS, review, evidence rollback, versions, cursor continuity, commitments, mission workspaces, continuity engine, shadow agency, specialist orchestration, idempotency, leases, heartbeat escalation, routine delivery' as result;
rollback;
