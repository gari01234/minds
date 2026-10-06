import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migrations=()=>readdirSync(new URL('supabase/migrations/',root)).filter(x=>x.endsWith('.sql')).map(x=>read('supabase/migrations/'+x)).join('\n');

const chat=read('supabase/functions/isabella-chat/index.ts');
const runtime=read('supabase/functions/_shared/capability-runtime.ts');
const registry=read('supabase/functions/_shared/capability-registry.ts');
const capability=read('supabase/functions/isabella-capability-runtime/index.ts');
const runner=read('supabase/functions/isabella-capability-runner/index.ts');
const ambient=read('apps/isabella/ambient.js');

test('Build 79 separates MINDS governance from a general capability plane',()=>{
  assert.ok(registry.includes('CAPABILITY_REGISTRY_VERSION="minds-capabilities-v0.1"'));
  assert.ok(registry.includes('general_execution'));
  assert.ok(registry.includes('code_interpreter'));
  assert.ok(registry.includes('durable_mission'));
  assert.ok(registry.includes('authority:"material_output_only"'));
  assert.ok(chat.includes('capabilityPromptSummary()'));
  assert.ok(chat.includes('CAPABILITY_REGISTRY_VERSION'));
});

test('Build 79 has completion bias instead of file-extension keyword dependency',()=>{
  assert.ok(chat.includes('COMPLETION / EXECUTION BIAS:'));
  assert.ok(chat.includes('Gari no necesita decir "PDF", "Excel", "PowerPoint" ni "usa Python"'));
  assert.ok(chat.includes('name:"execute_artifact_task"'));
  assert.ok(chat.includes('General material execution environment'));
  assert.ok(chat.includes('likelyMaterialDeliverable(message)'));
  assert.ok(chat.includes('lista para imprimir y firmar'));
});

test('Build 79 general execution uses provider-managed background Code Interpreter',()=>{
  assert.ok(runtime.includes('background:true'));
  assert.ok(runtime.includes('type:"code_interpreter"'));
  assert.ok(runtime.includes('memory_limit:"4g"'));
  assert.ok(!runtime.includes('network_policy'));
  assert.ok(runtime.includes('retrieveGeneralExecution'));
  assert.ok(runtime.includes('cancelGeneralExecution'));
  assert.ok(runtime.includes('container_file_citation'));
  assert.ok(runtime.includes('/files/'));
  assert.ok(runtime.includes('/content'));
});

test('Build 79 supports office and general material deliverables without one tool per format',()=>{
  for(const kind of ['docx','pdf','xlsx','pptx','csv','zip','html','txt','json']){
    assert.ok(runtime.includes(kind),kind);
  }
  assert.ok(runtime.includes('Generate real structured files'));
  assert.ok(runtime.includes('presentation, create PPTX'));
  assert.ok(runtime.includes('prefer XLSX or CSV'));
});

test('Build 79 keeps generated deliverables non-authoritative',()=>{
  assert.ok(runtime.includes('provenance_class:"generated_deliverable"'));
  assert.ok(runtime.includes('accepted_fact:false'));
  assert.ok(runtime.includes('promotion_required_for_project_truth:true'));
  assert.ok(chat.includes('no se promueven silenciosamente a Conocimiento'));
});

test('Build 79 durable capability runner can finish after the initiating chat closes',()=>{
  assert.ok(capability.includes('minds_capability_runs'));
  assert.ok(capability.includes('startGeneralExecution'));
  assert.ok(runner.includes('.in("status",["queued","in_progress"])'));
  assert.ok(runner.includes('reconcileCapabilityRun'));
  assert.ok(runner.includes('const missionParent=String(run?.metadata?.delivery||"")==="mission_parent"'));
  assert.ok(runner.includes('{deliver:!missionParent}'));
  assert.ok(runtime.includes('conversation_messages'));
  assert.ok(runtime.includes('clientKey="capability:"+run.id'));
});

test('Build 79 capability ledger is RLS protected and broadens artifact kinds',()=>{
  const sql=migrations();
  assert.ok(sql.includes('create table public.minds_capability_runs'));
  assert.ok(sql.includes('alter table public.minds_capability_runs enable row level security'));
  assert.ok(sql.includes('capability_runs_select_own'));
  assert.ok(sql.includes('grant select on table public.minds_capability_runs to authenticated'));
  assert.ok(sql.includes("'xlsx'::text"));
  assert.ok(sql.includes("'pptx'::text"));
  assert.ok(sql.includes("'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'"));
});

test('Build 79 durable runner is declared and scheduled independently of the browser',()=>{
  const sql=migrations();
  const config=read('supabase/config.toml');
  assert.ok(config.includes('[functions.isabella-capability-runtime]'));
  assert.ok(config.includes('[functions.isabella-capability-runner]'));
  assert.ok(config.includes('verify_jwt = false'));
  assert.ok(sql.includes("'capability_runner'"));
  assert.ok(sql.includes("'minds-capability-runner'"));
  assert.ok(sql.includes("'* * * * *'"));
  assert.ok(sql.includes('/functions/v1/isabella-capability-runner'));
});

test('Build 79 ambient presence is state projection, not another brain',()=>{
  assert.ok(ambient.includes("status==='queued'"));
  assert.ok(ambient.includes("status==='in_progress'"));
  assert.ok(ambient.includes("status==='completed'"));
  assert.ok(ambient.includes("status==='failed'"));
  assert.ok(ambient.includes("from('minds_capability_runs')"));
  assert.ok(ambient.includes("functions.invoke('isabella-capability-runtime'"));
  assert.ok(!ambient.includes('OPENAI_API_KEY'));
});

test('Build 79 Threads render asynchronous deliverables in their own history',()=>{
  const work=read('apps/isabella/work.js');
  assert.ok(work.includes('work-thread-artifacts'));
  assert.ok(work.includes("storage.from('minds-artifacts').createSignedUrl"));
  assert.ok(work.includes('threadArtifactLabel'));
  assert.ok(work.includes("pptx:'POWERPOINT'"));
});

test('Build 79 PWA assets are aligned',()=>{
  const shell=read('apps/isabella/shell.js');
  const index=read('apps/isabella/index.html');
  const sw=read('apps/isabella/sw.js');
  assert.ok(shell.includes('Build 2026.10.06.82.1'));
  assert.ok(index.includes('app.css?v=57'));
  assert.ok(index.includes('shell.js?v=83'));
  assert.ok(index.includes('app.js?v=89'));
  assert.ok(index.includes('work.js?v=9'));
  assert.ok(index.includes('ambient.js?v=2'));
  assert.ok(index.includes('../shared/human-surface.js?v=2'));
  assert.ok(sw.includes("isabella-shell-v95"));
  assert.ok(sw.includes("'./ambient.js?v=2'"));
});

test('Build 79.1 hides execution plumbing and treats generated PNGs as previews',()=>{
  const app=read('apps/isabella/app.js');
  const work=read('apps/isabella/work.js');
  const ambient=read('apps/isabella/ambient.js');
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(app.includes('cleanGeneratedDeliverableText'));
  assert.ok(app.includes('artifactSurfaceGroups'));
  assert.ok(app.includes('generated-artifact-preview'));
  assert.ok(work.includes('cleanThreadDeliverableText'));
  assert.ok(work.includes('threadArtifactGroups'));
  assert.ok(work.includes('work-thread-previews'));
  assert.ok(ambient.includes('cleanCapabilitySummary'));
  assert.ok(ambient.includes('primaryArtifacts'));
  assert.ok(chat.includes('Nunca escribas rutas internas'));
  assert.ok(chat.includes('sandbox:/mnt/data/...'));
  assert.ok(chat.includes('trátala como preview'));
});

test('Build 79 browser clients remain valid JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(read('apps/isabella/ambient.js')));
  assert.doesNotThrow(()=>new Function(read('apps/isabella/work.js')));
  assert.doesNotThrow(()=>new Function(read('apps/isabella/app.js')));
});
