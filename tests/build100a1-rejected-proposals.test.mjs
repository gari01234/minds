import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {unregisteredReviewAttempt,turnOutcomeReceipt} from '../supabase/functions/_shared/turn-capability-contract.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const policy=name=>['create_task','update_task','update_event','create_event','delete_task'].includes(name)?'confirm':
  ['search_calendar','search_memory'].includes(name)?'allow':'deny';
const safe='No pude registrar una propuesta nueva y verificable';

test('failed registration cannot be mistaken for a created proposal in any language',()=>{
 for(const [tools,proposals,expected] of [
   [['update_task'],[],true],
   [['search_calendar','update_task'],[],true],
   [['create_task'],[],true],
   [['update_event'],[],true],
   [['search_calendar'],[],false],
   [['create_task'],[{request_id:'review-id'}],false],
   [['unknown_tool'],[],false],
   [[],[],false]
 ]) assert.equal(unregisteredReviewAttempt(tools,proposals,policy),expected,JSON.stringify(tools));
 assert.equal(unregisteredReviewAttempt(['update_task'],[],null),false);
 assert.equal(turnOutcomeReceipt({proposals:[]}).outcome,'answered');
 const region=server.slice(server.indexOf('let reply=String(extractText(payload)'),server.indexOf('for(const intent of standingIntents||[])'));
 assert.match(region,/unregisteredReviewAttempt\(usedTools,toolProposals,policyMode\)/);
 assert.match(region,/else if\(reviewAttemptWithoutReceipt\)/);
 assert.match(region,/No pude registrar una propuesta nueva y verificable/);
 assert.ok(region.indexOf('else if(reviewAttemptWithoutReceipt)')<region.indexOf('else if(fastAgenda&&!toolProposals.length)'));
 assert.doesNotMatch(region,/corrígelo|Besprechungsnotiz|corrige la tarea/);
});

test('confirmed task update: one real RPC receipt plus matching canonical reread is required',async()=>{
 const start=app.indexOf('async function applyVerifiedTaskUpdate(p){');
 const end=app.indexOf('\nasync function applyVerifiedTaskCreate(',start);
 assert.ok(start>0&&end>start);
 const code=app.slice(start,end);
 const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const expected={id:'canonical-1',client_key:'client-1',title:'Tarea verificable',
   due_date:'2026-10-27',notes:'',reminder_time:null,project_id:null,category_id:null,
   updated_at:'2026-10-23T11:00:00Z'};
 const before={id:'client-1',title:'Tarea verificable',date:'2026-10-25'};
 const make=({receiptOverride={},rowOverride={},writeError=null,readError=null}={})=>{
  let writes=0,reads=0,saved=0,rendered=0,closed=0;const spoken=[];
  const sb={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},
   rpc:async(name,args)=>{
    writes++;assert.equal(name,'minds_commit_reviewed_task_update_v01');
    assert.equal(args.p_request_id,requestId);
    return {data:{status:'applied',receipt_id:'receipt-1',entity_id:'canonical-1',
       entity_client_key:'client-1',after:{title:expected.title,date:expected.due_date,
          updated_at:expected.updated_at},...receiptOverride},error:writeError};
   },
   from(table){assert.equal(table,'isabella_tasks');return {
    select(){return this},eq(){return this},async single(){reads++;return {data:{...expected,...rowOverride},error:readError}}
   }}
  };
  const state={tasks:[{...before}]};
  const context={window:{MINDS_SUPABASE:sb},state,save:()=>saved++,renderCalendar:()=>rendered++,
   closeModal:()=>closed++,say:(...x)=>spoken.push(x),Date,Error};
  vm.runInNewContext(code+'\nthis.update=applyVerifiedTaskUpdate;',context);
  return {update:context.update,state,spoken,counts:()=>({writes,reads,saved,rendered,closed})};
 };
 const good=make();
 const done=await good.update({request_id:requestId});
 assert.equal(done.receipt_id,'receipt-1');
 assert.equal(good.state.tasks[0].date,'2026-10-27');
 assert.match(good.spoken[0][1],/Confirmé en Supabase/);
 assert.deepEqual(good.counts(),{writes:1,reads:1,saved:1,rendered:1,closed:1});
 for(const overrides of [
  {receiptOverride:{receipt_id:null}},
  {receiptOverride:{status:'rejected'}},
  {rowOverride:{due_date:'2026-10-26'}},
  {rowOverride:{title:'Inconsistente'}},
  {readError:{message:'read failed'}},
  {writeError:{message:'blocked'}}
 ]){
  const a=make(overrides);
  await assert.rejects(a.update({request_id:requestId}));
  assert.equal(a.state.tasks[0].date,before.date);
  assert.equal(a.counts().saved,0);
  assert.equal(a.counts().rendered,0);
  assert.equal(a.counts().closed,0);
  assert.equal(a.spoken.length,0);
 }
});
