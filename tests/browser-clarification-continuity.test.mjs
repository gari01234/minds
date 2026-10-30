import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {
  makeClarification,validStoredClarification,boundedContinuationEvidence,
  validContinuationToken,CLARIFICATION_WINDOW_MS
} from "../supabase/functions/_shared/browser-continuation.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=read("supabase/functions/isabella-chat/index.ts");
const app=read("apps/isabella/app.js");
const ai=read("apps/isabella/ai.js");
const sync=read("apps/isabella/sync.js");
const uuidA="12345678-1234-4234-8234-123456789abc";
const uuidB="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const uuidC="11111111-2222-4333-8444-555555555555";
const date="2026-10-13T14:09:32Z";
const now=Date.parse(date)+7000;
function scenario(){
 const pending=makeClarification({sourceTurnId:uuidA,receiptId:uuidB,
  question:"¿A qué proyecto deben pertenecer las dos tareas?",capability:"calendar",issuedAt:date});
 const ownerTurn={role:"user",client_key:uuidA,exposure_scope_version:1,
  provenance_class:"owner",content:"Agrega dos tareas de ELT para hoy"};
 const provided={source_turn_id:uuidA,receipt_id:uuidB,current_turn_id:uuidC};
 return {pending,ownerTurn,provided};
}
test("the exact user's two-task request survives a global -> Bernried reply",()=>{
 const {pending,ownerTurn,provided}=scenario();
 assert.ok(validContinuationToken(provided));
 assert.equal(validStoredClarification({stored:pending,ownerTurn,provided,now,latestOwnerTurnId:uuidA}),true);
 const evidence=boundedContinuationEvidence({sourceMessage:ownerTurn.content,
   question:pending.question,currentMessage:"a Bernried"});
 assert.match(evidence,/Agrega dos tareas de ELT para hoy/);
 assert.match(evidence,/a Bernried/);
 assert.match(evidence,/¿A qué proyecto deben pertenecer/);
 assert.ok(!evidence.includes("Besprechungsnotiz"));
});
test("source, token, user provenance, replay and recency are mandatory",()=>{
 const s=scenario();const fields={stored:s.pending,ownerTurn:s.ownerTurn,provided:s.provided,now};
 for(const input of [
  {...fields,provided:{...s.provided,receipt_id:uuidC}},
  {...fields,ownerTurn:{...s.ownerTurn,role:"assistant"}},
  {...fields,ownerTurn:{...s.ownerTurn,provenance_class:"agent"}},
  {...fields,ownerTurn:{...s.ownerTurn,exposure_scope_version:0}},
  {...fields,stored:{...s.pending,consumed_by:"someone-else"}},
  {...fields,latestOwnerTurnId:"another-message"},
  {...fields,now:Date.parse(date)+CLARIFICATION_WINDOW_MS+1}
 ]) assert.equal(validStoredClarification(input),false,JSON.stringify(input));
 assert.equal(validStoredClarification({...fields,latestOwnerTurnId:uuidA}),true);
});
test("browser continuation is server-validated BEFORE routing and only exact source is read",()=>{
 const lookup=server.indexOf("verifiedContinuation=await resolveBrowserContinuation(");
 const route=server.indexOf("const route=await routeRequest(",lookup);
 const ownerPersist=server.indexOf("await persistCanonicalBrowserOwnerTurn(",route);
 assert.ok(lookup>0&&route>lookup&&ownerPersist>route);
 assert.match(server,/source\.metadata\?\.pending_clarification/);
 assert.match(server,/\.eq\("user_id",user\.id\)\.eq\("client_key",requested\.source_turn_id\)/);
 assert.match(server,/if\(!validStoredClarification/);
 assert.match(server,/boundedContinuationEvidence/);
 assert.match(server,/const fastAgenda=false/);
 assert.match(server,/request_clarification/);
 assert.match(server,/turn_outcome:"needs_clarification"/);
 assert.match(server,/provider_history_policy:"bounded_scoped"/);
});
test("an unverified tool-free calendar turn cannot promise a phantom proposal",()=>{
 assert.match(server,/if\(calls\.some\(\(x:any\)=>x\.name==="request_clarification"\)\)/);
 assert.match(server,/if\(calls\.length!==1\|\|!browserTurnId\(clientMessageId\)/);
 assert.match(server,/recordBrowserClarification\(req,clientMessageId,question,capability\)/);
 assert.match(server,/if\(fastAgenda&&!toolProposals\.length\)/);
 assert.match(server,/No he registrado ninguna propuesta de calendario verificable/);
 assert.doesNotMatch(server,/provider_legacy_continuity/);
 assert.doesNotMatch(server,/boundedGlobalChat=false;/);
});
test("actual browser UI carries canonical receipt, never an arbitrary cross-scope history",()=>{
 assert.match(app,/pending_clarification:result\.pending_clarification/);
 assert.match(app,/const candidate=pending\?\.version===1/);
 assert.match(app,/continuation:candidate/);
 assert.match(ai,/continuation:options\.continuation\|\|null/);
 assert.match(ai,/if\(!options\.continuation&&!options\.workThread/);
 assert.doesNotMatch(ai.slice(ai.indexOf("async function ask(message,state"),ai.indexOf("async function brief(state")),/recent_local_conversation:.+slice\(-10000\)/);
});
test("client echo cannot overwrite a server owner turn's pending receipt",()=>{
 assert.match(sync,/const ownerRows=rows\.filter\(r=>r\.role==='user'\)/);
 assert.match(sync,/ignoreDuplicates:true/);
 assert.match(sync,/const assistantRows=rows\.filter\(r=>r\.role!=='user'\)/);
});
test("turn-integrity UI rejects missing or inconsistent clarification claims",()=>{
 const root={};
 runInNewContext(read("apps/isabella/turn-integrity.js"),{window:root,globalThis:root});
 const result={reply:"¿A qué proyecto?",outcome:{outcome:"needs_clarification",proposal_count:0,applied_count:0},
  pending_clarification:makeClarification({sourceTurnId:uuidA,receiptId:uuidB,
   question:"¿A qué proyecto?",capability:"calendar",issuedAt:date})};
 assert.equal(root.MINDS_TURN_INTEGRITY.validate(result).ok,true);
 assert.equal(root.MINDS_TURN_INTEGRITY.validate({...result,pending_clarification:null}).ok,false);
 assert.equal(root.MINDS_TURN_INTEGRITY.validate({...result,reply:"Listo, ya la guardé"}).ok,false);
});

test("pending clarification tool is unavailable in Presence and Work Thread authorities",()=>{
 assert.match(server,/const clarificationTools=surface==="chat_browser"&&!currentWorkThread/);
 assert.match(server,/fastAgenda\?\[\.\.\.clarificationTools/);
 assert.match(server,/\.\.\.clarificationTools,\n    \{type:"web_search"/);
 assert.doesNotMatch(server,/fastAgenda\?\[clarificationTool,/);
});
