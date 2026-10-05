import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Build 72.5B Agents shadow has no environment, tools, multi-agent or write-through',()=>{
  const adapter=read('supabase/functions/_shared/openai-agents-runtime.ts');
  const runner=read('supabase/functions/isabella-agent-shadow/index.ts');
  assert.ok(adapter.includes('environment:{type:"none"}'));
  assert.ok(adapter.includes('multi_agent:{enabled:false}'));
  assert.ok(adapter.includes('tools_enabled:false'));
  assert.ok(adapter.includes('multi_agent_enabled:false'));
  assert.ok(!adapter.includes('type:"web_search"'));
  assert.ok(!adapter.includes('type:"mcp"'));
  assert.ok(!adapter.includes('openai_hosted'));
  assert.ok(!runner.includes('minds_apply_mission_step'));
  assert.ok(!runner.includes('minds_append_commitment_workspace_item'));
  assert.ok(!runner.includes('minds_update_commitment_workspace_summary'));
  assert.ok(runner.includes('write_through:false'));
});

test('Build 72.5B compares native and Agents shadows from the same normalized snapshot hash',()=>{
  const runner=read('supabase/functions/isabella-agent-shadow/index.ts');
  assert.ok(runner.includes('createExecution(sb,run,"native_minds",snapshotHash,nativeModel)'));
  assert.ok(runner.includes('createExecution(sb,run,"openai_agents",snapshotHash,agentsModel)'));
  assert.ok(runner.includes('normalizeMissionRuntimeSnapshot'));
  assert.ok(runner.includes('snapshot_hash:snapshotHash'));
  assert.ok(runner.includes('mode:"shadow"'));
  assert.ok(runner.includes('action==="run_pair"'));
  assert.ok(runner.includes('action==="inspect_agents"'));
  assert.ok(runner.includes('snapshot_for_normalizer:snapshot'));
});

test('Build 72.5B stores normalized results in the runtime ledger, not Mission state',()=>{
  const migration=read('supabase/migrations/20261002173851_mission_runtime_shadow_v01.sql');
  const runner=read('supabase/functions/isabella-agent-shadow/index.ts');
  assert.ok(migration.includes('add column if not exists result_payload jsonb'));
  assert.ok(migration.includes("'agent_shadow_runner'"));
  assert.ok(runner.includes('result_payload:result.result'));
  assert.ok(runner.includes('result_status:result.result.status'));
  assert.ok(runner.includes('minds_mission_runtime_executions'));
  assert.ok(runner.includes('minds_mission_runtime_events'));
  assert.ok(!migration.includes('cron.schedule'));
  assert.ok(!migration.includes('alter table public.minds_mission_runs'));
});

test('Build 72.5B keeps Managed Agents provider-native and normalizes through strict Responses',()=>{
  const adapter=read('supabase/functions/_shared/openai-agents-runtime.ts');
  assert.ok(adapter.includes('https://api.openai.com/v1/agents'));
  assert.ok(adapter.includes('https://api.openai.com/v1/responses'));
  assert.ok(adapter.includes('"OpenAI-Beta":BETA_HEADER'));
  assert.ok(adapter.includes('BETA_HEADER="agents=v1"'));
  assert.ok(adapter.includes('environment:{type:"none"}'));
  assert.ok(adapter.includes('multi_agent:{enabled:false}'));
  assert.ok(!adapter.includes('agent:{\n              model,\n              text:'));
  assert.ok(adapter.includes('name:"mission_shadow_result"'));
  assert.ok(adapter.includes('strict:true'));
  assert.ok(adapter.includes('normalization:"responses_strict_json_schema"'));
  assert.ok(adapter.includes('/turns?order=desc&limit=1'));
  assert.ok(adapter.includes('/items?order=asc&limit=100'));
  assert.ok(adapter.includes('phase==="final_answer"'));
});

test('Build 72.5B shadow runner is internal custom-auth and never scheduled',()=>{
  const config=read('supabase/config.toml');
  const runner=read('supabase/functions/isabella-agent-shadow/index.ts');
  const migrations=[
    read('supabase/migrations/20261002155459_mission_runtime_adapter_v01.sql'),
    read('supabase/migrations/20261002173851_mission_runtime_shadow_v01.sql')
  ].join('\n');
  assert.ok(config.includes('[functions.isabella-agent-shadow]'));
  assert.ok(config.includes('verify_jwt = false'));
  assert.ok(runner.includes('.eq("key","agent_shadow_runner")'));
  assert.ok(runner.includes('return json({error:"unauthorized"},401)'));
  assert.ok(!migrations.includes("'isabella-agent-shadow'"));
  assert.ok(!migrations.includes('minds-agent-shadow'));
});

test('Build 72.5B native production Mission runner remains unchanged by provider selection',()=>{
  const runner=read('supabase/functions/isabella-mission-runner/index.ts');
  assert.ok(runner.includes('minds_claim_mission_runs'));
  assert.ok(runner.includes('minds_apply_mission_step_v2'));
  assert.ok(runner.includes('https://api.openai.com/v1/responses'));
  assert.ok(!runner.includes('openai_agents'));
  assert.ok(!runner.includes('isabella-agent-shadow'));
});

test('Build 72.5B SQL suite asserts zero write-through and paired isolation',()=>{
  const sql=read('supabase/tests/mission_runtime_shadow.sql');
  assert.ok(sql.includes('TEST paired shadows did not share snapshot'));
  assert.ok(sql.includes('TEST shadow changed Mission Run status'));
  assert.ok(sql.includes('TEST shadow changed workspace summary'));
  assert.ok(sql.includes('TEST shadow wrote workspace items'));
  assert.ok(sql.includes('TEST cross-user shadow read'));
  assert.ok(sql.trim().endsWith('rollback;'));
});
