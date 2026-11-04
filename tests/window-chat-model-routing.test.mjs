import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chatTurnModel,documentModel,FAST_MODEL,DEEP_MODEL} from '../supabase/functions/_shared/chat-model-routing.mjs';
import CREDIT from '../supabase/functions/_shared/credit-model.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const turn=x=>chatTurnModel({env:{},...x});

test('everyday chat stays on Luna; complex turns go to Terra',()=>{
  assert.equal(FAST_MODEL,'gpt-5.6-luna');
  assert.equal(DEEP_MODEL,'gpt-5.6-terra');
  assert.equal(turn({complexity:'light',depth:'standard'}).model,FAST_MODEL);
  assert.equal(turn({complexity:'standard',depth:'standard'}).model,FAST_MODEL);
  assert.deepEqual(turn({complexity:'deep',depth:'deep'}),{model:DEEP_MODEL,tier:'deep',reason:'complex_turn'});
  assert.equal(turn({complexity:'standard',depth:'deep'}).model,DEEP_MODEL,'a deep budget alone is enough');
});

test('Work Threads combine both: quick questions on Luna, normal and complex work on Terra',()=>{
  assert.deepEqual(turn({workThread:true,complexity:'light',depth:'standard'}),{model:FAST_MODEL,tier:'fast',reason:'work_thread_quick'});
  assert.deepEqual(turn({workThread:true,complexity:'standard',depth:'standard'}),{model:DEEP_MODEL,tier:'deep',reason:'work_thread'});
  assert.equal(turn({workThread:true,complexity:'deep',depth:'deep'}).model,DEEP_MODEL);
});

test('background turns never switch to Terra on their own',()=>{
  assert.equal(turn({background:true,complexity:'deep',depth:'deep'}).model,FAST_MODEL);
  assert.equal(turn({background:true,workThread:true,complexity:'standard'}).model,FAST_MODEL);
});

test('secrets: OPENAI_MODEL still sets the everyday model, OPENAI_DEEP_MODEL switches Terra off or on',()=>{
  assert.equal(turn({env:{OPENAI_MODEL:' gpt-5.6-luna-2026-07 '},complexity:'light'}).model,'gpt-5.6-luna-2026-07');
  const off={OPENAI_DEEP_MODEL:'gpt-5.6-luna'};
  assert.equal(turn({env:off,complexity:'deep'}).model,'gpt-5.6-luna');
  assert.equal(documentModel(off),'gpt-5.6-luna');
  assert.equal(documentModel({}),DEEP_MODEL);
});

test('Isabella chat decides once per turn and reads documents with the document model',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(chat,/import \{chatTurnModel,documentModel\} from "\.\.\/_shared\/chat-model-routing\.mjs";/);
  assert.match(chat,/const turnModel=chatTurnModel\(\{complexity:route\.complexity,depth:budget\.depth,workThread:!!currentWorkThread,background,env:modelEnv\(\)\}\);/);
  // The decision comes after the last budget change, before the turn starts.
  assert.ok(chat.indexOf('const turnModel=')>chat.indexOf('maxOutput:Math.max(budget.maxOutput,responseContinuation?6200:4400)'));
  assert.equal((chat.match(/const model=turnModel\.model;/g)||[]).length,3,'durable start, direct stream and the main loop');
  assert.match(chat,/exposure_scope:exposureScope,model:turnModel\.model,/);
  for(const fn of ['compareProjectSource','analyzeProjectSource','readWorkFile']){
    const body=chat.slice(chat.indexOf(`async function ${fn}(`));
    const first=body.match(/const model=([^;]+);/)[1];
    assert.equal(first,'documentModel(modelEnv())',fn);
  }
  // No chat turn falls back to a hard-coded Luna; utility work keeps its own setting.
  assert.doesNotMatch(chat,/const model=Deno\.env\.get\("OPENAI_MODEL"\)\|\|"gpt-5\.6-luna";/);
  assert.equal((chat.match(/Deno\.env\.get\("OPENAI_UTILITY_MODEL"\)\|\|Deno\.env\.get\("OPENAI_MODEL"\)\|\|"gpt-5\.6-luna"/g)||[]).length,4);
  assert.match(chat,/\(footprint as any\)\.model_route=\{model:turnModel\.model,tier:turnModel\.tier,reason:turnModel\.reason\}/);
});

test('Uso IA prices Terra, so the estimate stays right',()=>{
  const usd=CREDIT.costOf({model:'gpt-5.6-terra',input_tokens:100000,output_tokens:10000});
  assert.equal(Math.round(usd*1000)/1000,0.32,'0.20 $ input + 0.12 $ output');
});
