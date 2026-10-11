import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261011193000_work_intake_reconciliation_v01.sql');
const core=read('supabase/functions/_shared/work-ingest-core.ts');
const worker=read('supabase/functions/isabella-work-ingest-runner/index.ts');
test('new uploads automatically enqueued; historical originals discovered only in bounded batches',()=>{
  const first=read('supabase/migrations/20261011133000_knowledge_intake_queue_v01.sql');
  assert.match(first,/after insert on public\.minds_work_files/i);
  assert.match(sql,/minds_reconcile_work_ingest/);
  assert.match(sql,/not exists\(select 1 from public\.minds_work_ingest_queue/);
  assert.match(sql,/for update of f skip locked/i);
  assert.match(sql,/v_limit integer:=greatest\(1,least\(coalesce\(p_limit,1\),2\)\)/);
  assert.match(sql,/true,deferred_reason from classified/);
  assert.match(worker,/p_limit:1,p_docling_ready:doclingReady/);
});
test('new user files always outrank historical background backlog',()=>{
  assert.match(sql,/is_backfill boolean not null default false/);
  assert.match(sql,/order by q\.is_backfill asc,q\.created_at,q\.id/);
  assert.match(worker,/minds_reconcile_work_ingest/);
  assert.match(worker,/minds_claim_work_ingest/);
  assert.ok(worker.indexOf('minds_reconcile_work_ingest')<worker.indexOf('minds_claim_work_ingest'));
});
test('unsupported or oversized source waits for reader without burning retries or claiming knowledge',()=>{
  assert.match(sql,/waiting_parser/);
  assert.match(sql,/needs_format_reader/);
  assert.match(sql,/needs_larger_worker/);
  assert.match(sql,/docling_required_large_source/);
  assert.match(sql,/needs_private_docling_image/);
  assert.match(core,/status:"waiting_parser",reason:"docling_required_large_source"/);
  assert.match(core,/status:"waiting_parser",reason:"needs_format_reader"/);
  assert.match(core,/status:"waiting_parser",reason:"needs_larger_worker"/);
  assert.match(worker,/status:needsParser\?"waiting_parser":indexed\?"completed":"skipped"/);
  assert.match(worker,/index_status:needsParser\?"waiting_parser":indexed\?"indexed":"failed"/);
  assert.match(worker,/reason:x\.reason\|\|null/);
});
test('parser activation requeues only supported blocked files, not unprocessable oversized ones',()=>{
  assert.match(sql,/if p_docling_ready then/);
  assert.match(sql,/where q\.status='waiting_parser'/);
  assert.match(sql,/and f\.size_bytes<=50331648/);
  assert.match(sql,/status='queued',attempts=0,last_error=null/);
  assert.match(sql,/grant execute on function public\.minds_reconcile_work_ingest\(integer,boolean\)\s+to service_role/);
  assert.match(sql,/security invoker/);
  assert.doesNotMatch(sql,/update public\.minds_work_claims/);
});
