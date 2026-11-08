// 08.11.2026: «¡Gracias!» routed to Work (Bernried) cost ~370k characters of context, 274k of them the
// preloaded project; «mueve esta tarea» did it four rounds in a row. Light turns no longer preload the
// project and speak from the lean context. Standard and deep Work turns are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lightWorkTurn,deferredLightWorkContext} from '../supabase/functions/_shared/work-model-prefetch.mjs';
import {lightWorkConversationContext,contextFootprintSignal} from '../supabase/functions/_shared/light-conversation-context.mjs';
const chat=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');

test('Only light Work turns skip the preload',()=>{
  const r=(o={})=>({work:true,project:'Proyecto A',complexity:'light',...o});
  assert.equal(lightWorkTurn({route:r()}),true);
  assert.equal(lightWorkTurn({route:r({complexity:'standard'})}),false);
  assert.equal(lightWorkTurn({route:r({complexity:'deep'})}),false);
  assert.equal(lightWorkTurn({route:r({work:false})}),false);
  assert.equal(lightWorkTurn({route:r(),attachments:1}),false,'a file to read is not light');
  assert.equal(lightWorkTurn({route:r(),materialDeliverable:true}),false);
  assert.equal(lightWorkTurn({route:r(),background:true}),false);
  const note=deferredLightWorkContext('Proyecto A');
  assert.equal(note.status,'not_preloaded');assert.equal(note.recover_with,'search_work');assert.ok(JSON.stringify(note).length<300);
});

test('A light Work turn keeps the agenda, the route and the Thread, and drops the heavy sections',()=>{
  const big='x'.repeat(5000);
  const full={
    current_date:'2026-11-08',tomorrow_tasks:[{id:'t',title:'Tarea',responsable:['Persona']}],undated_tasks:[],upcoming:[],overdue_tasks:[],
    route:{work:true,project:'Proyecto A',complexity:'light'},current_work_thread:{id:'th',title:'Fassade'},
    routed_work_context:deferredLightWorkContext('Proyecto A'),exposure_scope:{version:1,kind:'project'},
    memoria_de_isabella:{paginas:[{tipo:'gari'},{tipo:'persona'}],hilos:[{id:'h'}],seguimientos_programados:[{id:'s'}]},
    recent_activity:Array(24).fill({after_state:{notes:big}}),proposal_feedback:Array(16).fill({proposal:{notes:big}}),
    personal_model_claims:Array(21).fill({claim:big}),commitment_workspaces:[{body:big},{body:big}],active_mission_runs:[{log:big}]
  };
  const ctx=lightWorkConversationContext(full);
  for(const k of ['tomorrow_tasks','route','current_work_thread','routed_work_context','exposure_scope'])assert.ok(k in ctx,k);
  for(const k of ['recent_activity','proposal_feedback','personal_model_claims','commitment_workspaces','active_mission_runs'])assert.equal(k in ctx,false,k);
  assert.deepEqual(ctx.memoria_de_isabella.paginas.map(p=>p.tipo),['gari']);
  assert.deepEqual([ctx.memoria_de_isabella.hilos.length,ctx.memoria_de_isabella.seguimientos_programados.length],[0,0]);
  assert.ok(JSON.stringify(ctx).length<2000);
  assert.deepEqual(contextFootprintSignal('work_light',{context_chars:370000}).exceeding_fields,['context_chars'],'an oversized light Work turn shows up');
});

test('Wiring: no project preload, lean context, nothing read means nothing tainted',()=>{
  assert.match(chat,/const lightWork=lightWorkTurn\(\{route,background,fastAgenda,attachments:attachments\.length,materialDeliverable:route\.material_deliverable===true\}\);/);
  assert.match(chat,/route\.project\?lightWork\?Promise\.resolve\(deferredLightWorkContext\(route\.project\)\):searchWork\(req,/);
  assert.match(chat,/const lightWorkSurface=workCoreEligible&&lightWork;/);
  assert.match(chat,/let sourceTainted=\(!!routedWork&&routedWork\.status!=="not_preloaded"\)\|\|!!routedSofia;/);
  // search_work, when she calls it, still taints the turn and still works.
  assert.match(chat,/\["search_generated_artifacts","search_work","search_work_threads","read_work_file"/);
});
