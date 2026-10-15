import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const app=source("apps/isabella/app.js");
const migration=source("supabase/migrations/20261015100000_minds_create_task_receipt_kind_v01.sql");
const prior=source("supabase/migrations/20261014121000_minds_direct_calendar_create_v01.sql");
const first=app.indexOf("async function applyDirectCalendarCreate(");
const end=app.indexOf("\nfunction directCreationBatch(",first);
assert.ok(first>=0&&end>first);
const js=app.slice(first,end)+"\napplyDirectCalendarCreate";

const request="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const candidate={request_id:request,kind:"task",action:"create",title:"Enviar documentos a Fr. Sawaski",date:"2026-10-15"};
const row={id:"11111111-bbbb-4ccc-8ddd-eeeeeeeeeeee",client_key:"review:"+request,
 title:candidate.title,due_date:candidate.date,notes:"",reminder_time:null,
 project_id:null,category_id:null,updated_at:"2026-10-15T07:53:15Z"};
const receipt={status:"applied",receipt_id:"22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee",
 entity_id:row.id,entity_client_key:row.client_key,
 after:{title:row.title,date:row.due_date,updated_at:"2026-10-15T07:53:15+00:00",project_id:null,category_id:null}};

const harness=({response=receipt,stored=row,rpcError=null}={})=>{
 const calls=[];
 const db={
  auth:{getSession:async()=>({data:{session:{user:{id:"owner"}}}})},
  rpc:async(name,args)=>{calls.push(["rpc",name,args]);return {data:response,error:rpcError}},
  from:name=>({select:columns=>({eq:()=>({eq:()=>({
   single:async()=>{calls.push(["read",name,columns]);return {data:stored,error:null}}
  })})})})
 };
 const ctx={window:{MINDS_SUPABASE:db}, Date, String, Error};
 return {fn:runInNewContext(js,ctx),calls};
};

test("database create-task success AND replay return a typed entity kind",()=>{
 assert.match(migration,/RETURNS jsonb/);
 assert.equal((migration.match(/'entity_kind','task'/g)||[]).length,2);
 assert.match(prior,/RETURN public\.minds_commit_reviewed_task_create_v01\(p_request_id,p_candidate\)/);
});
test("legacy already-committed task with missing kind is verified using real readback",async()=>{
 const h=harness();
 const out=await h.fn(candidate);
 assert.equal(out.title,candidate.title);
 assert.equal(h.calls.length,2);
 assert.equal(h.calls[0][1],"minds_commit_direct_calendar_create_v01");
 assert.equal(h.calls[1][1],"isabella_tasks");
});
test("new typed kind and replay status are accepted after canonical matching",async()=>{
 for(const status of ["applied","already_applied"]){
  const h=harness({response:{...receipt,status,entity_kind:"task"}});
  assert.equal((await h.fn(candidate)).receipt_id,receipt.receipt_id);
 }
});
test("mismatched kind, nonverified result or altered row never claim success",async()=>{
 for(const opts of [
  {response:{...receipt,entity_kind:"event"}},
  {response:{...receipt,receipt_id:null}},
  {response:{...receipt,after:null}},
  {stored:{...row,due_date:"2026-10-11"}},
  {rpcError:{message:"unauthorized"}}
 ]){
  const h=harness(opts);
  await assert.rejects(h.fn(candidate));
 }
});
test("sent attachments leave the composer and remain bound to the message",()=>{
 assert.match(app,/function clearSentChatFiles\(\)/);
 assert.match(app,/for\(const url of pendingChatUrls\.values\(\)\)URL\.revokeObjectURL\(url\)/);
 assert.match(app,/pendingChatUrls\.clear\(\)/);
 assert.match(app,/pendingChatFiles=\[\];/);
 const send=app.slice(app.indexOf("let chatSending=false;"),app.indexOf("\n $('#sendButton').onclick=send;"));
 assert.match(send,/const attachments=files\.length\?await uploadChatFiles\(files\):\[\];\s*clearSentChatFiles\(\)/);
 assert.match(send,/await handle\(t,attachments,replyTo\)/);
 assert.match(send,/if\(chatSending\)return/);
 assert.match(send,/finally\{chatSending=false/);
 assert.match(app,/attachments:copy,replyTo/);
 assert.match(app,/m\.attachments\.map\(a=>/);
});
