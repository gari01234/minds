import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const v01=read('supabase/migrations/20261003091752_counterfactual_isabella_v01.sql');
const v011=read('supabase/migrations/20261003091841_counterfactual_isabella_v011_pending_hardening.sql');
const app=read('apps/isabella/app.js');

test('Build 75 counterfactual is read-only, exact-scope and score-free',()=>{
  const all=v01+'\n'+v011;
  assert.ok(all.includes('security invoker'));
  assert.ok(all.includes("p_action<>'create_task'"));
  assert.ok(all.includes("'fast_task_undated_v1','fast_task_dated_v1'"));
  assert.ok(all.includes("d.user_id=u"));
  assert.ok(all.includes("d.context->'autonomy_class'->>'context_key'=p_context_key"));
  assert.ok(all.includes("d.context->'autonomy_class'->>'scope_key'=p_scope_key"));
  assert.ok(all.includes("d.created_at>=now()-interval '30 days'"));
  assert.ok(!all.includes('insert into public.isabella_tasks'));
  assert.ok(!all.includes('update public.minds_contextual_permissions'));
  assert.ok(!all.includes('insert into public.minds_permission_reviews'));
  assert.ok(!all.includes('insert into public.minds_autonomy_executions'));
  assert.ok(!all.match(/score/i));
});

test('Build 75 distinguishes accepted, corrected, rejected and unknown outcomes',()=>{
  assert.ok(v011.includes("'same_result_without_confirmation'"));
  assert.ok(v011.includes("'would_act_before_correction'"));
  assert.ok(v011.includes("'would_act_despite_rejection'"));
  assert.ok(v011.includes("'already_autonomous'"));
  assert.ok(v011.includes("else 'unknown'"));
  assert.ok(v011.includes("case when d.reviewed_candidate is null then '[]'::jsonb"));
});

test('Build 75 Human Surface keeps simulation separate from permission authority',()=>{
  assert.ok(app.includes('function contextualCounterfactualPanel(unit)'));
  assert.ok(app.includes("rpc('minds_preview_contextual_counterfactual'"));
  assert.ok(app.includes('Simulación, no permiso.'));
  assert.ok(app.includes('Ver qué habría pasado'));
  assert.ok(app.includes('No ejecuta nada ni cambia tus permisos.'));
  const start=app.indexOf('async function contextualCounterfactualPanel(unit)');
  const end=app.indexOf('function reviewContextualPermission',start);
  const previewBlock=app.slice(start,end);
  assert.ok(!previewBlock.includes('minds_review_contextual_permission'));
});
