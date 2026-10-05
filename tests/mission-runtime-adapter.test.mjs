import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Build 72.5A defines a provider-neutral Mission Runtime contract',()=>{
  const runtime=read('supabase/functions/_shared/mission-runtime.ts');
  for(const token of [
    'start(input:',
    'inspect(execution:',
    'steer(execution:',
    'pause_or_stop(execution:',
    'collect(execution:',
    '"native_minds"|"openai_agents"',
    '"primary"|"shadow"',
    'createMissionRuntimeRegistry',
    'createNativeMindsRuntimeAdapter'
  ]) assert.ok(runtime.includes(token),token);
  assert.ok(runtime.includes('native_minds_runtime_required'));
  assert.ok(!runtime.includes('api.openai.com'));
  assert.ok(!runtime.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('Build 72.5A snapshot boundary rejects credential-shaped project context',()=>{
  const runtime=read('supabase/functions/_shared/mission-runtime.ts');
  assert.ok(runtime.includes('CREDENTIAL_KEYS'));
  assert.ok(runtime.includes('mission_runtime_credentials_forbidden'));
  assert.ok(runtime.includes('mission_runtime_snapshot_too_large'));
  assert.ok(runtime.includes('mission_runtime_snapshot_too_complex'));
  assert.ok(runtime.includes('project_context:projectContext'));
});

test('Build 72.5A stores runtime identity outside the authoritative Mission Run',()=>{
  const migration=read('supabase/migrations/20261002155459_mission_runtime_adapter_v01.sql');
  assert.ok(migration.includes('create table public.minds_mission_runtime_executions'));
  assert.ok(migration.includes('create table public.minds_mission_runtime_events'));
  assert.ok(migration.includes("provider in ('native_minds','openai_agents')"));
  assert.ok(migration.includes("mode in ('primary','shadow')"));
  assert.ok(migration.includes('unique(mission_run_id,provider,mode)'));
  assert.ok(migration.includes('provider_session_id'));
  assert.ok(migration.includes('provider_turn_id'));
  assert.ok(migration.includes('snapshot_hash'));
  assert.ok(migration.includes('usage jsonb'));
  assert.ok(!migration.includes('alter table public.minds_mission_runs add'));
});

test('Build 72.5A derives ownership in the database and exposes no direct writes',()=>{
  const migration=read('supabase/migrations/20261002155459_mission_runtime_adapter_v01.sql');
  assert.ok(migration.includes('new.user_id:=v_user'));
  assert.ok(migration.includes('mission_runtime_execution_identity_immutable'));
  assert.ok(migration.includes('alter table public.minds_mission_runtime_executions enable row level security'));
  assert.ok(migration.includes('alter table public.minds_mission_runtime_events enable row level security'));
  assert.ok(migration.includes('using ((select auth.uid())=user_id)'));
  assert.ok(migration.includes('revoke all on public.minds_mission_runtime_executions from anon,authenticated'));
  assert.ok(migration.includes('revoke all on public.minds_mission_runtime_events from anon,authenticated'));
  assert.ok(migration.includes('grant select on public.minds_mission_runtime_executions to authenticated'));
  assert.ok(migration.includes('grant select,insert,update,delete on public.minds_mission_runtime_executions to service_role'));
});

test('Build 72.5A does not switch production Mission execution to OpenAI Agents',()=>{
  const runner=read('supabase/functions/isabella-mission-runner/index.ts');
  assert.ok(runner.includes('minds_claim_mission_runs'));
  assert.ok(runner.includes('minds_apply_mission_step_v2'));
  assert.ok(runner.includes('https://api.openai.com/v1/responses'));
  assert.ok(!runner.includes('openai_agents'));
  assert.ok(!runner.includes('_shared/mission-runtime'));
});

test('Build 72.5A includes rolled-back behavioral coverage for the runtime ledger',()=>{
  const sql=read('supabase/tests/mission_runtime_adapter.sql');
  assert.ok(sql.startsWith('-- Build 72.5A behavioral contract'));
  assert.ok(sql.includes('TEST execution owner not derived from run'));
  assert.ok(sql.includes('TEST runtime identity mutation accepted'));
  assert.ok(sql.includes('TEST cross-user execution read'));
  assert.ok(sql.includes('TEST direct execution write exposed'));
  assert.ok(sql.trim().endsWith('rollback;'));
});
