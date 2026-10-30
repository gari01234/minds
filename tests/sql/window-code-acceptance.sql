begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.minds_enable_window_review_v1();
select public.minds_set_window_code_v1(true);
do $$
declare p uuid; project uuid; r uuid; j jsonb;
begin
 select project_id into project from public.minds_self_review_settings where user_id=auth.uid();
 insert into public.minds_self_review_reports(user_id,project_id,review_key,window_start,window_end) values(auth.uid(),project,'synthetic',now()-interval '1 day',now()) returning id into r;
 insert into public.minds_self_review_proposals(user_id,project_id,report_id,problem_key,title,details,status) values(auth.uid(),project,r,'test-code','Synthetic','{"change_type":"code","change":"Synthetic test","acceptance_test":"Assert behavior"}','rejected') returning id into p;
 if public.minds_claim_window_code_v1(repeat('a',40),'123') is not null then raise exception 'claimed rejected proposal';end if;
 update public.minds_self_review_proposals set status='proposed' where id=p;
 j:=public.minds_claim_window_code_v1(repeat('a',40),'123');
 if j is null then raise exception 'missing job';end if;
 if public.minds_claim_window_code_v1(repeat('a',40),'124') is not null then raise exception 'duplicate job';end if;
 if (select status from public.minds_self_review_proposals where id=p)<>'proposed' then raise exception 'preparation altered owner decision';end if;
 update public.minds_window_code_jobs set lease_until=now()-interval '1 minute' where id=(j->>'id')::uuid;
 perform public.minds_claim_window_code_v1(repeat('a',40),'125');
 if (select status from public.minds_window_code_jobs where id=(j->>'id')::uuid)<>'failed' then raise exception 'expired job hidden';end if;
end $$;
set local role authenticated;
do $$begin
 if has_column_privilege(current_user,'public.minds_window_code_jobs','lease_token','SELECT') then raise exception 'lease token exposed';end if;
 if has_function_privilege(current_user,'public.minds_claim_window_code_v1(text,text)','EXECUTE') then raise exception 'owner can impersonate worker';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$begin
 if exists(select id from public.minds_window_code_jobs) then raise exception 'owner isolation failed';end if;
end $$;
reset role;
rollback;
