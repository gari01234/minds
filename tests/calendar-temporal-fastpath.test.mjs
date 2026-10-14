import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isSimpleAgendaMutation,calendarDateReferenceText,calendarProposalReply}
 from "../supabase/functions/_shared/calendar-temporal-fastpath.mjs";
import {verifyCalendarSemanticProposal}
 from "../supabase/functions/_shared/calendar-semantic-boundary.mjs";
const source=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
test("the fast hint preserves low-latency access for familiar calendar requests",()=>{
 for(const s of [
  "Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz",
  "Agrega para mañana revisar Fachplaner",
  "Agrega una tarea para el martes",
  "Agrega un Termin proyecto Schwarz para el martes 27 a las 11 de la mañana, dos horas",
  "Mañana es martes, te has confundido"
 ])assert.equal(isSimpleAgendaMutation(s),true,s);
 for(const s of ["Analiza todos los planos de Bernried","Prepara un PDF del proyecto Bernried",
  "Qué tal pinta mañana"])assert.equal(isSimpleAgendaMutation(s),false,s);
});
test("fast hints must not determine a calendar date, permission, or acceptance",()=>{
 assert.doesNotMatch(source,/guardCalendarProposal\(/);
 assert.doesNotMatch(source,/resolveRelativeCalendarDate\(/);
 assert.match(source,/verifyCalendarSemanticProposal\(rawProposal,args\?\.temporal_grounding/);
 assert.match(source,/source_tainted:sourceTainted,round,background/);
 assert.match(source,/recordShadowDecision\(req/);
 assert.match(source,/create_event:"confirm"/);
 assert.match(source,/update_task:"confirm"/);
 assert.match(source,/calendarProposalReply\(toolProposals\[0\]\)/);
});
test("wrong date given by a model is derived from normalized semantic relative claim",()=>{
 const p={kind:"task",action:"create",title:"Besprechungsnotiz",project:"Bernried",date:"2026-10-11"};
 const phrase="Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz";
 const v=verifyCalendarSemanticProposal(p,{mode:"relative",source_excerpt:"mañana",offset_days:1},phrase,"2026-10-12");
 assert.equal(v.kind,"verified");
 assert.equal(v.proposal.date,"2026-10-13");
 assert.equal(p.date,"2026-10-11");
 assert.match(calendarProposalReply(v.proposal),/martes, 13 de octubre de 2026/);
});
test("arithmetic is stable over leap days and DST when interpretation is already structured",()=>{
 const cases=[
  ["2028-02-28",1,"2028-02-29"],["2026-10-24",1,"2026-10-25"],
  ["2026-10-24",2,"2026-10-26"],["2026-10-12",0,"2026-10-12"]];
 for(const [today,days,expected] of cases){
   const v=verifyCalendarSemanticProposal({kind:"task",action:"create",date:"2026-10-11"},
     {mode:"relative",source_excerpt:"tomorrow",offset_days:days},
     "please do this tomorrow",today);
   assert.equal(v.kind,"verified");
   assert.equal(v.proposal.date,expected);
 }
});
test("named weekday mismatch is a structured contradiction rather than a regex override",()=>{
 const v=verifyCalendarSemanticProposal({kind:"event",action:"create",date:"2026-10-15"},
   {mode:"relative",source_excerpt:"mañana",offset_days:1,weekday:2},
   "mañana martes a las 11","2026-10-14");
 assert.equal(v.kind,"needs_clarification");
 assert.equal(v.reason,"claimed_weekday_disagrees_with_calendar");
});
test("proposal wording shows a proposal, never a premature claim of a database write",()=>{
 const v={kind:"event",action:"create",title:"Abgabe LP2",date:"2026-10-27",project:"Schwarz"};
 assert.match(calendarProposalReply(v),/martes, 27 de octubre de 2026/);
 assert.match(calendarProposalReply(v),/pendiente de tu confirmación/);
 assert.doesNotMatch(calendarProposalReply(v),/quedó creada|agregado/);
 assert.doesNotThrow(()=>calendarProposalReply({...v,date:"2026-19-67"}));
});
test("legacy date-reparsing helpers no longer exist",()=>{
 const helper=readFileSync(new URL("../supabase/functions/_shared/calendar-temporal-fastpath.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(helper,/export function guardCalendarProposal/);
 assert.doesNotMatch(helper,/export function resolveRelativeCalendarDate/);
 assert.ok(!calendarDateReferenceText("a las 11 de la mañana").includes("mañana"));
});
