import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const chat=readFileSync('supabase/functions/isabella-chat/index.ts','utf8');
const app=readFileSync('apps/isabella/app.js','utf8');
const bindCode=stripTypeScriptTypes(chat.slice(chat.indexOf('async function bindRoutineProposal'),chat.indexOf('async function recordUsage')));
const routine={id:'canonical-id',title:'News',instruction:'News and agenda',schedule:{kind:'weekly',time:'08:00',weekdays:[1,3]},timezone:'Europe/Berlin',enabled:false};
async function bind(p,result={status:'ok',routines:[routine]}){
 const ctx=vm.createContext({searchRoutines:async()=>result});vm.runInContext(bindCode,ctx);
 return JSON.parse(JSON.stringify(await ctx.bindRoutineProposal({},p)));
}
test('time-only update keeps canonical instruction, weekdays, timezone and paused state',async()=>{
 const p=await bind({kind:'routine',action:'update',target_id:'canonical-id',time:'07:45'});
 assert.equal(p.time,'07:45');assert.equal(p.instruction,routine.instruction);
 assert.deepEqual(p.weekdays,[1,3]);assert.equal(p.timezone,routine.timezone);
 assert.equal(p.before.enabled,false);assert.equal(p.before.schedule.time,'08:00');
});
test('pause ignores model content patches and snapshots the exact canonical target',async()=>{
 const p=await bind({action:'pause',target_id:'canonical-id',instruction:'overwrite',title:'wrong'});
 assert.equal(p.title,'News');assert.equal(p.instruction,routine.instruction);
 assert.equal(p.target_id,routine.id);
});
test('missing target and unavailable reads cannot become routine proposals',async()=>{
 await assert.rejects(bind({action:'update',target_id:''}));
 await assert.rejects(bind({action:'update',target_id:'id'},{status:'error',routines:[]}));
 await assert.rejects(bind({action:'update',target_id:'id'},{status:'ok',routines:[]}));
});
const applyCode=app.slice(app.indexOf('async function createRoutineProposal'),app.indexOf('async function dbWorkProjectByName'));
function client(result){const messages=[],calls=[];const ctx=vm.createContext({window:{MINDS_SUPABASE:{rpc:async(...args)=>{calls.push(args);return result}}},closeModal(){},say:(role,msg)=>messages.push(msg)});vm.runInContext(applyCode,ctx);return {ctx,messages,calls};}
test('routine RPC errors and unverified responses never announce success',async()=>{
 for(const result of [{error:{message:'routine_changed_since_review'}},{data:{status:'applied'}},{data:{status:'pending',receipt_id:'x'}}]){
  const {ctx,messages}=client(result);await assert.rejects(ctx.createRoutineProposal({request_id:'req'}));assert.equal(messages.length,0);
 }
});
test('routine UI routes retries through the same RPC and never inserts an optimistic duplicate',async()=>{
 const {ctx,messages,calls}=client({data:{status:'already_applied',receipt_id:'receipt',after:{title:'News',enabled:false}}});
 await ctx.createRoutineProposal({request_id:'same-id',kind:'routine',action:'pause'});
 assert.equal(calls[0][0],'minds_commit_reviewed_routine_v1');assert.equal(calls[0][1].p_request_id,'same-id');
 assert.match(messages[0],/Pausé/);
});
test('all routine actions are exposed in the fast agenda path and read recovery supports canonical lookup',()=>{
 const fast=chat.slice(chat.indexOf('const fastAgendaToolNames='),chat.indexOf('const fastAgendaTools='));
 for(const name of ['search_routines','update_routine','pause_routine','resume_routine','delete_routine'])assert.ok(fast.includes('"'+name+'"'));
 assert.match(chat,/search_routines:"allow"/);
 assert.match(chat,/RECOVERABLE_READ_TOOLS=.*"search_routines"/);
});
test('old clients cannot receive mutation proposals their legacy UI would interpret as creation',()=>{
 assert.match(chat,/routineReviewSupported=context.routine_review_version===1&&surface==="chat_browser"/);
 assert.match(chat,/filter\(\(t:any\)=>routineReviewSupported\|\|!routineMutationTools.has/);
 assert.match(chat,/if\(!routineReviewSupported\)/);
 const ai=readFileSync('apps/isabella/ai.js','utf8');
 assert.match(ai,/routine_review_version:window.MINDS_ROUTINE_REVIEW_VERSION===1\?1:0/);
 assert.match(app,/window.MINDS_ROUTINE_REVIEW_VERSION=1/);
});
