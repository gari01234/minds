import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runner=read('supabase/functions/isabella-work-ingest-runner/index.ts');
const core=read('supabase/functions/_shared/work-ingest-core.ts');
const docling=read('supabase/functions/_shared/work-docling.ts');
const extraction=read('supabase/functions/_shared/work-source-proposals.ts');
const cron=read('supabase/migrations/20261011140000_knowledge_source_first_worker_v01.sql');
test('Source First worker has server-only bounded and lease-safe execution',()=>{
  assert.match(runner,/work_ingest_runner/);
  assert.match(runner,/minds_claim_work_ingest/);
  assert.match(runner,/p_limit:1/);
  assert.match(runner,/\.eq\("attempts",job\.attempts\)/);
  assert.match(runner,/Number\(job.attempts\)>=4/);
  assert.match(cron,/\*\/5 \* \* \* \*/);
  assert.match(read('supabase/config.toml'),/\[functions.isabella-work-ingest-runner\]\nverify_jwt = false/);
});
test('every accepted claim is sourced, proposed and committed through existing RPC',()=>{
  assert.match(core,/crypto.subtle.digest\("SHA-256"/);
  assert.match(core,/minds_project_source_ingestions/);
  assert.match(core,/minds_commit_project_source_extraction/);
  assert.match(core,/no_verifiable_propositions/);
  assert.match(extraction,/evidence_excerpt/);
  assert.match(extraction,/proposed/);
  assert.doesNotMatch(runner,/minds_work_claims/);
  assert.doesNotMatch(core,/status:"confirmed"/);
});
test('Docling adapter accepts only private configured HTTPS endpoint',()=>{
  assert.match(docling,/DOCLING_SERVE_URL/);
  assert.match(docling,/base.protocol!=="https:"/);
  assert.match(docling,/X-Api-Key/);
  assert.match(docling,/\/v1\/convert\/file/);
  assert.match(core,/docling_required_large_source/);
  assert.match(core,/coverage:converted/);
  assert.match(core,/claims_only/);
});
test('a file is indexed only after completed source-first commit',()=>{
  assert.match(runner,/const indexed=x.status==="completed"/);
  assert.match(runner,/index_status:indexed\?"indexed":"failed"/);
  assert.match(core,/\["completed","already_indexed"\]/);
  assert.doesNotMatch(core,/minds_attention_events/);
});
