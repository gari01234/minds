import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 leanConversationEligible,leanConversationContext,LIGHT_CONVERSATION_INSTRUCTIONS,
 promptComponentSizes
} from "../supabase/functions/_shared/light-conversation-context.mjs";
const source=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const base={complexity:"light",depth:"light",background:false,fastAgenda:false,work:false,
 sofia:false,workThread:false,attachments:0,scheduleAssessment:false,weather:false};
test("typed routing never uses sentence-specific regex to select lean context",()=>{
 for(const text of ["Gracias","¿Puedo hacer aubergine en rodajas?",
   "¿Cuáles son mis tareas para mañana?","Move my existing tasks to Thursday",
   "Kannst du es für mich ändern?"]){
   assert.equal(leanConversationEligible(base),true,text);
 }
 for(const props of [{work:true},{sofia:true},{workThread:true},{complexity:"deep"},
  {depth:"standard"},{attachments:1},{scheduleAssessment:true},{weather:true},
  {fastAgenda:true},{background:true}])
  assert.equal(leanConversationEligible({...base,...props}),false,JSON.stringify(props));
 assert.match(source,/leanConversationEligible\(\{/);
 assert.match(source,/leanSurface\?leanConversationContext\(resolvedContext\):resolvedContext/);
 assert.match(source,/tools\}\);/);
});
test("complete owned calendar snapshots, scoped referents, personal rules remain intact",()=>{
 const fixtures={
  current_date:"2026-10-15",timezone:"Europe/Berlin",exposure_scope:{key:"global"},
  today_tasks:Array.from({length:40},(_,i)=>({id:i,title:"Task "+i})),
  tomorrow_tasks:Array.from({length:42},(_,i)=>({id:i,title:"Tomorrow "+i})),
  tomorrow_events:[{id:"e1"}],upcoming:Array.from({length:27},(_,i)=>({id:i})),
  recalled_memory:[{source:"owner",content:"Ninja device"}],
  preferences:{assistant_behavior_rules:[{id:"accepted",rule:"No bullets"}]},
  reply_context:{thread:"recent"},standing_intent_matches:[{id:"s"}],
  active_commitments:[{id:"c"}],taxonomy:{private_title:"not needed"},
  routed_work_context:{claims:["large and out of scope"]},
  memory_checkpoint:{summary:"large, not needed for light scope"},
  all_tools:[{anything:true}]
 };
 const lean=leanConversationContext(fixtures);
 assert.equal(lean.today_tasks.length,40);
 assert.equal(lean.tomorrow_tasks.length,42);
 assert.equal(lean.upcoming.length,27);
 assert.deepEqual(lean.recalled_memory,fixtures.recalled_memory);
 assert.deepEqual(lean.preferences,fixtures.preferences);
 assert.deepEqual(lean.exposure_scope,fixtures.exposure_scope);
 assert.deepEqual(lean.reply_context,fixtures.reply_context);
 assert.ok(!("routed_work_context" in lean));
 assert.ok(!("memory_checkpoint" in lean));
 assert.ok(!("taxonomy" in lean));
});
test("light prompt preserves confidentiality, provenance and action truth",()=>{
 for(const phrase of ["search_memory","recibo verificado","memoria recuperada",
  "ámbito de exposición","temporal_grounding","Modificaciones y eliminaciones",
  "No conviertas una conversación cotidiana en una acción"])
  assert.ok(LIGHT_CONVERSATION_INSTRUCTIONS.includes(phrase),phrase);
 const fakeSystem="x".repeat(38255);
 assert.ok(LIGHT_CONVERSATION_INSTRUCTIONS.length<fakeSystem.length/8);
});
test("telemetry is numeric-only, with separate instruction/context/input/tool footprints",()=>{
 const out=promptComponentSizes({
   instructions:"safe",
   context:{secret_user_text:"private evidence"},
   input:[{role:"user",content:"some private text"}],
   tools:[{type:"function",name:"search_memory"}]
 });
 assert.deepEqual(Object.keys(out),[
   "instructions_chars","context_chars","input_chars","tools_chars","tools_count"
 ]);
 assert.equal(out.instructions_chars,4);
 assert.equal(out.tools_count,1);
 assert.ok(!JSON.stringify(out).includes("private evidence"));
 assert.match(source,/prompt_components:footprint/);
 assert.match(source,/context_tier:fastAgenda\?"calendar_fast":leanSurface\?"lean":"full"/);
});
test("governed tools and direct calendar receipts remain unchanged by the lean tier",()=>{
 assert.match(source,/const tools=\(background\?/);
 assert.match(source,/\.\.\.calendarTools/);
 assert.match(source,/recordShadowDecision\(req/);
 assert.match(source,/authorizedDirectBatch\(toolProposals/);
 assert.match(source,/request_clarification/);
 assert.match(source,/verifyCalendarSemanticProposal\(rawProposal/);
 assert.match(source,/turnOutcomeReceipt\(\{proposals:toolProposals\}\)/);
});
