import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isSimpleAgendaMutation,resolveRelativeCalendarDate,guardCalendarProposal,
  calendarProposalReply} from "../supabase/functions/_shared/calendar-temporal-fastpath.mjs";

const source=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const original="Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz";
test("real Bernried phrase uses lightweight action lane without the noun tarea",()=>{
 assert.equal(isSimpleAgendaMutation(original),true);
 assert.equal(isSimpleAgendaMutation("Agrega para mañana revisar Fachplaner"),true);
 assert.equal(isSimpleAgendaMutation("Agrega una tarea para el martes"),true);
 assert.equal(isSimpleAgendaMutation("Analiza todos los planos de Bernried"),false);
 assert.equal(isSimpleAgendaMutation("Prepara un PDF del proyecto Bernried"),false);
 assert.equal(isSimpleAgendaMutation("Qué tal pinta mañana"),false);
});
test("server-local Monday 12 October produces Tuesday 13, not Sunday 11",()=>{
 assert.deepEqual(resolveRelativeCalendarDate(original,"2026-10-12"),
  {kind:"resolved",date:"2026-10-13",token:"tomorrow"});
 const result=guardCalendarProposal({action:"create",kind:"task",
  title:"Besprechungsnotiz",project:"Bernried",date:"2026-10-11"},original,"2026-10-12");
 assert.equal(result.kind,"normalized");
 assert.equal(result.proposal.date,"2026-10-13");
 assert.match(calendarProposalReply(result.proposal),/martes, 13 de octubre de 2026/);
 assert.doesNotMatch(calendarProposalReply(result.proposal),/domingo|agregado/);
});
test("calendar dates are stable across leap days and Germany DST boundaries",()=>{
 assert.equal(resolveRelativeCalendarDate("añade para mañana","2028-02-28").date,"2028-02-29");
 assert.equal(resolveRelativeCalendarDate("añade para mañana","2026-10-24").date,"2026-10-25");
 assert.equal(resolveRelativeCalendarDate("añade pasado mañana","2026-10-24").date,"2026-10-26");
 assert.equal(resolveRelativeCalendarDate("añade hoy","2026-10-12").date,"2026-10-12");
});
test("conflicting explicit dates or weekdays cannot be silently overwritten",()=>{
 const d=resolveRelativeCalendarDate("mañana martes 2026-10-11","2026-10-12");
 assert.equal(d.kind,"conflict");
 const w=resolveRelativeCalendarDate("mañana domingo","2026-10-12");
 assert.equal(w.kind,"conflict");
 const guarded=guardCalendarProposal({action:"create",kind:"task",
  title:"Example",date:"2026-10-11"},"mañana domingo","2026-10-12");
 assert.equal(guarded.kind,"conflict");
});
test("date-free intentions and non-calendar proposals stay unchanged",()=>{
 const proposal={action:"create",kind:"task",title:"Llamar a Bernried",date:null};
 assert.equal(guardCalendarProposal(proposal,"anota tarea Bernried","2026-10-12").proposal,proposal);
 const memo={action:"create",kind:"commitment",date:"2026-10-11"};
 assert.equal(guardCalendarProposal(memo,original,"2026-10-12").proposal,memo);
});
test("existing user-confirmation and source truth boundaries are unchanged",()=>{
 assert.match(source,/create_task:"confirm"/);
 assert.match(source,/update_task:"confirm"/);
 assert.match(source,/recordShadowDecision\(req/);
 assert.match(source,/guardCalendarProposal\(rawProposal,effectiveMessage,temporal\.current_date\)/);
 assert.match(source,/dateGuard\.kind==="conflict"/);
 assert.match(source,/calendarProposalReply\(toolProposals\[0\]\)/);
});
test("fast mutations do not replay huge provider conversation context",()=>{
 assert.match(source,/const fastAgenda=!background&&!attachments\.length&&simpleAgendaMutation/);
 assert.match(source,/!fastAgenda&&conversationInfo\.id\?\{conversation:conversationInfo\.id\}/);
 assert.match(source,/fastAgenda\?fastCalendarInstructions:system/);
 assert.match(source,/fastAgenda\?fastCalendarContext:JSON\.parse\(dynamicContext\)/);
 assert.match(source,/recent\.slice\(-4\)/);
 assert.match(source,/input=nextToolInput\(input,payload\.output,outputs,!!conversationInfo\.id&&!fastAgenda\)/);
 assert.match(source,/!background&&!fastAgenda&&\(route\.work\|\|responseContinuation\)/);
 assert.match(source,/fastAgenda\?fastAgendaTools:/);
});
