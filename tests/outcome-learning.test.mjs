import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261003071804_outcome_learning_post_action_feedback_v01.sql');
const app=read('apps/isabella/app.js');
const sql=read('supabase/tests/outcome_learning.sql');

test('Build 73 treats post-action mutation as a candidate, never automatic causal feedback',()=>{
  assert.ok(migration.includes('create table public.minds_post_action_feedback_candidates'));
  assert.ok(migration.includes('create table public.minds_outcome_feedback'));
  assert.ok(migration.includes("new.source<>'manual'"));
  assert.ok(migration.includes("new.action not in ('update','delete')"));
  assert.ok(migration.includes("created_at>=new.created_at-interval '48 hours'"));
  assert.ok(migration.includes('on conflict(autonomy_execution_id) do nothing'));
  assert.ok(migration.includes("status text not null default 'pending'"));
  assert.ok(!migration.includes("new.action in ('complete'"));
});

test('Build 73 requires explicit user causal review and never lets service assert causality',()=>{
  assert.ok(migration.includes('p_confirmed is distinct from true'));
  assert.ok(migration.includes("p_outcome not in ('correction','later_change')"));
  assert.ok(migration.includes("if p_outcome='later_change' then"));
  assert.ok(migration.includes("status='not_causal'"));
  assert.ok(migration.includes("status='confirmed_correction'"));
  assert.ok(migration.includes("grant execute on function public.minds_review_post_action_feedback(uuid,text,text,boolean)\n to authenticated"));
  assert.ok(migration.includes("revoke all on function public.minds_review_post_action_feedback(uuid,text,text,boolean)\n from public,anon,authenticated,service_role"));
  assert.ok(!migration.includes('grant execute on function public.minds_review_post_action_feedback(uuid,text,text,boolean)\n to service_role'));
});

test('Build 73 can only reduce contextual autonomy after a confirmed correction',()=>{
  assert.ok(migration.includes("if found and p.mode='allow' then"));
  assert.ok(migration.includes("set mode='confirm'"));
  assert.ok(migration.includes('revision=revision+1'));
  assert.ok(migration.includes('expires_at=null'));
  assert.ok(migration.includes("'last_post_action_correction'"));
  assert.ok(migration.includes("when coalesce(c.corrections,0)>0 then 'needs_review'"));
  assert.ok(!migration.includes("set mode='allow'"));
});

test('Build 73 keeps ordinary completion and late edits out of causal learning',()=>{
  assert.ok(sql.includes("'complete','manual'"));
  assert.ok(sql.includes('completion classified as correction'));
  assert.ok(sql.includes("now()-interval '49 hours'"));
  assert.ok(sql.includes('stale edit classified as correction'));
  assert.ok(sql.includes("'later_change'"));
  assert.ok(sql.includes('later change created feedback'));
});

test('Build 73 exposes a human review inside Permissions without a new product surface',()=>{
  assert.ok(app.includes('function postActionCandidateHTML'));
  assert.ok(app.includes('async function reviewPostActionFeedback'));
  assert.ok(app.includes("rpc('minds_review_post_action_feedback'"));
  assert.ok(app.includes('Correcciones por revisar'));
  assert.ok(app.includes('Sí, fue una corrección'));
  assert.ok(app.includes('Fue un cambio posterior'));
  assert.ok(app.includes('Una edición posterior nunca se interpreta sola como feedback'));
  assert.ok(app.includes('Confirmar causalidad reduce el permiso a “volver a preguntar”'));
  assert.ok(!app.includes('data-action="outcomelearning"'));
});

test('Build 73 does not turn outcome feedback into memory or positive approval evidence',()=>{
  assert.ok(!migration.includes('isabella_memories'));
  assert.ok(!migration.includes('minds_memory'));
  assert.ok(!migration.includes('minds_append_commitment_workspace_item'));
  assert.ok(!migration.includes('minds_publish_attention'));
  assert.ok(migration.includes("'outcome_corrections'"));
  assert.ok(migration.includes("when coalesce(c.corrections,0)>0 then 'needs_review'"));
});
