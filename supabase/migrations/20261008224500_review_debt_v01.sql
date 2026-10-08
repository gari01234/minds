-- Build 87.1 — Review Debt Ledger.
-- This is a read-only projection over existing canonical review/proposal stores.
-- It measures pending human judgment without granting authority or creating a second proposal database.

create or replace view public.minds_review_debt_v1
with (security_invoker=true)
as
select
  s.user_id,
  'shadow_decision'::text as item_kind,
  s.id as item_id,
  left(coalesce(nullif(s.candidate->>'title',''),nullif(s.candidate->>'statement',''),replace(s.action,'_',' ')),500) as title,
  case
    when s.proposal_kind='commitment' then 'delegation'
    when s.proposal_kind in ('permission','permission_change') then 'authority'
    when s.proposal_kind in ('work_claim','claim') then 'project_truth'
    when s.proposal_kind in ('skill','skill_proposal') then 'procedure'
    when s.proposal_kind in ('standing_intent','expectation') then 'future_state'
    else 'state_change'
  end as review_class,
  case
    when s.proposal_kind in ('permission','permission_change','commitment','work_claim','claim') then 'high'
    when s.proposal_kind in ('standing_intent','expectation','skill','skill_proposal') then 'medium'
    else 'low'
  end as consequence,
  case
    when s.proposal_kind in ('permission','permission_change') then 'low'
    when s.proposal_kind in ('commitment','work_claim','claim') then 'medium'
    else 'high'
  end as reversibility,
  s.created_at,
  extract(epoch from (now()-s.created_at))/3600.0 as age_hours,
  null::timestamptz as expires_at,
  s.status as source_status,
  jsonb_build_object(
    'proposal_kind',s.proposal_kind,
    'action',s.action,
    'policy_mode',s.policy_mode,
    'request_id',s.request_id,
    'candidate',s.candidate,
    'context',s.context
  ) as metadata
from public.minds_shadow_decisions s
where s.status='pending'

union all

select
  h.user_id,
  'operating_hypothesis'::text,
  h.id,
  left(h.statement,500),
  'behavior_rule'::text,
  'high'::text,
  'medium'::text,
  h.proposed_at,
  extract(epoch from (now()-h.proposed_at))/3600.0,
  null::timestamptz,
  h.status,
  jsonb_build_object(
    'dimension',h.dimension,
    'claim_type',h.claim_type,
    'inference_kind',h.inference_kind,
    'pattern_key',h.pattern_key,
    'rationale',h.rationale,
    'evidence_summary',h.evidence_summary
  )
from public.minds_operating_model_hypotheses h
where h.status='proposed'

union all

select
  sp.user_id,
  'skill_proposal'::text,
  sp.id,
  left(sp.name,500),
  'procedure'::text,
  'medium'::text,
  'high'::text,
  sp.created_at,
  extract(epoch from (now()-sp.created_at))/3600.0,
  null::timestamptz,
  sp.status,
  jsonb_build_object(
    'slug',sp.slug,
    'agent',sp.agent,
    'description',sp.description,
    'preferred_tools',to_jsonb(sp.preferred_tools),
    'evidence',sp.evidence
  )
from public.minds_skill_proposals sp
where sp.status='proposed'

union all

select
  wc.user_id,
  'project_claim'::text,
  wc.id,
  left(wc.statement,500),
  'project_truth'::text,
  'high'::text,
  'medium'::text,
  wc.created_at,
  extract(epoch from (now()-wc.created_at))/3600.0,
  null::timestamptz,
  wc.status,
  jsonb_build_object(
    'project_id',wc.project_id,
    'claim_type',wc.claim_type,
    'provenance_class',wc.provenance_class,
    'author_kind',wc.author_kind,
    'model_kind',wc.model_kind,
    'confidence',wc.confidence
  )
from public.minds_work_claims wc
where wc.status='proposed'

union all

select
  v.user_id,
  'project_variant'::text,
  v.id,
  left(coalesce(v.rationale,v.variant_kind),500),
  'project_interpretation'::text,
  'medium'::text,
  'high'::text,
  v.created_at,
  extract(epoch from (now()-v.created_at))/3600.0,
  null::timestamptz,
  v.status,
  jsonb_build_object(
    'project_id',v.project_id,
    'revision_id',v.revision_id,
    'variant_kind',v.variant_kind,
    'source_claim_id',v.source_claim_id,
    'target_claim_id',v.target_claim_id,
    'confidence',v.confidence,
    'provenance',v.provenance
  )
from public.minds_project_model_variants v
where v.status='open';

grant select on public.minds_review_debt_v1 to authenticated;

create or replace function public.minds_review_debt_summary()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with q as (
  select * from public.minds_review_debt_v1 where user_id=auth.uid()
), by_consequence as (
  select consequence,count(*) n from q group by consequence
), by_class as (
  select review_class,count(*) n from q group by review_class
)
select jsonb_build_object(
  'total',(select count(*) from q),
  'high',(select count(*) from q where consequence='high'),
  'medium',(select count(*) from q where consequence='medium'),
  'low',(select count(*) from q where consequence='low'),
  'older_than_24h',(select count(*) from q where age_hours>=24),
  'older_than_7d',(select count(*) from q where age_hours>=168),
  'oldest_created_at',(select min(created_at) from q),
  'by_consequence',coalesce((select jsonb_object_agg(consequence,n) from by_consequence),'{}'::jsonb),
  'by_class',coalesce((select jsonb_object_agg(review_class,n) from by_class),'{}'::jsonb),
  'scoring','none',
  'authority_changed',false
);
$$;

grant execute on function public.minds_review_debt_summary() to authenticated;