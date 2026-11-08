import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ISABELLA_CORE,ISABELLA_CORE_VERSION,isabellaRoutineInstructions,
  isabellaCoreInstructions,workCoreEnabled} from "../supabase/functions/_shared/isabella-core.mjs";
import {CORE_DETAILS,detailKeys} from "../supabase/functions/_shared/isabella-core-details.mjs";
import {promptComponentSizes} from "../supabase/functions/_shared/light-conversation-context.mjs";
const read=(file)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const chat=read("supabase/functions/isabella-chat/index.ts");
const routine=read("supabase/functions/isabella-routine-runner/index.ts");
const tools=read("supabase/functions/_shared/window-tools.mjs");
const oldStart=chat.indexOf("const system = \`Eres Isabella");
const oldEnd=chat.indexOf("\`;\n  const consolidated=await consolidatedPending;",oldStart);
const oldPrompt=chat.slice(oldStart,oldEnd);

test("Daily routine has canonical Isabella identity and cannot mutate tasks or invent facts",()=>{
  const instructions=isabellaRoutineInstructions({relationship:"RELACION DE PRUEBA"});
  for(const required of [ISABELLA_CORE,"RELACION DE PRUEBA","RUTINA PROACTIVA",
    "No crees ni modifiques tareas","Usa web_search únicamente","Comienza por lo que de verdad importa hoy"])
    assert.ok(instructions.includes(required),required);
  assert.match(routine,/isabellaRoutineInstructions\(\{relationship:relationshipPolicy\("proactive"\)\}\)/);
  assert.match(routine,/consolidatedMemoryView\(pages\.data\|\|\[\],threads\.data\|\|\[\],Date\.now\(\)\)/);
  assert.match(routine,/workRadar\(sb,\{userId:routine\.user_id,tz\}\)/);
  assert.match(routine,/\.eq\("user_id",routine\.user_id\)/);
  assert.match(routine,/memoria_de_isabella:memoriaDeIsabella,radar_work:radarWork/);
});

test("Work core retains original detailed Work rules byte for byte and switch off is reversible",()=>{
  assert.ok(oldStart>=0&&oldEnd>oldStart,"legacy system prompt remains for rollback");
  assert.ok(CORE_DETAILS.work.includes("SEGMENTOS DOCUMENTALES DE WORK"));
  assert.ok(CORE_DETAILS.work.includes("PROJECT THREAD MODE"));
  for(const line of CORE_DETAILS.work.split("\n").filter(x=>x.length>60))
    assert.ok(oldPrompt.includes(line),"Original guidance missing: "+line.slice(0,45));
  assert.equal(workCoreEnabled({work:true}),true);
  assert.equal(workCoreEnabled({workThread:true}),true);
  assert.equal(workCoreEnabled({work:true,flag:"off"}),false);
  assert.equal(workCoreEnabled({workThread:true,background:true}),false);
  assert.equal(workCoreEnabled({work:true,fastAgenda:true}),false);
  assert.ok(detailKeys({route:{work:true}}).includes("work"));
  assert.ok(detailKeys({context:{current_work_thread:{id:"test"}}}).includes("work"));
  assert.match(chat,/flag:Deno\.env\.get\("ISABELLA_WORK_CORE"\)/);
  assert.match(chat,/workCoreSurface\?"work_core":"full"/);
  assert.match(chat,/workCoreSurface\?await consolidatedMemory\(req,true\):null/);
  assert.match(chat,/\.in\("entity_type",\["gari","relationship","isabella"\]\)/);
  assert.match(chat,/modelContext=leanSurface\?leanConversationContext\(resolvedContext\):coreSurface\?coreConversationContext\(resolvedContext\):workCoreContext/);
  assert.match(chat,/const modelInstructions=reasoningContract/);
  assert.match(chat,/system\+\(scheduleAssessment\?/);
  assert.match(chat,/core_version:\(footprint as any\)\.core_version/);
});

test("Prompt component size measurements are bounded and do not discard Work context",()=>{
  const fixtures={
    context:{routed_work_context:{sources:[{status:"available",id:"fixture-a"}]},
      current_work_thread:{id:"fixture-thread"},memoria_de_isabella:{paginas:[],hilos:[]}},
    input:[{role:"user",content:[{type:"input_text",text:"¿Qué documentos siguen sin revisar?"}]}],
    tools:[{type:"function",name:"search_work"},{type:"function",name:"read_work_file"}]
  };
  const baseline=promptComponentSizes({...fixtures,instructions:oldPrompt});
  const after=promptComponentSizes({...fixtures,instructions:isabellaCoreInstructions({
    relationship:"RELACION DE PRUEBA",tools:fixtures.tools,
    route:{work:true,complexity:"standard"},context:fixtures.context
  })});
  assert.ok(baseline.instructions_chars>35000);
  assert.ok(after.instructions_chars<32000,"Work prompt should fit the expected 32k-char envelope");
  assert.ok(after.instructions_chars<baseline.instructions_chars);
  assert.equal(after.context_chars,baseline.context_chars);
  assert.equal(after.input_chars,baseline.input_chars);
  assert.equal(after.tools_chars,baseline.tools_chars);
  assert.match(routine,/promptFootprint=promptComponentSizes/);
  console.log("Prompt tamaños fixture Work:",JSON.stringify({before:baseline,after,core_version:ISABELLA_CORE_VERSION}));
});

test("Phase telemetry is timing-only and exposed by turn_diagnostics allowlist",()=>{
  for(const key of ["route","context","rounds","total"])
    assert.match(chat,new RegExp("phaseMs|phaseSnapshot"));
  assert.match(chat,/const phaseSnapshot=\(\)=>\(\{route:phaseMs\.route,context:phaseMs\.context,rounds:\[\.\.\.phaseMs\.rounds\],total:/);
  assert.match(chat,/phaseMs\.route=Math\.max\(0,Date\.now\(\)-routeStarted\)/);
  assert.match(chat,/phaseMs\.context=Math\.max\(0,Date\.now\(\)-contextStarted\)/);
  assert.match(chat,/phaseMs\.rounds\.push\(Math\.max\(0,Date\.now\(\)-roundStarted\)\)/);
  assert.match(chat,/phase_ms:phaseSnapshot\(\)/);
  assert.match(tools,/'prompt_components','phase_ms','semantic_temporal_rejected'/);
  assert.match(tools,/for\(const k of DIAG_FIELDS\)/);
});
