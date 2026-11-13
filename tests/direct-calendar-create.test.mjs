import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {ownerAsked,directCreatable,directOwnerTexts,directToolHistorySafe,withDefaultEventDuration,authorizedDirectBatch}
 from "../supabase/functions/_shared/direct-calendar-contract.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=read("supabase/functions/isabella-chat/index.ts");
const tools=read("supabase/functions/_shared/isabella-tools.mjs");
const app=read("apps/isabella/app.js");
const client=read("apps/isabella/ai.js");
const migration=read("supabase/migrations/20261014121000_minds_direct_calendar_create_v01.sql");
const v03=read("supabase/migrations/20261111230000_isabella_direct_create_owner_request_v03.sql");
const uuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const proposal={kind:"task",action:"create",title:"Enviar Angebot",request_id:uuid};
const event={kind:"event",action:"create",title:"Bemusterung Leuchten",date:"2026-11-12",time:"10:00",duration_minutes:60};
test("the request has to be the owner's own words of this turn, in any wording and any length",()=>{
 assert.equal(ownerAsked("Agrega una tarea de enviar Angebot para hoy","Agrega una tarea de enviar Angebot"),true);
 assert.equal(ownerAsked("Agrega este Termin","agrega este termin."),true);
 assert.equal(ownerAsked("Sí, apúntalo","Sí"),true);
 assert.equal(ownerAsked("ok","OK"),true);
 // Nothing she read or remembers can be the request.
 assert.equal(ownerAsked("Hoy revisamos ELT","Agrega una tarea"),false);
 assert.equal(ownerAsked("¿Qué tengo mañana?",""),false);
 assert.equal(ownerAsked("👍","👍"),false);
 assert.equal(ownerAsked("a","a"),false);
 // After a verified clarification the answered turn counts as well; retrieved text never does.
 assert.deepEqual(directOwnerTexts({source_message:"Agrega reunión con Hans mañana"},"a las 10"),["Agrega reunión con Hans mañana","a las 10"]);
 assert.deepEqual(directOwnerTexts(null,"a las 10"),["a las 10"]);
});
test("what can be created without a card: an own task or a timed event, nothing else",()=>{
 assert.equal(directCreatable(proposal),true);
 assert.equal(directCreatable({...proposal,date:null}),true);
 assert.equal(directCreatable(event),true);
 for(const bad of [
  {...event,all_day:true},{...event,time:null},{...event,duration_minutes:0},{...event,duration_minutes:900},
  {...event,recurrence:{frequency:"weekly"}},{...proposal,recurrence:{frequency:"daily"}},
  {...proposal,action:"update"},{...proposal,action:"delete"},{...proposal,target_id:"t1"},{...proposal,target_title:"Otra"},
  {...proposal,title:" "},{...proposal,kind:"routine"},null
 ])assert.equal(directCreatable(bad),false,JSON.stringify(bad));
});
test("reading the owner's own things does not block a creation; text from outside does",()=>{
 assert.equal(directToolHistorySafe(["search_calendar","search_memory","create_task"]),true);
 assert.equal(directToolHistorySafe(["search_work","read_work_file","create_event"]),true);
 assert.equal(directToolHistorySafe(["load_skill","create_task","create_task"]),true);
 assert.equal(directToolHistorySafe(["consult_sofia","create_task"]),false);
 assert.equal(directToolHistorySafe(["delegate_specialist","create_task"]),false);
 assert.equal(directToolHistorySafe(["orchestrate_specialists","create_event"]),false);
 assert.equal(authorizedDirectBatch([proposal],[uuid],["search_work","create_task"])?.mode,"direct_create_v1");
 assert.equal(withDefaultEventDuration({kind:"event",action:"create",time:"10:00",duration_minutes:null}).duration_defaulted,true);
 assert.equal(withDefaultEventDuration({kind:"event",action:"create",time:"10:00",duration_minutes:45}).duration_defaulted,false);
});
test("only a turn whose prepared changes are all authorized creations goes through without cards",()=>{
 assert.deepEqual(authorizedDirectBatch([proposal],[uuid],["create_task"]),{
   version:1,mode:"direct_create_v1",request_ids:[uuid]});
 for(const [ps,ids,used] of [
  [[{...proposal,action:"delete"}],[uuid],["delete_task"]],
  [[proposal,{...proposal,action:"update",request_id:"bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee"}],[uuid],["create_task","update_task"]],
  [[proposal],[uuid],["consult_sofia","create_task"]],
  [[proposal],[uuid,uuid],["create_task"]],
  [[proposal],[],["create_task"]],
  [[{...proposal,kind:"routine"}],[uuid],["create_task"]],
 ])assert.equal(authorizedDirectBatch(ps,ids,used),null);
});
test("the server takes the request from the owner's turn and nothing else; details may be interpreted",()=>{
 assert.match(server,/ownerTexts\.some\(t=>ownerAsked\(t,quoted\)\)/);
 assert.match(server,/const ownerTexts=directOwnerTexts\(verifiedContinuation,effectiveMessage\);/);
 assert.match(server,/directCreatable\(proposal\)/);
 assert.match(server,/minds_calendar_execution_preferences/);
 // Creating with Undo is the default; only an explicit «review» turns it off.
 assert.match(server,/directAllowed=!!pref&&!pref\.error&&pref\.data\?\.create_mode!=="review"/);
 assert.match(server,/const directHistorySafe=!routedSofia&&!providerWebSeen&&directToolHistorySafe\(usedTools\)/);
 assert.match(server,/surface==="chat_browser"&&!voiceDelegation&&!currentWorkThread&&!background&&/);
 // The literal-quote rules for title, day and hour are gone.
 assert.doesNotMatch(server,/exactOwnerTitle|exactFieldExcerpt|direct_event_time_excerpt/);
 assert.doesNotMatch(tools,/direct_event_time_excerpt|direct_event_duration_excerpt/);
 assert.match(server,/direct_calendar_authority:"owner_request_v2"/);
 assert.match(server,/direct_source_turn_id:verifiedContinuation\.source_turn_id/);
 assert.match(server,/direct_owner_source_tainted:/);
 assert.match(server,/direct_authorization_turn_id:clientMessageId/);
 assert.match(server,/direct_authorization:directAuthorization/);
 assert.match(server,/authorizedDirectBatch\(toolProposals,directAuthorizedIds,usedTools\)/);
 // An overlap is told to her, not turned into a failure.
 assert.match(server,/minds_direct_event_overlap_v01/);
 assert.match(server,/overlaps:directOverlaps/);
 assert.match(tools,/set direct_user_excerpt to his words: the app saves it at once and shows Undo/);
});
test("direct tool lane retains reviewed behavior when permission is off",()=>{
 // 11.11.2026: the app does not pick a path from the preference or the wording; the server decides.
 assert.doesNotMatch(client,/create_mode|askFastStream/);
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
 assert.match(app,/const undoItems=committed\.map/); assert.match(app,/action_receipts:undoItems/);
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
test("v03 in the database: the owner's request, an admitted decision and a receipt; no literal title or hour",()=>{
 for(const regexp of [
  /CREATE OR REPLACE FUNCTION public\.minds_commit_direct_calendar_create_v01\(/,
  /IF v_pref IS NOT DISTINCT FROM 'review' THEN RAISE EXCEPTION 'direct_creation_not_enabled'/,
  /NOT IN \('explicit_owner_v1','owner_request_v2'\)/,
  /direct_owner_source_tainted/,/v_decision\.status<>'pending'/,/pg_advisory_xact_lock/,
  /m\.provenance_class='owner' AND m\.exposure_scope_version=1/,
  /IF length\(v_evidence\)<2 OR length\(v_evidence\)>900/,
  /recurrence_requires_review/,/event_duration_or_all_day_requires_review/,
  /minds_commit_reviewed_task_create_v01/,/INSERT INTO public\.isabella_events/,
  /INSERT INTO public\.minds_calendar_action_receipts/,
  /CREATE OR REPLACE FUNCTION public\.minds_undo_direct_calendar_create_v01\(/,
  /interval '10 minutes'/,
  /CREATE OR REPLACE FUNCTION public\.minds_direct_event_overlap_v01\(/,
  /LANGUAGE plpgsql STABLE SECURITY INVOKER/,
  /GRANT EXECUTE ON FUNCTION public\.minds_direct_event_overlap_v01\(date,time,integer,text\) TO authenticated/
 ])assert.match(v03,regexp);
 for(const gone of [/direct_title_not_in_owner_turn/,/event_time_or_duration_not_explicit/,/event_overlap_requires_review/,/direct_event_time_excerpt/])
  assert.doesNotMatch(v03,gone);
 // Nothing is dropped by the migration.
 assert.doesNotMatch(v03,/\bDROP\b|\bTRUNCATE\b/i);
});
test("permission panel can restore review mode with an authenticated owner update",()=>{
 assert.match(app,/const directCalendar=calendarPref\?\.create_mode!=='review'/);
 assert.match(app,/const desired=directCalendar\?'review':'direct'/);
 assert.match(app,/upsert\(\{user_id:session\.user\.id,create_mode:desired/);
});
