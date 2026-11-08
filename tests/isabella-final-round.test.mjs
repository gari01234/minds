import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readModelRound,finalRoundResponse} from '../supabase/functions/_shared/final-round.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
const window={};
runInNewContext(readFileSync(new URL('../apps/isabella/final-round.js',import.meta.url),'utf8'),{window,TextDecoder});
const client=window.ISABELLA_FINAL_ROUND;
const upstream=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''),{headers:{'content-type':'text/event-stream'}});
test('streamed tools retain the full provider output and hide commentary',async()=>{
 const output={status:'completed',output:[{type:'function_call',name:'search_calendar'}]};
 const deltas=[];
 assert.deepEqual(await readModelRound(upstream([{type:'response.output_item.added',output_index:0,item:{phase:'commentary'}},
  {type:'response.output_text.delta',output_index:0,delta:'buscando'},{type:'response.completed',response:output}]),d=>deltas.push(d)),output);
 assert.deepEqual(deltas,[]);
});
test('a final delta arrives while the provider is active; the last event is the canonical JSON',async()=>{
 let releases,started;
 const hold=new Promise(r=>releases=r),first=new Promise(r=>started=r);
 const canonical={reply:'La propuesta está pendiente.',outcome:{outcome:'proposal_created',proposal_count:1},proposal:{request_id:'receipt'},isabella_reply:null};
 let saved;
 const response=finalRoundResponse({headers:{},execute:async emit=>{emit('Hola');await hold;return Response.json(canonical)},save:async value=>saved=value});
 const pending=client.read(response,(d)=>started(d));assert.equal(await first,'Hola');releases();
 assert.deepEqual(JSON.parse(JSON.stringify(await pending)),canonical);assert.deepEqual(saved.body,canonical);
});
test('disconnection recovers the same typed result without submitting another request',async()=>{
 let sends=0,resets=0,reads=0;
 const expected={reply:'Pendiente',proposal:{request_id:'receipt'}};
 const result=await client.ask({send:async()=>{sends++;return new Response('event: delta\ndata: {"text":"parcial"}\n\n',{headers:{'content-type':'text/event-stream'}})},onReset:()=>resets++,recover:async()=>{reads++;return expected}});
 assert.equal(result,expected);assert.deepEqual([sends,resets,reads],[1,1,1]);
});
test('parallel scheduling uses the same model inputs and overlaps independent reads',async()=>{
 const sample={instructions:'Respuesta breve.',context:{hoy:[]},input:[{role:'user',content:'Consulta de muestra'}],tools:[{type:'function',name:'search_calendar'}]};
 const a=promptComponentSizes(sample);assert.deepEqual(a,promptComponentSizes(structuredClone(sample)));
 const run=async parallel=>{let now=0;const pending=[];
  const delay=ms=>new Promise(resolve=>pending.push({end:now+ms,resolve}));
  const route=delay(30);const early=parallel?delay(50):null;
  const finished=(async()=>{await route;await(early||delay(50));await delay(70);return now})();
  for(let i=0;i<3;i++){pending.sort((a,b)=>a.end-b.end);const next=pending.shift();now=next.end;next.resolve();await Promise.resolve()}
  return finished;};
 assert.equal(await run(false),150);assert.equal(await run(true),120);
 console.log('fixture',JSON.stringify(a));
});

// Review of PR #310 (Claude, 08.11.2026).
const server=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');
test('A failed recovery copy never turns a delivered turn into an error',async()=>{
 const canonical={reply:'Aquí sigo.',outcome:{outcome:'answered'}};
 const response=finalRoundResponse({headers:{},execute:async emit=>{emit('Aquí');return Response.json(canonical)},save:async()=>{throw new Error('db down')}});
 const deltas=[];
 assert.deepEqual(JSON.parse(JSON.stringify(await client.read(response,d=>deltas.push(d)))),canonical);
 assert.deepEqual(deltas,['Aquí']);
});
test('Without stream_mode nothing changes; refusals before running let the app take the JSON path',()=>{
 assert.match(server,/if\(body\?\.stream_mode!=="final_round"\)return executeTurn\(req,body\);/);
 assert.match(server,/json\(\{error:"unsupported_stream_mode",execution_started:false\},400\)/);
 assert.match(server,/json\(\{error:"stream_auth_required",execution_started:false\},401\)/);
 // Before the migration the claim fails with another code than 23505: same fallback, nothing ran.
 assert.match(server,/if\(claim\.error\.code!=="23505"\)return json\(\{error:"stream_receipt_unavailable",execution_started:false\},503\);/);
});
test('Streaming shows plain conversation only; a prepared change never flashes a draft',()=>{
 assert.match(server,/const emitText=\(delta:string\)=>\{if\(emit&&!toolProposals\.length&&!directAuthorizedIds\.length\)emit\(delta\)\};/);
 assert.match(server,/readModelRound\(response,emitText,round===budget\.rounds\)/);
 assert.match(server,/readModelRound\(retry,emitText,true\)/);
 assert.doesNotMatch(server,/readModelRound\([a-z]+,emit,/);
});
test('The streamed turn is the same turn: server copy, empty-reply retry, voice, timings and follow-ups stay',()=>{
 const turn=server.slice(server.indexOf('async function executeTurn('));
 for(const must of ['persistServerAssistantTurn(req,canonicalAssistantRow(','// Step 3a: a completed turn without any text','voiceDelegation',
   'phaseRoundsMs.push(','phase_ms','FOLLOWUP_TOOLS','early.memory','await early.agenda'])assert.ok(turn.includes(must),must);
 // The read receipt is merged by key and never overwrites the final_round copy.
 const save=server.slice(server.indexOf('async function saveBrowserChatStreamReceipt'),server.indexOf('// Step 3a: the server writes'));
 assert.match(save,/onConflict:"user_id,request_id"/);assert.doesNotMatch(save,/final_delivery/);
});
