import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261008224500_review_debt_v01.sql');
const batching=read('supabase/migrations/20261008232000_review_batching_expiry_v01.sql');
const heartbeat=read('supabase/functions/isabella-heartbeat/index.ts');
const routing=read('supabase/migrations/20261008234500_review_routing_v01.sql');
const admission=read('supabase/migrations/20261009001500_review_admission_v01.sql');
const chat=read('supabase/functions/isabella-chat/index.ts');
const fast=read('supabase/functions/isabella-fast-stream/index.ts');
const build=read('BUILD-87.md');

test('Build 87.1 review debt is a projection over existing canonical stores',()=>{
  assert.ok(migration.includes('create or replace view public.minds_review_debt_v1'));
  for(const table of [
    'public.minds_shadow_decisions',
    'public.minds_operating_model_hypotheses',
    'public.minds_skill_proposals',
    'public.minds_work_claims',
    'public.minds_project_model_variants'
  ])assert.ok(migration.includes(table));
  assert.ok(migration.includes("where s.status='pending'"));
  assert.ok(migration.includes("where h.status='proposed'"));
  assert.ok(migration.includes("where sp.status='proposed'"));
  assert.ok(migration.includes("where wc.status='proposed'"));
  assert.ok(migration.includes("where v.status='open'"));
});

test('Build 87.1 classification is explicit consequence plus reversibility, not an opaque score',()=>{
  assert.ok(migration.includes("'behavior_rule'::text"));
  assert.ok(migration.includes("'project_truth'::text"));
  assert.ok(migration.includes("'project_interpretation'::text"));
  assert.ok(migration.includes("'state_change'"));
  assert.ok(migration.includes("'high'::text"));
  assert.ok(migration.includes("'medium'::text"));
  assert.ok(migration.includes("else 'low'"));
  assert.ok(migration.includes("'scoring','none'"));
  assert.ok(build.includes('Review debt is measured in transparent pending items and age, not a global opaque score.'));
});

test('Build 87.1 summary exposes transparent counts and age bands',()=>{
  assert.ok(migration.includes('function public.minds_review_debt_summary()'));
  assert.ok(migration.includes("'older_than_24h'"));
  assert.ok(migration.includes("'older_than_7d'"));
  assert.ok(migration.includes("'oldest_created_at'"));
  assert.ok(migration.includes("'by_consequence'"));
  assert.ok(migration.includes("'by_class'"));
});

test('Build 87.1 cannot accept reject expire or otherwise mutate review authority',()=>{
  const lower=migration.toLowerCase();
  assert.equal(/\binsert\s+into\s+public\./.test(lower),false);
  assert.equal(/\bupdate\s+public\./.test(lower),false);
  assert.equal(/\bdelete\s+from\s+public\./.test(lower),false);
  assert.ok(migration.includes("'authority_changed',false"));
  assert.ok(build.includes('Do not move, accept, reject or expire anything in this slice.'));
});


test('Build 87.2 batching is deterministic and limited to cheap reversible create proposals',()=>{
  assert.ok(batching.includes('create or replace view public.minds_review_queue_v2'));
  assert.ok(batching.includes("d.metadata->>'proposal_kind' in ('task','event')"));
  assert.ok(batching.includes("d.metadata->>'action' in ('create_task','create_event')"));
  assert.ok(batching.includes("d.consequence='low'"));
  assert.ok(batching.includes("d.reversibility='high'"));
  assert.ok(batching.includes("'batch_v1'"));
  assert.ok(batching.includes("case when coalesce((d.metadata->'context'->>'direct_request')::boolean,false) then 'direct' else 'inferred' end"));
  assert.ok(batching.includes('create or replace view public.minds_review_batches_v1'));
  assert.ok(batching.includes('having count(*)>=2'));
});

test('Build 87.2 batching excludes tainted and recurring proposals',()=>{
  assert.ok(batching.includes("source_tainted"));
  assert.ok(batching.includes("recurrence"));
  assert.ok(build.includes('source-tainted or recurring proposals never batch'));
});

test('Build 87.2 expires only stale reversible task/event shadow decisions',()=>{
  assert.ok(batching.includes('function public.minds_expire_review_items'));
  assert.ok(batching.includes("q.item_kind='shadow_decision'"));
  assert.ok(batching.includes("q.expiry_policy='stale_reversible_shadow_v1'"));
  assert.ok(batching.includes("s.status='pending'"));
  assert.ok(batching.includes("status='expired'"));
  assert.ok(batching.includes("d.created_at + interval '24 hours'"));
  assert.ok(batching.includes("d.created_at + interval '7 days'"));
  assert.ok(batching.includes("((d.metadata->'candidate'->>'date')::date + interval '1 day')"));
  assert.ok(batching.includes("'authority_changed',false"));
});

test('Build 87.2 age never expires authority, accepted-rule, project-truth or contradiction reviews',()=>{
  assert.ok(batching.includes("d.item_kind in ('operating_hypothesis','project_claim','project_variant')"));
  assert.ok(batching.includes("('permission','permission_change','commitment','work_claim','claim')"));
  const fn=batching.slice(batching.indexOf('create or replace function public.minds_expire_review_items'));
  assert.ok(!fn.includes('minds_operating_model_hypotheses'));
  assert.ok(!fn.includes('minds_work_claims'));
  assert.ok(!fn.includes('minds_project_model_variants'));
});

test('Build 87.2 expiry is deterministic heartbeat maintenance, not model authority',()=>{
  assert.ok(heartbeat.includes('minds_expire_review_items'));
  assert.ok(heartbeat.includes('review_economy_expiry'));
  assert.ok(batching.includes("grant execute on function public.minds_expire_review_items(uuid,timestamptz)"));
  assert.ok(batching.includes('to service_role'));
});

test('Build 87.2 summary exposes batching and expiry without an opaque score',()=>{
  assert.ok(batching.includes("'batchable_items'"));
  assert.ok(batching.includes("'compatible_batches'"));
  assert.ok(batching.includes("'expirable_items'"));
  assert.ok(batching.includes("'protected_items'"));
  assert.ok(batching.includes("'scoring','none'"));
});


test('Build 87.3 separates authority boundary, bounded change and cheap reversible review lanes',()=>{
  assert.ok(routing.includes('create or replace view public.minds_review_routing_v1'));
  assert.ok(routing.includes("'authority_boundary'"));
  assert.ok(routing.includes("'bounded_change'"));
  assert.ok(routing.includes("'cheap_reversible'"));
  assert.ok(routing.includes("q.review_class in ('authority','project_truth','behavior_rule','delegation')"));
});

test('Build 87.3 interruption is reserved for a real blocking dependency',()=>{
  assert.ok(routing.includes('dependency_blocking'));
  assert.ok(routing.includes("'requires_user',q.dependency_blocking"));
  assert.ok(routing.includes("when 'review_required' then v_route:='briefing'"));
  assert.ok(routing.includes("when 'review_window_closing' then v_route:='ambient'"));
  assert.ok(routing.includes("v_silent:=q.review_lane='cheap_reversible'"));
});

test('Build 87.3 delegates final delivery route to Attention Economy without review mutation',()=>{
  assert.ok(routing.includes('v_attention:=public.minds_route_attention(v_uid,v_candidate)'));
  assert.ok(routing.includes("'authority_changed',false"));
  const decision=routing.slice(routing.indexOf('create or replace function public.minds_review_attention_decision'));
  assert.equal(/\bupdate\s+public\.minds_(shadow_decisions|work_claims|operating_model_hypotheses|project_model_variants)/i.test(decision),false);
  assert.equal(/\binsert\s+into\s+public\.minds_(shadow_decisions|work_claims|operating_model_hypotheses|project_model_variants)/i.test(decision),false);
});

test('Build 87.3 authority review does not become an interrupt merely because it is important',()=>{
  assert.ok(routing.includes("when 'review_required' then v_route:='briefing';v_reason:='review_required'"));
  assert.ok(routing.includes("when 'review_window_closing' then v_route:='ambient';v_reason:='review_window_closing'"));
  assert.ok(build.includes('Authority-boundary review routes to briefing by default'));
});


test('Build 87.4 admission is an audit receipt layer, not another proposal store',()=>{
  assert.ok(admission.includes('create table if not exists public.minds_review_admission_events'));
  assert.ok(admission.includes("outcome in ('admitted','duplicate','suppressed')"));
  assert.ok(admission.includes('existing_decision_id uuid null references public.minds_shadow_decisions'));
  assert.ok(!admission.includes('candidate jsonb not null'));
});

test('Build 87.4 semantic duplicate suppression is limited to one agent run',()=>{
  assert.ok(admission.includes("s.context->>'run_id'=v_run_id"));
  assert.ok(admission.includes("'same_run_semantic_duplicate'"));
  assert.ok(admission.includes("status='pending'"));
  assert.ok(admission.includes('admission_fingerprint'));
  assert.ok(build.includes('later turns remain new user acts and are never silently swallowed'));
});

test('Build 87.4 only suppresses provable no-op task state changes',()=>{
  assert.ok(admission.includes("v_action in ('complete_task','archive_task')"));
  assert.ok(admission.includes("completed_at is not null"));
  assert.ok(admission.includes("archived_at is not null"));
  assert.ok(admission.includes("'task_already_completed'"));
  assert.ok(admission.includes("'task_already_archived'"));
  const fn=admission.slice(admission.indexOf('create or replace function public.minds_admit_shadow_decision'));
  assert.ok(!fn.includes('minds_operating_model_hypotheses'));
  assert.ok(!fn.includes('minds_work_claims'));
  assert.ok(!fn.includes('minds_project_model_variants'));
});

test('Build 87.4 full and fast Isabella respect admission before surfacing review',()=>{
  assert.ok(chat.includes('minds_admit_shadow_decision'));
  assert.ok(chat.includes('status:"no_review_needed"'));
  assert.ok(chat.includes('proposalForReview'));
  assert.ok(fast.includes('minds_admit_shadow_decision'));
  assert.ok(fast.includes('review_suppressed'));
});

test('Build 87.4 suppression is inspectable, reversible and authority-neutral',()=>{
  assert.ok(admission.includes("'reissue_if_state_changes',true"));
  assert.ok(admission.includes("'authority_changed',false"));
  assert.ok(build.includes('Suppression never applies to permission, Project Claim, Project Variant, operating-rule'));
});
