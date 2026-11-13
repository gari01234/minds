import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ISABELLA_CORE,ISABELLA_CORE_VERSION,isabellaCoreInstructions,
  isabellaRoutineInstructions,workCoreConversationContext}
  from '../supabase/functions/_shared/isabella-core.mjs';
import {CORE_DETAILS} from '../supabase/functions/_shared/isabella-core-details.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
import {createWindowTools} from '../supabase/functions/_shared/window-tools.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const runner=read('supabase/functions/isabella-routine-runner/index.ts');
const toolsSource=read('supabase/functions/_shared/window-tools.mjs');
const original=chat.slice(chat.indexOf('  const system = `Eres Isabella'),chat.indexOf('`;\n  const consolidated=await consolidatedPending;'));
const mockInstruction='CONTRATO FICTICIO';

test('routine uses the same conversational core, proactively without writes or system vocabulary',()=>{
  const inst=isabellaRoutineInstructions({relationship:mockInstruction});
  assert.ok(inst.startsWith(ISABELLA_CORE));
  assert.ok(inst.includes(mockInstruction));
  for(const fragment of ['RUTINA PROACTIVA','No crees ni modifiques tareas','web_search',
    'hechos comprobados','no impongas un informe fijo'])
    assert.ok(inst.includes(fragment),fragment);
  assert.match(runner,/isabellaRoutineInstructions\(\{relationship:relationshipPolicy\("proactive"\)\}\)/);
  assert.match(runner,/consolidatedMemoryView\(pagesQ\.data\|\|\[\],threadsQ\.data\|\|\[\],Date\.now\(\)\)/);
  assert.match(runner,/workRadar\(sb,\{userId:routine\.user_id,tz\}\)/);
  assert.match(runner,/memoria_de_isabella/);
  assert.match(runner,/radar_work/);
  assert.match(runner,/sb\.from\("isabella_entities"\)[\s\S]*?\.eq\("user_id",routine\.user_id\)/);
  assert.match(runner,/sb\.from\("isabella_return_queue"\)[\s\S]*?\.eq\("user_id",routine\.user_id\)/);
  assert.match(runner,/localEventView\(e,tz\)/);
});
test('Work core restores exact legacy documentary paragraphs while preserving rollback',()=>{
  for(const text of CORE_DETAILS.work.split('\n').filter(l=>l.length>60))
    assert.ok(original.includes(text),'A Work legacy sentence was changed: '+text.slice(0,35));
  const s=isabellaCoreInstructions({relationship:mockInstruction,tools:[],route:{work:true}})+
    '\n\nDETALLE WORK PARA ESTE TURNO\n'+CORE_DETAILS.work;
  assert.ok(s.includes(ISABELLA_CORE));
  assert.match(s,/SEGMENTOS DOCUMENTALES DE WORK:/);
  assert.match(s,/PROJECT THREAD MODE:/);
  assert.match(s,/consult_sofia/);
  assert.match(chat,/Deno\.env\.get\("ISABELLA_WORK_CORE"\)!=="off"/);
  assert.match(chat,/contextTier=[^;]*"work_core"/);
  assert.match(chat,/workCoreEligible&&detailsMode==="legacy"\?"\\n\\nDETALLE WORK PARA ESTE TURNO\\n"\+CORE_DETAILS\.work:""/);
  assert.match(chat,/workCoreEligible\?workCoreConversationContext\(resolvedContext\):resolvedContext/);
  assert.match(chat,/\(footprint as any\)\.core_version=coreSurface\|\|leanSurface\|\|workCoreEligible\?ISABELLA_CORE_VERSION:null/);
  const sizes=promptComponentSizes({instructions:s,context:{},input:[],tools:[]});
  assert.ok(sizes.instructions_chars<32000,'Work instructions exceed target');
  assert.ok(sizes.instructions_chars<original.length,'Work core is not cheaper than legacy template');
  assert.equal(ISABELLA_CORE_VERSION,'isabella-core-v6');
});
test('Work retains all source context but exposes only three central autobiographical pages',()=>{
  const fixture={routed_work_context:{sources:[{id:'fixture',status:'proposed'}]},
    memory_checkpoint:{source:'mock'},
    memoria_de_isabella:{paginas:[
      {tipo:'gari',nombre:'A',resumen:'dato'},
      {tipo:'persona',nombre:'B',resumen:'ajeno'},
      {tipo:'relacion',nombre:'C',resumen:'vínculo'},
      {tipo:'isabella',nombre:'D',resumen:'asistente'},
      {tipo:'tema',nombre:'E',resumen:'excluido'}
    ],hilos:[{id:'external'}]}};
  const result=workCoreConversationContext(fixture);
  assert.equal(result.routed_work_context,fixture.routed_work_context);
  assert.equal(result.memory_checkpoint,fixture.memory_checkpoint);
  assert.deepEqual(result.memoria_de_isabella.paginas.map(x=>x.tipo),['gari','relacion','isabella']);
  assert.deepEqual(result.memoria_de_isabella.hilos,[]);
  assert.equal(fixture.memoria_de_isabella.paginas.length,5);
});
test('Per-phase diagnostics are bounded, numeric only, and no text leaks through metadata',async()=>{
  assert.match(chat,/phaseRouteMs=/);
  assert.match(chat,/phaseContextMs=/);
  assert.match(chat,/phaseRoundsMs\.push/);
  assert.match(chat,/finishAgentRun\(req,run,"success",\{phase_ms,core_version:/);
  assert.match(toolsSource,/'phase_ms'/);
  const q={
    select(){return this},eq(){return this},in(){return this},
    order(){return this},limit(){return Promise.resolve({data:[{
      id:'run_1',feature:'isabella_chat',status:'success',
      route:{complexity:'standard'},started_at:'2026-11-08T06:00:00Z',
      metadata:{phase_ms:{route:23.4,context:140.6,rounds:[201.5,90],total:550,
        contents:'should never be returned'},core_version:'isabella-core-v4',
        user_message:'private example must not appear'},
      latency_ms:550
    }],error:null})}
  };
  const sb={from:()=>q};
  const tools=createWindowTools({sb,userId:'owner',now:()=>new Date('2026-11-08T06:10:00Z')});
  const found=await tools.turnDiagnostics({limit:1});
  assert.equal(found.runs.length,1);
  assert.deepEqual(found.runs[0].phase_ms,{route:23,context:141,rounds:[202,90],total:550});
  assert.equal(found.runs[0].core_version,'isabella-core-v4');
  assert.doesNotMatch(JSON.stringify(found),/should never be returned|private example/);
});
test('Prompt-component comparison measures all four dimensions with no real user content',()=>{
  const fixture={context:{timezone:'Europe/Berlin',today_tasks:[{title:'Tarea de prueba',due:'2026-11-09'}]},
    input:[{role:'user',content:[{type:'input_text',text:'Consulta inventada'}]}],
    tools:[{type:'function',name:'search_work',description:'Fuente de prueba'}]};
  const old=promptComponentSizes({instructions:original,...fixture});
  const next=promptComponentSizes({instructions:isabellaCoreInstructions({relationship:mockInstruction})+
    '\n\nDETALLE WORK PARA ESTE TURNO\n'+CORE_DETAILS.work,...fixture});
  assert.ok(next.instructions_chars<old.instructions_chars);
  assert.equal(next.context_chars,old.context_chars);
  assert.equal(next.input_chars,old.input_chars);
  assert.equal(next.tools_chars,old.tools_chars);
});
