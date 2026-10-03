import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const consolidated=read('supabase/migrations/20261003090435_personal_operating_model_v01.sql');
const v012=read('supabase/migrations/20261003090656_personal_operating_model_v012_consolidate.sql');
const v013=read('supabase/migrations/20261003090953_personal_operating_model_v013_review_hardening.sql');
const v014=read('supabase/migrations/20261003091317_personal_operating_model_v014_retire.sql');
const receipts=read('supabase/migrations/20261003092245_personal_operating_model_v015_review_receipts.sql');
const reconcile=read('supabase/migrations/20261003092332_personal_operating_model_v015_reconcile.sql');
const privateBoundary=read('supabase/migrations/20261003093343_personal_operating_model_v016_private_review_boundary.sql');
const engine=read('supabase/functions/isabella-operating-model/index.ts');
const app=read('apps/isabella/app.js');
const ai=read('apps/isabella/ai.js');
const chat=read('supabase/functions/isabella-chat/index.ts');
const sql=read('supabase/tests/personal_operating_model.sql');

test('Build 74 has one consolidated operating-model ontology',()=>{
  assert.ok(consolidated.includes('create table public.minds_operating_model_observations'));
  assert.ok(consolidated.includes('create table public.minds_operating_model_hypotheses'));
  assert.ok(consolidated.includes('create table public.minds_operating_model_evidence'));
  assert.ok(consolidated.includes('create table public.minds_operating_model_reviews'));
  assert.ok(v012.includes('minds_operating_model_observations'));
  assert.ok(v012.includes('minds_operating_model_hypotheses'));
  assert.ok(sql.includes('TEST74 legacy parallel ontology still exists'));
  assert.ok(!engine.includes('minds_operating_observations'));
  assert.ok(!engine.includes('minds_operating_hypotheses'));
  assert.ok(!engine.includes('minds_operating_reviews'));
});

test('Build 74 never turns observations directly into accepted rules',()=>{
  assert.ok(engine.includes('signal_type:"explicit_statement"'));
  assert.ok(engine.includes('signal_type:"pattern_summary"'));
  assert.ok(engine.includes('const explicit=rows.some(explicitObservation)'));
  assert.ok(engine.includes('rows.length>=2&&sources.size>=2'));
  assert.ok(engine.includes('Prefer no candidate over a weak candidate.'));
  assert.ok(engine.includes('Create operational collaboration rules, never personality labels or psychological claims.'));
  assert.ok(engine.includes('Never infer health, politics, religion, sexuality, finances, exact location, identity traits, motives or emotions.'));
  assert.ok(engine.includes('status:"proposed"'));
  assert.ok(engine.includes('requires_explicit_review:true'));
  assert.ok(!engine.includes('status:"accepted"'));
});

test('Build 74 review is explicit, idempotent and preserves review history',()=>{
  assert.ok(v013.includes('p_confirmed is distinct from true'));
  assert.ok(v013.includes('request_id'));
  assert.ok(v014.includes("'retire'"));
  assert.ok(receipts.includes('minds_model_claim_reviews'));
  assert.ok(reconcile.includes('minds_operating_model_reviews_hypothesis_idx'));
  assert.ok(reconcile.includes("h.status not in ('accepted','superseded')"));
  assert.ok(reconcile.includes("case when p_decision='correct' then 'replace' else p_decision end"));
  assert.ok(sql.includes('TEST74 confirmation not required'));
  assert.ok(sql.includes('TEST74 corrected statement not preserved'));
  assert.ok(sql.includes('TEST74 review receipts missing'));
  assert.ok(sql.includes('TEST74 retire failed'));
});

test('Build 74 exposes review in the existing personal-memory surface, not a new product section',()=>{
  assert.ok(app.includes('const operatingDimensionLabels='));
  assert.ok(app.includes("scheduling:'Planificación del tiempo'"));
  assert.ok(app.includes("work_rhythm:'Ritmo de trabajo'"));
  assert.ok(app.includes("communication:'Cómo colaboramos'"));
  assert.ok(app.includes('async function loadOperatingModel'));
  assert.ok(app.includes('async function refreshOperatingModel'));
  assert.ok(app.includes('async function reviewOperatingHypothesis'));
  assert.ok(app.includes("rpc('minds_get_personal_operating_model'"));
  assert.ok(app.includes("rpc('minds_review_operating_hypothesis'"));
  assert.ok(app.includes('Cómo trabajo'));
  assert.ok(app.includes('Corregir'));
  assert.ok(app.includes('Retirar'));
  assert.ok(!app.includes('data-action="personaloperatingmodel"'));
});

test('Build 74 sends only accepted or explicitly corrected operating rules into Isabella context',()=>{
  assert.ok(reconcile.includes("'accepted',coalesce(("));
  assert.ok(reconcile.includes("h.status in ('accepted','superseded')"));
  assert.ok(reconcile.includes("c.status='confirmed'"));
  assert.ok(app.includes("accepted.map(x=>({dimension:String(x.dimension||''),statement:String(x.accepted_statement||x.statement||'').trim()}))"));
  assert.ok(app.includes('window.ISABELLA_OPERATING_RULES=accepted.map'));
  assert.ok(ai.includes('operating_rules:Array.isArray(window.ISABELLA_OPERATING_RULES)'));
  assert.ok(chat.includes('son reglas del Personal Operating Model que el usuario aceptó o corrigió explícitamente'));
  assert.ok(chat.includes('Las hipótesis no aceptadas nunca se envían aquí y no deben influir en tu comportamiento.'));
  assert.ok(chat.includes('No las conviertas en etiquetas de personalidad ni extrapoles rasgos, motivos o preferencias fuera de su formulación.'));
});

test('Build 74 keeps the model operational rather than psychological',()=>{
  assert.ok(consolidated.includes("'scheduling','task_management','work_rhythm','interruptions'"));
  assert.ok(consolidated.includes("'planning','decision_style','communication','tooling','review'"));
  assert.ok(engine.includes('A statement must say how Isabella should organize, interrupt, ask, plan, decide or collaborate.'));
  assert.ok(!consolidated.includes('personality_score'));
  assert.ok(!consolidated.includes('psychological_profile'));
  assert.ok(!consolidated.includes('global_user_score'));
});

test('Build 74 SQL contract proves no direct client model manufacture and one active rule per dimension',()=>{
  assert.ok(sql.includes("has_table_privilege('authenticated','public.minds_operating_model_hypotheses','INSERT')"));
  assert.ok(sql.includes("has_table_privilege('authenticated','public.minds_operating_model_observations','INSERT')"));
  assert.ok(sql.includes('TEST74 second active rule allowed in same dimension'));
  assert.ok(sql.includes('TEST74 dimension not released after retire'));
  assert.ok(reconcile.includes('minds_operating_model_one_active_dimension_idx'));
});


test('Build 74 keeps privileged review logic out of the public schema',()=>{
  assert.ok(privateBoundary.includes('create or replace function minds_private.review_operating_model_hypothesis'));
  assert.ok(privateBoundary.includes('create or replace function minds_private.review_model_claim'));
  assert.ok(privateBoundary.includes('language sql security invoker'));
  assert.ok(privateBoundary.includes('select minds_private.review_operating_model_hypothesis'));
  assert.ok(privateBoundary.includes('select minds_private.review_model_claim'));
  assert.ok(privateBoundary.includes('p_confirmed is distinct from true'));
  assert.ok(privateBoundary.includes('auth.uid()'));
});
