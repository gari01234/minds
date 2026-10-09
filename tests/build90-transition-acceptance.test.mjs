import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('apps/isabella/app.js');
const sync=read('apps/isabella/sync.js');
const theory=read('apps/theory/v09.js');
const work=read('apps/isabella/work.js');
function part(source,start,end){
  const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Missing function boundary: '+start);
  return source.slice(i,j);
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('90.4 manual calendar creation retains date, category and canonical project on the same task',()=>{
  const elements={
    '#newType':{value:'task'},'#newDate':{value:'2026-10-15'},
    '#newTime':{value:'09:00',classList:{toggle(){}}},
    '#newTitle':{value:'Revisar Schnitt'},'#newCat':{value:'trabajo'},
    '#newProject':{value:'bernried'},'#newSave':{}
  };
  const state={tasks:[],events:[],categories:[{id:'trabajo',name:'Trabajo'}],projects:[{id:'bernried',name:'Bernried'}]};
  const calls=[];
  const c={state,$:s=>elements[s],modal:(title,html)=>calls.push(['modal',title,html]),esc,
    uid:()=> 'task-one',today:()=> '2026-10-09',nextTaskOrder:()=>10,
    mutation:(...args)=>calls.push(['mutation',...args]),save:()=>calls.push(['save']),closeModal:()=>{},renderCalendar:()=>{}};
  const fn=vm.runInNewContext('('+part(app,'function newPanel(presetDate=null){','function autonomyContextLabel(').trim()+')',c);
  fn('2026-10-15');
  assert.match(calls[0][2],/id="newProject"/);
  assert.match(calls[0][2],/value="2026-10-15"/);
  elements['#newSave'].onclick();
  assert.equal(state.tasks.length,1);
  const task=state.tasks[0];
  assert.deepEqual([task.id,task.title,task.date,task.categoryId,task.projectId,task.sortOrder],
    ['task-one','Revisar Schnitt','2026-10-15','trabajo','bernried',10]);
  assert.equal(calls.find(x=>x[0]==='mutation')?.[2],'create');
});

test('90.4 event creation also preserves explicit project and date',()=>{
  const elements={
    '#newType':{value:'event'},'#newDate':{value:'2026-10-21'},
    '#newTime':{value:'16:30',classList:{toggle(){}}},
    '#newTitle':{value:'Besprechung'},'#newCat':{value:'trabajo'},
    '#newProject':{value:'schwarz'},'#newSave':{}
  };
  const state={tasks:[],events:[],categories:[{id:'trabajo',name:'Trabajo'}],projects:[{id:'schwarz',name:'Schwarz'}]};
  const c={state,$:s=>elements[s],modal:()=>{},esc,uid:()=> 'event-one',
    today:()=> '2026-10-09',nextTaskOrder:()=>10,mutation:()=>{},save:()=>{},closeModal:()=>{},renderCalendar:()=>{}};
  const fn=vm.runInNewContext('('+part(app,'function newPanel(presetDate=null){','function autonomyContextLabel(').trim()+')',c);
  fn('2026-10-21');
  elements['#newSave'].onclick();
  assert.deepEqual([state.events[0].projectId,state.events[0].start,state.events[0].date],['schwarz','16:30','2026-10-21']);
});

test('90.4 opening an existing database task waits for a successful canonical refresh',async()=>{
  const events=[];
  const context={
    window:{
      MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},
        from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:{id:'uuid',client_key:'key'},error:null})})})},
      ISABELLA_SYNC_PULL_NOW:async()=>{events.push('pulled');return true}
    },
    itemBy:(kind,id)=>{events.push('lookup');return{id}},
    editItem:(kind,id)=>events.push('edit:'+id),
    modal:()=>events.push('error'),esc
  };
  const fn=vm.runInNewContext('('+part(app,'async function openCanonicalTaskById(rowId){','function itemActions(').trim()+')',context);
  await fn('uuid');
  assert.deepEqual(events,['pulled','lookup','edit:key']);
});

test('90.4 failed canonical refresh refuses to edit potentially stale task state',async()=>{
  const events=[];
  const context={
    window:{MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},
      from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:{id:'uuid',client_key:'key'},error:null})})})},
      ISABELLA_SYNC_PULL_NOW:async()=>false},
    itemBy:()=>({id:'key'}),editItem:()=>events.push('edited'),
    modal:title=>events.push(title),esc
  };
  const fn=vm.runInNewContext('('+part(app,'async function openCanonicalTaskById(rowId){','function itemActions(').trim()+')',context);
  await fn('uuid');
  assert.deepEqual(events,['No pude abrir la tarea']);
});

test('90.4 queued pull must resolve after its actual sync, not immediately',()=>{
  assert.match(sync,/queuedSyncWaiters/);
  assert.match(sync,/return new Promise\(resolve=>queuedSyncWaiters\.push\(resolve\)\)/);
  assert.match(sync,/syncNow\(next\)\.then\(ok=>waiters\.forEach\(resolve=>resolve\(ok\)\)/);
  assert.match(app,/refreshed!==true/);
  assert.match(app,/dataset\.section==='feed'\)void window\.MINDS_SITUATION\?\.render/);
  assert.match(work,/work_sort_order:\(i\+1\)\*10/);
  assert.ok(!work.includes("update({sort_order:"),'Work ordering is separate from calendar ordering');
});

test('90.5 Sofía iframe queues opening until loaded and preserves iframe on subsequent visits',()=>{
  const sent=[],events={};
  const frame={dataset:{},contentWindow:{postMessage:m=>sent.push(m)},
    addEventListener:(name,handler)=>events[name]=handler};
  const readingClass={toggle(){}},bodyClass={toggle(){}};
  const document={body:{dataset:{section:'assistant'},classList:bodyClass}};
  const elements={'#readingsFrame':frame,'#readingsScreen':{classList:readingClass}};
  const c={window:{addEventListener:(name,handler)=>events['window-'+name]=handler},
    location:{pathname:'/minds/isabella/',origin:'https://example.com'},
    document,$:s=>elements[s],show:name=>{document.body.dataset.section=name;c.testBridge?.ensureReadings()},queuedSofiaRequest:null};
  const source=part(app,'function readingsUrl(){','let pendingReplyTo=null;');
  vm.runInNewContext(source+';globalThis.testBridge={openSofia,ensureReadings};',c);
  c.testBridge.openSofia('Explica esta lectura');
  assert.equal(sent.length,0,'Do not post before iframe load');
  assert.ok(frame.src.includes('../theory/?embedded=1'));
  events.load();
  assert.equal(sent[0].type,'minds:sofia-state-request');
  assert.equal(sent[1].type,'minds:sofia-prompt');
  assert.equal(sent[1].prompt,'Explica esta lectura');
  const sameSrc=frame.src;
  c.testBridge.ensureReadings();
  assert.equal(frame.src,sameSrc);
  assert.match(theory,/minds:sofia-state-request/);
});

test('90.6 retained destinations, document transfer, reduced motion and source scopes remain explicit',()=>{
  const shell=read('apps/isabella/shell.js'),css=read('apps/isabella/app.css');
  const screens=['assistant','calendar','feed','work','readings','ideas'];
  for(const screen of screens)assert.match(shell,new RegExp('data-screen="'+screen+'"'));
  assert.match(shell,/id="workFileInput"/);
  assert.match(work,/uploadFiles\(fs\)/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/@media\(min-width:1100px\)/);
  assert.match(app,/e\.origin!==location\.origin\|\|e\.source!==frame\?\.contentWindow/);
  assert.match(shell,/data-nav="calendar"/);
  assert.match(app,/window\.MINDS_WORK\?\.render/);
});
