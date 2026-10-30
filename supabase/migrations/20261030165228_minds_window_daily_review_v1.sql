-- Daily self-review is a Work-owned observation/proposal workflow, not authority
-- to rewrite behavior, deploy code or grant permissions.
create table public.minds_self_review_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 project_id uuid not null references public.isabella_projects(id) on delete cascade,
 enabled boolean not null default true,
 timezone text not null default 'Europe/Berlin',
 local_hour integer not null default 4 check(local_hour between 0 and 23),
 baseline_completed boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.minds_self_review_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.isabella_projects(id) on delete cascade,
 review_key text not null,
 window_start timestamptz not null,
 window_end timestamptz not null,
 status text not null default 'pending' check(status in ('pending','running','completed','failed')),
 attempts integer not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 report jsonb not null default '{}',
 evidence jsonb not null default '[]',
 coverage jsonb not null default '{}',
 error text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(user_id,review_key),check(window_end>window_start)
);
create table public.minds_self_review_proposals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.isabella_projects(id) on delete cascade,
 report_id uuid not null references public.minds_self_review_reports(id),
 problem_key text not null,
 title text not null,
 details jsonb not null,
 status text not null default 'proposed' check(status in ('proposed','accepted','rejected','testing','implemented','verified')),
 owner_note text not null default '',
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(user_id,project_id,problem_key)
);
create index self_review_settings_project on public.minds_self_review_settings(project_id);
create index self_review_reports_project on public.minds_self_review_reports(project_id,created_at desc);
create index self_review_proposals_project on public.minds_self_review_proposals(project_id,created_at desc);
create index self_review_proposals_report on public.minds_self_review_proposals(report_id);
alter table public.minds_self_review_settings enable row level security;
alter table public.minds_self_review_reports enable row level security;
alter table public.minds_self_review_proposals enable row level security;
revoke all on public.minds_self_review_settings,public.minds_self_review_reports,public.minds_self_review_proposals from public,anon,authenticated;
grant select on public.minds_self_review_settings,public.minds_self_review_reports,public.minds_self_review_proposals to authenticated;
grant all on public.minds_self_review_settings,public.minds_self_review_reports,public.minds_self_review_proposals to service_role;
create policy self_review_settings_read on public.minds_self_review_settings for select to authenticated using(user_id=(select auth.uid()));
create policy self_review_reports_read on public.minds_self_review_reports for select to authenticated using(user_id=(select auth.uid()));
create policy self_review_proposals_read on public.minds_self_review_proposals for select to authenticated using(user_id=(select auth.uid()));

-- Config creation is owner authenticated. No hard-coded user or generated IDs.
create function public.minds_enable_window_review_v1() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); p uuid;
begin
 if u is null then raise exception 'auth_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':window_review',42));
 select project_id into p from public.minds_self_review_settings where user_id=u;
 if p is null then
  select id into p from public.isabella_projects where user_id=u and lower(name)='window' and not archived order by created_at limit 1;
  if p is null then
   insert into public.isabella_projects(user_id,client_key,name,archived) values(u,'window','Window',false) returning id into p;
  end if;
  insert into public.minds_self_review_settings(user_id,project_id) values(u,p);
 else
  update public.minds_self_review_settings set enabled=true where user_id=u;
 end if;
 return jsonb_build_object('project_id',p,'enabled',true,'timezone','Europe/Berlin','local_hour',4);
end $$;
revoke all on function public.minds_enable_window_review_v1() from public,anon;
grant execute on function public.minds_enable_window_review_v1() to authenticated;

create function public.minds_claim_self_review_v1() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.minds_self_review_settings; r public.minds_self_review_reports; k text; start_at timestamptz; end_at timestamptz; local_day date; review_day date;
begin
 for s in select * from public.minds_self_review_settings where enabled order by created_at for update skip locked loop
  if not exists(select 1 from public.isabella_projects where id=s.project_id and user_id=s.user_id and not archived) then continue; end if;
  local_day:=(now() at time zone s.timezone)::date;
  if not s.baseline_completed and coalesce((select attempts from public.minds_self_review_reports where user_id=s.user_id and review_key='baseline'),0)<3 then
   k:='baseline';start_at:=s.created_at-interval '7 days';end_at:=s.created_at;
  elsif extract(hour from now() at time zone s.timezone)>=s.local_hour then
   -- Recover missed dates after outages; exhausted failures remain visible and
   -- do not prevent subsequent daily reports. One bounded job per invocation.
   select d::date into review_day from generate_series((s.created_at at time zone s.timezone)::date::timestamp,(local_day-1)::timestamp,interval '1 day') d
   where not exists(select 1 from public.minds_self_review_reports x where x.user_id=s.user_id and x.review_key=d::date::text and (x.status='completed' or x.attempts>=3))
   order by d limit 1;
   if review_day is null then continue; end if;
   k:=review_day::text;start_at:=review_day::timestamp at time zone s.timezone;end_at:=(review_day+1)::timestamp at time zone s.timezone;
  else continue;
  end if;
  insert into public.minds_self_review_reports(user_id,project_id,review_key,window_start,window_end)
   values(s.user_id,s.project_id,k,start_at,end_at) on conflict(user_id,review_key) do nothing;
  select * into r from public.minds_self_review_reports where user_id=s.user_id and review_key=k for update;
  if r.status='completed' or r.attempts>=3 or (r.status='running' and r.lease_until>now()) then continue; end if;
  update public.minds_self_review_reports set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes',error=null where id=r.id returning * into r;
  return to_jsonb(r);
 end loop;
 return null;
end $$;
revoke all on function public.minds_claim_self_review_v1() from public,anon,authenticated;
grant execute on function public.minds_claim_self_review_v1() to service_role;

create function public.minds_finish_self_review_v1(p_id uuid,p_token uuid,p_report jsonb,p_evidence jsonb,p_coverage jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.minds_self_review_reports; f jsonb; ref text; pid uuid; ids jsonb:='[]';
begin
 select * into r from public.minds_self_review_reports where id=p_id for update;
 if not found or r.lease_token is distinct from p_token or r.status<>'running' or r.lease_until<now() then raise exception 'invalid_review_lease'; end if;
 if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_evidence) is distinct from 'array' or jsonb_typeof(p_report->'findings') is distinct from 'array' then raise exception 'invalid_review'; end if;
 if jsonb_array_length(p_report->'findings')>3 then raise exception 'too_many_proposals'; end if;
 for f in select * from jsonb_array_elements(p_report->'findings') loop
  if coalesce(length(btrim(f->>'problem_key')),0) not between 1 and 160 or coalesce(length(btrim(f->>'title')),0) not between 1 and 240
   or jsonb_typeof(f->'evidence_refs') is distinct from 'array' then raise exception 'invalid_finding'; end if;
  if jsonb_array_length(f->'evidence_refs')=0 then raise exception 'finding_requires_evidence'; end if;
  for ref in select jsonb_array_elements_text(f->'evidence_refs') loop
   if not exists(select 1 from jsonb_array_elements(p_evidence) e where e->>'ref'=ref) then raise exception 'unknown_review_evidence'; end if;
  end loop;
  -- The model may link an existing issue, but cannot change its owner decision.
  pid:=null;
  if nullif(f->>'existing_proposal_id','') is not null then
   select id into pid from public.minds_self_review_proposals where id=(f->>'existing_proposal_id')::uuid and user_id=r.user_id and project_id=r.project_id;
   if pid is null then raise exception 'unknown_existing_proposal'; end if;
   update public.minds_self_review_proposals set last_seen_at=now() where id=pid;
  else
   insert into public.minds_self_review_proposals(user_id,project_id,report_id,problem_key,title,details)
    values(r.user_id,r.project_id,r.id,lower(btrim(f->>'problem_key')),f->>'title',f)
    on conflict(user_id,project_id,problem_key) do update set last_seen_at=now() returning id into pid;
  end if;
  ids:=ids||jsonb_build_array(pid);
 end loop;
 update public.minds_self_review_reports set report=p_report||jsonb_build_object('proposal_ids',ids),evidence=p_evidence,coverage=p_coverage,status='completed',completed_at=now(),lease_until=null where id=r.id;
 if r.review_key='baseline' then update public.minds_self_review_settings set baseline_completed=true where user_id=r.user_id; end if;
 return jsonb_build_object('status','completed','report_id',r.id,'proposal_ids',ids);
end $$;
revoke all on function public.minds_finish_self_review_v1(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.minds_finish_self_review_v1(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

create function public.minds_review_improvement_v1(p_id uuid,p_status text,p_note text default '') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.minds_self_review_proposals;
begin
 if auth.uid() is null or p_status not in ('proposed','accepted','rejected') then raise exception 'invalid_owner_review'; end if;
 update public.minds_self_review_proposals set status=p_status,owner_note=left(coalesce(p_note,''),4000),reviewed_at=now()
 where id=p_id and user_id=auth.uid() and status in ('proposed','accepted','rejected') returning * into r;
 if not found then raise exception 'proposal_not_reviewable'; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.minds_review_improvement_v1(uuid,text,text) from public,anon;
grant execute on function public.minds_review_improvement_v1(uuid,text,text) to authenticated;

insert into public.isabella_runtime_secrets(key,value) values('self_review_runner',md5(gen_random_uuid()::text||clock_timestamp()::text)) on conflict(key) do nothing;
select cron.schedule('minds-self-review','15 * * * *',
$$select net.http_post(
 url:='https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-self-review',
 headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('secret',(select value from public.isabella_runtime_secrets where key='self_review_runner')),
 timeout_milliseconds:=115000
)$$);
