import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261003064428_runtime_capability_grants_v01.sql');
const mcp=read('supabase/functions/isabella-runtime-mcp/index.ts');
const config=read('supabase/config.toml');

test('Build 72.8 capability grants are execution-scoped, read-only and invisible to clients',()=>{
  assert.ok(migration.includes('create table public.minds_runtime_capability_grants'));
  assert.ok(migration.includes("v_provider<>'openai_agents'"));
  assert.ok(migration.includes("v_mode<>'shadow'"));
  assert.ok(migration.includes("'read_mission_workspace'"));
  assert.ok(migration.includes("'read_relevant_artifacts'"));
  assert.ok(migration.includes("'read_project_context'"));
  assert.ok(!migration.includes("'write_workspace'"));
  assert.ok(migration.includes('revoke all on public.minds_runtime_capability_grants from anon,authenticated'));
  assert.ok(migration.includes("old.status='active' and new.status in ('revoked','expired')"));
});

test('Build 72.8 MCP authenticates by hashed ephemeral capability token',()=>{
  assert.ok(mcp.includes('tokenHash=await sha256(token)'));
  assert.ok(mcp.includes('.eq("token_hash",tokenHash)'));
  assert.ok(mcp.includes('grant.status!=="active"'));
  assert.ok(mcp.includes('Date.parse(grant.expires_at)<=Date.now()'));
  assert.ok(mcp.includes('execution.provider!=="openai_agents"||execution.mode!=="shadow"'));
  assert.ok(!mcp.includes('SUPABASE_ANON_KEY'));
  assert.ok(!mcp.includes('OPENAI_API_KEY'));
});

test('Build 72.8 exposes only bounded read capabilities and audits each use',()=>{
  assert.ok(mcp.includes('registerTool("read_mission_workspace"'));
  assert.ok(mcp.includes('registerTool("read_relevant_artifacts"'));
  assert.ok(mcp.includes('registerTool("read_project_context"'));
  assert.ok(!mcp.includes('registerTool("write_'));
  assert.ok(!mcp.includes('registerTool("mutate_'));
  assert.ok(mcp.includes('event_type:"mcp.read"'));
  assert.ok(mcp.includes('use_count:Number(grant.use_count||0)+1'));
  assert.ok(mcp.includes('item_count:bounded.length'));
  assert.ok(mcp.includes('artifact_count:artifacts.length'));
});

test('Build 72.8 artifact MCP returns metadata only, never quarantine or file bytes',()=>{
  const block=mcp.slice(mcp.indexOf('registerTool("read_relevant_artifacts"'),mcp.indexOf('registerTool("read_project_context"'));
  assert.ok(block.includes('minds_artifacts'));
  assert.ok(block.includes('mime_type'));
  assert.ok(block.includes('sha256'));
  assert.ok(!block.includes('minds_artifact_intake'));
  assert.ok(!block.includes('.download('));
  assert.ok(!block.includes('createSignedUrl'));
});

test('Build 72.8 runtime MCP uses custom auth instead of Supabase client JWT',()=>{
  const block=config.slice(config.indexOf('[functions.isabella-runtime-mcp]'));
  assert.ok(block.includes('verify_jwt = false'));
  assert.ok(block.includes('entrypoint = "./functions/isabella-runtime-mcp/index.ts"'));
});
