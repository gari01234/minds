-- Build 84 — Project Model & Evidence Constitution v0.1
-- Add a governed project-understanding layer without replacing the existing canonical
-- Task / Expectation / Commitment / Mission state machines.

create table if not exists public.minds_project_referents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  kind text not null check (kind in ('person','organization','building_element','room','system','document','decision','meeting','phase','workstream','other')),
  label text not null check (length(trim(label)) between 1 and 240),
  canonical_key text null,
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases)='array'),
  status text not null default 'active' check (status in ('active','merged','retired')),
  merged_into uuid null references public.minds_project_referents(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists minds_project_referents_key_uidx
  on public.minds_project_referents(user_id,project_id,canonical_key)
  where canonical_key is not null and status='active';

create index if not exists minds_project_referents_project_idx
  on public.minds_project_referents(user_id,project_id,status,kind,label);

alter table public.minds_work_claims
  add column if not exists referent_id uuid null references public.minds_project_referents(id) on delete set null,
  add column if not exists author_kind text null,
  add column if not exists model_kind text null,
  add column if not exists learned_at timestamptz null;

update public.minds_work_claims
set author_kind = case provenance_class
  when 'user' then 'user'
  when 'external' then 'external'
  when 'project_source' then 'external'
  when 'system' then 'system'
  else 'isabella'
end
where author_kind is null;

update public.minds_work_claims
set learned_at=created_at
where learned_at is null;

alter table public.minds_work_claims
  alter column author_kind set default 'isabella',
  alter column author_kind set not null,
  alter column learned_at set default now(),
  alter column learned_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='minds_work_claims_author_kind_check') then
    alter table public.minds_work_claims add constraint minds_work_claims_author_kind_check
      check (author_kind in ('user','isabella','external','system'));
  end if;
  if not exists (select 1 from pg_constraint where conname='minds_work_claims_model_kind_check') then
    alter table public.minds_work_claims add constraint minds_work_claims_model_kind_check
      check (model_kind is null or model_kind in ('structural','descriptive','diagnostic','evaluative','prescriptive','gap'));
  end if;
end $$;

create index if not exists minds_work_claims_referent_idx
  on public.minds_work_claims(user_id,project_id,referent_id,status,updated_at desc);

create table if not exists public.minds_work_claim_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  source_claim_id uuid not null references public.minds_work_claims(id) on delete cascade,
  target_claim_id uuid not null references public.minds_work_claims(id) on delete cascade,
  relation text not null check (relation in ('supports','contradicts','supersedes','depends_on','qualifies','same_subject')),
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected','superseded')),
  author_kind text not null default 'isabella' check (author_kind in ('user','isabella','external','system')),
  confidence numeric not null default 0.7 check (confidence>=0 and confidence<=1),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_claim_id<>target_claim_id)
);

create unique index if not exists minds_work_claim_relations_uidx
  on public.minds_work_claim_relations(user_id,project_id,source_claim_id,target_claim_id,relation)
  where status in ('proposed','confirmed');

create index if not exists minds_work_claim_relations_project_idx
  on public.minds_work_claim_relations(user_id,project_id,status,relation,updated_at desc);

create table if not exists public.minds_project_perimeter (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  source_class text not null check (length(trim(source_class)) between 1 and 120),
  observation_mode text not null default 'unobserved'
    check (observation_mode in ('autonomous','via_user','unobserved')),
  readability text not null default 'unknown'
    check (readability in ('readable','partial','unreadable','unknown')),
  coverage text not null default 'unknown'
    check (coverage in ('complete','partial','missing','unknown')),
  freshness_minutes integer null check (freshness_minutes is null or freshness_minutes between 1 and 5256000),
  last_checked_at timestamptz null,
  last_seen_at timestamptz null,
  note text null check (note is null or length(note)<=1200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,project_id,source_class)
);

create table if not exists public.minds_project_model_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  parent_revision_id uuid null references public.minds_project_model_revisions(id) on delete set null,
  trigger_kind text not null check (trigger_kind in ('source','user_correction','time','reread','manual')),
  reason text not null check (length(trim(reason)) between 1 and 1200),
  status text not null default 'draft' check (status in ('draft','current','rejected','superseded')),
  coverage_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage_snapshot)='object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  published_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists minds_project_model_one_current_uidx
  on public.minds_project_model_revisions(user_id,project_id)
  where status='current';

create index if not exists minds_project_model_revisions_project_idx
  on public.minds_project_model_revisions(user_id,project_id,created_at desc);

create table if not exists public.minds_project_model_elements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  revision_id uuid not null references public.minds_project_model_revisions(id) on delete cascade,
  element_kind text not null check (element_kind in ('referent','claim','relation','movement','gap')),
  element_ref text not null check (length(trim(element_ref)) between 1 and 240),
  role text not null default 'inferred' check (role in ('accepted','inferred','gap')),
  note text null check (note is null or length(note)<=1600),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(revision_id,element_kind,element_ref,role)
);

create index if not exists minds_project_model_elements_revision_idx
  on public.minds_project_model_elements(user_id,project_id,revision_id,element_kind);

alter table public.minds_project_referents enable row level security;
alter table public.minds_work_claim_relations enable row level security;
alter table public.minds_project_perimeter enable row level security;
alter table public.minds_project_model_revisions enable row level security;
alter table public.minds_project_model_elements enable row level security;

drop policy if exists "project_referents_select_own" on public.minds_project_referents;
create policy "project_referents_select_own" on public.minds_project_referents
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "work_claim_relations_select_own" on public.minds_work_claim_relations;
create policy "work_claim_relations_select_own" on public.minds_work_claim_relations
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "project_perimeter_select_own" on public.minds_project_perimeter;
create policy "project_perimeter_select_own" on public.minds_project_perimeter
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "project_model_revisions_select_own" on public.minds_project_model_revisions;
create policy "project_model_revisions_select_own" on public.minds_project_model_revisions
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "project_model_elements_select_own" on public.minds_project_model_elements;
create policy "project_model_elements_select_own" on public.minds_project_model_elements
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_project_referents,public.minds_work_claim_relations,public.minds_project_perimeter,
  public.minds_project_model_revisions,public.minds_project_model_elements from anon,authenticated;
grant select on public.minds_project_referents,public.minds_work_claim_relations,public.minds_project_perimeter,
  public.minds_project_model_revisions,public.minds_project_model_elements to authenticated;
grant select,insert,update,delete on public.minds_project_referents,public.minds_work_claim_relations,public.minds_project_perimeter,
  public.minds_project_model_revisions,public.minds_project_model_elements to service_role;

create or replace view public.minds_project_sources_v1
with (security_invoker=true)
as
select
  f.user_id,
  f.project_id,
  'work_file'::text as source_kind,
  f.id::text as source_ref,
  f.name as title,
  f.created_at as observed_at,
  null::timestamptz as occurred_at,
  coalesce(f.metadata->>'sha256',f.id::text) as source_version,
  jsonb_build_object(
    'mime_type',f.mime_type,
    'size_bytes',f.size_bytes,
    'index_status',f.index_status,
    'source_kind',f.source_kind,
    'folder_id',f.folder_id
  ) || coalesce(f.metadata,'{}'::jsonb) as metadata
from public.minds_work_files f
union all
select
  t.user_id,
  t.project_id,
  'thread_message'::text as source_kind,
  m.id::text as source_ref,
  t.title as title,
  m.created_at as observed_at,
  m.created_at as occurred_at,
  m.id::text as source_version,
  jsonb_build_object(
    'thread_id',t.id,
    'conversation_id',t.conversation_id,
    'role',m.role
  ) as metadata
from public.minds_work_threads t
join public.conversation_messages m on m.conversation_id=t.conversation_id
where t.conversation_id is not null
  and m.role in ('user','assistant');

grant select on public.minds_project_sources_v1 to authenticated;

create or replace view public.minds_project_movements_v1
with (security_invoker=true)
as
select
  t.user_id,t.project_id,
  'task'::text as source_kind,t.id::text as source_ref,
  'gari'::text as actor_kind,
  t.title,
  case when t.archived_at is not null then 'archived'
       when t.completed_at is not null then 'completed'
       else coalesce(t.work_status,'not_started') end as status,
  case when t.due_date is not null then t.due_date::timestamptz else null end as due_at,
  case when t.due_date is not null then 'date'::text else null::text end as anchor_kind,
  jsonb_build_object('priority',t.priority,'bucket_id',t.work_bucket_id,'start_date',t.start_date) as metadata
from public.isabella_tasks t
where t.project_id is not null
union all
select
  e.user_id,e.project_id,
  'expectation'::text,e.id::text,
  'world'::text,
  e.title,
  e.status,
  e.due_at,
  'expectation_due'::text,
  jsonb_build_object('expected_event',e.expected_event,'observability',e.observability,'resolution_source',e.resolution_source)
from public.minds_expectations e
where e.project_id is not null
union all
select
  c.user_id,c.project_id,
  'commitment'::text,c.id::text,
  'isabella'::text,
  c.title,
  c.status,
  null::timestamptz,
  null::text,
  jsonb_build_object('objective',c.objective,'completion_criteria',c.completion_criteria,'agent',c.agent)
from public.minds_commitments c
where c.project_id is not null
union all
select
  r.user_id,w.project_id,
  'mission'::text,r.id::text,
  'isabella'::text,
  coalesce(w.title,r.instruction),
  r.status,
  coalesce(r.wake_at,r.next_attempt_at),
  case when r.wake_at is not null then 'wake_at'::text
       when r.next_attempt_at is not null then 'retry_at'::text
       else null::text end,
  jsonb_build_object('workspace_id',r.workspace_id,'phase',r.phase,'wait_kind',r.wait_kind,'wait_ref',r.wait_ref,'blocker_question',r.blocker_question)
from public.minds_mission_runs r
join public.minds_commitment_workspaces w on w.id=r.workspace_id
where w.project_id is not null;

grant select on public.minds_project_movements_v1 to authenticated;

create or replace function public.minds_project_model_snapshot(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_project jsonb;
  v_revision jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select jsonb_build_object('id',p.id,'name',p.name,'client_key',p.client_key)
  into v_project
  from public.isabella_projects p
  where p.id=p_project_id and p.user_id=v_uid and p.archived=false;

  if v_project is null then raise exception 'project_not_found' using errcode='P0002'; end if;

  select to_jsonb(r) into v_revision
  from public.minds_project_model_revisions r
  where r.user_id=v_uid and r.project_id=p_project_id and r.status='current'
  order by r.created_at desc limit 1;

  select jsonb_build_object(
    'project',v_project,
    'current_revision',v_revision,
    'referents',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.kind,x.label)
      from (
        select id,kind,label,canonical_key,aliases,status,merged_into,provenance,updated_at
        from public.minds_project_referents
        where user_id=v_uid and project_id=p_project_id and status<>'retired'
        limit 180
      ) x
    ),'[]'::jsonb),
    'claims',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select id,claim_type,statement,referent_id,subject,topic,discipline,status,confidence,
               provenance_class,author_kind,model_kind,supersedes_id,superseded_by,
               valid_from,valid_to,learned_at,confirmed_at,updated_at
        from public.minds_work_claims
        where user_id=v_uid and project_id=p_project_id
          and status in ('proposed','confirmed','disputed','resolved')
        order by updated_at desc limit 220
      ) x
    ),'[]'::jsonb),
    'relations',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select id,source_claim_id,target_claim_id,relation,status,author_kind,confidence,provenance,updated_at
        from public.minds_work_claim_relations
        where user_id=v_uid and project_id=p_project_id and status in ('proposed','confirmed')
        order by updated_at desc limit 260
      ) x
    ),'[]'::jsonb),
    'movements',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.title)
      from (
        select source_kind,source_ref,actor_kind,title,status,due_at,anchor_kind,metadata
        from public.minds_project_movements_v1
        where user_id=v_uid and project_id=p_project_id
        order by due_at nulls last,title limit 220
      ) x
    ),'[]'::jsonb),
    'perimeter',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.source_class)
      from (
        select source_class,observation_mode,readability,coverage,freshness_minutes,last_checked_at,last_seen_at,note,metadata
        from public.minds_project_perimeter
        where user_id=v_uid and project_id=p_project_id
        order by source_class
      ) x
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.minds_project_model_snapshot(uuid) from public,anon;
grant execute on function public.minds_project_model_snapshot(uuid) to authenticated;
