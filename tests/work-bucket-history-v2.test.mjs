import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261031165000_minds_work_bucket_completed_history_v2.sql',import.meta.url),'utf8');
function extract(a,b){const i=js.indexOf(a),j=js.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing '+a);return js.slice(i,j).trim()}

test('Completed tasks remain linked to the archived Bucket, not moved to Ohne Bucket',()=>{
 assert.match(migration,/security invoker/);
 assert.match(migration,/and completed_at is null/);
 assert.match(migration,/update public\.minds_work_buckets[\s\S]*?set archived = true/);
 assert.match(migration,/minds_work_bucket_restore/);
 assert.doesNotMatch(migration,/\bdelete\s+from\s+public\.isabella_tasks\b/i);
});
test('A visually empty Bucket explains completed history and zero tasks moved',()=>{
 const modalHTML=[];
 const eight=Array.from({length:8},(_,i)=>({id:String(i),work_bucket_id:'bucket',completed_at:'2026-10-30T10:00:00Z'}));
 const ctx={
  buckets:[{id:'bucket',name:'Für Kickofftermin mit Fachplaner'}],
  tasks:eight,
  $:()=>({}),
  closeBucketMenus:()=>{},
  esc:s=>String(s),
  window:{ISABELLA_APP:{openModal:(title,html)=>modalHTML.push({title,html})}}
 };
 vm.runInNewContext('('+extract('function archiveBucketDialog(id){','async function archiveBucket(id){')+')',ctx)('bucket');
 assert.equal(modalHTML.length,1);
 assert.match(modalHTML[0].html,/8 erledigte Aufgaben bleiben/);
 assert.match(modalHTML[0].html,/Keine offenen Aufgaben müssen verschoben werden/);
 assert.match(modalHTML[0].html,/im Archiv/);
 assert.doesNotMatch(modalHTML[0].html,/8 Aufgabe.*nach.*Ohne Bucket/);
});
test('Pending work still moves to Ohne Bucket and completed history stays intact',()=>{
 const modalHTML=[];
 const tasks=[
  {work_bucket_id:'bucket',completed_at:'2026-10-30'},
  {work_bucket_id:'bucket',completed_at:null}
 ];
 const ctx={
  buckets:[{id:'bucket',name:'Planung'}],tasks,$:()=>({}),
  closeBucketMenus:()=>{},esc:s=>String(s),
  window:{ISABELLA_APP:{openModal:(title,html)=>modalHTML.push(html)}}
 };
 vm.runInNewContext('('+extract('function archiveBucketDialog(id){','async function archiveBucket(id){')+')',ctx)('bucket');
 assert.match(modalHTML[0],/1 offene Aufgabe wird nach <strong>Ohne Bucket<\/strong> verschoben/);
 assert.match(modalHTML[0],/1 erledigte Aufgabe bleibt im Archiv/);
});
test('Archived Bucket access and restoration are part of the actual Planner',()=>{
 assert.match(js,/data-work-show-bucket-archive/);
 assert.match(js,/void openArchivedBuckets\(\)/);
 assert.match(js,/from\('minds_work_buckets'\)[\s\S]*?archived',true/);
 assert.match(js,/from\('isabella_tasks'\)[\s\S]*?work_bucket_id',ids/);
 assert.match(js,/rpc\('minds_work_bucket_restore'/);
 assert.match(js,/openModal\?\.\('Archivierte Buckets'/);
 assert.doesNotThrow(()=>new Function(js));
});
