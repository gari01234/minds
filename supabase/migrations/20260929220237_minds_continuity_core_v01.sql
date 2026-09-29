create table if not exists public.minds_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent text not null default 'isabella' check (agent in ('isabella','sofia')),
  title text not null check (length(trim(title)) between 1 and 400),
  objective text not null check (length(trim(objective)) between 1 and 6000),
  scope text not null default 'global' check (scope in ('global','personal','project','theory','other')),
  project_id uuid references public.isabella_projects(id) on delete set null,
  status text not null default 'active' check (status in ('active','waiting','paused','completed','cancelled')),
  completion_criteria text check (completion_criteria is null or length(completion_criteria) <= 4000),
  source_kind text not null default 'user' check (source_kind in ('user','conversation','checkpoint','project','system')),
  source_conversation_id uuid references public.conversations(id) on delete set null,
  source_flush_id uuid references public.minds_memory_flushes(id) on delete set null,
  source_open_loop text,
  request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope <> 'project') or project_id is not null),
  check ((source_flush_id is null and source_open_loop is null) or (source_flush_id is not null and source_open_loop is not null))
);
create unique index if not exists minds_commitments_request_uidx on public.minds_commitments(user_id,request_id);
create index if not exists minds_commitments_user_status_idx on public.minds_commitments(user_id,status,updated_at desc);
create index if not exists minds_commitments_project_status_idx on public.minds_commitments(project_id,status,updated_at desc) where project_id is not null;
create index if not exists minds_commitments_source_flush_idx on public.minds_commitments(source_flush_id) where source_flush_id is not null;

alter table public.minds_commitments enable row level security;
drop policy if exists minds_commitments_select_own on public.minds_commitments;
create policy minds_commitments_select_own on public.minds_commitments
for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.minds_commitment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  commitment_id uuid not null references public.minds_commitments(id) on delete cascade,
  event_type text not null check (event_type in ('created','open_loop_linked','status_changed','note','reactivated','completed')),
  body text not null default '',
  from_status text,
  to_status text,
  source_kind text not null default 'system' check (source_kind in ('user','conversation','checkpoint','project','system')),
  source jsonb not null default '{}'::jsonb check (jsonb_typeof(source)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);
create index if not exists minds_commitment_events_commitment_idx on public.minds_commitment_events(commitment_id,created_at);
create index if not exists minds_commitment_events_user_idx on public.minds_commitment_events(user_id,created_at desc);
alter table public.minds_commitment_events enable row level security;
drop policy if exists minds_commitment_events_select_own on public.minds_commitment_events;
create policy minds_commitment_events_select_own on public.minds_commitment_events
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.minds_commitments,public.minds_commitment_events from anon,authenticated;
grant select on public.minds_commitments,public.minds_commitment_events to authenticated;
grant all on public.minds_commitments,public.minds_commitment_events to service_role;

create or replace function public.minds_create_commitment(
  p_commitment jsonb,
  p_request_id uuid,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
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

  return to_jsonb(saved);
end $$;

revoke all on function public.minds_create_commitment(jsonb,uuid,boolean) from public,anon;
grant execute on function public.minds_create_commitment(jsonb,uuid,boolean) to authenticated,service_role;

update public.minds_action_policies
set mode='allow',reason='Read user-reviewed commitments without mutation.',updated_at=now()
where user_id is null and app_scope='isabella' and action='search_commitments';
insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority)
select null,'isabella','search_commitments','allow','Read user-reviewed commitments without mutation.',100
where not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='search_commitments');

update public.minds_action_policies
set mode='confirm',reason='Creating durable continuity requires explicit user review.',updated_at=now()
where user_id is null and app_scope='isabella' and action='propose_commitment';
insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority)
select null,'isabella','propose_commitment','confirm','Creating durable continuity requires explicit user review.',100
where not exists(select 1 from public.minds_action_policies where user_id is null and app_scope='isabella' and action='propose_commitment');
