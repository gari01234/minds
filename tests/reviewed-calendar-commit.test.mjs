import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../apps/isabella/app.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261013112500_minds_calendar_reviewed_task_commit_v01.sql",import.meta.url),"utf8");
const begin=app.indexOf("async function applyVerifiedTaskUpdate("),end=app.indexOf("\nfunction applyProposal(",begin);
assert.ok(begin>0&&end>begin,"verified task executor must be isolated");
const fragment=app.slice(app.indexOf('function naturalDay('),app.indexOf('function renderMessages('))+app.slice(begin,end);
const uuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const owner="11111111-2222-4333-8444-555555555555";
const clientKey="besprechungsnotiz-abc";
const canonical={id:"77777777-2222-4333-8444-888888888888",client_key:clientKey,
 title:"Besprechungsnotiz",due_date:"2026-10-13",notes:"",reminder_time:null,
 project_id:null,category_id:null,updated_at:"2026-10-13T09:15:00Z"};
const receipt={status:"applied",receipt_id:"88888888-bbbb-4ccc-8ddd-777777777777",
 entity_id:canonical.id,entity_client_key:canonical.client_key,
 after:{title:canonical.title,date:canonical.due_date,updated_at:"2026-10-13T09:15:00+00:00"}};
function harness({rpcError=null,readError=null,reply=receipt,row=canonical}={}){
 const calls=[],tasks=[{id:clientKey,title:"Besprechungsnotiz",date:"2026-10-11"}],spoken=[];
 let saves=0,closed=0;
 const sb={
   auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},
   rpc:async(name,args)=>{calls.push({kind:"rpc",name,args});return {data:reply,error:rpcError}},
   from:table=>({select:cols=>({eq:(key,value)=>({eq:(key2,value2)=>({
      single:async()=>{calls.push({kind:"read",table,columns:cols});return {data:row,error:readError}}
   })})})})
 };
 const context={window:{MINDS_SUPABASE:sb},state:{tasks},save:()=>{saves++},
   renderCalendar:()=>calls.push({kind:"render"}),closeModal:()=>{closed++},
   say:(role,text)=>spoken.push({role,text}),Date,Error,RegExp};
 const exec=vm.runInNewContext(fragment+"\napplyVerifiedTaskUpdate",context);
 return {exec,calls,tasks,spoken,results:()=>({saves,closed})};
}
test("calendar approval writes before any local success and reads back canonical row",async()=>{
 const h=harness();
 const result=await h.exec({request_id:uuid,kind:"task",action:"update",date:"2026-10-13"});
 assert.equal(h.calls[0].kind,"rpc");
 assert.equal(h.calls[0].name,"minds_commit_reviewed_task_update_v01");
 assert.equal(h.calls[1].kind,"read");
 assert.equal(h.calls[1].table,"isabella_tasks");
 assert.equal(h.tasks[0].date,"2026-10-13");
 assert.equal(h.results().saves,1);
 assert.equal(h.results().closed,1);
 assert.equal(result.receipt_id,receipt.receipt_id);
 assert.match(h.spoken[0].text,/^Listo, «Besprechungsnotiz» queda para /);
 assert.doesNotMatch(h.spoken[0].text,/Supabase|\d{4}-\d{2}-\d{2}/);
});
test("RPC failure never mutates local tasks or declares success",async()=>{
 const h=harness({rpcError:{message:"stale_target_date"}});
 await assert.rejects(h.exec({request_id:uuid,kind:"task",action:"update",date:"2026-10-13"}),/stale_target_date/);
 assert.equal(h.tasks[0].date,"2026-10-11");assert.equal(h.results().saves,0);
 assert.equal(h.spoken.length,0);assert.equal(h.calls.length,1);
});
test("unverified receipt and mismatched server readback fail closed",async()=>{
 for(const opts of [
  {reply:{...receipt,receipt_id:null}},
  {row:{...canonical,due_date:"2026-10-11"}},
  {readError:{message:"offline"}}
 ]){
  const h=harness(opts);
  await assert.rejects(h.exec({request_id:uuid,kind:"task",action:"update"}));
  assert.equal(h.tasks[0].date,"2026-10-11");assert.equal(h.results().saves,0);
 }
});
test("authorization and idempotency are determined by owner-locked canonical receipt",()=>{
 for(const rule of [
  /SECURITY DEFINER/,/v_user uuid:=auth\.uid\(\)/,
  /FOR UPDATE/,/UNIQUE\(user_id,request_id\)/,
  /status','already_applied'/,/status','applied'/,
  /review_target_or_authority_changed/,
  /reviewed_candidate_mismatch/,
  /stale_target_date/,
  /REVOKE ALL ON public\.minds_calendar_action_receipts FROM PUBLIC,anon,authenticated/,
  /GRANT EXECUTE ON FUNCTION public\.minds_commit_reviewed_task_update_v01\(uuid,jsonb\) TO authenticated/
 ])assert.match(migration,rule);
});
test("reviewed task feedback is emitted only after canonical commit",()=>{
 const part=app.slice(app.indexOf("function confirmProposal("),app.indexOf("function confirmProposals("));
 assert.match(part,/if\(!verified\)\{state\.pendingIntent=null;save\(\);proposalFeedback\('accepted',p\);\}/);
 assert.match(part,/Promise\.resolve\(\)\.then\(\(\)=>applyProposal\(p,\{quiet:true\}\)\)\.then\(\(\)=>\{/);
 assert.match(part,/if\(verified\)\{state\.pendingIntent=null;save\(\);proposalFeedback\('accepted',p\);\}/);
 assert.match(app,/if\(p\.kind==='task'&&\(p\.action\|\|'create'\)==='update'\)\s+return applyVerifiedTaskUpdate\(p,opts\)/);
});
