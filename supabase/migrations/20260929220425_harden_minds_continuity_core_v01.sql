create index if not exists minds_commitments_source_conversation_idx
on public.minds_commitments(source_conversation_id) where source_conversation_id is not null;

drop policy if exists minds_commitments_reviewed_insert on public.minds_commitments;
create policy minds_commitments_reviewed_insert on public.minds_commitments
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select current_setting('minds.commitment_reviewed',true)) = 'true'
);

drop policy if exists minds_commitment_events_reviewed_insert on public.minds_commitment_events;
create policy minds_commitment_events_reviewed_insert on public.minds_commitment_events
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select current_setting('minds.commitment_reviewed',true)) = 'true'
  and exists (
    select 1 from public.minds_commitments c
    where c.id=commitment_id and c.user_id=(select auth.uid())
  )
);

revoke all on public.minds_commitments,public.minds_commitment_events from anon,authenticated;
grant select,insert on public.minds_commitments,public.minds_commitment_events to authenticated;
grant all on public.minds_commitments,public.minds_commitment_events to service_role;

create or replace function public.minds_create_commitment(
  p_commitment jsonb,
  p_request_id uuid,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  u uuid := auth.uid();
  saved public.minds_commitments;
  existing public.minds_commitments;
  project uuid;
  conv uuid;
  flush public.minds_memory_flushes;
  flush_id uuid;
  open_loop text;
  prior_guard text := current_setting('minds.commitment_reviewed',true);
  v_title text := trim(coalesce(p_commitment->>'title',''));
  v_objective text := trim(coalesce(p_commitment->>'objective',''));
  v_scope text := lower(trim(coalesce(p_commitment->>'scope','global')));
  v_status text := lower(trim(coalesce(p_commitment->>'status','active')));
  v_agent text := lower(trim(coalesce(p_commitment->>'agent','isabella')));
  v_source text := lower(trim(coalesce(p_commitment->>'source_kind','user')));
  v_criteria text := nullif(trim(coalesce(p_commitment->>'completion_criteria','')),'');
  v_metadata jsonb := coalesce(p_commitment->'metadata','{}'::jsonb);
begin
  if u is null then raise exception 'Authentication required'; end if;
  if p_confirmed is not true then raise exception 'Explicit review required'; end if;
  if p_request_id is null then raise exception 'Request id required'; end if;
  if length(v_title) not between 1 and 400 or length(v_objective) not between 1 and 6000 then raise exception 'Invalid commitment'; end if;
  if v_scope not in ('global','personal','project','theory','other') or v_status not in ('active','waiting','paused') or v_agent not in ('isabella','sofia') then raise exception 'Invalid commitment state'; end if;
  if v_source not in ('user','conversation','checkpoint','project','system') then raise exception 'Invalid commitment source'; end if;
  if jsonb_typeof(v_metadata) <> 'object' then raise exception 'Invalid commitment metadata'; end if;
  if v_criteria is not null and length(v_criteria) > 4000 then raise exception 'Completion criteria too long'; end if;

  perform pg_advisory_xact_lock(hashtextextended('commitment:'||u::text||':'||p_request_id::text,0));
  select * into existing from public.minds_commitments where user_id=u and request_id=p_request_id;
  if found then return to_jsonb(existing); end if;

  if nullif(p_commitment->>'project_id','') is not null then
    begin project := (p_commitment->>'project_id')::uuid; exception when others then raise exception 'Invalid project'; end;
    if not exists(select 1 from public.isabella_projects where id=project and user_id=u) then raise exception 'Project not accessible'; end if;
    v_scope := 'project';
  elsif v_scope='project' then
    raise exception 'Project required for project commitment';
  end if;

  if nullif(p_commitment->>'source_conversation_id','') is not null then
    begin conv := (p_commitment->>'source_conversation_id')::uuid; exception when others then raise exception 'Invalid conversation'; end;
    if not exists(select 1 from public.conversations where id=conv and user_id=u) then raise exception 'Conversation not accessible'; end if;
  end if;

  if nullif(p_commitment->>'source_flush_id','') is not null or nullif(p_commitment->>'source_open_loop','') is not null then
    if nullif(p_commitment->>'source_flush_id','') is null or nullif(p_commitment->>'source_open_loop','') is null then raise exception 'Checkpoint provenance incomplete'; end if;
    begin flush_id := (p_commitment->>'source_flush_id')::uuid; exception when others then raise exception 'Invalid checkpoint'; end;
    open_loop := trim(p_commitment->>'source_open_loop');
    select * into flush from public.minds_memory_flushes where id=flush_id and user_id=u;
    if not found then raise exception 'Checkpoint not accessible'; end if;
    if not exists(select 1 from jsonb_array_elements_text(coalesce(flush.open_loops,'[]'::jsonb)) x(value) where x.value=open_loop) then
      raise exception 'Open loop not present in checkpoint';
    end if;
    conv := flush.conversation_id;
    v_source := 'checkpoint';
  end if;

  perform set_config('minds.commitment_reviewed','true',true);

  insert into public.minds_commitments(
    user_id,agent,title,objective,scope,project_id,status,completion_criteria,
    source_kind,source_conversation_id,source_flush_id,source_open_loop,request_id,metadata
  ) values (
    u,v_agent,v_title,v_objective,v_scope,project,v_status,v_criteria,
    v_source,conv,flush_id,open_loop,p_request_id,v_metadata
  ) returning * into saved;

  insert into public.minds_commitment_events(user_id,commitment_id,event_type,body,to_status,source_kind,source,metadata)
  values(u,saved.id,'created',saved.objective,saved.status,v_source,
    jsonb_strip_nulls(jsonb_build_object('request_id',p_request_id,'project_id',project,'conversation_id',conv)),
    jsonb_build_object('scope',saved.scope,'agent',saved.agent));

  if flush_id is not null then
    insert into public.minds_commitment_events(user_id,commitment_id,event_type,body,to_status,source_kind,source)
    values(u,saved.id,'open_loop_linked',open_loop,saved.status,'checkpoint',
      jsonb_build_object('flush_id',flush_id,'open_loop',open_loop));
  end if;

  perform set_config('minds.commitment_reviewed',coalesce(prior_guard,''),true);
  return to_jsonb(saved);
end $$;

revoke all on function public.minds_create_commitment(jsonb,uuid,boolean) from public,anon;
grant execute on function public.minds_create_commitment(jsonb,uuid,boolean) to authenticated,service_role;
