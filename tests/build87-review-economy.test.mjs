import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261008224500_review_debt_v01.sql');
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
  assert.ok(migration.includes("'low'::text"));
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
