alter table public.minds_window_code_jobs add column attempts_on_base integer not null default 1 check(attempts_on_base between 1 and 3);
update public.minds_window_code_jobs set attempts_on_base=least(attempts,3);
grant select(attempts_on_base) on public.minds_window_code_jobs to authenticated;
create or replace function public.minds_retry_window_code_v1(p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'auth_required';end if;
 update public.minds_window_code_jobs j set retry_requested=true where j.id=p_id and j.user_id=auth.uid() and j.status='failed' and j.branch is null
 and exists(select 1 from public.minds_self_review_proposals p where p.id=j.proposal_id and p.user_id=auth.uid() and p.status in ('proposed','accepted'));
 if not found then raise exception 'retry_not_available';end if;
 return true;
end $$;
revoke all on function public.minds_retry_window_code_v1(uuid) from public,anon;
grant execute on function public.minds_retry_window_code_v1(uuid) to authenticated;
create or replace function public.minds_claim_window_code_v1(p_sha text,p_run text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.minds_self_review_settings; p public.minds_self_review_proposals; j public.minds_window_code_jobs;
begin
 if p_sha !~ '^[0-9a-f]{40}$' or p_run !~ '^[0-9]+$' then raise exception 'invalid_run';end if;
 update public.minds_window_code_jobs set status='failed',completed_at=now(),result='{"reason":"worker_lease_expired"}' where status='preparing' and lease_until<now();
 for s in select * from public.minds_self_review_settings where enabled and code_preparation_enabled and code_repository='gari01234/minds' for update skip locked loop
  select * into j from public.minds_window_code_jobs cj where cj.user_id=s.user_id and cj.retry_requested and cj.status='failed' and cj.branch is null
   and exists(select 1 from public.minds_self_review_proposals sp where sp.id=cj.proposal_id and sp.user_id=s.user_id and sp.status in ('proposed','accepted'))
   order by cj.created_at limit 1 for update;
  if found then
   -- A retry requires either unused budget on this exact revision or a changed base.
   if j.base_sha=p_sha and j.attempts_on_base>=3 then
    update public.minds_window_code_jobs set retry_requested=false,result=result||jsonb_build_object('retry_blocked','revision_attempt_limit','reason','Se agotaron tres intentos en esta revisión. Se requiere una nueva revisión del código antes de reintentar.') where id=j.id;
    continue;
   end if;
   update public.minds_window_code_jobs set history=history||jsonb_build_array(jsonb_build_object('attempt',attempts,'status',status,'base_sha',base_sha,'github_run_id',github_run_id,'result',result)),attempts=attempts+1,attempts_on_base=case when base_sha=p_sha then attempts_on_base+1 else 1 end,retry_requested=false,status='preparing',base_sha=p_sha,github_run_id=p_run,lease_token=gen_random_uuid(),lease_until=now()+interval '40 minutes',model_calls=0,result='{}',completed_at=null where id=j.id returning * into j;
   return to_jsonb(j);
  end if;
  if exists(select 1 from public.minds_window_code_jobs where user_id=s.user_id and created_at>=date_trunc('day',now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin') then continue;end if;
  select * into p from public.minds_self_review_proposals x where x.user_id=s.user_id and x.project_id=s.project_id and x.status in ('proposed','accepted')
   and x.details->>'change_type' in ('code','tools','context','reasoning','communication') and not exists(select 1 from public.minds_window_code_jobs prior_job where prior_job.proposal_id=x.id)
   order by case when x.details->>'change_type'='code' then 0 else 1 end,x.created_at limit 1;
  if not found then continue;end if;
  insert into public.minds_window_code_jobs(user_id,proposal_id,base_sha,github_run_id) values(s.user_id,p.id,p_sha,p_run) returning * into j;
  return to_jsonb(j)||jsonb_build_object('task',jsonb_build_object('change',p.details->>'change','acceptance_test',p.details->>'acceptance_test'));
 end loop;
 return null;
end $$;
revoke all on function public.minds_claim_window_code_v1(text,text) from public,anon,authenticated;
grant execute on function public.minds_claim_window_code_v1(text,text) to service_role;

