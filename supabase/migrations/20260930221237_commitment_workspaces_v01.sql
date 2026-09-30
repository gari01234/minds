create table if not exists public.minds_commitment_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  commitment_id uuid not null references public.minds_commitments(id) on delete cascade,
  project_id uuid null references public.isabella_projects(id) on delete set null,
  title text not null,
  objective_snapshot text not null,
  completion_criteria_snapshot text null,
  status text not null default 'active' check (status in ('active','paused','done','archived')),
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minds_commitment_workspaces_title_check check (length(trim(title)) between 1 and 400),
  constraint minds_commitment_workspaces_objective_check check (length(trim(objective_snapshot)) between 1 and 6000),
  constraint minds_commitment_workspaces_summary_check check (length(summary) <= 12000)
);

create unique index if not exists minds_commitment_workspaces_user_commitment_uq
  on public.minds_commitment_workspaces(user_id,commitment_id);
create index if not exists minds_commitment_workspaces_user_status_idx
  on public.minds_commitment_workspaces(user_id,status,updated_at desc);
create index if not exists minds_commitment_workspaces_project_idx
  on public.minds_commitment_workspaces(user_id,project_id,updated_at desc)
  where project_id is not null;

alter table public.minds_commitment_workspaces enable row level security;
drop policy if exists "commitment workspaces select own" on public.minds_commitment_workspaces;
create policy "commitment workspaces select own"
on public.minds_commitment_workspaces for select to authenticated
using (auth.uid()=user_id);

revoke insert,update,delete on public.minds_commitment_workspaces from authenticated,anon;
grant select on public.minds_commitment_workspaces to authenticated;

create table if not exists public.minds_commitment_workspace_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.minds_commitment_workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('plan','finding','source','question','decision','note')),
  status text not null default 'working' check (status in ('working','proposed','confirmed','resolved','superseded')),
  content text not null,
  provenance_class text not null default 'agent' check (provenance_class in ('user','project_source','external','inferred','agent')),
  source_kind text not null default 'conversation' check (source_kind in ('user','conversation','work','document','web','specialist','system')),
  source_ref text null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minds_commitment_workspace_items_content_check check (length(trim(content)) between 1 and 16000)
);

create index if not exists minds_commitment_workspace_items_workspace_idx
  on public.minds_commitment_workspace_items(workspace_id,created_at asc);
create index if not exists minds_commitment_workspace_items_user_kind_idx
  on public.minds_commitment_workspace_items(user_id,kind,created_at desc);

alter table public.minds_commitment_workspace_items enable row level security;
drop policy if exists "commitment workspace items select own" on public.minds_commitment_workspace_items;
create policy "commitment workspace items select own"
on public.minds_commitment_workspace_items for select to authenticated
using (
  auth.uid()=user_id
  and exists (
    select 1 from public.minds_commitment_workspaces w
    where w.id=workspace_id and w.user_id=auth.uid()
  )
);

revoke insert,update,delete on public.minds_commitment_workspace_items from authenticated,anon;
grant select on public.minds_commitment_workspace_items to authenticated;

create or replace function public.minds_ensure_commitment_workspace(p_commitment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_commitment public.minds_commitments%rowtype;
  v_workspace public.minds_commitment_workspaces%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;

  select * into v_commitment
  from public.minds_commitments
  where id=p_commitment_id and user_id=v_uid and status in ('active','waiting','paused');

  if not found then return jsonb_build_object('status','missing'); end if;

  insert into public.minds_commitment_workspaces(
    user_id,commitment_id,project_id,title,objective_snapshot,completion_criteria_snapshot,status,metadata
  ) values (
    v_uid,v_commitment.id,v_commitment.project_id,v_commitment.title,v_commitment.objective,v_commitment.completion_criteria,
    case when v_commitment.status='paused' then 'paused' else 'active' end,
    jsonb_build_object('commitment_status_at_open',v_commitment.status,'opened_from','isabella')
  )
  on conflict(user_id,commitment_id) do update set
    project_id=excluded.project_id,
    title=excluded.title,
    objective_snapshot=excluded.objective_snapshot,
    completion_criteria_snapshot=excluded.completion_criteria_snapshot,
    updated_at=now()
  returning * into v_workspace;

  return jsonb_build_object('status','ok','workspace',to_jsonb(v_workspace));
end $$;

create or replace function public.minds_append_commitment_workspace_item(
  p_workspace_id uuid,
  p_kind text,
  p_content text,
  p_provenance_class text default 'agent',
  p_source_kind text default 'conversation',
  p_source_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_workspace public.minds_commitment_workspaces%rowtype;
  v_item public.minds_commitment_workspace_items%rowtype;
  v_provenance text;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if p_kind not in ('plan','finding','source','question','decision','note') then return jsonb_build_object('status','invalid_kind'); end if;
  if length(trim(coalesce(p_content,''))) < 1 or length(trim(coalesce(p_content,''))) > 16000 then return jsonb_build_object('status','invalid_content'); end if;
  if p_source_kind not in ('user','conversation','work','document','web','specialist','system') then return jsonb_build_object('status','invalid_source_kind'); end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then return jsonb_build_object('status','invalid_metadata'); end if;

  select * into v_workspace
  from public.minds_commitment_workspaces
  where id=p_workspace_id and user_id=v_uid and status in ('active','paused');

  if not found then return jsonb_build_object('status','missing'); end if;

  v_provenance:=case
    when p_source_kind='user' then 'user'
    when p_source_kind in ('work','document') then 'project_source'
    when p_source_kind='web' then 'external'
    when p_provenance_class in ('user','project_source','external','inferred','agent') then p_provenance_class
    else 'agent'
  end;
  v_status:=case when p_kind='decision' then 'proposed' else 'working' end;

  insert into public.minds_commitment_workspace_items(
    workspace_id,user_id,kind,status,content,provenance_class,source_kind,source_ref,metadata
  ) values (
    p_workspace_id,v_uid,p_kind,v_status,trim(p_content),v_provenance,p_source_kind,nullif(trim(coalesce(p_source_ref,'')),''),
    coalesce(p_metadata,'{}'::jsonb)
  ) returning * into v_item;

  update public.minds_commitment_workspaces
  set updated_at=now()
  where id=p_workspace_id and user_id=v_uid;

  return jsonb_build_object('status','ok','item',to_jsonb(v_item));
end $$;

create or replace function public.minds_update_commitment_workspace_summary(
  p_workspace_id uuid,
  p_summary text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_workspace public.minds_commitment_workspaces%rowtype;
begin
  if v_uid is null then return jsonb_build_object('status','unauthorized'); end if;
  if length(coalesce(p_summary,'')) > 12000 then return jsonb_build_object('status','invalid_summary'); end if;

  update public.minds_commitment_workspaces
  set summary=coalesce(p_summary,''),updated_at=now()
  where id=p_workspace_id and user_id=v_uid and status in ('active','paused')
  returning * into v_workspace;

  if not found then return jsonb_build_object('status','missing'); end if;
  return jsonb_build_object('status','ok','workspace',to_jsonb(v_workspace));
end $$;

revoke all on function public.minds_ensure_commitment_workspace(uuid) from public,anon;
revoke all on function public.minds_append_commitment_workspace_item(uuid,text,text,text,text,text,jsonb) from public,anon;
revoke all on function public.minds_update_commitment_workspace_summary(uuid,text) from public,anon;
grant execute on function public.minds_ensure_commitment_workspace(uuid) to authenticated;
grant execute on function public.minds_append_commitment_workspace_item(uuid,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.minds_update_commitment_workspace_summary(uuid,text) to authenticated;

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','open_commitment_workspace','allow','Internal workspace for a user-approved Commitment; does not execute external actions',10,true,
       '{"runtime":"commitment_workspace_v1","internal_only":true}'::jsonb
where not exists (
  select 1 from public.minds_action_policies
  where user_id is null and app_scope='isabella' and action='open_commitment_workspace' and enabled
);

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','write_commitment_workspace','allow','Append-only operational scratchpad; decisions remain proposed and workspace content is not personal memory',10,true,
       '{"runtime":"commitment_workspace_v1","append_only":true,"decision_status":"proposed"}'::jsonb
where not exists (
  select 1 from public.minds_action_policies
  where user_id is null and app_scope='isabella' and action='write_commitment_workspace' and enabled
);
