alter table public.minds_self_review_settings add column code_preparation_enabled boolean not null default false,
 add column code_repository text;
create table public.minds_window_code_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 proposal_id uuid not null unique references public.minds_self_review_proposals(id),
 status text not null default 'preparing' check(status in ('preparing','review_ready','no_change','failed','blocked')),
 base_sha text not null check(base_sha ~ '^[0-9a-f]{40}$'),
 github_run_id text not null,
 lease_token uuid not null default gen_random_uuid(),
 lease_until timestamptz not null default now()+interval '40 minutes',
 model_calls integer not null default 0,
 branch text,
 commit_sha text,
 pr_url text,
 result jsonb not null default '{}',
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index window_code_jobs_owner on public.minds_window_code_jobs(user_id,created_at desc);
alter table public.minds_window_code_jobs enable row level security;
revoke all on public.minds_window_code_jobs from public,anon,authenticated;
grant select(id,user_id,proposal_id,status,base_sha,github_run_id,branch,commit_sha,pr_url,result,created_at,completed_at) on public.minds_window_code_jobs to authenticated;
grant all on public.minds_window_code_jobs to service_role;
create policy window_code_jobs_read on public.minds_window_code_jobs for select to authenticated using(user_id=(select auth.uid()));
create function public.minds_claim_window_code_v1(p_sha text,p_run text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.minds_self_review_settings; p public.minds_self_review_proposals; j public.minds_window_code_jobs;
begin
 if p_sha !~ '^[0-9a-f]{40}$' or p_run !~ '^[0-9]+$' then raise exception 'invalid_run';end if;
 update public.minds_window_code_jobs set status='failed',completed_at=now(),result='{"reason":"worker_lease_expired"}' where status='preparing' and lease_until<now();
 for s in select * from public.minds_self_review_settings where enabled and code_preparation_enabled and code_repository='gari01234/minds' for update skip locked loop
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

create function public.minds_set_window_code_v1(p_enabled boolean) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or p_enabled is null then raise exception 'auth_required';end if;
 update public.minds_self_review_settings set code_preparation_enabled=p_enabled where user_id=auth.uid() and code_repository='gari01234/minds';
 if not found then raise exception 'window_not_configured';end if;
 return p_enabled;
end $$;
revoke all on function public.minds_set_window_code_v1(boolean) from public,anon;
grant execute on function public.minds_set_window_code_v1(boolean) to authenticated;
