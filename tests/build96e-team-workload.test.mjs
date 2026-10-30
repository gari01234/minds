import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const M=require('../apps/isabella/dashboard-model.js');
const read=name=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const desk=read('dashboard.js'),styles=read('dashboard-workload.css'),
  html=read('index.html'),sw=read('sw.js');

test('workload respects stable identity, unassigned, legacy and zero-task team members',()=>{
  const task=(id,date,startDate,who,estimate=0)=>({
    id,title:id,date,startDate,projectId:'bernried',done:false,archivedAt:null,
    assigneePersonId:who?.personId||null,assignee:who?.name||null,
    metadata:estimate?{planning:{estimated_minutes:estimate}}:{}
  });
  const tA=task('a','2026-10-22','2026-10-19',{personId:'p1',name:'Old name'},120);
  const tB=task('b','2026-10-23',null,{personId:'p2',name:'Julia'},0);
  const none=task('none',null,null,null,0);
  const legacy=task('legacy','2026-10-13',null,{name:'Antes'},45);
  const future=task('future','2026-11-09',null,{personId:'p1',name:'Old name'},1000);
  const completed={...task('completed','2026-10-22',null,null,180),done:true};
  const session=(id,taskKey,date,duration,projectId='bernried')=>({
    id,title:id,date,duration,projectId,metadata:{kind:'task_work_session_v1',task_client_key:taskKey}
  });
  const state={tasks:[tA,tB,none,legacy,future,completed],events:[
    session('aSession','a','2026-10-19',60),
    session('bSession','b','2026-10-23',30),
    session('orphan','missing','2026-10-20',15),
    session('outOfWeek','a','2026-10-26',200),
    session('other','foreign','2026-10-20',80,'schwarz')
  ]};
  const w=M.weeklyPlan(state,'2026-10-19','bernried');
  const people=[{id:'p1',name:'Julia'},{id:'p2',name:'Julia'},{id:'p3',name:'Sin tareas'}];
  const load=M.weeklyWorkload(state,w,people,'bernried');
  assert.equal(load.tasks,4);
  assert.equal(load.groups.length,5);
  const byKey=new Map(load.groups.map(r=>[r.key,r]));
  assert.equal(byKey.get('person:p1').name,'Julia');
  assert.equal(byKey.get('person:p2').name,'Julia');
  assert.equal(byKey.get('person:p1').tasks,1);
  assert.equal(byKey.get('person:p1').estimatedMinutes,120);
  assert.equal(byKey.get('person:p1').dueThisWeek,1);
  assert.equal(byKey.get('person:p2').withoutEstimate,1);
  assert.equal(byKey.get('person:p3').tasks,0);
  assert.equal(byKey.get('unassigned').withoutEstimate,1);
  assert.equal(byKey.get('legacy:Antes').overdue,1);
  assert.equal(byKey.get('legacy:Antes').estimatedMinutes,45);
  assert.equal(load.reservedOwnMinutes,105);
  assert.equal(load.bookings,3);
  assert.equal(load.availabilityKnown,false);
  assert.equal(load.actualTimeKnown,false);
  assert.equal(state.tasks.length,6);
});

test('unrelated and unscheduled future work does not become fictional weekly capacity',()=>{
  const t={id:'future',title:'Later',date:'2026-11-10',startDate:null,projectId:'schwarz',
    assigneePersonId:'member',metadata:{planning:{estimated_minutes:600}}};
  const w=M.weeklyPlan({tasks:[t],events:[]},'2026-10-19','schwarz');
  const result=M.weeklyWorkload({tasks:[t],events:[]},w,[{id:'member',name:'Person'}],'schwarz');
  assert.equal(result.tasks,0);
  assert.equal(result.groups[0].tasks,0);
  assert.equal(result.groups[0].estimatedMinutes,0);
  assert.equal(result.reservedOwnMinutes,0);
  assert.equal(result.availabilityKnown,false);
});

test('the Workload UI reads the private roster and never presents available hours',()=>{
  assert.match(desk,/MINDS_WORK_TEAM\.members\(data\.id\)/);
  assert.match(desk,/from\('isabella_projects'\)\.select\('id'\)\.eq\('client_key',key\)/);
  assert.match(desk,/knownPersonNames\.set\(person\.id,person\.name\)/);
  assert.match(desk,/M\.weeklyWorkload\(state,week,roster,projectId\)/);
  assert.match(desk,/reservedOwnMinutes/);
  assert.match(desk,/sin datos/);
  assert.match(desk,/Sin estimar/);
  assert.match(styles,/desk-week-workload/);
  assert.doesNotMatch(desk,/horas libres por compañera|capacidad disponible \d+/i);
});

test('PWA workload release pins HTML and SW to the same native assets',()=>{
  for(const asset of ['dashboard-model.js?v=5','dashboard.js?v=7','dashboard-workload.css?v=1']){
    assert.ok(html.includes(asset),asset+' missing in HTML');
    assert.ok(sw.includes(asset),asset+' missing in SW');
  }
  assert.match(sw,/isabella-shell-v170/);
});
