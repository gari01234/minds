-- Build 84.3 — compare source-first Claims against the current project baseline.
-- Comparison is an inspectable inference layer. It may propose relations, but it never
-- confirms, disputes, supersedes or otherwise mutates Claim authority.

create table if not exists public.minds_project_source_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  ingestion_id uuid not null references public.minds_project_source_ingestions(id) on delete cascade,
  baseline_revision_id uuid null references public.minds_project_model_revisions(id) on delete set null,
  baseline_fingerprint text not null check (baseline_fingerprint ~ '^[0-9a-f]{64}$'),
  model text null,
  status text not null default 'completed' check (status in ('completed','failed')),
  compared_claim_count integer not null default 0 check (compared_claim_count>=0),
  relation_count integer not null default 0 check (relation_count>=0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  error text null,
  created_at timestamptz not null default now(),
  unique(user_id,project_id,ingestion_id,baseline_fingerprint)
);

create index if not exists minds_project_source_comparisons_project_idx
  on public.minds_project_source_comparisons(user_id,project_id,created_at desc);

create table if not exists public.minds_project_source_comparison_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  comparison_id uuid not null references public.minds_project_source_comparisons(id) on delete cascade,
  source_claim_id uuid not null references public.minds_work_claims(id) on delete cascade,
  target_claim_id uuid null references public.minds_work_claims(id) on delete set null,
  verdict text not null check (verdict in ('aligned','contradicts','modifies','adds','unclear')),
  confidence numeric not null default 0.7 check (confidence>=0 and confidence<=1),
  rationale text null check (rationale is null or length(rationale)<=1600),
  relation_id uuid null references public.minds_work_claim_relations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists minds_project_source_comparison_items_comparison_idx
  on public.minds_project_source_comparison_items(user_id,project_id,comparison_id,source_claim_id);

alter table public.minds_project_source_comparisons enable row level security;
alter table public.minds_project_source_comparison_items enable row level security;

drop policy if exists "project_source_comparisons_select_own" on public.minds_project_source_comparisons;
create policy "project_source_comparisons_select_own" on public.minds_project_source_comparisons
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists "project_source_comparison_items_select_own" on public.minds_project_source_comparison_items;
create policy "project_source_comparison_items_select_own" on public.minds_project_source_comparison_items
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_project_source_comparisons,public.minds_project_source_comparison_items
  from anon,authenticated;
grant select on public.minds_project_source_comparisons,public.minds_project_source_comparison_items
  to authenticated;
grant select,insert,update,delete on public.minds_project_source_comparisons,public.minds_project_source_comparison_items
  to service_role;

create or replace function public.minds_commit_project_source_comparison(
  p_user_id uuid,
  p_project_id uuid,
  p_ingestion_id uuid,
  p_baseline_revision_id uuid,
  p_baseline_fingerprint text,
  p_model text,
  p_coverage jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_ingestion public.minds_project_source_ingestions%rowtype;
  v_comparison public.minds_project_source_comparisons%rowtype;
  v_item jsonb;
  v_source uuid;
  v_target uuid;
  v_verdict text;
  v_relation text;
  v_relation_id uuid;
  v_conf numeric;
  v_rationale text;
  v_count integer:=0;
  v_relations integer:=0;
begin
  if p_baseline_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_baseline_fingerprint';
  end if;

  select * into v_ingestion
  from public.minds_project_source_ingestions
  where id=p_ingestion_id and user_id=p_user_id and project_id=p_project_id
    and status='completed';

  if not found then raise exception 'completed_ingestion_not_found'; end if;

  if p_baseline_revision_id is not null and not exists (
    select 1 from public.minds_project_model_revisions r
    where r.id=p_baseline_revision_id and r.user_id=p_user_id and r.project_id=p_project_id
  ) then raise exception 'baseline_revision_mismatch'; end if;

  select * into v_comparison
  from public.minds_project_source_comparisons
  where user_id=p_user_id and project_id=p_project_id
    and ingestion_id=p_ingestion_id and baseline_fingerprint=p_baseline_fingerprint;

  if found and v_comparison.status='completed' then
    return jsonb_build_object(
      'status','already_compared',
      'comparison_id',v_comparison.id,
      'compared_claim_count',v_comparison.compared_claim_count,
      'relation_count',v_comparison.relation_count,
      'baseline_fingerprint',v_comparison.baseline_fingerprint
    );
  end if;

  insert into public.minds_project_source_comparisons(
    user_id,project_id,ingestion_id,baseline_revision_id,baseline_fingerprint,model,status
  ) values (
    p_user_id,p_project_id,p_ingestion_id,p_baseline_revision_id,p_baseline_fingerprint,
    nullif(trim(coalesce(p_model,'')),''),'completed'
  )
  on conflict (user_id,project_id,ingestion_id,baseline_fingerprint)
  do update set
    baseline_revision_id=excluded.baseline_revision_id,
    model=excluded.model,
    status='completed',
    error=null
  returning * into v_comparison;

  delete from public.minds_project_source_comparison_items
  where comparison_id=v_comparison.id and user_id=p_user_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    begin v_source=(v_item->>'source_claim_id')::uuid;
    exception when others then continue; end;

    if not exists (
      select 1 from public.minds_work_claims c
      where c.id=v_source and c.user_id=p_user_id and c.project_id=p_project_id
        and c.metadata->>'ingestion_id'=p_ingestion_id::text
    ) then continue; end if;

    v_target:=null;
    begin
      if nullif(trim(coalesce(v_item->>'target_claim_id','')),'') is not null then
        v_target=(v_item->>'target_claim_id')::uuid;
      end if;
    exception when others then v_target:=null; end;

    if v_target is not null and not exists (
      select 1 from public.minds_work_claims c
      where c.id=v_target and c.user_id=p_user_id and c.project_id=p_project_id
        and c.id<>v_source
        and coalesce(c.metadata->>'ingestion_id','')<>p_ingestion_id::text
    ) then v_target:=null; end if;

    v_verdict:=lower(trim(coalesce(v_item->>'verdict','unclear')));
    if v_verdict not in ('aligned','contradicts','modifies','adds','unclear') then
      v_verdict:='unclear';
    end if;
    if v_target is null and v_verdict in ('aligned','contradicts','modifies') then
      v_verdict:='unclear';
    end if;

    begin v_conf:=greatest(0,least(1,coalesce((v_item->>'confidence')::numeric,0.7)));
    exception when others then v_conf:=0.7; end;
    v_rationale:=nullif(left(trim(coalesce(v_item->>'rationale','')),1600),'');

    v_relation:=case v_verdict
      when 'aligned' then 'supports'
      when 'contradicts' then 'contradicts'
      when 'modifies' then 'qualifies'
      else null
    end;
    v_relation_id:=null;

    if v_relation is not null and v_target is not null then
      select id into v_relation_id
      from public.minds_work_claim_relations
      where user_id=p_user_id and project_id=p_project_id
        and source_claim_id=v_source and target_claim_id=v_target
        and relation=v_relation and status in ('proposed','confirmed')
      order by created_at desc limit 1;

      if v_relation_id is null then
        insert into public.minds_work_claim_relations(
          user_id,project_id,source_claim_id,target_claim_id,relation,status,
          author_kind,confidence,provenance
        ) values (
          p_user_id,p_project_id,v_source,v_target,v_relation,'proposed',
          'isabella',v_conf,
          jsonb_build_object(
            'class','project_source_comparison',
            'comparison_id',v_comparison.id,
            'ingestion_id',p_ingestion_id,
            'baseline_revision_id',p_baseline_revision_id,
            'baseline_fingerprint',p_baseline_fingerprint,
            'model',p_model
          )
        ) returning id into v_relation_id;
        v_relations:=v_relations+1;
      end if;
    end if;

    insert into public.minds_project_source_comparison_items(
      user_id,project_id,comparison_id,source_claim_id,target_claim_id,
      verdict,confidence,rationale,relation_id
    ) values (
      p_user_id,p_project_id,v_comparison.id,v_source,v_target,
      v_verdict,v_conf,v_rationale,v_relation_id
    );
    v_count:=v_count+1;
  end loop;

  update public.minds_project_source_comparisons
  set compared_claim_count=v_count,relation_count=v_relations,
      metadata=jsonb_build_object(
        'comparison_is_inference',true,
        'changes_claim_authority',false,
        'coverage',case when jsonb_typeof(p_coverage)='object' then p_coverage else '{}'::jsonb end
      )
  where id=v_comparison.id
  returning * into v_comparison;

  return jsonb_build_object(
    'status','completed',
    'comparison_id',v_comparison.id,
    'compared_claim_count',v_count,
    'relation_count',v_relations,
    'baseline_fingerprint',p_baseline_fingerprint
  );
end $$;

revoke all on function public.minds_commit_project_source_comparison(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.minds_commit_project_source_comparison(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb)
  to service_role;
