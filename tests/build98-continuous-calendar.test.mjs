import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const P=require('../apps/isabella/calendar-plan.js');
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const app=read('app.js'),css=read('calendar-spans.css'),html=read('index.html'),sw=read('sw.js');
const task=(id,startDate,date,projectId='bernried',assigneePersonId=null)=>({
  id,title:id,projectId,assigneePersonId,startDate,date,done:false,archivedAt:null
});

test('valid local dates, inclusive ranges and intervals never invent time worked',()=>{
  assert.equal(P.valid('2026-02-30'),false);
  assert.equal(P.valid('2026-10-20'),true);
  assert.equal(P.addDays('2026-10-31',1),'2026-11-01');
  assert.equal(P.monday('2026-11-01'),'2026-10-26');
  assert.deepEqual(P.interval(task('a','2026-10-20','2026-10-23')),
    {start:'2026-10-20',end:'2026-10-23',invalid:false});
  assert.deepEqual(P.interval(task('a','2026-10-25','2026-10-22')),
    {start:'2026-10-22',end:'2026-10-22',invalid:true});
  assert.equal(P.interval(task('without-dates',null,null)),null);
});

test('one canonical task flows continuously across weeks and month boundary',()=>{
  const main=task('multi','2026-10-29','2026-11-04');
  const result=P.plan({tasks:[main]},'2026-10-19',3);
  assert.equal(result.weeks.length,3);
  assert.equal(result.weeks[0].segments.length,0);
  assert.deepEqual(result.weeks[1].segments.map(s=>[s.task.id,s.col,s.length,s.continuesBefore,s.continuesAfter]),
    [['multi',4,4,false,true]]);
  assert.deepEqual(result.weeks[2].segments.map(s=>[s.task.id,s.col,s.length,s.continuesBefore,s.continuesAfter]),
    [['multi',1,3,true,false]]);
  assert.equal(main.startDate,'2026-10-29');
  assert.equal(main.date,'2026-11-04');
});

test('weeks keep identical task identity, no copies for booked sessions or multiple days',()=>{
  const a=task('task','2026-10-19','2026-10-23');
  const state={tasks:[a,a],events:[
    {id:'session1',date:'2026-10-20',metadata:{kind:'task_work_session_v1',task_client_key:'task'}},
    {id:'session2',date:'2026-10-22',metadata:{kind:'task_work_session_v1',task_client_key:'task'}}
  ]};
  const result=P.plan(state,'2026-10-19');
  assert.equal(result.weeks[0].segments.length,1);
  assert.equal(result.weeks[0].segments[0].task,a);
  assert.equal(result.weeks[0].segments[0].length,5);
  assert.equal(state.events.length,2);
  assert.equal(state.tasks.length,2);
});

test('project and named-person filtering is by stable membership key',()=>{
  const a=task('a','2026-10-19','2026-10-21','bernried','y-id');
  const b=task('b','2026-10-20','2026-10-23','bernried','a-id');
  const c=task('c','2026-10-20','2026-10-23','schwarz','y-id');
  const legacy={...task('legacy','2026-10-20','2026-10-23'),assignee:'Antigua'};
  const state={tasks:[a,b,c,legacy]};
  const got=P.plan(state,'2026-10-19',1,{projectId:'bernried',personKey:'person:y-id'});
  assert.deepEqual(got.weeks[0].segments.map(s=>s.task.id),['a']);
  assert.equal(P.personKey(legacy),'legacy:Antigua');
  assert.deepEqual(P.plan(state,'2026-10-19',1,{personKey:'legacy:Antigua'}).weeks[0].segments.map(s=>s.task.id),['legacy']);
  assert.equal(P.personKey({}),'unassigned');
});

test('lanes do not overlap, month limit reveals explicit hidden tasks',()=>{
  const items=Array.from({length:7},(_,i)=>task('t'+i,'2026-10-19','2026-10-23'));
  const small=P.plan({tasks:items},'2026-10-19',1,{},3).weeks[0];
  assert.equal(small.segments.length,3);
  assert.equal(small.hidden,4);
  assert.deepEqual(small.segments.map(s=>s.lane),[0,1,2]);
  assert.equal(P.plan({tasks:items},'2026-10-19',1,{},20).weeks[0].segments.length,7);
});

test('Build 98 uses existing native day/week/month, direct confirmation and no invented colleague sessions',()=>{
  assert.match(app,/function nativePlanBand\(/);
  assert.match(app,/nativePlanBand\(monthPlanning\.weeks\[r\],true\)/);
  assert.match(app,/nativePlanBand\(projection\.weeks\[0\]\)/);
  assert.match(app,/return P\.plan\(\{\.\.\.state,tasks:spanningTasks\},anchor,weeks,filters,rows\)/);
  assert.match(app,/data-native-filter="person"/);
  assert.match(app,/state\.nativePlanShowAll=!state\.nativePlanShowAll/);
  assert.match(app,/dayColors\(di,nativePlanFilters\(\)\)/);
  assert.match(app,/Single-day tasks retain native drag/);
  assert.match(app,/period\.start<period\.end/);
  for(const selector of ['data-native-filter','data-native-show-all','data-plan-open','data-plan-edge']){
    assert.ok(app.includes(`$('[${selector}]').forEach`),'collection selector must use $ '+selector);
  }
  assert.match(app,/window\.MINDS_WORK_TEAM\.members\(data\.id\)/);
  assert.match(app,/if\(edge==='start'\)nextStart=P\.addDays/);
  assert.match(app,/\.eq\('updated_at',row\.updated_at\)/);
  assert.match(app,/Las sesiones reservadas no se han movido/);
  assert.match(app,/edge==='move'/);
  assert.match(app,/start_date:nextStart,due_date:nextDue/);
  assert.match(css,/touch-action:pan-y/);
  assert.match(app,/filters\.personKey\?\[\]:state\.events\.filter/);
  assert.match(css,/minds-month-span-week/);
  assert.match(css,/minds-plan-span-handle/);
  assert.match(app,/function day\(\)/);
});

test('PWA caches matching native calendar assets and loads pure model before main script',()=>{
  const assets=['calendar-plan.js?v=2','calendar-spans.css?v=1','app.js?v=127'];
  for(const file of assets){assert.ok(html.includes(file),file+' absent HTML');assert.ok(sw.includes(file),file+' absent SW')}
  assert.ok(html.indexOf('calendar-plan.js?v=2')<html.indexOf('app.js?v=127'));
  assert.match(sw,/isabella-shell-v163/);
});