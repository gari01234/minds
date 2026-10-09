import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261009072000_model_independence_ledger_v01.sql');
const runner=read('supabase/functions/isabella-model-independence-runner/index.ts');
const config=read('supabase/config.toml');
const build=read('BUILD-89.md');

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
