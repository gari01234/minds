import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');
const start=src.indexOf('async function searchWork(req:Request,args:any)');
const end=src.indexOf('async function compareProjectSource',start);
const work=src.slice(start,end);
test('Work search includes canonical document coverage rather than equating storage with knowledge',()=>{
  assert.ok(start>=0&&end>start,'Work retrieval must be present');
  assert.match(work,/index_status,metadata,created_at/);
  const coverage=readFileSync(new URL('../supabase/functions/_shared/work-source-coverage.mjs',import.meta.url),'utf8');
  assert.match(work,/currentWorkTextCoverage\(sourceRows,textReceiptRows\|\|\[\]\)/);
  for(const field of ['stored_only','indexed','queued','failed','text_materialized',
    'indexed_without_current_text','indexing_is_not_full_understanding']){
    assert.ok(coverage.includes(field+':'),field+' coverage is computed by shared contract');
  }
  assert.match(work,/knowledge_coverage:knowledgeCoverage/);
});
test('Work claim lookup resolves original filename and partial coverage before relevance filtering',()=>{
  assert.match(work,/const sourceById=new Map/);
  assert.match(work,/source_file_id/);
  assert.match(work,/source_documents:/);
  assert.match(work,/extraction_coverage:x\.metadata\?\.knowledge_intake\?\.coverage/);
  const augmented=work.indexOf('const sourcedClaims=');
  const filtering=work.indexOf('const claims=sourcedClaims.filter');
  assert.ok(augmented>0&&filtering>augmented,'augment evidence with file names before query matches');
  assert.match(work,/\.in\("status",\["proposed","confirmed","disputed","resolved"\]\)/);
});
