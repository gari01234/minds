import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const edge=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const ai=readFileSync(new URL("../apps/isabella/ai.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../apps/isabella/app.js",import.meta.url),"utf8");
const recovered=readFileSync(new URL("../apps/isabella/chat-stream-recovery.js",import.meta.url),"utf8");

test("browser receipt must be limited to read-only results, not action/proposal success",()=>{
 const gate=edge.slice(edge.indexOf("const RECOVERABLE_READ_TOOLS="),edge.indexOf("async function saveBrowserChatStreamReceipt"));
 assert.match(gate,/surface==="chat_browser"/);
 assert.match(gate,/!background/);
 assert.match(gate,/proposals\.length===0/);
 assert.match(gate,/capabilityRuns\.length===0/);
 assert.match(gate,/artifacts\.length===0/);
 assert.match(gate,/tools\.every\(t=>RECOVERABLE_READ_TOOLS\.has\(t\)\)/);
 assert.doesNotMatch(gate,/"create_task"|"write_commitment_workspace"|"update_event"/);
 assert.match(gate,/new Set\(\[/);
 assert.match(gate,/"browse_work_sources"/);
 assert.match(gate,/function recoverableInformationalTurn/);
});
test("server writes owner-scoped completed read-only receipt before final success",()=>{
 const success=edge.slice(edge.indexOf("if(!reply){await finishAgentRun"),edge.indexOf("const responsePayload:any="));
 const write=success.indexOf("saveBrowserChatStreamReceipt(req,clientMessageId,reply,true,null)");
 const finish=success.indexOf('finishAgentRun(req,run,"success"');
 assert.ok(write>=0&&finish>write);
 assert.match(success,/browser_delivery_receipt_saved:browserReceiptSaved/);
 assert.match(edge,/saveBrowserChatStreamReceipt\(req,clientMessageId,partial,false,reason\)/);
 assert.match(edge,/onConflict:"user_id,request_id"/);
 assert.match(edge,/expires_at:new Date\(Date\.now\(\)\+86400000\)/);
});
test("normal browser transport failure recovers existing owner receipt without re-execution",async()=>{
 for(const name of ['FunctionsFetchError','FunctionsRelayError']){
  const calls=[],receipts=[];
  const transport=Object.assign(new Error('transport failed'),{name});
  const w={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async(endpoint,input)=>{calls.push({endpoint,input});return {error:transport}}}},
   MINDS_CHAT_STREAM_RECOVERY:async(id)=>{receipts.push(id);return {reply:'Original answer',proposal:{unsafe:true},proposals:[{unsafe:true}]}}};
  vm.runInNewContext(ai,{window:w,navigator:{language:'es'},setTimeout,clearTimeout,console},{timeout:1000});
  const result=await w.ISABELLA_AI.ask('Please explain the context',{}, {durableRequestId:'original-request',continuation:{id:'existing'}});
  assert.equal(calls.length,1);assert.equal(calls[0].endpoint,'isabella-chat');
  assert.equal(calls[0].input.body.client_message_id,'original-request');
  assert.deepEqual(receipts,['original-request']);assert.equal(result.reply,'Original answer');
  assert.equal(result.proposal,null);assert.equal(result.proposals.length,0);
 }
});
test("application errors do not recover or replay a request",async()=>{
 let calls=0,receipts=0;
 const original=Object.assign(new Error('denied'),{name:'FunctionsHttpError'});
 const w={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async()=>{calls++;return {error:original}}}},MINDS_CHAT_STREAM_RECOVERY:async()=>{receipts++}};
 vm.runInNewContext(ai,{window:w,navigator:{language:'es'},setTimeout,clearTimeout,console},{timeout:1000});
 await assert.rejects(w.ISABELLA_AI.ask('Explain',{}, {durableRequestId:'original-request',continuation:{id:'existing'}}),e=>e===original);
 assert.equal(calls,1);assert.equal(receipts,0);
});
test("receipt resolver returns the original answer but not invented authority",async()=>{
 let reads=0;
 const fake={
  from(table){assert.equal(table,"minds_chat_stream_delivery_receipts");return {
    select(){return this},eq(){return {maybeSingle:async()=>{reads++;return {data:{status:"completed",reply:"Original supported answer",incomplete_reason:null},error:null}}}}
  }}
 };
 const w={MINDS_SUPABASE:fake};
 vm.runInNewContext(recovered,{window:w,setTimeout}, {timeout:500});
 const r=await w.MINDS_CHAT_STREAM_RECOVERY("e7ca2a62-f955-4dd5-930a-6bfb61f9a673",{attempts:1});
 assert.equal(r.reply,"Original supported answer");
 assert.equal(r.delivery_recovered,true);
 assert.equal(r.proposal,undefined);
 assert.equal(reads,1);
});
test("reload reconciliation binds to original request UUID; never resubmits",()=>{
 const segment=app.slice(app.indexOf("async function reconcileReadOnlyBrowserReceipts()"),app.indexOf("let durableChatSyncBusy=false"));
 assert.match(segment,/durable_request_id/);
 assert.match(segment,/durable_status!=='unconfirmed'/);
 assert.match(segment,/MINDS_CHAT_STREAM_RECOVERY\(requestId,\{attempts:1\}\)/);
 assert.doesNotMatch(segment,/ISABELLA_AI\.ask|functions\.invoke|sendChatText/);
 assert.match(app,/void reconcileReadOnlyBrowserReceipts\(\)/);
});
