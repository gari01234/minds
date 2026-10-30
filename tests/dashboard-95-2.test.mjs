import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const app=read('app.js'),dash=read('dashboard.js'),html=read('index.html'),sw=read('sw.js'),css=read('dashboard-95-2.css');
const part=(begin,end)=>{
 const i=app.indexOf(begin),j=app.indexOf(end,i+begin.length);
 assert.ok(i>=0&&j>i,'Missing source boundaries '+begin);
 return app.slice(i,j);
};
test('Hoy offers a one-click canonical manual task editor and an always-visible add button',()=>{
 assert.match(dash,/data-desk-add-task>＋ Añadir tarea/);
 assert.match(dash,/app\(\)\?\.openNewItem\?\.\(prefs.selectedDate\)/);
 assert.match(app,/openNewItem:\(date\)=>newPanel\(date\)/);
 assert.match(css,/\.desk-add-task/);
});
test('panel reparenting scrolls Isabella to the most recent message even when Hoy has focus',()=>{
 assert.match(dash,/const chatParentBefore = parts\.chat\.parentElement/);
 assert.match(dash,/if \(chatParentBefore!==parts\.chat\.parentElement\) scrollChatAfterGridChange\(\)/);
 assert.match(dash,/setTimeout\(\(\)=>\{if\(shell\)app\(\)\?\.scrollChatToLatest\?\.\(\);\},90\)/);
});
test('reordering Hoy writes canonical sortOrder and emits task mutations for Work sync',()=>{
 const state={tasks:[
   {id:'a',date:'2026-10-19',sortOrder:10,title:'A'},
   {id:'b',date:'2026-10-19',sortOrder:20,title:'B'},
   {id:'c',date:'2026-10-19',sortOrder:30,title:'C'},
   {id:'other',date:'2026-10-20',sortOrder:10,title:'Other'}
 ]}, calls=[];
 const context={state,taskOrder:(a,b)=>a.sortOrder-b.sortOrder,
  orderedPendingTaskElements:()=>[],mutation:(...args)=>calls.push(args),
  clone:x=>structuredClone(x),save:()=>calls.push(['save'])};
 const code=part('function commitTaskOrderByIds(','function mutation(entityType');
 vm.runInNewContext(code,context);
 const changed=vm.runInNewContext("reorderDeskTasks('2026-10-19',['c','a','b'])",context);
 assert.equal(changed,true);
 assert.deepEqual(state.tasks.slice(0,3).map(t=>t.sortOrder),[20,30,10]);
 assert.equal(state.tasks[3].sortOrder,10);
 assert.equal(calls.filter(x=>x[0]==='task').length,3);
 assert.equal(calls.filter(x=>x[0]==='save').length,1);
 assert.equal(vm.runInNewContext("reorderDeskTasks('2026-10-19',['c','a','b'])",context),false);
});
test('estimate edits original task metadata and preserves existing fields without creating new tasks',()=>{
 const task={id:'t1',title:'Fassadenschnitte',date:'2026-10-19',metadata:{source:'manual',planning:{priority_note:'keep'}}};
 const state={tasks:[task],events:[]};
 const fields={'#deskTaskEstimate':{value:'180'},'#deskEstimateSave':{},'#deskEstimateCancel':{}};
 const calls=[],context={state,document:{querySelectorAll:()=>[]},
  $:selector=>fields[selector],
  modal:(title,body)=>calls.push(['modal',title,body]),
  mutation:(...args)=>calls.push(args),
  clone:x=>structuredClone(x),save:()=>calls.push(['save']),
  closeModal:()=>{},renderCalendar:()=>{},
  esc:x=>String(x)};
 const code=part('function setTaskEstimatedMinutes(taskId){','function autonomyEvidenceHTML(');
 vm.runInNewContext(code,context);
 assert.equal(vm.runInNewContext("setTaskEstimatedMinutes('t1')",context),true);
 fields['#deskEstimateSave'].onclick();
 assert.equal(state.tasks.length,1);
 assert.equal(task.metadata.planning.estimated_minutes,180);
 assert.equal(task.metadata.source,'manual');
 assert.equal(task.metadata.planning.priority_note,'keep');
 assert.equal(calls.filter(x=>x[0]==='task'&&x[1]==='update').length,1);
});
test('week calendar native touch and mouse share the canonical mutation and support cross-day drops',()=>{
 assert.match(app,/document\.elementFromPoint\(t\.clientX,t\.clientY\)\?\.closest\('\.wday\[data-week-date\]'\)/);
 assert.match(app,/commitTaskOrderFromContainer\(row\.parentNode,row\.dataset\.date,row\.dataset\.id\)/);
 assert.match(app,/function initWeekDateDrag\(\)/);
 assert.match(dash,/nativeTimeHost\.append\(node\)/);
 assert.match(dash,/app\(\)\?\.reorderDeskTasks\?\.\(prefs\.selectedDate,ids\)/);
 assert.match(dash,/desk-task-handle/);
 assert.match(dash,/touchstart/);
});
test('Sunsama-like estimates and work sessions are distinct with no new data store or unapproved autoscheduling',()=>{
 assert.match(app,/metadata=\{\.\.\.\(task\.metadata\|\|\{\}\)\}/);
 assert.match(app,/planning\.estimated_minutes=minutes/);
 assert.match(app,/kind:'task_work_session_v1',task_client_key:task\.id/);
 assert.match(app,/remaining=estimate>0\?Math\.max\(0,estimate-subtotal\):0/);
 assert.match(dash,/totalEstimate=plannedTasks\.reduce/);
 assert.match(html,/dashboard-95-2\.css\?v=3/);
 assert.match(html,/app\.js\?v=131/);
 assert.match(html,/dashboard-model\.js\?v=5/);
 assert.match(html,/dashboard\.js\?v=7/);
 assert.match(sw,/isabella-shell-v170/);
});
