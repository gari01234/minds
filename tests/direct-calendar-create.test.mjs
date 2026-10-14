import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {exactOwnerExcerpt,exactFieldExcerpt,authorizedDirectBatch}
 from "../supabase/functions/_shared/direct-calendar-contract.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=read("supabase/functions/isabella-chat/index.ts");
const app=read("apps/isabella/app.js");
const client=read("apps/isabella/ai.js");
const migration=read("supabase/migrations/20261014121000_minds_direct_calendar_create_v01.sql");
const uuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const proposal={kind:"task",action:"create",title:"Enviar Angebot",request_id:uuid};
test("direct authority quotes an actual owner utterance rather than arbitrary remembered text",()=>{
 assert.equal(exactOwnerExcerpt("Agrega una tarea de enviar Angebot para hoy","Agrega una tarea de enviar Angebot"),true);
 assert.equal(exactOwnerExcerpt("Hoy revisamos ELT","Agrega una tarea"),false);
 assert.equal(exactOwnerExcerpt("Tarea","Tarea"),false);
});
test("a missing or inferred event duration cannot enter direct mode",()=>{
 const source="Agrega una reunión mañana a las 10 por 45 minutos";
 assert.equal(exactFieldExcerpt(source,"a las 10"),true);
 assert.equal(exactFieldExcerpt(source,"45 minutos"),true);
 assert.equal(exactFieldExcerpt(source,"60 minutos"),false);
 assert.equal(exactFieldExcerpt(source,""),false);
});
test("only explicit create-only fully registered batches can execute",()=>{
 assert.deepEqual(authorizedDirectBatch([proposal],[uuid],["create_task"]),{
   version:1,mode:"direct_create_v1",request_ids:[uuid]});
 for(const [ps,ids,tools] of [
  [[{...proposal,action:"delete"}],[uuid],["delete_task"]],
  [[proposal],[uuid],["search_work","create_task"]],
  [[proposal],[uuid,uuid],["create_task"]],
  [[proposal],[],["create_task"]],
  [[{...proposal,kind:"routine"}],[uuid],["create_task"]],
 ])assert.equal(authorizedDirectBatch(ps,ids,tools),null);
});
test("server does not infer permission from shadow scores, memory or model prose",()=>{
 assert.match(server,/exactOwnerExcerpt\(sourceText,quoted\)/);
 assert.match(server,/minds_calendar_execution_preferences/);
 assert.match(server,/pref\?\.data\?\.create_mode==="direct"/);
 assert.match(server,/!sourceTainted&&round===0/);
 assert.match(server,/direct_authorization_turn_id:verifiedContinuation\?\.source_turn_id\|\|clientMessageId/);
 assert.match(server,/direct_authorization:directAuthorization/);
 assert.match(server,/authorizedDirectBatch\(toolProposals,directAuthorizedIds,usedTools\)/);
 assert.match(server,/direct_user_excerpt/);
});
test("direct tool lane retains reviewed behavior when permission is off",()=>{
 assert.match(client,/if\(calendarMode\?\.create_mode!=='direct'\)try/);
 assert.match(client,/askFastStream\(message,state/);
 assert.match(server,/create_event:"confirm"/);
 assert.match(server,/update_task:"confirm"/);
 assert.match(server,/delete_event:"confirm"/);
});
test("direct execution can only follow valid typed candidates and canonical readback",()=>{
 assert.match(app,/function directCreationBatch\(result,integrity\)/);
 assert.match(app,/direct\.version!==1\|\|direct\.mode!=='direct_create_v1'/);
 assert.match(app,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(app,/minds_commit_direct_calendar_create_v01/);
 assert.match(app,/No existe una creación autorizada y verificable/);
 assert.match(app,/La lectura canónica no coincide con el recibo/);
 assert.match(app,/await applyDirectCalendarCreate\(p\)/);
 assert.match(app,/action_receipts:committed\.map/);
});
test("database enforces owner preference, canonical quote, candidate and receipt",()=>{
 for(const regexp of [
  /minds_calendar_execution_preferences/,/ENABLE ROW LEVEL SECURITY/,
  /create_mode IN \('review','direct'\)/,/auth\.uid\(\)/,
  /pg_advisory_xact_lock/,/v_decision\.status<>'pending'/,
  /direct_calendar_authority/,/direct_authorization_excerpt/,
  /direct_authorization_turn_id/,/position\(lower\(v_evidence\) in lower\(m\.content\)\)/,
  /minds_commit_reviewed_task_create_v01/,
  /INSERT INTO public\.isabella_events/,/INSERT INTO public\.minds_calendar_action_receipts/,
  /event_overlap_requires_review/,/event_time_or_duration_not_explicit/,
  /GRANT EXECUTE ON FUNCTION public\.minds_commit_direct_calendar_create_v01\(uuid,jsonb\)\s+TO authenticated/
 ])assert.match(migration,regexp);
});
test("permission panel can restore review mode with an authenticated owner update",()=>{
 assert.match(app,/const directCalendar=calendarPref\?\.create_mode==='direct'/);
 assert.match(app,/const desired=directCalendar\?'review':'direct'/);
 assert.match(app,/upsert\(\{user_id:session\.user\.id,create_mode:desired/);
});
