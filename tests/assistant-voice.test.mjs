import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appVoice,failureLine,proposalLine} from '../supabase/functions/_shared/assistant-voice.mjs';
import {calendarProposalReply} from '../supabase/functions/_shared/calendar-temporal-fastpath.mjs';
import {failureNotice} from '../supabase/functions/_shared/chat-delivery.mjs';
import {isSystemNotice} from '../supabase/functions/_shared/system-notice.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const event={kind:'event',action:'create',title:'Bemusterung Leuchten',date:'2026-11-11',project:'Bernried'};

test('Window keeps its Spanish lines exactly as before',()=>{
  assert.equal(calendarProposalReply(event),'Propuesta: evento «Bemusterung Leuchten» para el miércoles, 11 de noviembre de 2026 (proyecto Bernried) · pendiente de tu confirmación.');
  assert.equal(calendarProposalReply({...event,action:'update',kind:'task',project:null,date:null}),'Propuesta: actualizar tarea «Bemusterung Leuchten» · pendiente de tu confirmación.');
  assert.equal(appVoice('window').prepared,'He preparado el cambio para que lo revises antes de aplicarlo.');
  assert.equal(appVoice().direct_pending,'Creación autorizada, pendiente de comprobante.');
  assert.equal(failureNotice('credit'),'No se pudo responder: la cuenta de OpenAI que usa Isabella se quedó sin crédito. Cuando la recargues, vuelve a enviar el mensaje.');
  assert.equal(failureNotice('whatever'),'No se pudo responder a este mensaje por un error del servicio. Vuelve a enviarlo.');
});

test('the office gets the same lines in German, written by the engine',()=>{
  assert.equal(calendarProposalReply(event,'office'),'Vorschlag: Termin «Bemusterung Leuchten» · Mittwoch, 11. November 2026 (Projekt Bernried) · wartet auf deine Bestätigung.');
  assert.equal(proposalLine({kind:'task',action:'update',target_title:'Angebot prüfen'},'office'),'Vorschlag: Aufgabe «Angebot prüfen» aktualisieren · wartet auf deine Bestätigung.');
  assert.equal(proposalLine({kind:'routine',action:'create',title:'x'},'office'),null);
  assert.doesNotThrow(()=>proposalLine({...event,date:'2026-19-67'},'office'));
  assert.match(failureLine('credit','office'),/^Keine Antwort möglich: /);
  assert.match(failureNotice('empty','office'),/^Keine Antwort möglich: /);
  const de=appVoice({id:'office'}),es=appVoice('window');
  assert.deepEqual(Object.keys(de).sort(),Object.keys(es).sort());
  // No Spanish left in the German set and no line names the wrong assistant.
  for(const [key,line] of Object.entries(de)){
    assert.doesNotMatch(line,/\b(No pude|pendiente|propuesta|Isabella|MINDS)\b/i,key);
  }
});

test('every app line of both languages is recognised as a system line, never as her own words',()=>{
  for(const profile of ['window','office']){
    const v=appVoice(profile);
    for(const key of ['prepared','direct_pending','unregistered','failure_credit','failure_empty','failure_incomplete','failure_error'])
      assert.equal(isSystemNotice(v[key]),true,profile+':'+key);
    assert.equal(isSystemNotice(proposalLine(event,profile)),true,profile+':proposal');
  }
  assert.equal(isSystemNotice(appVoice('office').voice_card),true);
});

test('the engine takes its fixed lines from the profile voice',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(chat,/const voice=appVoice\(assistantProfile\)/);
  assert.match(chat,/calendarProposalReply\(toolProposals\[0\],assistantProfile\.id\)/);
  assert.match(chat,/failureNotice\(kind,assistantProfile\.id\)/);
  for(const literal of ['"He preparado el cambio para que lo revises antes de aplicarlo."','"Creación autorizada, pendiente de comprobante."',
    '"No pude registrar una propuesta nueva y verificable','"Hay una propuesta pendiente de confirmar."','Me pediste que te recordara: "'])
    assert.equal(chat.includes(literal),false,literal);
});
