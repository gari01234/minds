import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261011133000_knowledge_intake_queue_v01.sql');
const work=read('apps/isabella/work.js');
test('knowledge intake: each new Desktop file is queued server-side without changing original storage',()=>{
  assert.match(sql,/after insert on public\.minds_work_files/);
  assert.match(sql,/on conflict \(file_id\) do nothing/);
  assert.match(sql,/index_status='queued'/);
  assert.match(sql,/references public\.minds_work_files\(id\) on delete cascade/);
  assert.match(work,/sb\.storage\.from\('minds-work'\)\.upload/);
  assert.match(work,/sb\.from\('minds_work_files'\)\.insert/);
  assert.doesNotMatch(sql,/insert into public\.minds_work_claims/);
  assert.doesNotMatch(sql,/update public\.minds_work_files[\s\S]*index_status='indexed'/);
});
test('knowledge intake: owner can inspect jobs but cannot mutate them',()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/grant select on public\.minds_work_ingest_queue to authenticated/);
  assert.match(sql,/grant select,insert,update,delete on public\.minds_work_ingest_queue to service_role/);
  assert.doesNotMatch(sql,/grant (?:all|insert|update|delete) on public\.minds_work_ingest_queue to authenticated/i);
  assert.match(sql,/using\(user_id=\(select auth\.uid\(\)\)\)/);
  assert.match(sql,/revoke all on function public\.minds_claim_work_ingest\(integer\) from public,anon,authenticated/);
});
test('knowledge intake: claim is bounded, deterministic and crash-recoverable',()=>{
  assert.match(sql,/for update skip locked/);
  assert.match(sql,/attempts < 4/);
  assert.match(sql,/locked_at < now\(\)-interval '8 minutes'/);
  assert.match(sql,/least\(coalesce\(p_limit,2\),3\)/);
  assert.match(sql,/No destructive backfill/);
});
test('knowledge objective persists as acceptance criteria rather than shipped-feature claims',()=>{
  const text=read('docs/KNOWLEDGE-COVERAGE-ACCEPTANCE.md');
  assert.match(text,/Issue #113/);
  assert.match(text,/Docling Serve/);
  assert.match(text,/CocoIndex/);
  assert.match(text,/until empirically met or explicitly reconsidered/);
});
