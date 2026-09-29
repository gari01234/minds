-- Preserve request receipts across later edits of a claim.
create table public.minds_review_receipts(user_id uuid not null default auth.uid(),request_id uuid not null,kind text not null,target_id uuid not null,created_at timestamptz not null default now(),primary key(user_id,request_id));
alter table public.minds_review_receipts enable row level security;
create policy minds_review_receipts_own on public.minds_review_receipts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert on public.minds_review_receipts to authenticated;
grant all on public.minds_review_receipts to service_role;
create or replace function public.minds_save_work_claim(p_claim jsonb,p_evidence jsonb,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); project uuid; old_id uuid; c public.minds_work_claims; e jsonb; source_file uuid; source_message uuid; provenance text; state text;
begin
  if u is null or p_confirmed is not true then raise exception 'Explicit review required'; end if;
  if p_request_id is null or length(trim(coalesce(p_claim->>'statement','')))=0 then raise exception 'Invalid claim'; end if;
  project:=(p_claim->>'project_id')::uuid;
  if not exists(select 1 from public.isabella_projects where id=project and user_id=u) then raise exception 'Project not accessible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,0));
  select c0.* into c from public.minds_work_claims c0 join public.minds_review_receipts r on r.target_id=c0.id and r.kind='work_claim' where r.user_id=u and r.request_id=p_request_id and c0.user_id=u;
  if found then return to_jsonb(c); end if;
  select * into c from public.minds_work_claims where user_id=u and metadata->>'request_id'=p_request_id::text;
  if found then return to_jsonb(c); end if;
  state:=coalesce(p_claim->>'status','proposed');
  if state not in ('proposed','confirmed','disputed','resolved','rejected') then raise exception 'Invalid reviewed status'; end if;
  provenance:=coalesce(p_claim->>'provenance_class','inferred');
  if provenance='system' then raise exception 'System provenance cannot be assigned by a proposal'; end if;
  if jsonb_typeof(p_evidence) is distinct from 'array' then raise exception 'Evidence must be an array'; end if;
  if exists(select 1 from jsonb_array_elements(p_evidence) x where nullif(x->>'source_file_id','') is not null) and provenance='user' then provenance:='project_source'; end if;
  old_id:=nullif(p_claim->>'id','')::uuid;
  if old_id is not null then
    select * into c from public.minds_work_claims where id=old_id and user_id=u and project_id=project for update;
    if not found then raise exception 'Claim not accessible'; end if;
    -- A reviewed change retains the previous statement and provenance for traceability.
    update public.minds_work_claims set statement=p_claim->>'statement',claim_type=coalesce(p_claim->>'claim_type',c.claim_type),subject=nullif(p_claim->>'subject',''),topic=nullif(p_claim->>'topic',''),discipline=nullif(p_claim->>'discipline',''),status=state,provenance_class=provenance,confidence=least(1,greatest(0,coalesce((p_claim->>'confidence')::numeric,c.confidence))),
    confirmed_at=case when state='confirmed' then coalesce(c.confirmed_at,now()) else c.confirmed_at end,
    valid_from=nullif(p_claim->>'valid_from','')::timestamptz,valid_to=nullif(p_claim->>'valid_to','')::timestamptz,
    metadata=c.metadata||jsonb_build_object('request_id',p_request_id,'reviewed_at',now(),'previous_versions',coalesce(c.metadata->'previous_versions','[]'::jsonb)||jsonb_build_array(to_jsonb(c)-'metadata')),updated_at=now()
    where id=c.id returning * into c;
  else
    insert into public.minds_work_claims(user_id,project_id,claim_type,statement,subject,topic,discipline,status,confidence,provenance_class,confirmed_at,valid_from,valid_to,metadata)
    values(u,project,coalesce(p_claim->>'claim_type','fact'),p_claim->>'statement',nullif(p_claim->>'subject',''),nullif(p_claim->>'topic',''),nullif(p_claim->>'discipline',''),state,least(1,greatest(0,coalesce((p_claim->>'confidence')::numeric,0.7))),provenance,case when state='confirmed' then now() end,nullif(p_claim->>'valid_from','')::timestamptz,nullif(p_claim->>'valid_to','')::timestamptz,jsonb_build_object('request_id',p_request_id,'source','reviewed_proposal','reviewed_at',now())) returning * into c;
  end if;
  for e in select * from jsonb_array_elements(p_evidence) loop
    source_file:=nullif(e->>'source_file_id','')::uuid;source_message:=nullif(e->>'source_message_id','')::uuid;
    if source_file is not null and not exists(select 1 from public.minds_work_files where id=source_file and user_id=u and project_id=project) then raise exception 'Evidence file is not in this project'; end if;
    if source_message is not null and not exists(select 1 from public.conversation_messages where id=source_message and user_id=u) then raise exception 'Evidence message not accessible'; end if;
    insert into public.minds_work_evidence(user_id,project_id,claim_id,source_kind,source_file_id,source_message_id,locator,excerpt,stance,trust_level,metadata)
    values(u,project,c.id,case when source_file is not null then 'work_file' else coalesce(e->>'source_kind','manual') end,source_file,source_message,coalesce(e->'locator','{}'),nullif(e->>'excerpt',''),coalesce(e->>'stance','supports'),case when provenance='inferred' then 'derived' when provenance='external' then 'untrusted' else 'reported' end,jsonb_build_object('reviewed_at',now(),'source_provenance',provenance));
  end loop;
  old_id:=nullif(p_claim->>'supersedes_id','')::uuid;
  if old_id is not null then
    if state<>'confirmed' or old_id=c.id then raise exception 'Replacement requires a confirmed new claim'; end if;
    update public.minds_work_claims set status='superseded',superseded_by=c.id,valid_to=now(),updated_at=now() where id=old_id and project_id=project and user_id=u;
    if not found then raise exception 'Prior claim not accessible'; end if;
    update public.minds_work_claims set supersedes_id=old_id where id=c.id returning * into c;
  end if;
  insert into public.minds_review_receipts(user_id,request_id,kind,target_id) values(u,p_request_id,'work_claim',c.id);
  return to_jsonb(c);
end $$;
