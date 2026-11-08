import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {exactOwnerTitle,directToolHistorySafe,withDefaultEventDuration,authorizedDirectBatch}
  from '../supabase/functions/_shared/direct-calendar-contract.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';

const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const server=read('supabase/functions/isabella-chat/index.ts');
const client=read('apps/isabella/app.js');
const migration=read('supabase/migrations/20261108101000_isabella_direct_calendar_safe_undo_v02.sql');

test('Owner-only direct evidence is quoted, title-normalized and not supplied by retrieved content',()=>{
  assert.equal(exactOwnerTitle('Anota: Revisar EL informe!','revisar el informe'),true);
  assert.equal(exactOwnerTitle('Anota enviar informe','Preparar un diseño nuevo'),false);
  assert.equal(directToolHistorySafe(['search_calendar','search_routines','create_task'],2),true);
  assert.equal(directToolHistorySafe(['search_calendar','search_work','create_task'],2),false);
  assert.equal(directToolHistorySafe(['create_task','search_memory','create_task'],1),false);
  assert.equal(directToolHistorySafe(['search_calendar','search_memory','create_event'],2),true);
  assert.equal(directToolHistorySafe(['web_search','create_event'],1),false);
  assert.equal(directToolHistorySafe(['search_calendar','create_task'],100),false);
  const id='12345678-1234-4234-8234-123456789abc';
  assert.deepEqual(authorizedDirectBatch([{request_id:id,kind:'task',action:'create'}],[id],
    ['search_calendar','search_memory','create_task']).request_ids,[id]);
  assert.equal(authorizedDirectBatch([{request_id:id,kind:'task',action:'create'}],[id],
    ['search_work','create_task']),null);
  assert.match(server,/direct_owner_source_tainted:/);
  assert.match(server,/directHistorySafe&&!providerWebSeen|!routedSofia&&!providerWebSeen/);
  assert.match(server,/ownerTexts\.some\(t=>exactOwnerTitle\(t,proposal\.title\)\)/);
  assert.match(server,/directToolHistorySafe\(usedTools,roundStartedAt\)/);
});
test('60-minute fallback is server-generated only, with visible editable mark',()=>{
  const draft={kind:'event',action:'create',date:'2026-12-01',time:'10:00'};
  const v=withDefaultEventDuration(draft);
  assert.equal(v.duration_minutes,60);
  assert.equal(v.duration_defaulted,true);
  assert.equal(withDefaultEventDuration({...draft,duration_minutes:45}).duration_defaulted,false);
  const invalid={...draft,time:'not-a-clock'}; assert.equal(withDefaultEventDuration(invalid),invalid);
  assert.match(server,/withDefaultEventDuration\(calendarGrounding\.proposal\)/);
  assert.match(server,/direct_duration_defaulted:proposal\.duration_defaulted===true/);
  assert.match(client,/1 h · editable/);
  assert.match(client,/p\.duration_defaulted/);
});
test('SQL independently verifies receipt, global owner quote, title, default and no retrieved authority',()=>{
  for(const text of ['CREATE OR REPLACE FUNCTION public.minds_commit_direct_calendar_create_v01',
    "v_decision.context->>'direct_owner_source_tainted'",
    'direct_title_not_in_owner_turn','m.provenance_class=\'owner\'',
    "m.exposure_scope_version=1","m.client_key=ANY(v_turns)","ARRAY[v_owner_turn::text,v_source_turn::text]",
    'event_default_duration_invalid',"v_event_duration_quote IS NOT NULL",
    "v_decision.context->>'direct_duration_defaulted'","v_duration<1 OR v_duration>720"])
    assert.ok(migration.includes(text),text);
  assert.doesNotMatch(migration,/DROP TABLE|DROP POLICY|TRUNCATE|DELETE FROM public\.isabella_events\s*;/i);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.minds_commit_direct_calendar_create_v01/);
});
test('Undo is an authenticated atomic receipt-bound exception, not a general delete or archive',()=>{
  for(const phrase of [
    'minds_undo_direct_calendar_create_v01','minds_undo_direct_calendar_batch_v01',
    'auth.uid()','v_receipt.created_at+interval \'10 minutes\'',
    "v_decision.context->>'direct_calendar_authority'","original_task_changed_undo_requires_review",
    'original_event_changed_undo_requires_review','minds_calendar_action_receipts',
    'isabella_activity_log','isabella_deleted_items',
    'pg_advisory_xact_lock','REVOKE ALL ON FUNCTION public.minds_undo_direct_calendar_batch_v01'
  ])assert.ok(migration.includes(phrase),phrase);
  assert.match(migration,/v_count>20/);
  assert.match(migration,/RETURN jsonb_build_object\('status','undone','count',v_count/);
  assert.match(client,/minds_undo_direct_calendar_batch_v01/);
  assert.match(client,/No pude confirmar Deshacer/);
  assert.match(client,/Date\.parse\(expires\)<=Date\.now\(\)/);
  assert.match(client,/directUndoEligible\(m,index\)/);
  assert.match(client,/state\.messages\.slice\(index\+1\)\.some\(m=>m\.role==='user'\)/);
});
function dynamicHarness({failRpc=false,failRead=false}={}){
  const prefix='review:',id='12345678-1234-4234-8234-123456789abc';
  const receipt='77777777-1111-4111-8111-777777777777',key=prefix+id;
  const item={request_id:id,receipt_id:receipt,kind:'task',entity_client_key:key};
  const messages=[{id:'notice-1',role:'assistant',metadata:{direct_undo:{
    status:'ready',expires_at:new Date(Date.now()+55000).toISOString(),items:[item]}}}];
  const state={messages,tasks:[{id:key,title:'Sample',archivedAt:null}],events:[]};
  const notices=[],calls=[],owner='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const sb={
    auth:{getSession:async()=>({data:{session:{user:{id:owner}}},error:null})},
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(failRpc)return {data:null,error:{message:'network_failure'}};
      return {data:{status:'undone',count:1,receipts:[{
        status:'undone',undo_receipt_id:'99999999-1111-4111-8111-999999999999',
        request_id:id,original_receipt_id:receipt,entity_client_key:key,entity_kind:'task'
      }]},error:null};
    },
    from:table=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({
      data:failRead?null:{client_key:key,archived_at:new Date().toISOString()},error:null
    })})})})})
  };
  const context={state,window:{MINDS_SUPABASE:sb},Date,Error,console,
    save(){},renderMessages(){},renderCalendar(){},sayEvent:x=>notices.push(x)};
  const a=client.indexOf('function directUndoEligible(');
  const b=client.indexOf('function renderMessages(',a);
  const c=client.indexOf('async function undoDirectCalendarMessage(');
  const d=client.indexOf('function directCreationBatch(',c);
  assert.ok(a>0&&b>a&&c>0&&d>c);
  const fn=runInNewContext(client.slice(a,b)+'\n'+client.slice(c,d)+'\nundoDirectCalendarMessage;',context);
  return {fn,state,notices,calls,item};
}
test('A verified undo is the exact prior create; no retry or success without both RPC receipt and readback',async()=>{
  const good=dynamicHarness();
  await good.fn('notice-1');
  assert.equal(good.calls.length,1);
  assert.equal(good.calls[0].name,'minds_undo_direct_calendar_batch_v01');
  assert.deepEqual(good.calls[0].args.p_items.map(x=>x.request_id),[good.item.request_id]);
  assert.ok(good.state.tasks[0].archivedAt);
  assert.deepEqual(good.notices,['Deshecho.']);
  await good.fn('notice-1');
  assert.equal(good.calls.length,1,'same Undo never invoked twice');

  for(const opts of [{failRpc:true},{failRead:true}]){
    const h=dynamicHarness(opts);
    await h.fn('notice-1');
    assert.equal(h.calls.length,1);
    assert.equal(h.notices.length,1);
    assert.match(h.notices[0],/No pude confirmar Deshacer/);
    await h.fn('notice-1');
    assert.equal(h.calls.length,1,'ambiguous network status must never replay Undo');
  }
});
test('Direct UI is only visible within ten minutes and before the next owner turn',()=>{
  const start=client.indexOf('function directUndoEligible('),end=client.indexOf('function renderMessages(',start);
  const now=Date.now(),user={role:'user'},note={role:'assistant',metadata:{direct_undo:{
    status:'ready',expires_at:new Date(now+60000).toISOString(),items:[{}]}}};
  const context={state:{messages:[note]},Date};
  const eligible=runInNewContext(client.slice(start,end)+'\ndirectUndoEligible;',context);
  assert.equal(eligible(note,0,now),true);
  context.state.messages.push(user);
  assert.equal(eligible(note,0,now),false);
  context.state.messages.pop();
  assert.equal(eligible(note,0,now+120000),false);
  note.metadata.direct_undo.status='processing';
  assert.equal(eligible(note,0,now),false);
});
test('Block 2 keeps existing instruction/context/input budget, with a small explicit tool description change',()=>{
  const instr='Instrucciones estables de prueba';
  const context={tasks:[],calendar:[]};
  const input=[{role:'user',content:'Añade reunión del proyecto de prueba mañana a las 10'}];
  const oldTool=[{name:'create_event',description:'Propose creating one calendar event. This does NOT execute the change; the UI will ask the user to confirm.'}];
  const newTool=[{name:'create_event',description:'Propose creating an event. If the owner supplied a clock time but no duration, OMIT duration_minutes: the server defaults to 60 min and the UI marks it editable. Otherwise use the stated duration. Direct creation requires an exact owner quote and the owner direct-create preference; other mutations require review.'}];
  const before=promptComponentSizes({instructions:instr,context,input,tools:oldTool});
  const after=promptComponentSizes({instructions:instr,context,input,tools:newTool});
  assert.equal(before.instructions_chars,after.instructions_chars);
  assert.equal(before.context_chars,after.context_chars);
  assert.equal(before.input_chars,after.input_chars);
  assert.ok(after.tools_chars>before.tools_chars);
  console.log('prompt_component_sizes_block2',JSON.stringify({before,after}));
});

// Review of PR #307 (08.11.2026): two things that already worked must keep working.
test('Quotes are literal but not case-sensitive, in the code and in the SQL',async()=>{
  const {exactOwnerExcerpt,exactFieldExcerpt}=await import('../supabase/functions/_shared/direct-calendar-contract.mjs');
  assert.equal(exactOwnerExcerpt('mañana a las 10 reunión con el equipo','Mañana a las 10 reunión'),true);
  assert.equal(exactFieldExcerpt('Reunión MAÑANA a las 10','a las 10'),true);
  assert.equal(exactFieldExcerpt('reunión a las 10','A LAS 10'),true);
  assert.equal(exactOwnerExcerpt('mañana a las 10','mañana a las 11'),false,'still literal');
  assert.equal(exactFieldExcerpt('a las 10','a'),false,'still a minimum length');
  for(const s of ['position(lower(v_evidence) in lower(m.content))>0','position(lower(v_event_time_quote) in lower(m.content))>0',
    'position(lower(v_event_duration_quote) in lower(m.content))>0'])assert.ok(migration.includes(s),s);
  assert.doesNotMatch(migration,/position\(v_evidence in m\.content\)/);
});

test('After «¿a qué hora?», the answer and the clarified message together authorize a direct creation',async()=>{
  const {directOwnerTexts,exactOwnerExcerpt,exactFieldExcerpt}=await import('../supabase/functions/_shared/direct-calendar-contract.mjs');
  const continuation={source_message:'Agrega reunión con el Bauamt mañana',source_turn_id:'22222222-2222-4222-8222-222222222222'};
  const texts=directOwnerTexts(continuation,'A las 10');
  assert.deepEqual(texts,['Agrega reunión con el Bauamt mañana','A las 10']);
  assert.ok(texts.some(t=>exactOwnerExcerpt(t,'agrega reunión con el Bauamt mañana')));
  assert.ok(texts.some(t=>exactOwnerTitle(t,'Reunión con el Bauamt')));
  assert.ok(texts.some(t=>exactFieldExcerpt(t,'a las 10')));
  assert.equal(texts.some(t=>exactOwnerExcerpt(t,'mañana A las 10 con el Bauamt')),false,'a quote never spans two messages');
  assert.deepEqual(directOwnerTexts(null,'Anota llamar a Ana'),['Anota llamar a Ana']);
  assert.deepEqual(directOwnerTexts({source_message:'  '},'x'),['x']);
  // The answering turn authorizes (Undo closes with the next message); the clarified one may hold the title.
  assert.match(server,/direct_authorization_turn_id:clientMessageId,/);
  assert.match(server,/direct_source_turn_id:verifiedContinuation\.source_turn_id/);
  assert.match(migration,/v_source_turn:=nullif\(v_decision\.context->>'direct_source_turn_id',''\)::uuid;/);
  assert.match(migration,/v_turns:=array_remove\(ARRAY\[v_owner_turn::text,v_source_turn::text\],NULL\);/);
  // Voice delegation never creates directly (main), nor does a turn that saw the web (#307).
  assert.match(server,/surface==="chat_browser"&&!voiceDelegation&&!currentWorkThread/);
  assert.match(server,/const directAuthorization=providerWebSeen\|\|voiceDelegation\?null:/);
});
