import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const app=read('apps/isabella/app.js');
const work=read('apps/isabella/work.js');
const chat=read('supabase/functions/isabella-chat/index.ts');
const migration=read('supabase/migrations/20261008115000_build83_operational_regressions.sql');

test('Build 83.2 drag bindings use collection selectors, not querySelector results',()=>{
  assert.equal(/(^|[^$])\$\('\.task-item\[data-date\]:not\(\.task-done\)'\)\.forEach/.test(app),false);
  assert.equal(/(^|[^$])\$\('\.task-item\[data-id\]'\)\.find\(/.test(app),false);
  assert.ok(app.includes("$('.task-item[data-date]:not(.task-done)').forEach"));
  assert.ok(app.includes("$('.task-item[data-id]').find("));
  assert.equal(/(^|[^$])\$\('\[data-work-bucket-drop\]'\)\.forEach/.test(work),false);
  assert.equal(/(^|[^$])\$\('\[data-work-task\]'\)\.find\(/.test(work),false);
  assert.ok(work.includes("$('[data-work-bucket-drop]').forEach"));
  assert.ok(work.includes("$('[data-work-task]').find("));
});

test('Build 83.2 proposal confirmation catches synchronous render failures',()=>{
  assert.ok(app.includes("Promise.resolve().then(()=>applyProposal(p))"));
  assert.ok(app.includes("b.textContent='Guardando…'"));
  assert.ok(app.includes("No pude aplicar el cambio:"));
});

test('Build 83.2 sends chat documents to Responses API as MIME data URLs',()=>{
  assert.ok(chat.includes('file_data:"data:"+mime+";base64,"+encoded'));
  assert.ok(chat.includes('type:"input_file"'));
});

test('Build 83.2 activity log admits calendar date moves',()=>{
  assert.ok(migration.includes("'move_date'"));
  assert.ok(migration.includes("'reorder'"));
});
