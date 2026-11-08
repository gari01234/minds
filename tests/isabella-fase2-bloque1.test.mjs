import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ISABELLA_CORE,isabellaCoreInstructions,isabellaRoutineInstructions,ISABELLA_CORE_VERSION} from '../supabase/functions/_shared/isabella-core.mjs';
import {CORE_DETAILS,detailKeys} from '../supabase/functions/_shared/isabella-core-details.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
import {phaseTimingView} from '../supabase/functions/_shared/window-tools.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const routine=read('supabase/functions/isabella-routine-runner/index.ts');
const tools=read('supabase/functions/_shared/window-tools.mjs');
const fullLegacy=chat.slice(chat.indexOf('  const system = \`Eres Isabella'),chat.indexOf('\`;\n  const consolidated=await consolidatedPending;'));

test('routine uses Isabella core with a proactive relationship but no writes',()=>{
  const prompt=isabellaRoutineInstructions({relationship:'CONTRATO RELACIONAL DE PRUEBA'});
  assert.ok(prompt.includes(ISABELLA_CORE));
  for(const line of ['CONTRATO RELACIONAL DE PRUEBA','No crees ni modifiques tareas, eventos ni rutinas',
    'Usa web_search solo si','No menciones cron','hechos comprobados','Una propuesta concreta'])assert.ok(prompt.includes(line),line);
  assert.match(routine,/isabellaRoutineInstructions\(\{relationship:relationshipPolicy\("proactive"\)\}\)/);
  assert.match(routine,/consolidatedMemoryView\(pages\.data\|\|\[\],threads\.data\|\|\[\],Date\.now\(\)\)/);
  assert.match(routine,/workRadar\(sb,\{userId:routine\.user_id,tz\}\)/);
  for(const t of ['isabella_entities','isabella_return_queue'])assert.match(routine,new RegExp('sb.from\\("'+t+'"\\)'));
  assert.match(routine,/eq\("user_id",routine\.user_id\)/);
  assert.match(routine,/MEMORIA CONSOLIDADA DE ISABELLA/);
  assert.match(routine,/RADAR WORK/);
  assert.match(routine,/localEventView\(e,tz\)/);
});
test('Work detail matches legacy source verbatim in all five original blocks',()=>{
  const anchors=['SEGMENTOS DOCUMENTALES DE WORK:','PROJECT THREAD MODE:',
    'Tienes search_work y read_work_file','Work distingue fuente de conocimiento','Tienes consult_sofia'];
  const blocks=CORE_DETAILS.work.split('\n\n');
  assert.equal(blocks.length,5);
  for(let i=0;i<5;i++){
    assert.ok(blocks[i].startsWith(anchors[i]),anchors[i]);
    assert.ok(fullLegacy.includes(blocks[i]),'missing exact Work legacy paragraph '+anchors[i]);
  }
  assert.ok(detailKeys({route:{work:true}}).includes('work'));
  assert.ok(!detailKeys({route:{work:false}}).includes('work'));
  assert.ok(!detailKeys({route:{work:true},light:true}).includes('work'));
});
test('Work keeps full context, core route, core version and exact legacy rollback',()=>{
  assert.match(chat,/const workCoreEligible=!background&&!fastAgenda&&/);
  assert.match(chat,/Deno\.env\.get\("ISABELLA_WORK_CORE"\)!=="off"/);
  assert.match(chat,/workCoreSurface\? "work_core"|workCoreSurface\?"work_core"/);
  assert.match(chat,/contextTier,footprint/);
  assert.match(chat,/core_version=workCoreSurface\|\|coreSurface\|\|leanSurface/);
  assert.match(chat,/isabellaCoreInstructions\(\{relationship:relationshipPolicy\("conversation"\),tools/);
  assert.match(chat,/\(leanSurface\|\|coreSurface\|\|workCoreSurface\)/);
  assert.match(chat,/const modelContext=leanSurface\?leanConversationContext\(resolvedContext\):coreSurface\?coreConversationContext\(resolvedContext\):resolvedContext/);
  assert.match(chat,/consolidatedMemory\(req,\{coreOnly:true\}\)/);
  assert.match(chat,/\.in\("entity_type",\["gari","relationship","isabella"\]\)/);
  assert.match(chat,/system\+\(scheduleAssessment\?/);
});
test('phase_ms is numerical only and includes router/context/rounds/total',()=>{
  assert.match(chat,/const phaseMs:\{route:number;context:number;rounds:number\[\]\}/);
  assert.match(chat,/phaseMs\.route=Math\.max/);
  assert.match(chat,/phaseMs\.context=Math\.max/);
  assert.match(chat,/phaseMs\.rounds\.push\(Math\.max/);
  assert.match(chat,/finishAgentRun\(req,run,"success",\{phase_ms:phaseSnapshot\(\)/);
  assert.match(tools,/'phase_ms'/);
  assert.match(tools,/phaseTimingView\(m\[k\]\)/);
  assert.deepEqual(phaseTimingView({route:23.5,context:5,rounds:[1.1,9],total:38,secret:'private'}),
    {route:24,context:5,rounds:[1,9],total:38});
  assert.deepEqual(phaseTimingView({route:'secret',context:-1,rounds:['text',Infinity],total:{text:'secret'}}),
    {route:null,context:null,rounds:[],total:null});
});
test('budgeted Work and routine fixtures use promptComponentSizes; no runtime content logged',()=>{
  const context={today_tasks:[],tomorrow_tasks:[],radar_work:null,memoria_de_isabella:{paginas:[],hilos:[]}};
  const input=[{role:'user',content:[{type:'input_text',text:'Revisa el proyecto de prueba.'}]}];
  const prior=promptComponentSizes({instructions:fullLegacy,context,input,tools:[]});
  const updated=promptComponentSizes({instructions:isabellaCoreInstructions({
    relationship:'CONTRATO RELACIONAL DE PRUEBA',route:{work:true,complexity:'standard'},context,tools:[]
  }),context,input,tools:[]});
  const oldRoutine=promptComponentSizes({instructions:'Eres Isabella, asistente personal ejecutando una rutina.',context,input,tools:[]});
  const newRoutine=promptComponentSizes({instructions:isabellaRoutineInstructions({relationship:'CONTRATO RELACIONAL DE PRUEBA'}),context,input,tools:[]});
  assert.ok(updated.instructions_chars<32000,'Work should fit in 32k for the fixed no-tool fixture');
  assert.ok(updated.instructions_chars<prior.instructions_chars,'Work instructions must shrink');
  assert.deepEqual(Object.keys(prior),Object.keys(updated));
  assert.equal(updated.context_chars,prior.context_chars);
  assert.equal(updated.input_chars,prior.input_chars);
  assert.equal(updated.tools_chars,prior.tools_chars);
  // Fixture counts only; no user/model content is printed by the test.
  console.log('prompt_component_sizes_fixture_work',JSON.stringify({before:prior,after:updated,core_version:ISABELLA_CORE_VERSION}));
  console.log('prompt_component_sizes_fixture_routine',JSON.stringify({before:oldRoutine,after:newRoutine}));
});
