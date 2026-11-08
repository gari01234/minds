import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildVoiceSessionContext,persistVoiceTurn} from '../supabase/functions/_shared/live-context.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
const asset=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('raw fragments, speaker changes, repeat delivery and interrupted writes keep one row per utterance',async()=>{
 const window={};runInNewContext(asset('apps/isabella/live/transcript.js'),{window});
 const rows=new Map();let seq=0,drop=true;
 const t=window.ISABELLA_LIVE_TRANSCRIPT.turns({id:()=>String(++seq),write:async row=>{
   rows.set(row.turn_id,row);if(drop){drop=false;throw Error('lost acknowledgement')}
 }});
 const first={event_id:'one',start_ms:2,end_ms:10,delta:'¿Con'};
 t.add('gari',first);t.add('gari',first);t.add('gari',{event_id:'two',start_ms:11,end_ms:20,delta:'tinuamos?'});
 assert.equal(t.ownerAt(25).text,'¿Continuamos?');assert.equal(t.ownerAt(25),null);
 t.add('isabella',{start_ms:40,end_ms:90,delta:'Sí.'});await t.finish();await t.finish();
 assert.deepEqual([...rows.values()].map(x=>[x.author,x.text]),[['gari','¿Continuamos?'],['isabella','Sí.']]);
});
test('history uses typed parts and byte bounds even with multibyte input and 200 messages',()=>{
 const messages=Array.from({length:200},(_,i)=>({role:i%2?'user':'assistant',content:'楽🟢'.repeat(900)}));
 messages.unshift({role:'assistant',content:'sistema',metadata:{author:'system'}});
 const voice=buildVoiceSessionContext({hoy:'2026-09-14',mañana:'2026-09-15',eventos:[]},messages,'a'.repeat(50000));
 assert.ok(Buffer.byteLength(voice.instructions)<=16384);
 assert.ok(voice.input.length<=128);
 assert.ok(voice.input.reduce((n,x)=>n+Buffer.byteLength(x.content[0].text)+24,0)<=8192);
 assert.ok(!JSON.stringify(voice.input).includes('sistema'));
 for(const x of voice.input)assert.equal(x.content[0].type,x.role==='user'?'input_text':'output_text');
 const sample=buildVoiceSessionContext({hoy:'2026-09-14',eventos:[]},[{role:'user',content:'Consulta de muestra'}]);
 const sizes=promptComponentSizes({instructions:sample.instructions,input:sample.input});
 console.log('caracteres',sizes.instructions_chars,sizes.context_chars,sizes.input_chars,sizes.tools_chars);
});
test('only owner-global v1 transcript rows admit retries; collisions never promote old history',async()=>{
 const saved=[];
 const db={from(table){
  const filters={};let insert;
  const q={select(){return q},eq(k,v){filters[k]=v;return q},upsert(r,opts){assert.equal(opts.ignoreDuplicates,true);insert=r;return q},
   maybeSingle(){return Promise.resolve({data:filters.user_id==='a'?{id:'chat'}:null})},
   single(){return Promise.resolve({data:saved.find(x=>Object.entries(filters).every(([k,v])=>x[k]===v))})},
   then(ok,bad){if(insert&&!saved.some(x=>x.client_key===insert.client_key))saved.push(insert);return Promise.resolve({error:null}).then(ok,bad)}};
  return q;
 }};
 const body={conversation_id:'chat',turn_id:'voice-1',author:'gari',text:'Una frase inventada.'};
 await persistVoiceTurn(db,'a',body);await persistVoiceTurn(db,'a',body);
 assert.equal(saved.length,1);assert.equal(saved[0].exposure_scope_kind,'global');assert.equal(saved[0].metadata.modality,'voice');
 await assert.rejects(()=>persistVoiceTurn(db,'b',body));
 await assert.rejects(()=>persistVoiceTurn(db,'a',{...body,text:'Una frase distinta.'}));
 saved[0].exposure_scope_version=0;await assert.rejects(()=>persistVoiceTurn(db,'a',body));assert.equal(saved[0].exposure_scope_version,0);
});
