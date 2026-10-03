import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261003073538_personal_operating_model_v01.sql');
const hardening=read('supabase/migrations/20261003084335_personal_operating_model_v011_hardening.sql');
const engine=read('supabase/functions/isabella-operating-model/index.ts');
const app=read('apps/isabella/app.js');
const ai=read('apps/isabella/ai.js');
const chat=read('supabase/functions/isabella-chat/index.ts');
const sql=read('supabase/tests/personal_operating_model.sql');

test('Build 74 separates observations, hypotheses, reviews and accepted rules',()=>{
  assert.ok(migration.includes('create table public.minds_operating_observations'));
  assert.ok(migration.includes('create table public.minds_operating_hypotheses'));
  assert.ok(migration.includes('create table public.minds_operating_reviews'));
  assert.ok(migration.includes("status text not null default 'hypothesis'"));
  assert.ok(migration.includes("status in ('hypothesis','proposed','accepted','rejected','retired')"));
  assert.ok(migration.includes('evidence_ids uuid[] not null'));
  assert.ok(migration.includes('accepted_statement text'));
  assert.ok(hardening.includes('minds_operating_one_active_dimension_idx'));
});

test('Build 74 never turns behavioral evidence directly into a rule',()=>{
  assert.ok(engine.includes('provenance_class:"behavioral"'));
  assert.ok(engine.includes('provenance_class:"explicit"'));
  assert.ok(engine.includes('provenance_class:"outcome"'));
  assert.ok(engine.includes('const explicit=rows.some'));
  assert.ok(engine.includes('rows.length>=2&&sources.size>=2'));
  assert.ok(engine.includes('Prefer no candidate over a weak candidate.'));
  assert.ok(engine.includes('Create operating rules, not personality labels or psychological claims.'));
  assert.ok(engine.includes('Never infer health, politics, religion, sexuality, finances, exact location, identity traits, motives or emotions.'));
  assert.ok(engine.includes('Each evidence_id must come from the observations of that same dimension.'));
});

test('Build 74 requires explicit user review before a hypothesis becomes accepted',()=>{
  assert.ok(migration.includes('p_confirmed is distinct from true'));
  assert.ok(migration.includes("p_decision not in ('accept','correct','reject','retire')"));
  assert.ok(hardening.includes('security invoker'));
  assert.ok(hardening.includes('minds_private.review_operating_hypothesis'));
  assert.ok(migration.includes("old.status='proposed' and new.status in ('accepted','rejected')"));
  assert.ok(migration.includes("old.status='accepted' and new.status='retired'"));
  assert.ok(sql.includes('TEST74 confirmation not required'));
  assert.ok(sql.includes('TEST74 corrected statement not preserved'));
  assert.ok(sql.includes('TEST74 review receipts missing'));
});

test('Build 74 exposes review in the existing personal-memory surface, not a new product section',()=>{
  assert.ok(app.includes('const operatingDimensionLabels='));
  assert.ok(app.includes('async function loadOperatingModel'));
  assert.ok(app.includes('async function refreshOperatingModel'));
  assert.ok(app.includes('async function reviewOperatingHypothesis'));
  assert.ok(app.includes("rpc('minds_get_personal_operating_model'"));
  assert.ok(app.includes("rpc('minds_review_operating_hypothesis'"));
  assert.ok(app.includes('Cómo trabajo'));
  assert.ok(app.includes('Confirmar'));
  assert.ok(app.includes('Corregir'));
  assert.ok(app.includes('Retirar'));
  assert.ok(!app.includes('data-action="personaloperatingmodel"'));
});

test('Build 74 sends only accepted operating rules into Isabella context',()=>{
  assert.ok(app.includes("accepted.map(x=>({dimension:String(x.dimension||''),statement:String(x.accepted_statement||x.statement||'').trim()}))"));
  assert.ok(app.includes('window.ISABELLA_OPERATING_RULES=accepted.map'));
  assert.ok(ai.includes('operating_rules:Array.isArray(window.ISABELLA_OPERATING_RULES)'));
  assert.ok(chat.includes('son reglas del Personal Operating Model que el usuario aceptó o corrigió explícitamente'));
  assert.ok(chat.includes('Las hipótesis no aceptadas nunca se envían aquí y no deben influir en tu comportamiento.'));
  assert.ok(chat.includes('No las conviertas en etiquetas de personalidad ni extrapoles rasgos, motivos o preferencias fuera de su formulación.'));
});

test('Build 74 keeps the model operational rather than psychological',()=>{
  assert.ok(migration.includes("'time_planning','task_management','focus','interruption'"));
  assert.ok(migration.includes("'decision_making','autonomy','interaction'"));
  assert.ok(engine.includes('A statement must say how Isabella should organize, interrupt, ask, plan, decide, or collaborate with the user.'));
  assert.ok(!migration.includes('personality_score'));
  assert.ok(!migration.includes('psychological_profile'));
  assert.ok(!migration.includes('global_user_score'));
});

test('Build 74 SQL contract proves user cannot manufacture the model directly',()=>{
  assert.ok(sql.includes("has_table_privilege('authenticated','public.minds_operating_hypotheses','INSERT')"));
  assert.ok(sql.includes("has_table_privilege('authenticated','public.minds_operating_observations','INSERT')"));
  assert.ok(sql.includes('TEST74 second active rule allowed in same dimension'));
  assert.ok(sql.includes('TEST74 dimension not released after retire'));
});
