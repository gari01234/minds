import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyCalendarSemanticProposal,validatedCalendarClock}
 from "../supabase/functions/_shared/calendar-semantic-boundary.mjs";
const server=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const date="2026-10-14";
const sourceVariants=[
 "Agrega un Termin proyecto Schwarz para el martes 27 a las 11 de la mañana, dos horas. Nombre del Termin es Abgabe LP2",
 "Ponme Abgabe LP2 en Schwarz el 27 de octubre a las once; dura dos horas.",
 "Para Schwarz, agenda el martes 27/10 a las 11 h una cita de 120 minutos: Abgabe LP2.",
 "El Termin Abgabe LP2 del proyecto Schwarz será el martes 27, de once a una.",
 "Necesito bloquear dos horas desde las 11 el 27 de octubre para Abgabe LP2 de Schwarz.",
 "Create an appointment Abgabe LP2 for Schwarz on Tuesday October 27, 11 AM to 1 PM.",
 "Bitte Termin Abgabe LP2 für Schwarz am Dienstag, 27. Oktober, von 11 bis 13 Uhr eintragen."
];
const absoluteEvent={kind:"event",action:"create",title:"Abgabe LP2",project:"Schwarz",
 date:"2026-10-27",time:"11:00",duration_minutes:120};
test("equivalent multilingual natural instructions share one semantic/action contract",()=>{
 for(const userMessage of sourceVariants){
  const quote=userMessage.includes("martes 27")?"martes 27":
    userMessage.includes("27 de octubre")?"27 de octubre":
    userMessage.includes("27/10")?"27/10":
    userMessage.includes("October 27")?"October 27":"27. Oktober";
  const v=verifyCalendarSemanticProposal(absoluteEvent,{
    mode:"absolute",source_excerpt:quote,weekday:2},userMessage,date);
  assert.equal(v.kind,"verified",userMessage);
  assert.equal(v.proposal.date,"2026-10-27");
  assert.equal(validatedCalendarClock(v.proposal).kind,"valid");
 }
});
test("model may interpret 'morning' but verifier never reads that wording",()=>{
 const source="el martes 27 a las 11 de la mañana, duración dos horas";
 const v=verifyCalendarSemanticProposal(absoluteEvent,{
   mode:"absolute",source_excerpt:"martes 27",weekday:2},source,date);
 assert.equal(v.kind,"verified");
 assert.doesNotMatch(server,/guardCalendarProposal\(rawProposal,effectiveMessage/);
 assert.doesNotMatch(server,/temporal_conflict_requires_clarification/);
 assert.match(server,/verifyCalendarSemanticProposal\(rawProposal,args\?\.temporal_grounding/);
});
test("relative-day math is canonical; ignore incorrect model-supplied ISO",()=>{
 const variants=[
  {text:"mañana a las 11 de la mañana",quote:"mañana",days:1,date:"2026-10-15"},
  {text:"pasado mañana a las 9",quote:"pasado mañana",days:2,date:"2026-10-16"},
  {text:"morning tomorrow for a short meeting",quote:"tomorrow",days:1,date:"2026-10-15"},
  {text:"am übermorgen einen Termin",quote:"übermorgen",days:2,date:"2026-10-16"}
 ];
 for(const x of variants){
  const proposed={kind:"task",action:"create",title:"Test",date:"2026-10-11"};
  const v=verifyCalendarSemanticProposal(proposed,{
   mode:"relative",source_excerpt:x.quote,offset_days:x.days},x.text,date);
  assert.equal(v.kind,"verified",x.text);
  assert.equal(v.proposal.date,x.date);
  assert.equal(proposed.date,"2026-10-11");
 }
});
test("a wrong weekday, nonexistent date, forged excerpt and invented relative offset abstain",()=>{
 const tests=[
  {p:{...absoluteEvent,date:"2026-10-27"},g:{mode:"absolute",source_excerpt:"martes 27",weekday:1},s:"el martes 27"},
  {p:{...absoluteEvent,date:"2026-02-30"},g:{mode:"absolute",source_excerpt:"el día 30"},s:"el día 30"},
  {p:{...absoluteEvent},g:{mode:"absolute",source_excerpt:"una fecha ausente"},s:"el martes 27"},
  {p:{...absoluteEvent},g:{mode:"relative",source_excerpt:"mañana",offset_days:1.5},s:"mañana"},
  {p:{...absoluteEvent},g:{mode:"absolute",source_excerpt:"martes 27",offset_days:1},s:"martes 27"},
  {p:{...absoluteEvent},g:null,s:"martes 27"}
 ];
 for(const c of tests)assert.equal(
   verifyCalendarSemanticProposal(c.p,c.g,c.s,date).kind,"needs_clarification",JSON.stringify(c));
});
test("undated tasks and changing only a title need no fabricated date quote",()=>{
 for(const x of [{kind:"task",action:"create",date:null,title:"Test"},
  {kind:"task",action:"update",date:null,title:"Rename"}]){
  const v=verifyCalendarSemanticProposal(x,null,"any phrase",date);
  assert.equal(v.kind,"verified");
  assert.equal(v.proposal,x);
 }
 assert.equal(verifyCalendarSemanticProposal({...absoluteEvent,date:null},null,"meeting",date).kind,"needs_clarification");
});
test("clock and duration validation deals in normalized quantities, not natural-language parsing",()=>{
 for(const bad of [
   {...absoluteEvent,time:"25:00"}, {...absoluteEvent,duration_minutes:0},
   {...absoluteEvent,duration_minutes:800}, {...absoluteEvent,time:"tomorrow"},
   {...absoluteEvent,duration_minutes:60.5}
 ]) assert.equal(validatedCalendarClock(bad).kind,"needs_clarification");
 assert.equal(validatedCalendarClock({...absoluteEvent,time:"13:15",duration_minutes:30}).kind,"valid");
});
test("the calendar writer keeps the original permission and receipt boundary",()=>{
 assert.match(server,/recordShadowDecision\(req/);
 assert.match(server,/source_tainted:sourceTainted,round,background/);
 assert.match(server,/temporal_basis:calendarGrounding.basis/);
 assert.match(server,/direct_authorization_turn_id/);
 assert.match(server,/toolProposals.push\(proposalForReview\)/);
 assert.match(server,/calendar_semantic_grounding_required/);
 assert.match(server,/request_clarification/);
});
