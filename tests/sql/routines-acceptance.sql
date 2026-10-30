-- Exercise exact RPC: idempotency, owner isolation, stale reviews, lifecycle,
-- validation, next-run scheduling, immutable receipts, no duplicate creation.
create function public.test_routine_propose(a text, patch jsonb, target uuid default null)
returns jsonb language plpgsql as $$
declare p jsonb; r public.isabella_routines; req uuid:=gen_random_uuid();
begin
 p:=jsonb_build_object('request_id',req,'kind','routine','action',a,'title','Brief','instruction','News and agenda','schedule_kind','daily','time','08:00','timezone','Europe/Berlin');
 if target is not null then
   select * into r from public.isabella_routines where id=target;
   p:=p||jsonb_build_object('target_id',target,'title',r.title,'instruction',r.instruction,'schedule_kind',r.schedule->>'kind','time',r.schedule->>'time','timezone',r.timezone,
    'before',jsonb_build_object('title',r.title,'instruction',r.instruction,'schedule',r.schedule,'timezone',r.timezone,'enabled',r.enabled));
 end if;
 p:=p||patch;
 insert into public.minds_shadow_decisions(user_id,request_id,action,proposal_kind,candidate) values(auth.uid(),req,a||'_routine','routine',p);
 return p;
end $$;
create function public.test_routine_error(p jsonb, expected text) returns void language plpgsql as $$
begin
 begin
  perform public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise;
 end;
 raise exception 'expected error: %',expected;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
declare p jsonb; q jsonb; res jsonb; target uuid; before_count integer; run_at timestamptz;
begin
 p:=public.test_routine_propose('create','{}');
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p); target:=(res->>'entity_id')::uuid;
 assert res->>'status'='applied';
 assert res->'after'->>'title'='Brief';
 assert (res->'after'->>'next_run_at')::timestamptz>now();
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->>'status'='already_applied';
 assert (select count(*) from public.isabella_routines)=1;
 perform public.test_routine_error(p||'{"time":"09:00"}','receipt_replay_candidate_mismatch');
 q:=public.test_routine_propose('create','{}');
 perform public.test_routine_error(q,'duplicate_routine');
 assert (select count(*) from public.isabella_routines)=1;
 p:=public.test_routine_propose('update','{"time":"07:45"}',target);
 -- A routine running between preparation and review is not a config conflict.
 update public.isabella_routines set last_run_at=now(),updated_at=now() where id=target;
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->'after'->'schedule'->>'time'='07:45';
 assert res->'after'->>'instruction'='News and agenda';
 assert (select count(*) from public.isabella_routines)=1;
 p:=public.test_routine_propose('update','{"time":"09:00"}',target);
 update public.isabella_routines set instruction='Changed elsewhere' where id=target;
 perform public.test_routine_error(p,'routine_changed');
 assert (select schedule->>'time' from public.isabella_routines where id=target)='07:45';
 p:=public.test_routine_propose('pause','{}',target);
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert not (res->'after'->>'enabled')::boolean;
 assert res->'after'->>'next_run_at' is null;
 p:=public.test_routine_propose('resume','{}',target);
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert (res->'after'->>'enabled')::boolean;
 assert (res->'after'->>'next_run_at')::timestamptz>now();
 p:=public.test_routine_propose('update','{"time":"25:00"}',target);
 perform public.test_routine_error(p,'invalid_routine_schedule');
 p:=public.test_routine_propose('update','{"timezone":"Fake/City"}',target);
 perform public.test_routine_error(p,'invalid_routine_timezone');
 p:=public.test_routine_propose('update','{"schedule_kind":"weekly","weekdays":[]}',target);
 perform public.test_routine_error(p,'invalid_routine_weekdays');
 p:=public.test_routine_propose('update','{"schedule_kind":"weekly","weekdays":[1,3,5]}',target);
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->'after'->'schedule'->'weekdays'='[1,3,5]'::jsonb;
 assert extract(dow from (res->'after'->>'next_run_at')::timestamptz at time zone 'Europe/Berlin')::integer in (1,3,5);
 p:=public.test_routine_propose('delete','{}',target);
 perform public.test_routine_error(p||'{"action":"pause"}','review_target_or_authority_changed');
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
 perform public.test_routine_error(p,'missing_or_ineligible_review');
 q:=public.test_routine_propose('delete','{}',target);
 perform public.test_routine_error(q,'routine_target_not_found');
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->>'status'='applied';
 assert not exists(select 1 from public.isabella_routines where id=target);
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->>'status'='already_applied';
 assert exists(select 1 from public.minds_routine_action_receipts where entity_id=target and action='delete' and before_state->>'title'='Brief');
 p:=public.test_routine_propose('create','{"title":"Tomorrow reminder","schedule_kind":"once","date":"2099-12-01"}');
 res:=public.minds_commit_reviewed_routine_v1((p->>'request_id')::uuid,p);
 assert res->'after'->'schedule'->>'date'='2099-12-01';
 p:=public.test_routine_propose('create','{"title":"Old reminder","schedule_kind":"once","date":"2000-01-01"}');
 perform public.test_routine_error(p,'routine_requires_future_run');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
 assert (select count(*) from public.minds_routine_action_receipts)=0;
 begin
  insert into public.minds_routine_action_receipts(user_id,request_id,action,entity_id,before_state,after_state,reviewed_candidate)
  values(auth.uid(),gen_random_uuid(),'create',gen_random_uuid(),'{}','{}','{}');
  raise exception 'receipt insertion should be forbidden';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.minds_commit_reviewed_routine_v1(uuid,jsonb)','execute');
 assert has_function_privilege('authenticated','public.minds_commit_reviewed_routine_v1(uuid,jsonb)','execute');
end $$;
