import test from 'node:test';
import assert from 'node:assert/strict';
import {officeMilestonesFromPlans,readOfficeTerminplanMilestones} from '../supabase/functions/_shared/office-terminplan.mjs';
import {workRadar} from '../supabase/functions/_shared/isabella-radar.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const P='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',Q='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projects=[{id:P,name:'Proyecto ficticio P'},{id:Q,name:'Proyecto ficticio Q'}];
const plans=[
 {id:'pppp',project_id:P,is_archived:false,state:{tasks:[{type:'milestone',id:'p1',name:'Plazo P',start:'2026-11-15'},
   {type:'task',id:'p2',name:'Actividad interna',start:'2026-11-12'}]}},
 {id:'qqqq',project_id:Q,is_archived:false,state:{tasks:[{type:'milestone',id:'q1',name:'Plazo Q',start:'2026-11-16'}]}}
];
function fakeSb({member=A,fail=false,history=[]}={}){
  const rows={
    office_project_members:[{user_id:A,project_id:P},{user_id:B,project_id:Q}],
    office_terminplan_instances:plans,office_projects:projects,
    isabella_projects:projects.map(p=>({...p,archived:false})),
    minds_work_threads:[],minds_work_memory:[]
  };
  return {from(table){
    history.push(table);
    let data=rows[table]||[],error=fail&&table==='office_project_members'?{message:'unavailable'}:null;
    const chain={
      select(){return this},
      eq(key,value){data=data.filter(row=>row[key]===value);return this},
      in(key,values){data=data.filter(row=>values.includes(row[key]));return this},
      gte(){return this},
      order(){return this},
      limit:async n=>({data:data.slice(0,n),error})
    };
    return chain;
  }};
}
test('Office Terminplan mapper includes only dated milestones and never invents tasks',()=>{
  const result=officeMilestonesFromPlans(plans,projects,{from:'2026-11-01',to:'2026-11-30'});
  assert.deepEqual(result.map(x=>x.title),['Plazo P','Plazo Q']);
  assert.ok(result.every(x=>x.kind==='terminplan_milestone'));
  assert.equal(officeMilestonesFromPlans(plans,projects,{from:'2026-11-30',to:'2026-12-10'}).length,0);
});
test('Romy reads Office milestone only from the owner\'s allocated project team',async()=>{
  const a=await readOfficeTerminplanMilestones(fakeSb(),{userId:A,from:'2026-11-01',to:'2026-11-30'});
  const b=await readOfficeTerminplanMilestones(fakeSb(),{userId:B,from:'2026-11-01',to:'2026-11-30'});
  assert.deepEqual(a.milestones.map(x=>x.title),['Plazo P']);
  assert.deepEqual(b.milestones.map(x=>x.title),['Plazo Q']);
  assert.equal(a.status,'ok');assert.equal(b.status,'ok');
});
test('Missing member context and failed source reads do not look like empty Fristen',async()=>{
  assert.equal((await readOfficeTerminplanMilestones(fakeSb(),{userId:''})).status,'unavailable');
  assert.equal((await readOfficeTerminplanMilestones(fakeSb({fail:true}),{userId:A})).status,'unavailable');
});
test('Work radar includes scoped Terminplan Fristen only for Office, preserving Window read path',async()=>{
  const officeReads=[],windowReads=[];
  const result=await workRadar(fakeSb({history:officeReads}),{now:new Date('2026-11-12T12:00:00Z'),userId:A,profile:'office'});
  assert.equal(result.terminplan_status,'ok');
  assert.deepEqual(result.terminplan_fristen.map(x=>x.title),['Plazo P']);
  assert.ok(officeReads.includes('office_project_members'));
  const old=await workRadar(fakeSb({history:windowReads}),{now:new Date('2026-11-12T12:00:00Z')});
  assert.equal(old,null);
  assert.ok(!windowReads.includes('office_project_members'));
});
