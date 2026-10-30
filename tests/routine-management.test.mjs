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
const searchCode=stripTypeScriptTypes(chat.slice(chat.indexOf('async function searchRoutines'),chat.indexOf('async function bindRoutineProposal')));
function catalogClient({error=null,user={id:'owner'},rows=null}={}){
 const calls=[];
 const stored=rows||[
  {id:'a',user_id:'owner',title:'Resumen diario del día',enabled:true,schedule:{kind:'daily',time:'07:45'}},
  {id:'b',user_id:'owner',title:'Resumen diario de noticias internacionales',enabled:true,schedule:{kind:'daily',time:'08:00'}},
  {id:'c',user_id:'other',title:'Private other routine',enabled:true,schedule:{kind:'daily',time:'10:00'}}
 ];
 let selected=stored;
 const q={select(){return this},eq(key,value){calls.push([key,value]);selected=selected.filter(r=>r[key]===value);return this},ilike(){throw Error('No title filtering allowed')},order(){return this},async range(a,b){return {data: error?null:selected.slice(a,b+1),count:selected.length,error}}};
 const ctx=vm.createContext({supabaseClient:()=>({auth:{getUser:async()=>({data:{user}})},from(){selected=stored;return q}})});
 vm.runInContext(searchCode,ctx);return {ctx,calls};
}
test('production failing search phrases return both canonical brief schedules, with owner isolation',async()=>{
 for(const query of ['resumen diario brief noticias','brief','resumen diario noticias 07:45 08:00']){
  const {ctx,calls}=catalogClient();const r=await ctx.searchRoutines({}, {query});
  assert.equal(r.status,'ok');assert.equal(r.scope,'owned_routine_catalog');assert.equal(r.total,2);assert.equal(r.complete,true);
  assert.deepEqual(Array.from(r.routines,x=>x.schedule.time),['07:45','08:00']);assert.deepEqual(calls,[['user_id','owner']]);
 }
});
test('exact ID lookup remains bound and is not an empty-catalog claim',async()=>{
 const {ctx}=catalogClient();const r=await ctx.searchRoutines({}, {target_id:'missing'});
 assert.equal(r.total,0);assert.equal(r.scope,'exact_routine_id');assert.match(r.guidance,/does not establish an empty catalog/);
});
test('read failures have no empty routines array and do not look like successful absence',async()=>{
 for(const options of [{error:{message:'database unavailable'}},{user:null}]){
  const {ctx}=catalogClient(options);const r=await ctx.searchRoutines({},{});
  assert.notEqual(r.status,'ok');assert.equal(r.routines,undefined);assert.equal(r.total,undefined);
 }
});
test('catalog pagination explicitly marks incomplete reads',async()=>{
 const rows=Array.from({length:101},(_,i)=>({id:String(i),user_id:'owner'}));
 const {ctx}=catalogClient({rows});const first=await ctx.searchRoutines({},{});
 assert.equal(first.total,101);assert.equal(first.routines.length,100);assert.equal(first.complete,false);assert.equal(first.next_offset,100);
 const last=await ctx.searchRoutines({},{offset:100});assert.equal(last.routines.length,1);assert.equal(last.next_offset,null);assert.equal(last.complete,false);
});
