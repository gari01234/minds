import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Workbook values distinguish blank, result-less formulas and text safely',()=>{
 const x=read('supabase/functions/_shared/work-source-materialize.ts');
 assert.match(x,/if\(v===null\|\|v===undefined\)return ""/);
 assert.match(x,/if\(v.result!==undefined\)return v.result===null\?"":String\(v.result\)/);
 assert.match(x,/Array.isArray\(v.richText\)/);
 assert.doesNotMatch(x,/cell\.text\?\?/);
 assert.match(x,/xlsx_load:/);
 assert.match(x,/xlsx_sheet:/);
});
test('Real parser errors are observable without storing document text in logs',()=>{
 const x=read('supabase/functions/isabella-work-ingest-runner/index.ts');
 assert.match(x,/work_source_intake_failure/);
 assert.match(x,/queue_id:job.id/);
 assert.match(x,/\.slice\(0,900\)/);
 assert.doesNotMatch(x,/console\.error\([^\n]*\.content/);
});
