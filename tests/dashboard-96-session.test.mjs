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
  for(const asset of ['app.js?v=124','dashboard.js?v=5','dashboard-model.js?v=5','dashboard-95-2.css?v=3']){
    assert.ok(html.includes(asset),'HTML missing '+asset);
    assert.ok(sw.includes(asset),'SW missing '+asset);
  }
  assert.match(sw,/isabella-shell-v158/);
});

test('month groups each task once while preserving every independently editable booking',()=>{
  const task={id:'task',title:'Fachplaner actualizado',date:'2026-10-19'};
  const reserve=(id,date,time)=>({id,title:'Nombre anterior',date,start:time,duration:30,metadata:{kind:'task_work_session_v1',task_client_key:'task'}});
  const first=reserve('session1','2026-10-19','09:00'),second=reserve('session2','2026-10-19','14:00'),third=reserve('session3','2026-10-20','11:00');
  const meeting={id:'meeting',title:'Reunión',date:'2026-10-19',start:'10:00',metadata:{kind:'meeting'}};
  const orphan={id:'orphan',title:'Sesión sin tarea',date:'2026-10-19',start:'12:00',metadata:{kind:'task_work_session_v1',task_client_key:'missing'}};
  const state={tasks:[task],events:[first,second,third,meeting,orphan]};
  const due=model.monthAgendaGroups(state,'2026-10-19');
  assert.equal(due.tasks.length,1);
  assert.equal(due.tasks[0].task,task);
  assert.deepEqual(due.tasks[0].sessions.map(e=>e.id),['session1','session2']);
  assert.deepEqual(due.events.map(e=>e.id),['meeting','orphan']);
  const other=model.monthAgendaGroups(state,'2026-10-20');
  assert.equal(other.tasks.length,1);
  assert.equal(other.tasks[0].task,task);
  assert.deepEqual(other.tasks[0].sessions.map(e=>e.id),['session3']);
  assert.equal(state.tasks.length,1);
  assert.match(app,/MINDS_DESK_MODEL\.monthAgendaGroups\(visibleState,state\.date\)/);
  assert.match(app,/MINDS_CALENDAR_PLAN/);
  assert.match(app,/month-session-link/);
  assert.match(app,/data-kind="event" data-id=/);
});
test('archived tasks never consume their former reservations',()=>{
  const task={id:'task',date:'2026-10-19',archivedAt:'2026-10-18T00:00:00Z'};
  const event={id:'session',date:'2026-10-19',metadata:{kind:'task_work_session_v1',task_client_key:'task'}};
  const result=model.monthAgendaGroups({tasks:[task],events:[event]},'2026-10-19');
  assert.equal(result.tasks.length,0);
  assert.equal(result.events[0],event);
});
