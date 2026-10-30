begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.minds_enable_window_review_v1();
select public.minds_enable_window_review_v1();
reset role;
do $$
declare j jsonb; f jsonb; p uuid; result jsonb; n int;
begin
 select count(*) into n from public.isabella_projects where name='Window';
 if n<>1 then raise exception 'duplicate Window';end if;
 j:=public.minds_claim_self_review_v1();
 if j->>'review_key'<>'baseline' then raise exception 'missing baseline';end if;
 if public.minds_claim_self_review_v1() is not null then raise exception 'duplicate lease';end if;
 f:='{"summary":"Synthetic review","what_worked":"Recorded result","limitations":"Fixture","findings":[{"problem_key":"scope_evidence","title":"Verify query coverage","evidence_refs":["run:1"],"existing_proposal_id":null}]}';
 begin
  perform public.minds_finish_self_review_v1((j->>'id')::uuid,(j->>'lease_token')::uuid,f,'[]','{}');
  raise exception 'accepted invented evidence';
 exception when raise_exception then if SQLERRM<>'unknown_review_evidence' then raise;end if;
 end;
 result:=public.minds_finish_self_review_v1((j->>'id')::uuid,(j->>'lease_token')::uuid,f,'[{"ref":"run:1"}]','{}');
 p:=(result->'proposal_ids'->>0)::uuid;
 perform public.minds_review_improvement_v1(p,'rejected','Do not reopen');
 begin
  perform public.minds_review_improvement_v1(p,'verified','');raise exception 'accepted fake verification';
 exception when raise_exception then if SQLERRM<>'invalid_owner_review' then raise;end if;
 end;
 -- Catch up a missed day, preserving a rejected proposal on recurrence.
 update public.minds_self_review_settings set created_at=now()-interval '3 days',local_hour=0;
 j:=public.minds_claim_self_review_v1();
 if j is null or j->>'review_key'='baseline' then raise exception 'daily catchup missing';end if;
 perform public.minds_finish_self_review_v1((j->>'id')::uuid,(j->>'lease_token')::uuid,f,'[{"ref":"run:1"}]','{}');
 if (select count(*) from public.minds_self_review_proposals)<>1 then raise exception 'duplicate issue';end if;
 if (select status from public.minds_self_review_proposals where id=p)<>'rejected' then raise exception 'overwrote owner decision';end if;
 -- Expired lease is retried, old worker cannot finish the replacement lease.
 j:=public.minds_claim_self_review_v1();
 update public.minds_self_review_reports set lease_until=now()-interval '1 minute' where id=(j->>'id')::uuid;
 perform public.minds_claim_self_review_v1();
 begin
  perform public.minds_finish_self_review_v1((j->>'id')::uuid,(j->>'lease_token')::uuid,f,'[{"ref":"run:1"}]','{}');raise exception 'accepted stale worker';
 exception when raise_exception then if SQLERRM<>'invalid_review_lease' then raise;end if;
 end;
 -- Berlin day boundaries preserve DST: 25-hour fall day and 23-hour spring day.
 if extract(epoch from (('2026-10-26'::timestamp at time zone 'Europe/Berlin')-('2026-10-25'::timestamp at time zone 'Europe/Berlin')))/3600<>25 then raise exception 'fall DST';end if;
 if extract(epoch from (('2026-03-30'::timestamp at time zone 'Europe/Berlin')-('2026-03-29'::timestamp at time zone 'Europe/Berlin')))/3600<>23 then raise exception 'spring DST';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.minds_self_review_reports) or exists(select 1 from public.minds_self_review_proposals) or exists(select 1 from public.minds_self_review_settings) then raise exception 'cross owner leak';end if;
 if has_function_privilege(current_user,'public.minds_claim_self_review_v1()','execute') then raise exception 'owner can run privileged worker';end if;
 begin
  insert into public.minds_self_review_settings(user_id,project_id) values(auth.uid(),gen_random_uuid());
  raise exception 'direct write allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
