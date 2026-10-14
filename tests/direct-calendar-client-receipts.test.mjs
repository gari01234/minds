import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const app=readFileSync(new URL("../apps/isabella/app.js",import.meta.url),"utf8");
const a=app.indexOf("async function applyDirectCalendarCreate(");
const b=app.indexOf("\nfunction applyProposal(",a);
assert.ok(a>0&&b>a);
const src=app.slice(a,b);
const request="12345678-1234-4234-8234-123456789abc";
const owner="11111111-2222-4333-8444-555555555555";
const task={kind:"task",action:"create",request_id:request,title:"Sample",date:"2026-10-15"};
const taskRow={id:"77777777-2222-4333-8444-888888888888",
 client_key:"review:"+request,title:"Sample",due_date:"2026-10-15",
 category_id:null,project_id:null,updated_at:"2026-10-14T09:45:00Z"};
const taskReceipt={status:"applied",receipt_id:"88888888-2222-4333-8444-888888888888",
 entity_id:taskRow.id,entity_kind:"task",entity_client_key:taskRow.client_key,
 after:{title:"Sample",date:"2026-10-15",project_id:null,category_id:null,updated_at:"2026-10-14T09:45:00+00:00"}};
const event={kind:"event",action:"create",request_id:request,title:"Sample event",
 date:"2026-10-15",time:"10:00",duration_minutes:45};
const eventRow={id:taskRow.id,client_key:"direct:"+request,title:"Sample event",
 starts_at:"2026-10-15T08:00:00Z",ends_at:"2026-10-15T08:45:00Z",
 all_day:false,project_id:null,category_id:null,updated_at:"2026-10-14T09:45:00Z"};
const eventReceipt={...taskReceipt,entity_kind:"event",entity_client_key:eventRow.client_key,
 after:{title:eventRow.title,starts_at:eventRow.starts_at,ends_at:eventRow.ends_at,
 all_day:false,project_id:null,category_id:null,updated_at:"2026-10-14T09:45:00+00:00"}};
function harness({receipt=taskReceipt,row=taskRow,rpcError=null,readError=null}={}){
 const calls=[],reads=[];let sync=0;
 const sb={auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},
  rpc:async(name,args)=>{calls.push({name,args});return{data:receipt,error:rpcError}},
  from:(table)=>({select:cols=>({eq:()=>({eq:()=>({single:async()=>{
    reads.push(table);return{data:row,error:readError}}})})})})};
 const window={MINDS_SUPABASE:sb,ISABELLA_SYNC_PULL_NOW:async()=>{sync++}};
 const fn=runInNewContext(src+"\napplyDirectCalendarCreate",{window,Date,Error,console});
 return{fn,calls,reads,counts:()=>({sync})};
}
test("direct task creation reports success only after RPC receipt AND canonical readback",async()=>{
 const h=harness();const r=await h.fn(task);
 assert.equal(r.receipt_id,taskReceipt.receipt_id);
 assert.equal(h.calls[0].name,"minds_commit_direct_calendar_create_v01");
 assert.equal(h.reads[0],"isabella_tasks");
 assert.equal(h.counts().sync,1);
});
test("direct event creation reads exact UTC timestamps and title",async()=>{
 const h=harness({receipt:eventReceipt,row:eventRow});const r=await h.fn(event);
 assert.equal(r.kind,"event");assert.equal(h.reads[0],"isabella_events");
});
test("no receipt, denied RPC, missing row or wrong date cannot claim success",async()=>{
 for(const cfg of [
  {rpcError:{message:"permission_revoked"}},
  {receipt:{...taskReceipt,receipt_id:null}},
  {readError:{message:"offline"}},
  {row:{...taskRow,due_date:"2026-10-14"}}
 ]){
  const h=harness(cfg);await assert.rejects(h.fn(task));
  assert.equal(h.counts().sync,0);
 }
});
test("typed authorization batch cannot include an update or unregistered request",()=>{
 const root=runInNewContext(src+"\ndirectCreationBatch", {Date,console});
 const result={direct_authorization:{version:1,mode:"direct_create_v1",request_ids:[request]}};
 const integrity={ok:true,outcome:"proposal_created",proposals:[task]};
 assert.equal(root({...result},integrity).length,1);
 assert.throws(()=>root(result,{...integrity,proposals:[{...task,action:"update"}]}));
 assert.throws(()=>root({...result,direct_authorization:{...result.direct_authorization,request_ids:[]}},integrity));
});
