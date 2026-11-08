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
const begin=app.indexOf('function newPanel(presetDate=null,kind=\'task\',draft={}){');
const end=app.indexOf('\nfunction autonomyContextLabel(',begin);
assert.ok(begin>=0&&end>begin);
const newPanelCode=app.slice(begin,end);
// 07.11.2026 (Gari): "Agregar" opens the complete task editor at once instead of a short form.
function panel(){
 const nodes={},stats={modals:0,opened:[],saved:0,closed:0,mutations:[]};
 for(const n of ['#newTitle','#newDate','#newTime','#newDuration','#newCat','#newProject','#newNotes','#newSave','#newToTask','#quickTaskStatus'])
  nodes[n]={value:'',textContent:''};
 const state={categories:[{id:'personal',name:'Personal'},{id:'casa',name:'Casa'}],projects:[{id:'p-1',name:'Bernried'}],tasks:[],events:[]};
 const ctx={$:k=>nodes[k],state,esc:v=>String(v??''),modal:(t,h)=>{stats.modals++;stats.html=h},today:()=> '2026-10-24',
  window:{MINDS_TASK_DETAIL:{open:opts=>{stats.opened.push(opts);return Promise.resolve()}}},
  save:()=>stats.saved++,renderCalendar:()=>{},closeModal:()=>stats.closed++,uid:()=> 'event-1',
  mutation:(...a)=>stats.mutations.push(a),Math,Number};
 vm.runInNewContext(newPanelCode+';this.newPanel=newPanel;',ctx);
 return {ctx,nodes,stats,state};
}
test('Calendar + opens the complete task editor with the day, no short form and no local-only task',()=>{
 const p=panel();
 p.ctx.newPanel('2026-10-27');
 assert.equal(p.stats.modals,0,'no short form');
 assert.equal(p.stats.opened.length,1);
 const o=p.stats.opened[0];
 assert.equal(o.date,'2026-10-27');assert.equal(o.categoryKey,'personal');assert.equal(typeof o.onSwitchKind,'function');
 assert.equal(p.state.tasks.length,0);assert.equal(p.stats.mutations.length,0);
 o.onSwitchKind({title:'Reunión',date:'2026-10-28',projectKey:'p-1',notes:'Sala 2',categoryKey:'casa'});
 assert.equal(p.stats.modals,1);
 assert.match(p.stats.html,/value="Reunión"/);assert.match(p.stats.html,/value="2026-10-28"/);
 assert.match(p.stats.html,/<option value="p-1" selected>/);assert.match(p.stats.html,/<option value="casa" selected>/);
 assert.match(p.stats.html,/id="newDuration"/);assert.match(p.stats.html,/id="newNotes"/);
});
test('The event form saves every field once; switching back keeps what was typed',()=>{
 const p=panel();
 p.ctx.newPanel('2026-10-27','event');
 Object.assign(p.nodes['#newTitle'],{value:'Besprechung'});p.nodes['#newDate'].value='2026-10-29';p.nodes['#newTime'].value='16:30';
 p.nodes['#newDuration'].value='90';p.nodes['#newCat'].value='casa';p.nodes['#newProject'].value='p-1';p.nodes['#newNotes'].value='Planos';
 p.nodes['#newSave'].onclick();
 assert.equal(p.state.events.length,1);
 const e=p.state.events[0];
 assert.deepEqual([e.title,e.date,e.start,e.duration,e.categoryId,e.projectId,e.notes],['Besprechung','2026-10-29','16:30',90,'casa','p-1','Planos']);
 assert.equal(p.stats.mutations.length,1);assert.equal(p.stats.closed,1);
 p.nodes['#newToTask'].onclick();
 const o=p.stats.opened.at(-1);
 assert.deepEqual([o.date,o.projectKey,o.categoryKey,o.draft.title,o.draft.notes],['2026-10-29','p-1','casa','Besprechung','Planos']);
});
test('The complete editor creates with one key and reads it back, so a retry never duplicates',()=>{
 assert.match(detail,/clientKey:task\?null:uid\(\),/);
 assert.match(detail,/row\.client_key=ctx\.clientKey\|\|uid\(\);ctx\.clientKey=row\.client_key;/);
 assert.match(detail,/let data=await readBack\(\),error=null;\n\s*if\(!data\)\{\n\s*const inserted=await sb\.from\('isabella_tasks'\)\.insert\(row\)/);
 assert.match(detail,/if\(error\|\|!data\)\{data=await readBack\(\);if\(data\)error=null\}/);
 assert.match(detail,/const button=\$\('#taskDetailCreate'\);button\.disabled=true;/);
});
test('PWA pins both changed scripts and rotates one coherent cache',()=>{
 const html=read('apps/isabella/index.html'),sw=read('apps/isabella/sw.js');
 for(const pin of ['app.js?v=145','task-detail.js?v=5']){
  assert.ok(html.includes(pin),'HTML '+pin);assert.ok(sw.includes(pin),'SW '+pin);
 }
 assert.match(sw,/isabella-shell-v189/);
 assert.match(app,/void window\.MINDS_TASK_DETAIL\.open\(\{date,projectKey:draft\.projectKey\|\|null,/);
 assert.doesNotMatch(app,/MINDS_TASK_DETAIL\.createQuick\(/);
});
