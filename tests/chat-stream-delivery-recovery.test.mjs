import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('apps/isabella/ai.js');
const recovery=read('apps/isabella/chat-stream-recovery.js');
const server=read('supabase/functions/isabella-chat/index.ts');
const migration=read('supabase/migrations/20261010210000_chat_stream_delivery_receipts_v01.sql');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const requestId='123e4567-e89b-42d3-a456-426614174000';

function recoveryHarness(payload){
  const calls=[];
  const sb={from(table){
    calls.push(['from',table]);
    return {select(columns){
      calls.push(['select',columns]);
      return {eq(field,value){
        calls.push(['eq',field,value]);
        return {async maybeSingle(){return payload}};
      }};
    }};
  }};
  const window={MINDS_SUPABASE:sb};
  runInNewContext(recovery,{window,setTimeout(fn){fn()}});
  return {recover:window.MINDS_CHAT_STREAM_RECOVERY,calls};
}

test('Browser recovers exactly the completed server text without a second model request',async()=>{
  const {recover,calls}=recoveryHarness({data:{status:'completed',reply:'Respuesta final íntegra.',incomplete_reason:null},error:null});
  const result=await recover(requestId);
  assert.equal(result.reply,'Respuesta final íntegra.');
  assert.equal(result.incomplete,false);
  assert.equal(result.delivery_recovered,true);
  assert.deepEqual(calls[0],['from','minds_chat_stream_delivery_receipts']);
  assert.deepEqual(calls[2],['eq','request_id',requestId]);
  assert.ok(!recovery.includes('fetch('));
  assert.ok(!recovery.includes('.insert('));
  assert.ok(!recovery.includes('.upsert('));
});

test('Browser never declares server incomplete text complete',async()=>{
  const {recover}=recoveryHarness({data:{status:'incomplete',reply:'Fragmento verificado',incomplete_reason:'max_output_tokens'},error:null});
  const result=await recover(requestId);
  assert.equal(result.incomplete,true);
  assert.equal(result.incomplete_reason,'max_output_tokens');
});
test('Missing authorization and invalid request ID cause no retry or generation',async()=>{
  const {recover,calls}=recoveryHarness({data:null,error:{code:'42501'}});
  assert.equal(await recover(requestId),null);
  assert.equal(calls.filter(x=>x[0]==='from').length,1);
  assert.equal(await recover('not-a-uuid'),null);
  assert.equal(calls.filter(x=>x[0]==='from').length,1);
});

test('Browser stream uses an opaque authenticated receipt ID and only falls back to visible partial',()=>{
  assert.ok(client.includes("const streamRequestId=globalThis.crypto?.randomUUID?.()||null"));
  assert.ok(client.includes("surface:'chat_browser',client_message_id:streamRequestId"));
  assert.ok(client.includes('const recovered=await window.MINDS_CHAT_STREAM_RECOVERY?.(streamRequestId)'));
  assert.ok(client.includes('if(recovered)return {...recovered,streamed_text:streamedText}'));
  assert.ok(client.includes('if(streamedText.trim()){'));
  assert.ok(!client.includes('await askDirectStream(message,state,options,replyContext);await askDirectStream'));
  assert.doesNotThrow(()=>new Script(client,{filename:'ai.js'}));
  assert.doesNotThrow(()=>new Script(recovery,{filename:'chat-stream-recovery.js'}));
  assert.ok(index.indexOf('chat-stream-recovery.js?v=1') < index.indexOf('ai.js?v=53'));
  assert.ok(sw.includes("'./chat-stream-recovery.js?v=1'"));
  assert.ok(sw.includes("const CACHE_NAME = 'isabella-shell-v139'"));
});

test('Server stores completion before terminal SSE result, never promoting partial to complete',()=>{
  const receipt=server.indexOf('const deliveryReceiptSaved=surface==="chat_browser"');
  const finish=server.indexOf('await finishAgentRun(req,run,streamCompleted?"success":"error"',receipt);
  const send=server.indexOf('send("result",{',receipt);
  assert.ok(receipt>0&&finish>receipt&&send>finish);
  assert.ok(server.includes('status:completed?"completed":"incomplete"'));
  assert.ok(server.includes('user_id:user.id,request_id:requestId'));
  assert.ok(server.includes('if(authError||!user?.id)return false;'));
  assert.ok(server.includes('incomplete:!streamCompleted,incomplete_reason:incompleteReason'));
  assert.ok(!server.includes('deliveryReceiptSaved?"success":"error"'));
});

test('Continuation and Work cannot inherit the tiny light-response budget',()=>{
  assert.match(server,/const responseContinuation=\/\(/);
  assert.ok(server.includes('if(!background&&!fastAgenda&&(route.work||responseContinuation))budget='));
  assert.ok(server.includes('responseContinuation?6200:4400'));
  assert.ok(server.includes('if(scheduleAssessment)budget='));
  assert.ok(server.includes('maxOutput:1500'));
  assert.ok(server.includes('tool_choice:{type:"function",name:"search_calendar"}'));
});

test('Transport receipts are private, expiring, and cannot become a new memory',()=>{
  assert.ok(migration.includes('primary key(user_id,request_id)'));
  assert.ok(migration.includes('enable row level security'));
  assert.ok(migration.includes('grant select on public.minds_chat_stream_delivery_receipts to authenticated'));
  assert.ok(migration.includes('user_id = auth.uid() and expires_at > now()'));
  assert.ok(migration.includes("status in ('completed','incomplete')"));
  assert.ok(migration.includes('minds-chat-stream-receipts-expiry'));
  assert.ok(!migration.includes('conversation_messages'));
  assert.ok(!migration.includes('minds_personal_operating'));
});
