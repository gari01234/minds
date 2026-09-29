-- Transactional v2 completion. Applied through Supabase migrations; no user data.
alter table public.minds_standing_intents add column if not exists request_id uuid;
create unique index if not exists minds_standing_intents_request_uidx on public.minds_standing_intents(user_id,request_id);
alter table public.minds_memory_flushes add column if not exists checkpoint_message_id uuid;
alter table public.minds_memory_flushes add column if not exists source_message_ids uuid[] not null default '{}';
create unique index if not exists minds_memory_flushes_checkpoint_uidx on public.minds_memory_flushes(user_id,agent,conversation_id,checkpoint_message_id);
create index if not exists conversation_messages_checkpoint_idx on public.conversation_messages(user_id,conversation_id,created_at,id);
create unique index if not exists minds_work_claims_request_uidx on public.minds_work_claims(user_id,(metadata->>'request_id')) where metadata ? 'request_id';
create unique index if not exists minds_skill_proposals_request_uidx on public.minds_skill_proposals(user_id,(metadata->>'request_id')) where metadata ? 'request_id';

create table if not exists public.minds_user_skill_versions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  skill_id uuid not null references public.minds_user_skills(id) on delete cascade,
  version integer not null check(version>0), snapshot jsonb not null,
  created_at timestamptz not null default now(), unique(skill_id,version)
);
alter table public.minds_user_skill_versions enable row level security;
create policy minds_user_skill_versions_own on public.minds_user_skill_versions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.minds_user_skills s where s.id=skill_id and s.user_id=(select auth.uid())));
create index minds_user_skill_versions_user_idx on public.minds_user_skill_versions(user_id);

create table if not exists public.minds_intent_deliveries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),
  intent_id uuid not null references public.minds_standing_intents(id) on delete cascade,
  run_key text not null, delivered_at timestamptz not null default now(),unique(user_id,intent_id,run_key)
);
alter table public.minds_intent_deliveries enable row level security;
create policy minds_intent_deliveries_own on public.minds_intent_deliveries for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.minds_standing_intents i where i.id=intent_id and i.user_id=(select auth.uid())));
create index minds_intent_deliveries_user_idx on public.minds_intent_deliveries(user_id,intent_id);

create or replace function public.minds_save_memory_checkpoint(p_agent text,p_conversation_id uuid,p_message_ids uuid[],p_summary text,p_open_loops jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); prior public.minds_memory_flushes; saved public.minds_memory_flushes; expected uuid[]; last_at timestamptz; last_id uuid;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_agent not in ('isabella','sofia') or coalesce(cardinality(p_message_ids),0) not between 1 and 100 or length(trim(coalesce(p_summary,'')))=0 then raise exception 'Invalid checkpoint'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and user_id=u and app_scope=p_agent) then raise exception 'Conversation not accessible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_agent||p_conversation_id::text,0));
  select * into saved from public.minds_memory_flushes where user_id=u and agent=p_agent and conversation_id=p_conversation_id and checkpoint_message_id=p_message_ids[cardinality(p_message_ids)];
  if found then
    if saved.source_message_ids<>p_message_ids then raise exception 'Checkpoint coverage conflict'; end if;
    return to_jsonb(saved);
  end if;
  select * into prior from public.minds_memory_flushes where user_id=u and agent=p_agent and conversation_id=p_conversation_id and status='active' order by checkpoint_message_at desc,checkpoint_message_id desc limit 1;
  select array_agg(id order by created_at,id) into expected from (
    select id,created_at from public.conversation_messages where user_id=u and conversation_id=p_conversation_id
    and (prior.id is null or (created_at,id)>(prior.checkpoint_message_at,coalesce(prior.checkpoint_message_id,'00000000-0000-0000-0000-000000000000'::uuid)))
    order by created_at,id limit cardinality(p_message_ids)
  ) q;
  if expected is distinct from p_message_ids then raise exception 'Checkpoint must cover the next contiguous messages'; end if;
  last_id:=p_message_ids[cardinality(p_message_ids)];
  select created_at into last_at from public.conversation_messages where id=last_id and user_id=u;
  insert into public.minds_memory_flushes(user_id,agent,conversation_id,checkpoint_message_at,checkpoint_message_id,source_message_ids,summary,open_loops,provenance)
  values(u,p_agent,p_conversation_id,last_at,last_id,p_message_ids,p_summary,p_open_loops,jsonb_build_object('type','derived_checkpoint','source','conversation','accepted_fact',false,'message_count',cardinality(p_message_ids))) returning * into saved;
  -- Sofía checkpoints remain in its intellectual namespace, never personal memory.
  if p_agent='isabella' then
    insert into public.isabella_memories(user_id,kind,subject,content,status,confidence,source,metadata,client_key)
    values(u,'episodic','conversation checkpoint',p_summary,'active',0.65,'compaction_flush',jsonb_build_object('derived',true,'accepted_fact',false,'conversation_id',p_conversation_id,'checkpoint_message_at',last_at,'checkpoint_message_id',last_id,'flush_id',saved.id),'flush:'||p_conversation_id||':'||last_id)
    on conflict(user_id,client_key) do update set content=excluded.content,metadata=excluded.metadata,updated_at=now();
  end if;
  return to_jsonb(saved);
end $$;

create or replace function public.minds_save_work_claim(p_claim jsonb,p_evidence jsonb,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); project uuid; old_id uuid; c public.minds_work_claims; e jsonb; source_file uuid; source_message uuid; provenance text; state text;
begin
  if u is null or p_confirmed is not true then raise exception 'Explicit review required'; end if;
  if p_request_id is null or length(trim(coalesce(p_claim->>'statement','')))=0 then raise exception 'Invalid claim'; end if;
  project:=(p_claim->>'project_id')::uuid;
  if not exists(select 1 from public.isabella_projects where id=project and user_id=u) then raise exception 'Project not accessible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,0));
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
    update public.minds_work_claims set statement=p_claim->>'statement',claim_type=coalesce(p_claim->>'claim_type',c.claim_type),subject=nullif(p_claim->>'subject',''),topic=nullif(p_claim->>'topic',''),discipline=nullif(p_claim->>'discipline',''),status=state,
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
  return to_jsonb(c);
end $$;

create or replace function public.minds_apply_personal_skill(p_skill jsonb,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); a text; s text; p public.minds_skill_proposals; skill public.minds_user_skills; tool_names text[];
begin
  if u is null or p_confirmed is not true then raise exception 'Explicit skill review required'; end if;
  a:=coalesce(p_skill->>'agent','isabella');s:=trim(both '-' from regexp_replace(lower(coalesce(nullif(p_skill->>'slug',''),p_skill->>'name')),'[^a-z0-9]+','-','g'));
  if a not in ('isabella','sofia') or length(coalesce(s,''))=0 or length(trim(coalesce(p_skill->>'instructions','')))=0 or length(trim(coalesce(p_skill->>'name','')))=0 or p_request_id is null then raise exception 'Invalid skill'; end if;
  s:=left(s,80);perform pg_advisory_xact_lock(hashtextextended(u::text||a||s,0));
  select * into p from public.minds_skill_proposals where user_id=u and metadata->>'request_id'=p_request_id::text;
  if found and p.applied_skill_id is not null then
    select * into skill from public.minds_user_skills where id=p.applied_skill_id and user_id=u;return to_jsonb(skill);
  end if;
  select coalesce(array_agg(value),'{}') into tool_names from jsonb_array_elements_text(coalesce(p_skill->'preferred_tools','[]'));
  insert into public.minds_skill_proposals(user_id,agent,slug,name,description,instructions,preferred_tools,status,evidence,metadata)
  values(u,a,s,p_skill->>'name',coalesce(p_skill->>'description',''),p_skill->>'instructions',tool_names,'accepted',case when nullif(p_skill->>'evidence_summary','') is not null then jsonb_build_array(jsonb_build_object('summary',p_skill->>'evidence_summary')) else '[]'::jsonb end,jsonb_build_object('request_id',p_request_id,'source','reviewed_workshop')) returning * into p;
  select * into skill from public.minds_user_skills where user_id=u and agent=a and slug=s for update;
  if found then
    insert into public.minds_user_skill_versions(user_id,skill_id,version,snapshot) values(u,skill.id,skill.version,to_jsonb(skill)) on conflict(skill_id,version) do nothing;
    update public.minds_user_skills set name=p.name,description=p.description,instructions=p.instructions,preferred_tools=tool_names,version=version+1,enabled=true,source_proposal_id=p.id,updated_at=now() where id=skill.id returning * into skill;
  else
    insert into public.minds_user_skills(user_id,agent,slug,name,description,instructions,preferred_tools,source_proposal_id,metadata) values(u,a,s,p.name,p.description,p.instructions,tool_names,p.id,'{"source":"workshop"}') returning * into skill;
  end if;
  update public.minds_skill_proposals set status='applied',applied_skill_id=skill.id,applied_at=now(),updated_at=now() where id=p.id;
  insert into public.minds_user_skill_versions(user_id,skill_id,version,snapshot) values(u,skill.id,skill.version,to_jsonb(skill)) on conflict(skill_id,version) do nothing;
  return to_jsonb(skill);
end $$;

create or replace function public.minds_ack_standing_intents(p_ids uuid[],p_run_key text)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); x public.minds_standing_intents; n integer:=0; inserted integer;
begin
  if u is null or length(coalesce(p_run_key,''))=0 then raise exception 'Authenticated delivery required'; end if;
  for x in select * from public.minds_standing_intents where user_id=u and id=any(p_ids) and status='active' order by id for update loop
    if x.trigger_count>=x.max_triggers or (x.expires_at is not null and x.expires_at<=now()) or (x.last_trigger_at is not null and x.last_trigger_at+make_interval(mins=>x.cooldown_minutes)>now()) then continue; end if;
    insert into public.minds_intent_deliveries(user_id,intent_id,run_key) values(u,x.id,p_run_key) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=1 then
      update public.minds_standing_intents set trigger_count=trigger_count+1,last_trigger_at=now(),status=case when trigger_count+1>=max_triggers then 'completed' else 'active' end,updated_at=now() where id=x.id;
      n:=n+1;
    end if;
  end loop;
  return n;
end $$;

grant select,insert,update,delete on public.minds_user_skill_versions,public.minds_intent_deliveries to authenticated;
grant all on public.minds_user_skill_versions,public.minds_intent_deliveries to service_role;
revoke all on function public.minds_save_memory_checkpoint(text,uuid,uuid[],text,jsonb) from public,anon;
revoke all on function public.minds_save_work_claim(jsonb,jsonb,uuid,boolean) from public,anon;
revoke all on function public.minds_apply_personal_skill(jsonb,uuid,boolean) from public,anon;
revoke all on function public.minds_ack_standing_intents(uuid[],text) from public,anon;
grant execute on function public.minds_save_memory_checkpoint(text,uuid,uuid[],text,jsonb),public.minds_save_work_claim(jsonb,jsonb,uuid,boolean),public.minds_apply_personal_skill(jsonb,uuid,boolean),public.minds_ack_standing_intents(uuid[],text) to authenticated;

-- Deterministic heartbeat publication and lifecycle share one transaction.
create or replace function public.minds_publish_heartbeat(p_user uuid,p_candidate jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.minds_heartbeat_events; fresh boolean:=false; sid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||(p_candidate->>'fingerprint'),0));
  select * into e from public.minds_heartbeat_events where user_id=p_user and fingerprint=p_candidate->>'fingerprint' for update;
  if not found then
    insert into public.minds_heartbeat_events(user_id,event_type,fingerprint,severity,title,body,project_id,source,metadata)
    values(p_user,p_candidate->>'event_type',p_candidate->>'fingerprint',coalesce(p_candidate->>'severity','attention'),p_candidate->>'title',coalesce(p_candidate->>'body',''),nullif(p_candidate->>'project_id','')::uuid,coalesce(p_candidate->'source','{}'),coalesce(p_candidate->'metadata','{}')) returning * into e;
    fresh:=true;
  else
    update public.minds_heartbeat_events set last_seen_at=now(),source=coalesce(p_candidate->'source','{}'),metadata=coalesce(p_candidate->'metadata','{}'),title=p_candidate->>'title',body=coalesce(p_candidate->>'body','') where id=e.id;
  end if;
  if e.status='new' and coalesce((p_candidate->>'surface')::boolean,true) then
    insert into public.minds_surface_items(user_id,surface,agent,title,body,status,lifecycle_state,icon,generated_at,expires_at,metadata)
    values(p_user,'feed','isabella',p_candidate->>'title',coalesce(p_candidate->>'body',''),'active','new',case when p_candidate->>'severity'='urgent' then '!' else '·' end,now(),now()+make_interval(hours=>coalesce((p_candidate->>'ttl_hours')::integer,12)),jsonb_build_object('source','heartbeat','heartbeat_event_id',e.id,'event_type',e.event_type,'fingerprint',e.fingerprint,'project_id',e.project_id)) returning id into sid;
    update public.minds_heartbeat_events set status='surfaced',surfaced_at=now() where id=e.id;
  end if;
  return jsonb_build_object('id',e.id,'created',fresh,'surfaced',sid is not null);
end $$;
revoke all on function public.minds_publish_heartbeat(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_heartbeat(uuid,jsonb) to service_role;

create or replace function public.minds_surface_heartbeat_feedback()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.metadata->>'heartbeat_event_id' is not null and new.lifecycle_state in ('dismissed','resolved') then
    update public.minds_heartbeat_events set status=new.lifecycle_state where id=(new.metadata->>'heartbeat_event_id')::uuid and user_id=new.user_id;
  end if;
  return new;
end $$;
create trigger minds_surface_heartbeat_feedback after update of lifecycle_state on public.minds_surface_items for each row execute function public.minds_surface_heartbeat_feedback();
drop policy if exists minds_heartbeat_events_update_own on public.minds_heartbeat_events;
create policy minds_heartbeat_events_update_own on public.minds_heartbeat_events for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- A durable outbox holds generated output across crashes/retries, without duplicates.
create table public.minds_routine_deliveries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.isabella_routines(id) on delete cascade,
  scheduled_at timestamptz not null,status text not null default 'pending' check(status in ('pending','generating','generated','delivered','error')),
  attempts integer not null default 0,lease_until timestamptz,retry_at timestamptz,
  output text,sources jsonb not null default '[]',model text,error text,message_id uuid references public.conversation_messages(id) on delete set null,
  claimed_at timestamptz,generated_at timestamptz,delivered_at timestamptz,created_at timestamptz not null default now(),unique(routine_id,scheduled_at)
);
alter table public.minds_routine_deliveries enable row level security;
create policy minds_routine_deliveries_own_read on public.minds_routine_deliveries for select to authenticated using(user_id=(select auth.uid()));
create index minds_routine_deliveries_user_idx on public.minds_routine_deliveries(user_id,scheduled_at desc);
create index minds_routine_deliveries_pending_idx on public.minds_routine_deliveries(retry_at,lease_until) where status<>'delivered';
grant select on public.minds_routine_deliveries to authenticated;
grant all on public.minds_routine_deliveries to service_role;

create or replace function public.claim_due_isabella_routines(p_limit integer default 20)
returns setof public.isabella_routines language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.isabella_routines; d public.minds_routine_deliveries; n integer:=0;
begin
  for r in select x.* from public.isabella_routines x where x.enabled and (
    x.next_run_at<=now() or exists(select 1 from public.minds_routine_deliveries z where z.routine_id=x.id and z.status<>'delivered' and z.attempts<5 and coalesce(z.lease_until,'epoch')<=now() and coalesce(z.retry_at,'epoch')<=now())
  ) order by x.next_run_at nulls first for update of x skip locked limit greatest(1,least(coalesce(p_limit,20),50)) loop
    -- Never overlap a still-live worker, even if the next scheduled time is due.
    if exists(select 1 from public.minds_routine_deliveries where routine_id=r.id and lease_until>now() and status<>'delivered') then continue; end if;
    select * into d from public.minds_routine_deliveries where routine_id=r.id and status<>'delivered' and attempts<5 and coalesce(lease_until,'epoch')<=now() and coalesce(retry_at,'epoch')<=now() order by scheduled_at for update limit 1;
    if not found then
      if r.next_run_at is null or r.next_run_at>now() then continue; end if;
      insert into public.minds_routine_deliveries(user_id,routine_id,scheduled_at) values(r.user_id,r.id,r.next_run_at) on conflict(routine_id,scheduled_at) do nothing returning * into d;
      if not found then continue; end if;
      update public.isabella_routines set next_run_at=public.isabella_next_routine_run(r.schedule,r.timezone,now()+interval '5 seconds') where id=r.id;
    end if;
    update public.minds_routine_deliveries set status=case when output is null then 'generating' else 'generated' end,attempts=attempts+1,lease_until=now()+interval '10 minutes',claimed_at=now(),retry_at=null where id=d.id returning * into d;
    update public.isabella_routines set last_run_at=now(),updated_at=now() where id=r.id returning * into r;
    r.metadata:=r.metadata||jsonb_build_object('delivery_id',d.id,'scheduled_at',d.scheduled_at,'delivery_output',d.output,'delivery_sources',d.sources,'delivery_model',d.model,'delivery_attempt',d.attempts);
    return next r;n:=n+1;
  end loop;
end $$;
revoke all on function public.claim_due_isabella_routines(integer) from public,anon,authenticated;
grant execute on function public.claim_due_isabella_routines(integer) to service_role;

create or replace function public.minds_deliver_routine(p_delivery_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.minds_routine_deliveries;r public.isabella_routines;conv uuid;mid uuid;
begin
  select * into d from public.minds_routine_deliveries where id=p_delivery_id;
  if not found then raise exception 'Delivery not found'; end if;
  if d.status='delivered' then return jsonb_build_object('message_id',d.message_id,'duplicate',true);end if;
  select * into r from public.isabella_routines where id=d.routine_id and user_id=d.user_id for update;
  select * into d from public.minds_routine_deliveries where id=p_delivery_id for update;
  if d.status='delivered' then return jsonb_build_object('message_id',d.message_id,'duplicate',true);end if;
  if length(coalesce(d.output,''))=0 then raise exception 'No generated output';end if;
  if not r.enabled then raise exception 'Routine disabled before delivery';end if;
  select id into conv from public.conversations where user_id=d.user_id and app_scope='isabella' order by updated_at desc limit 1;
  if conv is null then
    insert into public.conversations(user_id,app_scope,origin_kind,origin_anchor,title,mode,metadata) values(d.user_id,'isabella','global','{"type":"assistant","id":"isabella","label":"Isabella"}','Isabella','memory','{"app":"isabella"}') returning id into conv;
  end if;
  insert into public.conversation_messages(user_id,conversation_id,role,content,model,provisional,citations,metadata,client_key)
  values(d.user_id,conv,'assistant',d.output,d.model,false,d.sources,jsonb_build_object('source','isabella_routine','routine_id',r.id,'routine_title',r.title,'delivery_id',d.id,'scheduled_at',d.scheduled_at),'routine-delivery:'||d.id)
  on conflict(user_id,conversation_id,client_key) do update set content=excluded.content returning id into mid;
  update public.conversations set updated_at=now() where id=conv;
  if r.schedule->>'kind'='once' then
    update public.isabella_routines set last_output=d.output,last_error=null,metadata=metadata||'{"failure_retries":0}',enabled=false,next_run_at=null,updated_at=now() where id=r.id;
  else
    update public.isabella_routines set last_output=d.output,last_error=null,metadata=metadata||'{"failure_retries":0}',updated_at=now() where id=r.id;
  end if;
  update public.minds_routine_deliveries set status='delivered',message_id=mid,delivered_at=now(),lease_until=null,error=null where id=d.id;
  return jsonb_build_object('message_id',mid,'scheduled_at',d.scheduled_at,'delivered_at',now(),'delay_ms',greatest(0,extract(epoch from (now()-d.scheduled_at))*1000));
end $$;
revoke all on function public.minds_deliver_routine(uuid) from public,anon,authenticated;
grant execute on function public.minds_deliver_routine(uuid) to service_role;

create or replace function public.minds_heartbeat_users()
returns table(user_id uuid,timezone text) language sql security invoker set search_path=public,pg_temp as $$
  with ids as (
    select user_id from public.isabella_routines where enabled
    union select user_id from public.isabella_tasks where archived_at is null
    union select user_id from public.isabella_events where starts_at>=now()-interval '1 hour'
    union select user_id from public.isabella_projects where not archived
  ) select i.user_id,coalesce((select r.timezone from public.isabella_routines r where r.user_id=i.user_id and r.enabled order by r.created_at limit 1),'Europe/Berlin') from ids i;
$$;
revoke all on function public.minds_heartbeat_users() from public,anon,authenticated;
grant execute on function public.minds_heartbeat_users() to service_role;

-- Conversation leases prevent two workers from forking or appending concurrently.
alter table public.conversations add column if not exists runtime_lease_token uuid;
alter table public.conversations add column if not exists runtime_lease_until timestamptz;
create or replace function public.minds_lock_conversation(p_id uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_token is null then raise exception 'Lease token required';end if;
  update public.conversations set runtime_lease_token=p_token,runtime_lease_until=now()+interval '15 minutes' where id=p_id and (runtime_lease_until is null or runtime_lease_until<now());
  return found;
end $$;
create or replace function public.minds_unlock_conversation(p_id uuid,p_token uuid)
returns void language sql security invoker set search_path=public,pg_temp as $$
  update public.conversations set runtime_lease_token=null,runtime_lease_until=null where id=p_id and runtime_lease_token=p_token;
$$;
revoke all on function public.minds_lock_conversation(uuid,uuid),public.minds_unlock_conversation(uuid,uuid) from public,anon;
grant execute on function public.minds_lock_conversation(uuid,uuid),public.minds_unlock_conversation(uuid,uuid) to authenticated,service_role;
