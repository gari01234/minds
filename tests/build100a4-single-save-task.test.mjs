import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const detail=read('apps/isabella/task-detail.js');
const app=read('apps/isabella/app.js');
const quickStart=detail.indexOf('async function createQuick({');
const quickEnd=detail.indexOf('\nwindow.MINDS_TASK_DETAIL={',quickStart);
assert.ok(quickStart>=0&&quickEnd>quickStart);
const quickSource=detail.slice(quickStart,quickEnd);
const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const category={id:'cat-uuid',client_key:'personal'},project={id:'project-uuid',client_key:'p-1'};
const data={title:'Una tarea',date:'2026-10-27',categoryKey:'personal',projectKey:'p-1',clientKey:key};
function setup({lostAck=false,auth=true,corrupt=false}={}){
 const rows=new Map(),counts={writes:0,reads:0};
 const fake={
  auth:{getSession:async()=>({data:{session:auth?{user:{id:owner}}:null},error:null})},
  from(table){
   assert.equal(table,'isabella_tasks');
   const query={
    select(){return this},eq(){return this},
    insert(row){this.pending={...row};return this},
    async maybeSingle(){
      if(this.pending){
       counts.writes++;
       const record={id:'task-1',user_id:owner,...this.pending,updated_at:'2026-10-24T09:20:00Z'};
       rows.set(record.client_key,record);this.pending=null;
       if(lostAck)return {data:null,error:{message:'Connection lost after commit'}};
       return {data:{id:record.id},error:null};
      }
      counts.reads++;const record=rows.get(key)||null;
      return {data:record&&corrupt?{...record,due_date:'2026-10-26'}:record,error:null};
    }
   };
   return query;
  }
 };
 const ctx={sb:fake,readChoices:async()=>({categories:[category],projects:[project]}),
   Date,Number,String,RegExp,Error,Promise,Object};
 vm.runInNewContext(quickSource+'\nthis.quick=createQuick;',ctx);
 return {quick:ctx.quick,rows,counts};
}
test('one Guardar creates one canonical task with owner-scoped readback and mapped taxonomy',async()=>{
 const x=setup();
 const task=await x.quick(data);
 assert.equal(task.title,data.title);assert.equal(task.due_date,data.date);
 assert.equal(task.project_id,'project-uuid');assert.equal(task.category_id,'cat-uuid');
 assert.equal(x.counts.writes,1);assert.ok(x.counts.reads>=2);
 const same=await x.quick(data);
 assert.equal(same.id,task.id);assert.equal(x.counts.writes,1,'retry must reuse canonical key');
});
test('lost HTTP acknowledgement recovers same committed task without duplicate insert',async()=>{
 const x=setup({lostAck:true});
 const task=await x.quick(data);
 assert.equal(task.id,'task-1');assert.equal(x.counts.writes,1);
 await x.quick(data);assert.equal(x.counts.writes,1);
});
test('auth, unknown taxonomy and divergent canonical readback fail closed',async()=>{
 await assert.rejects(setup({auth:false}).quick(data),/Inicia sesión/);
 const x=setup();
 await assert.rejects(x.quick({...data,projectKey:'missing'}),/proyecto ya no/);
 assert.equal(x.counts.writes,0);
 await assert.rejects(x.quick({...data,date:'garbage'}),/fecha/);
 const wrong=setup({corrupt:true});
 await assert.rejects(wrong.quick(data),/otros datos/);
 assert.equal(wrong.counts.writes,1);
});
const begin=app.indexOf('function newPanel(presetDate=null){');
const end=app.indexOf('\nfunction autonomyContextLabel(',begin);
assert.ok(begin>=0&&end>begin);
const newPanelCode=app.slice(begin,end);
function form(){
 const nodes={};
 const names=['#newType','#newTitle','#newDate','#newCat','#newProject','#newTime','#newSave','#quickTaskStatus'];
 for(const n of names)nodes[n]={value:'',textContent:'',disabled:false,classList:{toggle(){}}};
 nodes['#newType'].value='task';nodes['#newTitle'].value='Una tarea';
 nodes['#newDate'].value='2026-10-27';nodes['#newCat'].value='personal';
 const stats={modals:0,legacyCreates:0,saved:0,closed:0,calls:[],timeouts:[]};
 let resolveWork;
 const ctx={$:k=>nodes[k],state:{categories:[{id:'personal',name:'Personal'}],projects:[],tasks:[],events:[]},
  esc:v=>String(v),modal:()=>stats.modals++,today:()=> '2026-10-24',
  window:{MINDS_TASK_DETAIL:{createQuick:params=>{stats.calls.push(params);
    return new Promise(resolve=>{resolveWork=resolve});}},
    ISABELLA_SYNC_PULL_NOW:async()=>true},
  crypto:{randomUUID:()=>key},setTimeout:fn=>{stats.timeouts.push(fn)},Promise,
  save:()=>stats.saved++,renderCalendar:()=>{},closeModal:()=>stats.closed++,
  uid:()=>{stats.legacyCreates++;return 'legacy-id'},mutation:()=>{stats.legacyCreates++}};
 vm.runInNewContext(newPanelCode+';this.newPanel=newPanel;',ctx);
 ctx.newPanel();return {ctx,nodes,stats,resolve:task=>resolveWork(task)};
}
test('Calendar and Tareas share one-button creation and prevent in-flight double click',async()=>{
 const f=form();
 assert.equal(f.stats.modals,1);
 const first=f.nodes['#newSave'].onclick();
 const second=f.nodes['#newSave'].onclick();
 assert.equal(f.stats.calls.length,1);
 assert.equal(f.stats.modals,1,'no second creation modal');
 assert.equal(f.stats.legacyCreates,0,'no local-only task');
 assert.equal(f.nodes['#newSave'].disabled,true);
 f.resolve({id:'task-1',title:'Una tarea'});
 await Promise.all([first,second]);
 assert.match(f.nodes['#quickTaskStatus'].textContent,/verificada en Supabase/);
 assert.equal(f.stats.closed,0);
 f.stats.timeouts[0]();assert.equal(f.stats.closed,1);
});
test('failed Guardar does not close, and retry preserves same idempotency key',async()=>{
 const f=form();
 const first=f.nodes['#newSave'].onclick();
 f.resolve(null);
 await first;
 assert.equal(f.stats.closed,0);
 assert.equal(f.nodes['#newSave'].disabled,false);
 const second=f.nodes['#newSave'].onclick();
 assert.equal(f.stats.calls.length,2);
 assert.equal(f.stats.calls[0].clientKey,f.stats.calls[1].clientKey);
 f.resolve({id:'task-1',title:'Una tarea'});await second;
 assert.equal(f.stats.legacyCreates,0);
});
test('PWA pins both changed scripts and rotates one coherent cache',()=>{
 const html=read('apps/isabella/index.html'),sw=read('apps/isabella/sw.js');
 for(const pin of ['app.js?v=131','task-detail.js?v=4']){
  assert.ok(html.includes(pin),'HTML '+pin);assert.ok(sw.includes(pin),'SW '+pin);
 }
 assert.match(sw,/isabella-shell-v172/);
 assert.match(app,/await window\.MINDS_TASK_DETAIL\.createQuick\(attempt\)/);
 assert.doesNotMatch(app,/MINDS_TASK_DETAIL\.open\(\{title,date,categoryKey:categoryId,projectKey:projectId\}\)/);
});
