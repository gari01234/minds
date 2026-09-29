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
 c:=public.minds_save_memory_checkpoint('isabella',conv,ids,'All messages covered','[]');
 perform public.minds_save_memory_checkpoint('isabella',conv,ids,'Retry','[]');
 if (select count(*) from public.minds_memory_flushes where conversation_id=conv)<>1 or (select count(*) from public.isabella_memories where metadata->>'flush_id'=c->>'id')<>1 then raise exception 'TEST checkpoint atomicity/idempotency';end if;
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
declare x jsonb;e uuid;r uuid;d uuid;c integer;u uuid:='f0000000-0000-4000-8000-000000000001';
begin
 x:=public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":false}');e:=(x->>'id')::uuid;
 if (x->>'surfaced')::boolean then raise exception 'TEST first failure surfaced';end if;
 x:=public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":true}');
 if not (x->>'surfaced')::boolean then raise exception 'TEST failure escalation lost';end if;
 perform public.minds_publish_heartbeat(u,'{"fingerprint":"test-failure","event_type":"routine_failure","title":"TEST","surface":true}');
 select count(*) into c from public.minds_surface_items where metadata->>'heartbeat_event_id'=e::text;
 if c<>1 then raise exception 'TEST duplicate heartbeat';end if;
 update public.minds_surface_items set lifecycle_state='dismissed',status='dismissed' where metadata->>'heartbeat_event_id'=e::text;
 if (select status from public.minds_heartbeat_events where id=e)<>'dismissed' then raise exception 'TEST feedback lifecycle';end if;
 insert into public.isabella_routines(user_id,title,instruction,schedule) values(u,'TEST','TEST','{"kind":"once","date":"2099-01-01","time":"07:45"}') returning id into r;
 insert into public.minds_routine_deliveries(user_id,routine_id,scheduled_at,status,output,model) values(u,r,now(),'generated','TEST OUTPUT','test') returning id into d;
 x:=public.minds_deliver_routine(d);perform public.minds_deliver_routine(d);
 if (select count(*) from public.conversation_messages where metadata->>'delivery_id'=d::text)<>1 then raise exception 'TEST duplicate routine';end if;
 if (select enabled from public.isabella_routines where id=r) then raise exception 'TEST once routine remains enabled';end if;
end $$;
select 'PASS: RLS, review, evidence rollback, versions, cursor continuity, idempotency, leases, heartbeat escalation, routine delivery' as result;
rollback;
