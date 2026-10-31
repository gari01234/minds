import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apps/isabella/work-buckets.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../apps/isabella/index.html',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261031120000_minds_work_bucket_lifecycle_v1.sql',import.meta.url),'utf8');
test('Work client parses and exposes all Bucket management actions',()=>{
 assert.doesNotThrow(()=>new Function(js));
 for(const name of ['data-work-rename-bucket','data-work-shift-bucket','data-work-archive-bucket',
  'data-work-bucket-handle','data-work-bucket-menu'])assert.ok(js.includes(name),name);
 assert.ok(!js.includes("window.prompt('Nombre del Bucket'"));
});
test('Bucket order is independent from task ordering',()=>{
 assert.match(js,/rpc\('minds_work_bucket_reorder'/);
 assert.match(js,/p_bucket_ids:ids/);
 assert.match(js,/draggedWorkBucketId/);
 assert.match(js,/function moveBucket\(/);
 assert.match(js,/function shiftBucket\(/);
 assert.match(js,/persistWorkTaskOrder\(/);
 assert.doesNotMatch(sql,/update\s+public\.isabella_tasks\s+set\s+sort_order/i);
});
test('Archiving preserves tasks, including completed and archived',()=>{
 assert.match(sql,/security invoker/);
 assert.match(sql,/update public\.isabella_tasks[\s\S]*?set work_bucket_id = null/);
 assert.match(sql,/update public\.minds_work_buckets[\s\S]*?set archived = true/);
 assert.match(sql,/where user_id = v_uid and project_id = p_project_id/);
 assert.match(js,/rpc\('minds_work_bucket_archive'/);
 assert.match(js,/Keine Aufgabe und keine Checkliste wird gelöscht/);
 assert.match(js,/if\(!existing\.data\?\.length\)/);
});
test('Bucket menu can be opened with accessible controls, CSS is scoped and served',()=>{
 assert.match(js,/aria-haspopup="menu"/);
 assert.match(js,/aria-expanded="false"/);
 assert.match(css,/\.work-bucket \.work-bucket-menu\[hidden\]/);
 assert.match(css,/\.work-bucket\.is-bucket-drop-before/);
 assert.match(html,/work-buckets\.css\?v=1/);
 assert.match(html,/work\.js\?v=34/);
});
