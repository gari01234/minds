// Phase 1, step 3a: no message from Gari stays without an answer in the conversation.
// Causes found with turn_diagnostics (27.10–07.11): an answer that only lived in a closed app (03.11),
// a completed turn without text (30.10), an exhausted OpenAI account (31.10).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assistantKeyFor,canonicalAssistantRow,failureNotice,isOutOfCredit} from '../supabase/functions/_shared/chat-delivery.mjs';
import {isSystemNotice} from '../supabase/functions/_shared/system-notice.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');

test('Server and app derive the same answer key from a request id',()=>{
  const begin=app.indexOf('function assistantKeyFor(requestId){'),end=app.indexOf('function sayKeyed(');
  const ctx={};vm.runInNewContext(app.slice(begin,end),ctx);
  for(const id of [crypto.randomUUID(),crypto.randomUUID(),'0d6c3c5e-1a2b-5c3d-8e4f-1234567890ab','0D6C3C5E-1A2B-4C3D-8E4F-1234567890AB']){
    const k=assistantKeyFor(id);
    assert.equal(ctx.assistantKeyFor(id),k);
    assert.notEqual(k,id.toLowerCase(),'never the key of Gari\'s own message');
    assert.match(k,/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(assistantKeyFor(id),k,'deterministic');
  }
  assert.equal(assistantKeyFor('not-a-uuid'),null);
  assert.equal(ctx.assistantKeyFor(null),null);
});

test('The canonical answer row is scoped, keyed and marked as the server copy',()=>{
  const requestId=crypto.randomUUID();
  const row=canonicalAssistantRow({userId:'u',conversationId:'c',requestId,content:'Aquí sigo.',scope:{version:1,kind:'global',key:'global'},model:'m'});
  assert.equal(row.client_key,assistantKeyFor(requestId));
  assert.equal(row.exposure_scope_version,1);assert.equal(row.exposure_scope_kind,'global');
  assert.equal(row.metadata.author,'isabella');assert.equal(row.metadata.source,'isabella_chat_server');
  assert.equal(row.metadata.durable_request_id,requestId);assert.equal(row.metadata.durable_status,'completed');
  const notice=canonicalAssistantRow({userId:'u',conversationId:'c',requestId,content:failureNotice('credit'),scope:{version:1,kind:'global'},author:'system',outcome:'failed'});
  assert.equal(notice.metadata.author,'system');assert.equal(notice.metadata.durable_status,'failed');
  assert.equal(canonicalAssistantRow({userId:'u',conversationId:'c',requestId,content:'x',scope:{version:0,kind:'global'}}),null,'never a legacy row');
  assert.equal(canonicalAssistantRow({userId:'u',conversationId:'c',requestId,content:'  ',scope:{version:1,kind:'global'}}),null);
});

test('Failure notices are honest, in the app\'s voice, and recognised as system lines',()=>{
  for(const k of ['credit','empty','incomplete','error']){
    const t=failureNotice(k);
    assert.match(t,/^No se pudo responder/);
    assert.equal(isSystemNotice(t),true,t);
  }
  assert.equal(isOutOfCredit(429,{error:{message:'You have no credits remaining. Add credits…'}}),true);
  assert.equal(isOutOfCredit(429,{error:{code:'insufficient_quota'}}),true);
  assert.equal(isOutOfCredit(500,{error:{message:'Service Unavailable'}}),false);
});

test('Server: answered turns are written by the server; failures leave a notice; empty text gets one retry',()=>{
  assert.match(chat,/browserTurn=await persistCanonicalBrowserOwnerTurn\(req,clientMessageId,effectiveMessage,exposureScope\);/);
  assert.match(chat,/const serverPersisted=browserReceiptSaved&&browserTurn\n\s+\?await persistServerAssistantTurn\(req,canonicalAssistantRow\(\{userId:browserTurn\.userId,conversationId:browserTurn\.conversationId,/);
  assert.match(chat,/upsert\(row,\{onConflict:"user_id,conversation_id,client_key",ignoreDuplicates:true\}\)/);
  assert.match(chat,/message:await failTurn\(isOutOfCredit\(response\.status,payload\)\?"credit":"error"\)/);
  assert.match(chat,/return json\(\{error:"empty_response",message:await failTurn\("empty"\)\},502\)/);
  assert.match(chat,/return json\(\{error:"incomplete_response",message:await failTurn\("incomplete"\),incomplete:true\},502\);/);
  const retry=chat.slice(chat.indexOf('// Step 3a: a completed turn without any text'),chat.indexOf('const modelProse='));
  assert.match(retry,/reasoning:\{effort:"low"\}/);
  assert.match(retry,/tool_choice:"none"/);
  assert.match(retry,/!toolProposals\.length&&!background/,'never retries a turn that prepared changes');
  assert.match(retry,/empty_reply_retry:true/,'the retry is visible in usage');
});

test('App: its copy updates the server row; recovery reads receipts for 24 h; live updates for server answers',()=>{
  assert.match(app,/sayKeyed\(receiptText\?null:assistantKeyFor\(durableRequestId\),'assistant',verifiedReply/);
  assert.match(app,/sayKeyed\(assistantKeyFor\(durableRequestId\),'assistant',e\?\.message\|\|localFallback\(text\),\{metadata:\{author:'system'/);
  assert.match(app,/sayKeyed\(assistantKeyFor\(requestId\),'assistant',result\.reply,/);
  assert.match(app,/now-Date\.parse\(m\.at\)<24\*60\*60000/);
  const begin=app.indexOf('function sayKeyed('),end=app.indexOf('function say(role,text,meta={}){');
  const state={messages:[{id:'k',role:'assistant',text:'old',metadata:{a:1}}]};let said=0;
  const ctx={state,save(){},renderMessages(){},say:(r,t,m)=>{said++;state.messages.push({id:m.id,role:r,text:t})}};
  vm.runInNewContext(app.slice(begin,end),ctx);
  ctx.sayKeyed('k','assistant','new',{metadata:{b:2}});
  assert.equal(state.messages.length,1);assert.equal(state.messages[0].text,'new');assert.equal(JSON.stringify(state.messages[0].metadata),JSON.stringify({a:1,b:2}));
  ctx.sayKeyed('k2','assistant','other',{});
  assert.equal(said,1);assert.equal(state.messages[1].id,'k2');
  assert.match(read('apps/isabella/sync.js'),/'isabella_presence','isabella_chat_server'\]\.includes\(source\)/);
});
