import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const model=require('../apps/isabella/dashboard-model.js');
const read=name=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const app=read('app.js'),desk=read('dashboard.js'),html=read('index.html'),sw=read('sw.js');

test('sessions link by canonical client key, not title, and never create another task',()=>{
  const task={id:'t1',title:'Actualizada',date:'2026-10-19'},state={tasks:[task]};
  const session=key=>({title:'Título anterior',metadata:{kind:'task_work_session_v1',task_client_key:key}});
  assert.equal(model.taskForSession(state,session('t1')),task);
  assert.equal(model.taskForSession(state,session('t1')),task); // second session, same task
  assert.equal(model.taskForSession(state,session('missing')),null);
  assert.equal(model.taskForSession(state,{title:task.title,metadata:{kind:'meeting'}}),null);
  assert.equal(model.taskForSession(state,{title:task.title,metadata:{kind:'task_work_session_v1'}}),null);
  assert.equal(state.tasks.length,1);
});
test('Tiempo presentation distinguishes reservations and guards orphan navigation',()=>{
  const i=app.indexOf('function workSessionPresentation(event){');
  const j=app.indexOf('function agendaRow(kind,item){',i);
  assert.ok(i>=0&&j>i);
  const state={tasks:[{id:'t1',title:'Fachplaner actualizado'}]},context={state};
  vm.runInNewContext(app.slice(i,j),context);
  const present=input=>JSON.parse(JSON.stringify(vm.runInNewContext('workSessionPresentation(input)',{...context,input})));
  const linked=present({title:'Fachplaner antiguo',metadata:{kind:'task_work_session_v1',task_client_key:'t1'}});
  assert.equal(linked.title,'Sesión · Fachplaner actualizado');
  assert.equal(linked.task.id,'t1');
  assert.equal(present({title:'No encontrada',metadata:{kind:'task_work_session_v1',task_client_key:'absent'}}).task,null);
  assert.equal(present({title:'Reunión',metadata:{kind:'meeting'}}).isSession,false);
  assert.match(app,/if\(session\?\.task\)\$\('#editLinkedTask'\)\.onclick=\(\)=>editItem\('task',session\.task\.id\)/);
  assert.match(app,/workSessionPresentation\(e\)/);
  assert.match(desk,/M\.taskForSession\(state,item\)/);
  assert.match(app,/mutation\(kind,'update',before,item,'manual'\)/);
  assert.match(app,/mutation\(kind,'delete',before,null,'manual'\)/);
});
test('all modified PWA asset URLs match between HTML and SW and rotate the cache',()=>{
  for(const asset of ['app.js?v=121','dashboard.js?v=3','dashboard-model.js?v=2','dashboard-95-2.css?v=2']){
    assert.ok(html.includes(asset),'HTML missing '+asset);
    assert.ok(sw.includes(asset),'SW missing '+asset);
  }
  assert.match(sw,/isabella-shell-v149/);
});
