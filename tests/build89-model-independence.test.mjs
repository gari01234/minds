import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261009072000_model_independence_ledger_v01.sql');
const runner=read('supabase/functions/isabella-model-independence-runner/index.ts');
const adapter=read('supabase/functions/_shared/constitutional-state.ts');
const config=read('supabase/config.toml');
const build=read('BUILD-89.md');
const report=read('BUILD-89-REPORT.md');

test('Build 89.1 experiment ledger freezes models policy version hashes and exact input',()=>{
  assert.ok(migration.includes('create table if not exists public.minds_model_independence_runs'));
  assert.ok(migration.includes('relationship_policy_version text not null'));
  assert.ok(migration.includes('relationship_policy_hash text not null'));
  assert.ok(migration.includes('input_hash text not null'));
  assert.ok(migration.includes('input_snapshot jsonb not null'));
  assert.ok(migration.includes("experiment_kind in ('model_swap','cold_reconstruction')"));
  assert.ok(migration.includes('grant select on public.minds_model_independence_runs to authenticated'));
  assert.ok(!migration.includes('grant insert on public.minds_model_independence_runs to authenticated'));
});

test('Build 89.1 runner is secret-gated and not an authenticated product capability',()=>{
  assert.ok(config.includes('[functions.isabella-model-independence-runner]'));
  assert.ok(config.includes('verify_jwt = false'));
  assert.ok(runner.includes('model_independence_runner'));
  assert.ok(runner.includes('String(body?.secret||"")!==String(secret.value)'));
  assert.ok(!runner.includes('Authorization: Bearer '+ ''));
});

test('Build 89.2 compares Luna and Astra under one exact Relationship Contract',()=>{
  assert.ok(runner.includes('"gpt-5.6-luna"'));
  assert.ok(runner.includes('"gpt-6-astra"'));
  assert.ok(runner.includes('relationshipPolicy("conversation")'));
  assert.ok(runner.includes('ISABELLA_RELATIONSHIP_POLICY_VERSION'));
  assert.ok(runner.includes('relationship_policy_hash_drift'));
  assert.ok(runner.includes('const a=await callModel'));
  assert.ok(runner.includes('const b=await callModel'));
});

test('Build 89.2 evaluator is deterministic and does not use a third model as judge',()=>{
  assert.ok(runner.includes('deterministic_evaluator:"exact_contract_v01"'));
  assert.ok(runner.includes('Object.keys(expected).filter'));
  assert.ok(runner.includes('both_preserve_all_hard_invariants'));
  assert.ok(runner.includes('agreement_rate'));
  assert.equal((runner.match(/await callModel\(/g)||[]).length,2);
});

test('Build 89.2 probe covers authority provenance time scope and relationship boundaries',()=>{
  for(const id of ['MI01','MI02','MI03','MI04','MI05','MI06','MI07','MI08','MI09','MI10','MI11'])assert.ok(runner.includes(id));
  assert.ok(runner.includes('due_unconfirmed'));
  assert.ok(runner.includes('generated_artifact'));
  assert.ok(runner.includes('ask_permission'));
  assert.ok(runner.includes('acknowledge_own_error'));
  assert.ok(runner.includes('close_disagreement'));
  assert.ok(runner.includes('accept_small_delegation'));
});

test('Build 89 experiment output cannot mutate MINDS authority or memory',()=>{
  assert.ok(build.includes('Experiment outputs are observations'));
  assert.ok(!runner.includes('minds_action_policies'));
  assert.ok(!runner.includes('isabella_memories'));
  assert.ok(!runner.includes('minds_work_claims'));
  assert.ok(!runner.includes('minds_permissions'));
});


test('Build 89.3 cold reconstruction hides the current Project Model and freezes exact Sources',()=>{
  assert.ok(runner.includes('const COLD_FIXTURE_VERSION="cold-reconstruction-v0.1"'));
  assert.ok(runner.includes('project_model_hidden:true'));
  for(const id of ['SRC1','SRC2','SRC3','SRC4','SRC5','SRC6'])assert.ok(runner.includes(id));
  assert.ok(runner.includes('The current Project Model is hidden'));
  assert.ok(runner.includes('Use only the supplied Sources.'));
});

test('Build 89.3 reconstructs Claims relations Movements Variants and gaps with deterministic expectations',()=>{
  assert.ok(runner.includes('function coldFixture'));
  assert.ok(runner.includes('function evaluateCold'));
  assert.ok(runner.includes('cold_structure_exact_v01'));
  assert.ok(runner.includes('C_ATTIKA_OPEN'));
  assert.ok(runner.includes('C_ATTIKA_120'));
  assert.ok(runner.includes('M_TWP_REVIEW'));
  assert.ok(runner.includes('M_CLARIFY_ATTIKA'));
  assert.ok(runner.includes('V_ATTIKA'));
  assert.ok(runner.includes('G_FACHPLANER_ACCEPTANCE'));
  assert.ok(runner.includes('G_ATTIKA_FINAL_VALUE'));
});

test('Build 89.3 preserves uncertainty and authority boundaries under cold reconstruction',()=>{
  assert.ok(runner.includes('authority_mutation:false'));
  assert.ok(runner.includes('absence of acceptance evidence is a gap'));
  assert.ok(runner.includes('later contradictory Source does not silently delete the earlier Claim'));
  assert.ok(runner.includes('A requested external review is an expectation of the world'));
  assert.ok(runner.includes('Gari\'s explicit preparation item is a task owned by Gari'));
  assert.ok(!runner.includes('minds_publish_project_model_revision_from_comparison'));
});

test('Build 89.3 runs both model families against one frozen cold fixture',()=>{
  assert.ok(runner.includes('action==="acceptance_cold_reconstruction"'));
  assert.ok(runner.includes('experiment_kind:"cold_reconstruction"'));
  assert.ok(runner.includes('const a=await callColdModel'));
  assert.ok(runner.includes('const b=await callColdModel'));
  assert.ok(runner.includes('both_preserve_all_structural_invariants'));
  assert.ok(runner.includes('agreement_structures'));
});


test('Build 89.4 report preserves failed v0.1 evidence instead of retuning the evaluator',()=>{
  assert.ok(report.includes('does **not** pass its predeclared 89.5 acceptance gate'));
  assert.ok(report.includes('c819ad54-c18c-49b8-a834-f47bbfddf3f4'));
  assert.ok(report.includes('57e53a81-a37a-43e4-a36e-2e7687e0542f'));
  assert.ok(report.includes('48/55 fields = 87.27%'));
  assert.ok(report.includes('Result: **FAILED — by design, not waived.**'));
  assert.ok(report.includes('Build 90 therefore does not start yet.'));
});

test('Build 89 remediation is additive: v0.1 stays failed and v0.2 must be predeclared',()=>{
  assert.ok(build.includes('89.R1 — Constitutional State Adapter'));
  assert.ok(build.includes('89.R2 — Predeclared v0.2 rerun'));
  assert.ok(report.includes('v0.1 experiments remain immutable evidence'));
  assert.ok(report.includes('hard-vs-interpretive'));
});


test('Build 89.R2 v0.2 freezes structured constitutional state before model execution',()=>{
  assert.ok(runner.includes('const FIXTURE_VERSION_V2="model-swap-v0.2"'));
  assert.ok(runner.includes('hard_vs_interpretive_frozen_before_run:true'));
  assert.ok(runner.includes('constitutional_envelope:constitutionalEnvelope(x.state)'));
  assert.ok(runner.includes('action==="acceptance_model_swap_v2"'));
  assert.ok(adapter.includes('export function constitutionalEnvelope'));
  assert.ok(adapter.includes('export function applyConstitutionalEnvelope'));
});

test('Build 89.R2 measures raw model drift separately from enforced system invariants',()=>{
  assert.ok(runner.includes('model_a_raw_compliant_cases'));
  assert.ok(runner.includes('model_b_raw_compliant_cases'));
  assert.ok(runner.includes('both_system_preserve_all_hard_invariants'));
  assert.ok(runner.includes('raw_model_agreement_rate'));
  assert.ok(runner.includes('constitutional_adapter_applied:true'));
  assert.ok(runner.includes('v01_results_preserved:true'));
});

test('Build 89.R2 cold v0.2 predeclares hard boundaries without requiring interpretive identity',()=>{
  assert.ok(runner.includes('const COLD_FIXTURE_VERSION_V2="cold-reconstruction-v0.2"'));
  assert.ok(runner.includes('function evaluateColdHard'));
  assert.ok(runner.includes('both_preserve_all_hard_boundaries'));
  assert.ok(runner.includes('exact_interpretive_identity_required:false'));
  assert.ok(runner.includes('movement_ownership:'));
  assert.ok(runner.includes('variant_authority_mutation'));
  assert.ok(runner.includes('gap_required_source:'));
  assert.ok(runner.includes('action==="acceptance_cold_reconstruction_v2"'));
});

test('Build 89.R2 keeps v0.1 executors and actions intact for auditability',()=>{
  assert.ok(runner.includes('action==="acceptance_model_swap"'));
  assert.ok(runner.includes('action==="acceptance_cold_reconstruction"'));
  assert.ok(runner.includes('exact_contract_v01'));
  assert.ok(runner.includes('cold_structure_exact_v01'));
});


test('Build 89.R3 canonicalizes symmetric contradiction representation before hard evaluation',()=>{
  assert.ok(runner.includes('const COLD_FIXTURE_VERSION_V3="cold-reconstruction-v0.3"'));
  assert.ok(runner.includes('function canonicalizeColdSymmetricRelations'));
  assert.ok(runner.includes('if(String(x?.type||"")!=="contradicts")return x'));
  assert.ok(runner.includes('symmetric_relation_canonicalizer_applied:true'));
  assert.ok(runner.includes('action==="acceptance_cold_reconstruction_v3"'));
});

test('Build 89.R3 keeps directional relation types directional',()=>{
  assert.ok(runner.includes('supports, supersedes, depends_on and qualifies remain directional'));
  assert.ok(runner.includes('contradicts is semantically symmetric'));
});

test('Build 89.R3 preserves v0.1 and v0.2 runs rather than rewriting failed evidence',()=>{
  assert.ok(runner.includes('v01_results_preserved:true'));
  assert.ok(runner.includes('v02_results_preserved:true'));
  assert.ok(runner.includes('cold_hard_boundaries_v02'));
  assert.ok(runner.includes('cold_hard_boundaries_v03'));
});
