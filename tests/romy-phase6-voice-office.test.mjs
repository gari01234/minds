import test from 'node:test';
import assert from 'node:assert/strict';
import {liveOriginAllowed,liveCorsOrigin,liveOwner,liveOriginalVoiceAllowed,liveTranscriptAuthorAllowed}
  from '../supabase/functions/_shared/office-live-contract.mjs';
import {liveConversation,buildVoiceSessionContext,persistVoiceTurn,VOICE_GUIDE,withinBytes}
  from '../supabase/functions/_shared/live-context.mjs';
import {ISABELLA_CORE} from '../supabase/functions/_shared/isabella-core.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
test('Window Live keeps original CORS, prompt and voice admission; Office opts in separately',()=>{
  assert.equal(liveOriginAllowed('https://gari01234.github.io','window'),true);
  assert.equal(liveOriginAllowed('https://tbarchitekten.github.io','window'),false);
  assert.equal(liveOriginAllowed('https://tbarchitekten.github.io','office'),true);
  assert.equal(liveOriginAllowed('https://gari01234.github.io','office'),true);
  assert.equal(liveOriginAllowed('https://attack.invalid','office'),false);
  assert.equal(liveCorsOrigin('https://attack.invalid','office'),null);
  assert.equal(liveOriginalVoiceAllowed('window'),true);
  assert.equal(liveOriginalVoiceAllowed('office'),false);
  assert.equal(liveTranscriptAuthorAllowed('isabella','window'),true);
  assert.equal(liveTranscriptAuthorAllowed('isabella','office'),false);
  const data={hoy:'2026-11-08'},recent=[];
  const original=buildVoiceSessionContext(data,recent,'');
  assert.equal(original.instructions,withinBytes([ISABELLA_CORE,VOICE_GUIDE].join('\n\n'),15500));
  assert.match(JSON.stringify(original),/Contexto de Window/);
  const office=buildVoiceSessionContext(data,recent,'',{profile:'office',owner:'Alex Beispiel'});
  assert.match(office.instructions,/Romy/);
  assert.match(office.instructions,/Alex/);
  assert.doesNotMatch(office.instructions,/\bGari\b|\bIsabella\b/);
  assert.match(JSON.stringify(office),/TBA Office Kontext|Kontext aus TBA Office/);
});
test('Live identity belongs to active signed-in Office member, never client-supplied names',async()=>{
  const rows=new Map([[A,{display_name:'Alex Beispiel',is_active:true,must_change_password:false}],
    [B,{display_name:'Mara Beispiel',is_active:false,must_change_password:false}]]);
  const sb={from(table){
    assert.equal(table,'office_members');
    return {select(cols){assert.equal(cols,'display_name,is_active,must_change_password');return{
      eq(k,v){assert.equal(k,'user_id');return {maybeSingle:async()=>({data:rows.get(v)||null,error:null})}}}}};
  }};
  assert.equal(await liveOwner(sb,A,'office'),'Alex');
  assert.equal(await liveOwner(sb,B,'office'),null);
  assert.equal(await liveOwner(sb,'44444444-4444-4444-8444-444444444444','office'),null);
  rows.set(B,{display_name:'Mara',is_active:true,must_change_password:true});
  assert.equal(await liveOwner(sb,B,'office'),null);
  assert.equal(await liveOwner(sb,A,'window'),'Gari');
});
test('New Office conversation is titled Romy, without changing Window conversation metadata',async()=>{
  const inserted=[];
  const sb={from(table){
    assert.equal(table,'conversations');
    return {
      select(cols){assert.equal(cols,'id');return {
        eq(){return this},order(){return this},limit(){return this},
        async maybeSingle(){return {data:null,error:null}}
      }},
      insert(row){inserted.push(row);return {
        select(){return {async single(){return {data:{id:'new-id'},error:null}}}}
      }}
    };
  }};
  await liveConversation(sb,A,null,'window');
  await liveConversation(sb,B,null,'office');
  assert.equal(inserted[0].title,'Isabella');
  assert.equal(inserted[0].metadata.app,'isabella');
  assert.equal(inserted[1].title,'Romy');
  assert.equal(inserted[1].metadata.app,'romy');
  assert.equal(inserted[1].user_id,B);
});
test('Office Live rejects forged assistant transcript before any database write',async()=>{
  const forbidden={from(){throw Error('database should not be touched')}};
  await assert.rejects(()=>persistVoiceTurn(forbidden,A,{turn_id:'voice-1',author:'isabella',
    text:'not provider verified',conversation_id:'fake-id'},'office'),/invalid_voice_turn/);
  await assert.rejects(()=>persistVoiceTurn(forbidden,A,{turn_id:'voice-2',author:'romy',
    text:'not provider verified',conversation_id:'fake-id'},'office'),/invalid_voice_turn/);
});

test('Phase 6: canonical spoken outcomes remain Spanish in Window and German in Office',()=>{
  const src=readFileSync(new URL('../apps/isabella/live/canonical.js',import.meta.url),'utf8');
  const make=profile=>{
    const win={APP_PROFILE:profile};runInNewContext(src,{window:win,TextEncoder,URL});
    return win.ISABELLA_LIVE_CANONICAL;
  };
  const payload={reply:'Bitte bestätigen',outcome:{outcome:'proposal_created'},proposals:[{request_id:A}]};
  const validator=()=>({ok:true,typed:true,outcome:'proposal_created',applied_count:0});
  const personal=make('window').admission(payload,validator,()=>null);
  const office=make('office').admission(payload,validator,()=>null);
  assert.match(personal.spoken,/propuesta en el chat/);
  assert.match(office.spoken,/Vorschlag im Romy-Chat/);
});

test('Phase 6: measured voice prompt footprint, Window no-op and Office profile',()=>{
  const data={hoy:'2026-01-02',tareas:[]};
  const windowResult=buildVoiceSessionContext(data,[],'');
  const officeResult=buildVoiceSessionContext(data,[],'',{profile:'office',owner:'Alex Beispiel'});
  const original=promptComponentSizes({
    instructions:windowResult.instructions,
    context:JSON.stringify(windowResult.input),input:'',tools:[]
  });
  const configured=promptComponentSizes({
    instructions:officeResult.instructions,
    context:JSON.stringify(officeResult.input),input:'',tools:[]
  });
  assert.ok(original.instructions_chars>1000);
  assert.ok(configured.instructions_chars>1000);
  assert.equal(original.tools_count,0);
  assert.equal(configured.tools_count,0);
  console.log('romy_phase6_voice_prompt_component_sizes',JSON.stringify({window:original,office:configured}));
});
