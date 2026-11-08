import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {directTitleInOwnerTurn,directPriorRoundsSafe,directToolsClean,
  authorizedDirectBatch,exactOwnerExcerpt,exactFieldExcerpt}
  from '../supabase/functions/_shared/direct-calendar-contract.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const sqlDefault=read('supabase/migrations/20261108091500_minds_direct_calendar_duration_v02.sql');
const sqlUndo=read('supabase/migrations/20261108091600_minds_direct_calendar_undo_v01.sql');
const requestA='123e4567-e89b-42d3-a456-426614174000';
const requestB='223e4567-e89b-42d3-a456-426614174000';
const p=id=>({kind:'task',action:'create',title:'Enviar informe',request_id:id});

test('Owner title is required in current utterance, never the Work prefetch',()=>{
 assert.equal(directTitleInOwnerTurn('Agrega la tarea de enviar informe hoy','Enviar informe'),true);
 assert.equal(directTitleInOwnerTurn('Agrega seguimiento de proyecto','Enviar informe'),false);
 assert.equal(directTitleInOwnerTurn('Preparar reunión de diseño','Preparar reunión de diseño'),true);
 assert.equal(directTitleInOwnerTurn('Agrega una tarea',''),false);
 assert.equal(exactOwnerExcerpt('Agrega enviar informe para hoy','Agrega enviar informe'),true);
 assert.match(server,/directTitleInOwnerTurn\(sourceText,proposal\?\.title\)/);
 assert.match(server,/exactOwnerExcerpt\(sourceText,quoted\)/);
 assert.match(server,/!directSourceTainted/);
 assert.match(server,/direct_source_tainted:directSourceTainted/);
});

test('Subsequent rounds permit only proven read-only work and never borrowed source authority',()=>{
 for(const tools of [
  ['search_calendar'],['search_routines','search_memory'],[]]){
  assert.equal(directPriorRoundsSafe(1,tools),true);
  assert.equal(directToolsClean([...tools,'create_task']),true);
 }
 for(const disallowed of ['search_work','read_work_file','consult_sofia','web_search',
   'read_task_origin','load_skill','delete_event','update_task']){
  assert.equal(directPriorRoundsSafe(1,[disallowed]),false,disallowed);
  assert.equal(directToolsClean([disallowed,'create_task']),false,disallowed);
 }
 assert.equal(directPriorRoundsSafe(0,['search_work']),true,'first round still separately source-gated');
 assert.equal(directPriorRoundsSafe(-1,[]),false);
 assert.equal(directPriorRoundsSafe(1,['search_calendar','create_task']),false);
 assert.deepEqual(authorizedDirectBatch([p(requestA),p(requestB)],
   [requestA,requestB],['search_calendar','search_memory','create_task','create_task']),{
   version:1,mode:'direct_create_v1',request_ids:[requestA,requestB]});
 assert.equal(authorizedDirectBatch([p(requestA)],[requestA],['search_work','create_task']),null);
 assert.match(server,/const priorRoundTools=usedTools\.slice\(\)/);
 assert.match(server,/directPriorRoundsSafe\(round,priorRoundTools\)/);
});

test('Absent event duration defaults to precisely 60 minutes and remains owner-clock backed',()=>{
 assert.match(server,/args\?\.duration_defaulted===true/);
 assert.match(server,/rawProposal=\{\.\.\.rawProposal,duration_minutes:60,duration_defaulted:true\}/);
 assert.match(server,/exactFieldExcerpt\(sourceText,args\?\.direct_event_time_excerpt\)/);
 assert.match(server,/proposal\?\.duration_defaulted===true&&proposal\?\.duration_minutes===60/);
 assert.equal(exactFieldExcerpt('Reunión mañana a las 10','a las 10'),true);
 assert.equal(exactFieldExcerpt('Reunión mañana a las 10','por 60 minutos'),false);
 assert.match(sqlDefault,/v_default_duration/);
 assert.match(sqlDefault,/v_default_duration IS DISTINCT FROM coalesce/);
 assert.match(sqlDefault,/v_event_duration_quote IS NOT NULL/);
 assert.match(sqlDefault,/event_default_duration_mismatch/);
 assert.match(sqlDefault,/p_candidate->>'duration_minutes'/);
 assert.match(sqlDefault,/position\(lower\(v_event_time_quote\) in lower\(m\.content\)\)>0/);
 assert.match(sqlDefault,/direct_source_tainted/);
 assert.match(app,/p\.duration_defaulted\?' · 1 h · editable'/);
 assert.doesNotMatch(sqlDefault,/DROP TABLE|TRUNCATE|DELETE FROM public\.isabella_/);
});

test('Undo is a bounded, owner-scoped receipt operation and never authorizes general mutation',()=>{
 for(const phrase of [
  'auth.uid()','pg_advisory_xact_lock','v_receipt.action NOT IN',
  "v_decision.context->>'direct_calendar_authority'",
  "interval '10 minutes'",'undo_newer_owner_turn_exists',
  "m.provenance_class='owner'","m.exposure_scope_version=1",
  'undo_canonical_target_changed','v_receipt.entity_id',
  'v_receipt.entity_client_key','updated_at=',
  'already_undone','undo_receipt_id','GRANT EXECUTE ON FUNCTION'
 ])assert.ok(sqlUndo.includes(phrase),phrase);
 assert.doesNotMatch(sqlUndo,/DROP TABLE|TRUNCATE|DELETE FROM public\.isabella_tasks/);
 assert.match(sqlUndo,/DELETE FROM public\.isabella_events\s+WHERE user_id=v_user AND id=v_receipt.entity_id/);
 assert.match(app,/minds_undo_direct_calendar_create_v01/);
 assert.match(app,/undo\.state="processing"/);
 assert.match(app,/undo\.state=failed\.length\?"failed":"undone"/);
 assert.match(app,/sayEvent\('Deshecho\.'/);
 assert.match(app,/10\*60000/);
 assert.match(app,/data-direct-undo=/);
 assert.match(app,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(server,/create_event:"confirm"/);
 assert.match(server,/update_task:"confirm"/);
});

test('Undo control disappears on next user message or deadline and never on unrelated output',()=>{
 const a=app.indexOf('function eligibleDirectUndo('),b=app.indexOf('\nfunction renderMessages(',a);
 assert.ok(a>0&&b>a,'undo pure gating function');
 const uuid='123e4567-e89b-42d3-a456-426614174000';
 const message={role:'assistant',metadata:{undo_direct:{
  state:'available',expires_at:'2026-11-08T10:10:00Z',
  items:[{receipt_id:uuid,request_id:uuid}]}}};
 const state={messages:[{role:'user',text:'Crea una tarea'},message]};
 const eligible=runInNewContext('(function(state){'+app.slice(a,b)+';return eligibleDirectUndo})')(state);
 const now=Date.parse('2026-11-08T10:05:00Z');
 assert.equal(eligible(message,1,now),true);
 assert.equal(eligible(message,1,Date.parse('2026-11-08T10:10:00Z')),false);
 state.messages.push({role:'assistant',text:'Otra respuesta'});
 assert.equal(eligible(message,1,now),true);
 state.messages.push({role:'user',text:'Otro mensaje'});
 assert.equal(eligible(message,1,now),false);
 assert.equal(eligible({...message,metadata:{undo_direct:{...message.metadata.undo_direct,state:'undone'}}},1,now),false);
});
