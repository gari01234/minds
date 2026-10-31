import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const detail=read('task-detail.js'),work=read('work.js'),app=read('app.js');
const html=read('index.html'),sw=read('sw.js'),css=read('task-detail.css');

test('Work and Tiempo route the same canonical task into the common editor',()=>{
  assert.match(work,/if\(window\.MINDS_TASK_DETAIL\?\.open\)/);
  assert.match(work,/taskId:task\?\.id\|\|null,projectId:project\.id/);
  assert.match(app,/if\(kind==='task'&&typeof window!=='undefined'&&window\.MINDS_TASK_DETAIL\?\.open\)/);
  assert.match(app,/window\.MINDS_TASK_DETAIL\.open\(\{clientKey:id\}\)/);
  assert.match(app,/await window\.MINDS_TASK_DETAIL\.createQuick\(attempt\)/);
  assert.doesNotMatch(app,/MINDS_TASK_DETAIL\.open\(\{title,date,categoryKey:categoryId,projectKey:projectId\}\)/);
  assert.match(detail,/async function readTask\(opts\)/);
  assert.match(detail,/\.eq\('id',opts\.taskId\)/);
  assert.match(detail,/\.eq\('client_key',opts\.clientKey\)/);
  assert.match(detail,/function collectChecks\(\)/);
  assert.match(detail,/async function uploadFiles\(/);
  assert.match(detail,/const datesValid=/);
  assert.doesNotMatch(detail,/id="taskDetailSave"/);
  assert.match(css,/minds-task-detail-top/);
});

test('partial autosave performs readback, avoids unrelated field writes, and detects conflict',async()=>{
  const start=detail.indexOf('async function perform(ctx,patch,rerender=false){');
  const end=detail.indexOf('\nasync function changeProject(',start);
  assert.ok(start>0&&end>start);
  let saved=[],messages=[],refreshed=0,updated=0,readResult=true;
  const fake={
    status:message=>messages.push(message),
    fail:err=>messages.push('Error: '+err?.message),
    $:()=>({classList:{remove(){}}}),
    sb:{from(table){assert.equal(table,'isabella_tasks');return{
      update(patch){saved.push(patch);return{
        eq(col,val){if(col==='updated_at')assert.ok(val);return this},
        select(){return this},
        async maybeSingle(){return readResult?
          {data:{id:'canonical',title:'Actualizado',updated_at:saved.at(-1).updated_at,notes:'previa'},error:null}:
          {data:null,error:null}}
      }}
    }}},
    app:()=>({refresh:()=>{refreshed++}}),
    window:{ISABELLA_SYNC_PULL_NOW:async()=>true},
    generation:1,
    render:()=>{throw new Error('Unexpected full editor rerender')},
    Promise,Object,JSON,Date
  };
  vm.runInNewContext(detail.slice(start,end),fake);
  const ctx={ticket:1,blocked:false,task:{id:'canonical',title:'Anterior',notes:'previa',updated_at:'2026-10-19T10:00:00+00:00'},queue:Promise.resolve(),opts:{onUpdated:()=>{updated++}}};
  fake.ctx=ctx;
  await vm.runInNewContext('update(ctx,{title:"Actualizado"})',fake);
  assert.equal(saved.length,1);
  assert.equal(saved[0].title,'Actualizado');
  assert.ok(!('notes' in saved[0]));
  assert.equal(ctx.task.title,'Actualizado');
  assert.equal(ctx.blocked,false);
  assert.equal(refreshed,1);
  readResult=false;
  await vm.runInNewContext('update(ctx,{title:"En conflicto"})',fake);
  assert.equal(ctx.blocked,true);
  assert.ok(messages.some(x=>x.includes('Conflicto')));
  await vm.runInNewContext('update(ctx,{priority:"important"})',fake);
  assert.equal(saved.length,2,'conflicted editor must stop issuing updates');
});

test('full task detail uses explicit creation and menu-only destructive actions',()=>{
  assert.match(detail,/data-task-action="archive"/);
  assert.match(detail,/data-task-action="delete"/);
  assert.match(detail,/window\.confirm\('¿Eliminar definitivamente esta tarea/);
  assert.match(detail,/if\(!ctx\.task\).*?Crea primero la tarea/);
  assert.match(detail,/id="taskDetailCreate"/);
  assert.match(detail,/taskDetailStatus/);
  assert.match(detail,/work_bucket_id/);
  assert.match(detail,/assignee_person_id/);
  assert.match(detail,/start_date/);
  assert.match(detail,/completed_at/);
  assert.match(detail,/estimated_minutes/);
  assert.match(detail,/checklist/);
  assert.match(detail,/attachments/);
});

test('PWA serves one task detail with matching versions',()=>{
  for(const asset of ['task-detail.js?v=4','task-detail.css?v=1','app.js?v=131','work.js?v=33']){
    assert.ok(html.includes(asset),'HTML '+asset);
    assert.ok(sw.includes(asset),'SW '+asset);
  }
  assert.match(sw,/isabella-shell-v171/);
  assert.ok(html.indexOf('task-detail.js?v=4')>html.indexOf('sync.js?v=pwa39'));
});
