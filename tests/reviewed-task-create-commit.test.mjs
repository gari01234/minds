import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const app=read("apps/isabella/app.js");
const migration=read("supabase/migrations/20261013222500_minds_calendar_reviewed_task_create_v01.sql");
const a=app.indexOf("async function applyVerifiedTaskCreate("),b=app.indexOf("\nfunction applyProposal(",a);
assert.ok(a>0&&b>a);const snippet=app.slice(a,b);
const request="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const owner="11111111-2222-4333-8444-555555555555";
const canonical={id:"77777777-2222-4333-8444-888888888888",
 client_key:"review:"+request,title:"Enviar Angebot ELT",due_date:"2026-10-13",
 notes:"",reminder_time:null,project_id:null,category_id:null,updated_at:"2026-10-13T22:00:00Z"};
const receipt={status:"applied",receipt_id:"88888888-bbbb-4ccc-8ddd-777777777777",
 entity_id:canonical.id,entity_client_key:canonical.client_key,
 after:{title:canonical.title,date:canonical.due_date,project_id:null,updated_at:"2026-10-13T22:00:00+00:00"}};
function harness({rpcError=null,reply=receipt,readError=null,row=canonical}={}){
 const calls=[],tasks=[],spoken=[];let saves=0,closed=0;
 const sb={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},
  rpc:async(name,args)=>{calls.push(["rpc",name,args]);return{data:reply,error:rpcError}},
  from:table=>({select:cols=>({eq:()=>({eq:()=>({
    single:async()=>{calls.push(["read",table]);return{data:row,error:readError}}
  })})})})};
 const ctx={window:{MINDS_SUPABASE:sb},state:{tasks,categories:[],projects:[]},
  save:()=>{saves++},renderCalendar:()=>calls.push(["render"]),
  closeModal:()=>{closed++},say:(role,text)=>spoken.push(text),Date};
 const fn=vm.runInNewContext(snippet+"\napplyVerifiedTaskCreate",ctx);
 return {fn,calls,tasks,spoken,results:()=>({saves,closed})};
}
const proposal={request_id:request,kind:"task",action:"create",title:"Enviar Angebot ELT",date:"2026-10-13"};
test("reviewed task creation uses canonical RPC then read-back before any success",async()=>{
 const h=harness(),r=await h.fn(proposal);
 assert.equal(h.calls[0][1],"minds_commit_reviewed_task_create_v01");
 assert.equal(h.calls[1][1],"isabella_tasks");
 assert.equal(h.tasks.length,1);
 assert.equal(h.tasks[0].id,canonical.client_key);
 assert.equal(h.results().saves,1);
 assert.equal(r.receipt_id,receipt.receipt_id);
 assert.match(h.spoken[0],/Confirmé en Supabase/);
});
test("RPC denial, missing receipt and canonical mismatch never claim success",async()=>{
 for(const opts of [{rpcError:{message:"unauthorized"}},{reply:{...receipt,receipt_id:null}},
  {readError:{message:"not found"}},{row:{...canonical,due_date:"2026-10-11"}}]){
  const h=harness(opts);
  await assert.rejects(h.fn(proposal));
  assert.equal(h.tasks.length,0);
  assert.equal(h.spoken.length,0);
  assert.equal(h.results().saves,0);
 }
});
test("database executor binds an owner, reviewed decision and one idempotent receipt",()=>{
 for(const pattern of [/SECURITY DEFINER/,/v_user uuid:=auth\.uid\(\)/,
  /pg_advisory_xact_lock/,/FOR UPDATE/,/create_task/,
  /receipt_replay_candidate_mismatch/,/missing_or_ineligible_review/,
  /INSERT INTO public\.isabella_tasks/,/INSERT INTO public\.minds_calendar_action_receipts/,
  /INSERT INTO public\.isabella_activity_log/,
  /GRANT EXECUTE ON FUNCTION public\.minds_commit_reviewed_task_create_v01\(uuid,jsonb\) TO authenticated/
 ])assert.match(migration,pattern);
});
test("single and batch task-create reviews defer feedback until verified commit",()=>{
 const single=app.slice(app.indexOf("function confirmProposal("),app.indexOf("function confirmProposals("));
 const batch=app.slice(app.indexOf("function confirmProposals("),app.indexOf("function findTarget("));
 assert.match(single,/const verified=p\.kind==='task'&&\['update','create'\]/);
 assert.match(single,/if\(verified\)\{state\.pendingIntent=null;save\(\);proposalFeedback\('accepted',p\)/);
 assert.match(batch,/if\(verified\)proposalFeedback\('accepted',p\)/);
 assert.match(app,/return applyVerifiedTaskCreate\(p\)/);
});
