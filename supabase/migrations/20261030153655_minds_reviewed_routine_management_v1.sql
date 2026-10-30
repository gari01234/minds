-- Routine lifecycle uses the existing review admission, with atomic receipts.
-- SECURITY DEFINER is needed only to write immutable receipts/review state;
-- every target and decision is explicitly scoped to auth.uid().
create table public.minds_routine_action_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check(action in ('create','update','pause','resume','delete')),
  entity_id uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  reviewed_candidate jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);
alter table public.minds_routine_action_receipts enable row level security;
revoke all on public.minds_routine_action_receipts from public,anon,authenticated;
grant select on public.minds_routine_action_receipts to authenticated;
grant all on public.minds_routine_action_receipts to service_role;
create policy routine_receipts_owner on public.minds_routine_action_receipts
  for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.minds_commit_reviewed_routine_v1(p_request_id uuid,p_reviewed jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  u uuid:=auth.uid();
  d public.minds_shadow_decisions%rowtype;
  receipt public.minds_routine_action_receipts%rowtype;
  r public.isabella_routines%rowtype;
  a text:=coalesce(p_reviewed->>'action','create');
  original jsonb;
  before_config jsonb;
  before_row jsonb:='{}';
  after_row jsonb:='{}';
  sched jsonb;
  tz text;
  title_text text;
  instruction_text text;
  rid uuid;
  receipt_id uuid;
  next_run timestamptz;
begin
  if u is null or p_request_id is null or jsonb_typeof(p_reviewed) is distinct from 'object'
     then raise exception 'unauthorized_or_invalid_review'; end if;
  -- Serialize routine changes per owner, including duplicate creation checks.
  perform pg_advisory_xact_lock(hashtextextended(u::text||':routines',42));
  select * into receipt from public.minds_routine_action_receipts where user_id=u and request_id=p_request_id;
  if found then
    if p_reviewed-'_review' is distinct from receipt.reviewed_candidate-'_review'
      then raise exception 'receipt_replay_candidate_mismatch'; end if;
    return jsonb_build_object('status','already_applied','receipt_id',receipt.id,'entity_id',receipt.entity_id,'after',receipt.after_state);
  end if;
  select * into d from public.minds_shadow_decisions where user_id=u and request_id=p_request_id for update;
  if not found or d.proposal_kind<>'routine' or d.policy_mode<>'confirm'
    or d.status not in ('pending','accepted','edited') then raise exception 'missing_or_ineligible_review'; end if;
  original:=d.candidate;
  if a not in ('create','update','pause','resume','delete')
    or coalesce(p_reviewed->>'kind','')<>'routine'
    or coalesce(original->>'action','create')<>a
    or (p_reviewed->>'request_id') is distinct from p_request_id::text
    or (p_reviewed->>'target_id') is distinct from (original->>'target_id')
    or (p_reviewed->'before') is distinct from (original->'before')
    or d.action not in (a||'_routine',case when a='create' then 'create_chat_reminder' else a||'_routine' end)
    then raise exception 'review_target_or_authority_changed'; end if;
  if d.status in ('accepted','edited') and (d.reviewed_candidate is null or
    p_reviewed-'_review' is distinct from d.reviewed_candidate-'_review')
    then raise exception 'reviewed_candidate_mismatch'; end if;
  if a<>'create' then
    select * into r from public.isabella_routines where id=(original->>'target_id')::uuid and user_id=u for update;
    if not found then raise exception 'routine_target_not_found'; end if;
    rid:=r.id; before_row:=to_jsonb(r);
    before_config:=jsonb_build_object('title',r.title,'instruction',r.instruction,'schedule',r.schedule,'timezone',r.timezone,'enabled',r.enabled);
    -- Runner timestamps/output do not invalidate a review, but config edits do.
    if original->'before' is distinct from before_config then raise exception 'routine_changed_since_review'; end if;
  end if;
  if a in ('create','update') then
    title_text:=btrim(p_reviewed->>'title'); instruction_text:=btrim(p_reviewed->>'instruction'); tz:=p_reviewed->>'timezone';
    if coalesce(length(title_text),0) not between 1 and 500 or coalesce(length(instruction_text),0) not between 1 and 20000
      then raise exception 'invalid_routine_content'; end if;
    if tz is null or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'invalid_routine_timezone'; end if;
    if coalesce(p_reviewed->>'schedule_kind','') not in ('once','daily','weekly')
      or coalesce(p_reviewed->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then raise exception 'invalid_routine_schedule'; end if;
    sched:=jsonb_build_object('kind',p_reviewed->>'schedule_kind','time',p_reviewed->>'time');
    if p_reviewed->>'schedule_kind'='weekly' then
      if jsonb_typeof(p_reviewed->'weekdays') is distinct from 'array' then raise exception 'invalid_routine_weekdays'; end if;
      if jsonb_array_length(p_reviewed->'weekdays')=0 or exists(
        select 1 from jsonb_array_elements(p_reviewed->'weekdays') x where x::text !~ '^[0-6]$'
      ) then raise exception 'invalid_routine_weekdays'; end if;
      sched:=sched||jsonb_build_object('weekdays',(select jsonb_agg(v order by v) from (select distinct value v from jsonb_array_elements(p_reviewed->'weekdays')) days));
    elsif p_reviewed->>'schedule_kind'='once' then
      if coalesce(p_reviewed->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_routine_date'; end if;
      perform (p_reviewed->>'date')::date;
      sched:=sched||jsonb_build_object('date',p_reviewed->>'date');
    end if;
    next_run:=public.isabella_next_routine_run(sched,tz,now());
    if next_run is null or next_run<=now() then raise exception 'routine_requires_future_run'; end if;
    if a='create' and exists(select 1 from public.isabella_routines
      where user_id=u and (lower(btrim(title))=lower(title_text) or
        (btrim(instruction)=instruction_text and schedule->>'kind'=sched->>'kind'
          and schedule->>'time'=sched->>'time' and coalesce(schedule->'weekdays','[]')=coalesce(sched->'weekdays','[]')
          and coalesce(schedule->>'date','')=coalesce(sched->>'date','') and timezone=tz)))
      then raise exception 'duplicate_routine_edit_existing'; end if;
    if a='create' then
      insert into public.isabella_routines(user_id,title,instruction,schedule,timezone,enabled,client_key,metadata)
        values(u,title_text,instruction_text,sched,tz,true,p_request_id::text,jsonb_build_object('source','isabella_chat')) returning * into r;
      rid:=r.id;
    else
      update public.isabella_routines set title=title_text,instruction=instruction_text,schedule=sched,timezone=tz,updated_at=now()
        where id=rid and user_id=u returning * into r;
    end if;
    after_row:=to_jsonb(r);
  elsif a='delete' then
    delete from public.isabella_routines where id=rid and user_id=u;
  else
    if a='resume' and public.isabella_next_routine_run(r.schedule,r.timezone,now()) is null
      then raise exception 'routine_requires_future_run'; end if;
    update public.isabella_routines set enabled=(a='resume'),updated_at=now()
      where id=rid and user_id=u returning * into r;
    after_row:=to_jsonb(r);
  end if;
  insert into public.minds_routine_action_receipts(user_id,request_id,action,entity_id,before_state,after_state,reviewed_candidate)
    values(u,p_request_id,a,rid,before_row,after_row,p_reviewed) returning id into receipt_id;
  update public.minds_shadow_decisions set
    status=case when p_reviewed-'_review' is distinct from original-'_review' then 'edited' else 'accepted' end,
    reviewed_candidate=p_reviewed,resolved_at=coalesce(resolved_at,now()),updated_at=now() where id=d.id;
  return jsonb_build_object('status','applied','receipt_id',receipt_id,'entity_id',rid,'after',after_row);
end $$;
revoke all on function public.minds_commit_reviewed_routine_v1(uuid,jsonb) from public,anon;
grant execute on function public.minds_commit_reviewed_routine_v1(uuid,jsonb) to authenticated;

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority) values
(null,'isabella','search_routines','allow','Read owned canonical routines',10),
(null,'isabella','update_routine','confirm','Review changes to an existing routine',10),
(null,'isabella','pause_routine','confirm','Review pausing an existing routine',10),
(null,'isabella','resume_routine','confirm','Review reactivating an existing routine',10),
(null,'isabella','delete_routine','confirm','Review removal of an existing routine',10);
