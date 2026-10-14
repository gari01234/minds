import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {interactiveTurnContract,boundedScopedTurn}
 from "../supabase/functions/_shared/turn-capability-contract.mjs";
import {verifyCalendarSemanticProposal}
 from "../supabase/functions/_shared/calendar-semantic-boundary.mjs";
const chat=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");

test("any elliptical correction retains governed tools without a phrase dictionary",()=>{
 for(const phrase of [
  "Por favor corrígelo", "sí, eso, arréglalo", "La anterior, pero el martes",
  "That's wrong, use Thursday", "Das Datum stimmt nicht, bitte ändern",
  "No, esa otra, la de Fachplaner"
 ]){
   const c=interactiveTurnContract({surface:"chat_browser"});
   assert.equal(c.lane,"tool_capable",phrase);
   assert.equal(c.tools,"governed",phrase);
 }
 assert.doesNotMatch(chat,/isContextualCorrection\(effectiveMessage\)/);
 assert.doesNotMatch(chat,/prepareContextualCalendarCorrection\(req/);
 assert.doesNotMatch(chat,/findCalendarCorrection\(/);
});
test("bounded owner conversation is evidence for correction, not permission to write",()=>{
 const context=boundedScopedTurn([
  {role:"user",content:"Agrega tarea Bernried Besprechungsnotiz para mañana"},
  {role:"assistant",content:"He preparado la tarea y la fecha"},
  {role:"user",content:"La fecha está mal"}
 ],"Corrígelo",{limit:12});
 assert.match(context,/Besprechungsnotiz/);
 assert.match(context,/Corrígelo/);
 assert.match(context,/fecha está mal/);
 assert.match(chat,/recordShadowDecision\(req/);
 assert.match(chat,/update_task:"confirm"/);
 assert.match(chat,/source_tainted:sourceTainted,round,background/);
 assert.match(chat,/minds_calendar_execution_preferences/);
});
test("model correction of wrong date remains deterministic once semantically grounded",()=>{
 const p={kind:"task",action:"update",title:"Besprechungsnotiz",
   target_title:"Besprechungsnotiz",target_date:"2026-10-11",date:"2026-10-13"};
 const v=verifyCalendarSemanticProposal(p,{mode:"relative",source_excerpt:"mañana",offset_days:1},
  "Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz","2026-10-12");
 assert.equal(v.kind,"verified");
 assert.equal(v.proposal.date,"2026-10-13");
});
test("no implicit date correction is accepted without its original-owner source",()=>{
 const p={kind:"task",action:"update",date:"2026-10-13"};
 const v=verifyCalendarSemanticProposal(p,{mode:"relative",source_excerpt:"mañana",offset_days:1},
  "Por favor corrígelo","2026-10-12");
 assert.equal(v.kind,"needs_clarification");
 assert.equal(v.reason,"date_evidence_not_in_owner_turn");
});
test("text streaming cannot bypass the normal tool-capable contract",()=>{
 assert.match(chat,/turnContract.lane==="tool_capable"&&\(body\?\.durable===true\|\|body\?\.stream===true\)/);
 assert.match(chat,/fallback:true,reason:"turn_requires_capability_runtime"/);
});
