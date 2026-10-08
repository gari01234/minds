-- Build 84.4 — triggered Project Model revisions + unresolved variants.
-- A Project Model revision is Isabella's versioned interpretation, not project truth.
-- Source comparison may update that interpretation automatically because the trigger is explicit,
-- but it must not mutate Claim authority, supersession, permissions or canonical Movement state.

alter table public.minds_project_model_revisions
  add column if not exists trigger_key text null;

create unique index if not exists minds_project_model_revision_trigger_uidx
  on public.minds_project_model_revisions(user_id,project_id,trigger_key)
  where trigger_key is not null;

create table if not exists public.minds_project_model_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  revision_id uuid not null references public.minds_project_model_revisions(id) on delete cascade,
  comparison_item_id uuid not null references public.minds_project_source_comparison_items(id) on delete cascade,
  variant_kind text not null check (variant_kind in ('contradiction','modification','uncertainty')),
  status text not null default 'open' check (status in ('open','resolved','retired')),
  source_claim_id uuid not null references public.minds_work_claims(id) on delete cascade,
  target_claim_id uuid null references public.minds_work_claims(id) on delete set null,
  confidence numeric not null default 0.7 check (confidence>=0 and confidence<=1),
  rationale text null check (rationale is null or length(rationale)<=1600),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique(revision_id,comparison_item_id)
);

create index if not exists minds_project_model_variants_revision_idx
  on public.minds_project_model_variants(user_id,project_id,revision_id,status,variant_kind);

alter table public.minds_project_model_variants enable row level security;

drop policy if exists "project_model_variants_select_own" on public.minds_project_model_variants;
create policy "project_model_variants_select_own" on public.minds_project_model_variants
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_project_model_variants from anon,authenticated;
grant select on public.minds_project_model_variants to authenticated;
grant select,insert,update,delete on public.minds_project_model_variants to service_role;


create or replace function public.minds_publish_project_model_revision_from_comparison(
  p_user_id uuid,
  p_comparison_id uuid
)
returns jsonb
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_comparison public.minds_project_source_comparisons%rowtype;
  v_ingestion public.minds_project_source_ingestions%rowtype;
  v_parent_id uuid;
  v_revision_id uuid;
  v_existing_id uuid;
  v_trigger_key text;
  v_elements integer:=0;
  v_variants integer:=0;
  v_perimeter jsonb:='[]'::jsonb;
begin
  select * into v_comparison
  from public.minds_project_source_comparisons
  where id=p_comparison_id and user_id=p_user_id and status='completed';

  if not found then raise exception 'completed_comparison_not_found'; end if;

  select * into v_ingestion
  from public.minds_project_source_ingestions
  where id=v_comparison.ingestion_id and user_id=p_user_id
    and project_id=v_comparison.project_id and status='completed';

  if not found then raise exception 'completed_ingestion_not_found'; end if;

  v_trigger_key:='source_comparison:'||v_comparison.id::text;

  perform pg_advisory_xact_lock(hashtextextended(v_comparison.project_id::text,0));

  select id into v_existing_id
  from public.minds_project_model_revisions
  where user_id=p_user_id and project_id=v_comparison.project_id
    and trigger_key=v_trigger_key
  order by created_at desc limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'status','already_published',
      'revision_id',v_existing_id,
      'trigger_key',v_trigger_key
    );
  end if;

  select id into v_parent_id
  from public.minds_project_model_revisions
  where user_id=p_user_id and project_id=v_comparison.project_id
    and status='current'
  order by created_at desc limit 1
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_class',p.source_class,
    'observation_mode',p.observation_mode,
    'readability',p.readability,
    'coverage',p.coverage,
    'freshness_minutes',p.freshness_minutes,
    'last_checked_at',p.last_checked_at,
    'last_seen_at',p.last_seen_at
  ) order by p.source_class),'[]'::jsonb)
  into v_perimeter
  from public.minds_project_perimeter p
  where p.user_id=p_user_id and p.project_id=v_comparison.project_id;

  insert into public.minds_project_model_revisions(
    user_id,project_id,parent_revision_id,trigger_kind,trigger_key,reason,status,
    coverage_snapshot,metadata
  ) values (
    p_user_id,v_comparison.project_id,v_parent_id,'source',v_trigger_key,
    'Source comparison '||v_comparison.id::text,
    'draft',
    jsonb_build_object(
      'comparison',coalesce(v_comparison.metadata->'coverage','{}'::jsonb),
      'perimeter',v_perimeter
    ),
    jsonb_build_object(
      'writer_version','project_model_revision_v01',
      'comparison_id',v_comparison.id,
      'ingestion_id',v_ingestion.id,
      'source_kind',v_ingestion.source_kind,
      'source_ref',v_ingestion.source_ref,
      'source_version',v_ingestion.source_version,
      'baseline_fingerprint',v_comparison.baseline_fingerprint,
      'authority_mutation',false
    )
  )
  returning id into v_revision_id;

  -- Referent identity is useful for navigation but remains an inferred model element.
  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'referent',r.id::text,'inferred',
    jsonb_build_object('status',r.status,'provenance',r.provenance)
  from public.minds_project_referents r
  where r.user_id=p_user_id and r.project_id=v_comparison.project_id and r.status='active'
  on conflict do nothing;
  get diagnostics v_elements=row_count;

  -- Claim authority is projected, never changed: confirmed -> accepted; proposed/disputed -> inferred.
  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'claim',c.id::text,
    case when c.status='confirmed' then 'accepted' else 'inferred' end,
    jsonb_build_object(
      'claim_status',c.status,
      'author_kind',c.author_kind,
      'provenance_class',c.provenance_class,
      'model_kind',c.model_kind
    )
  from public.minds_work_claims c
  where c.user_id=p_user_id and c.project_id=v_comparison.project_id
    and c.status in ('confirmed','proposed','disputed')
  on conflict do nothing;
  get diagnostics v_elements=v_elements+row_count;

  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'relation',r.id::text,
    case when r.status='confirmed' then 'accepted' else 'inferred' end,
    jsonb_build_object(
      'relation',r.relation,
      'relation_status',r.status,
      'author_kind',r.author_kind,
      'confidence',r.confidence
    )
  from public.minds_work_claim_relations r
  where r.user_id=p_user_id and r.project_id=v_comparison.project_id
    and r.status in ('proposed','confirmed')
  on conflict do nothing;
  get diagnostics v_elements=v_elements+row_count;

  -- Open canonical movements survive unrelated source updates because each revision re-projects them.
  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'movement',
    m.source_kind||':'||m.source_ref,'accepted',
    jsonb_build_object(
      'source_kind',m.source_kind,
      'source_ref',m.source_ref,
      'actor_kind',m.actor_kind,
      'status',m.status,
      'due_at',m.due_at,
      'anchor_kind',m.anchor_kind
    )
  from public.minds_project_movements_v1 m
  where m.user_id=p_user_id and m.project_id=v_comparison.project_id
    and m.status not in ('completed','archived','cancelled','failed','occurred','not_occurred','resolved','rejected')
  on conflict do nothing;
  get diagnostics v_elements=v_elements+row_count;

  -- Unclear comparison findings and unobserved/illegible perimeter are explicit gaps, not silently resolved.
  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'gap',
    'comparison_item:'||i.id::text,'gap',
    jsonb_build_object(
      'comparison_item_id',i.id,
      'source_claim_id',i.source_claim_id,
      'target_claim_id',i.target_claim_id,
      'verdict',i.verdict,
      'confidence',i.confidence
    )
  from public.minds_project_source_comparison_items i
  where i.user_id=p_user_id and i.project_id=v_comparison.project_id
    and i.comparison_id=v_comparison.id and i.verdict='unclear'
  on conflict do nothing;
  get diagnostics v_elements=v_elements+row_count;

  insert into public.minds_project_model_elements(
    user_id,project_id,revision_id,element_kind,element_ref,role,metadata
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,'gap',
    'perimeter:'||p.source_class,'gap',
    jsonb_build_object(
      'source_class',p.source_class,
      'observation_mode',p.observation_mode,
      'readability',p.readability,
      'coverage',p.coverage,
      'last_checked_at',p.last_checked_at
    )
  from public.minds_project_perimeter p
  where p.user_id=p_user_id and p.project_id=v_comparison.project_id
    and (
      p.observation_mode='unobserved'
      or p.readability in ('unreadable','unknown')
      or p.coverage in ('missing','unknown')
    )
  on conflict do nothing;
  get diagnostics v_elements=v_elements+row_count;

  -- Contradictions and modifications remain open alternatives; the writer does not choose a winner.
  insert into public.minds_project_model_variants(
    user_id,project_id,revision_id,comparison_item_id,variant_kind,status,
    source_claim_id,target_claim_id,confidence,rationale,provenance
  )
  select
    p_user_id,v_comparison.project_id,v_revision_id,i.id,
    case when i.verdict='contradicts' then 'contradiction' else 'modification' end,
    'open',i.source_claim_id,i.target_claim_id,i.confidence,i.rationale,
    jsonb_build_object(
      'class','project_model_variant',
      'comparison_id',v_comparison.id,
      'baseline_fingerprint',v_comparison.baseline_fingerprint,
      'authority_mutation',false
    )
  from public.minds_project_source_comparison_items i
  where i.user_id=p_user_id and i.project_id=v_comparison.project_id
    and i.comparison_id=v_comparison.id
    and i.verdict in ('contradicts','modifies')
    and i.target_claim_id is not null
  on conflict do nothing;
  get diagnostics v_variants=row_count;

  if v_parent_id is not null then
    update public.minds_project_model_revisions
    set status='superseded'
    where id=v_parent_id and user_id=p_user_id and status='current';
  end if;

  update public.minds_project_model_revisions
  set status='current',published_at=now()
  where id=v_revision_id and user_id=p_user_id and status='draft';

  return jsonb_build_object(
    'status','published',
    'revision_id',v_revision_id,
    'parent_revision_id',v_parent_id,
    'trigger_key',v_trigger_key,
    'element_count',v_elements,
    'variant_count',v_variants,
    'authority_mutation',false
  );
end $$;

revoke all on function public.minds_publish_project_model_revision_from_comparison(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.minds_publish_project_model_revision_from_comparison(uuid,uuid)
  to service_role;


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
  v_revision_id uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select jsonb_build_object('id',p.id,'name',p.name,'client_key',p.client_key)
  into v_project
  from public.isabella_projects p
  where p.id=p_project_id and p.user_id=v_uid and p.archived=false;

  if v_project is null then raise exception 'project_not_found' using errcode='P0002'; end if;

  select r.id,to_jsonb(r) into v_revision_id,v_revision
  from public.minds_project_model_revisions r
  where r.user_id=v_uid and r.project_id=p_project_id and r.status='current'
  order by r.created_at desc limit 1;

  select jsonb_build_object(
    'project',v_project,
    'current_revision',v_revision,
    'revision_elements',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.element_kind,x.role,x.element_ref)
      from (
        select element_kind,element_ref,role,note,metadata,created_at
        from public.minds_project_model_elements
        where user_id=v_uid and project_id=p_project_id and revision_id=v_revision_id
        order by element_kind,role,element_ref
        limit 800
      ) x
    ),'[]'::jsonb),
    'variants',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at,x.id)
      from (
        select id,variant_kind,status,source_claim_id,target_claim_id,confidence,rationale,
               comparison_item_id,provenance,created_at,resolved_at
        from public.minds_project_model_variants
        where user_id=v_uid and project_id=p_project_id and revision_id=v_revision_id
          and status<>'retired'
        order by created_at,id
        limit 180
      ) x
    ),'[]'::jsonb),
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
