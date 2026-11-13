// The bench is evidence, so it must itself be checked: invented people only, no production call,
// no database, and both arms assembled from the same modules the engine uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SCENARIOS,baseContext,defaultToolResult,NOW} from './bench/isabella-scenarios.mjs';
import {interactiveTools} from '../supabase/functions/_shared/isabella-tools.mjs';
import {FOLLOWUP_TOOLS} from '../supabase/functions/_shared/isabella-followups.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('scripts/bench-isabella.mjs');
const scenarios=read('tests/bench/isabella-scenarios.mjs');
const workflow=read('.github/workflows/isabella-bench.yml');

test('the bench never touches production: no database, no runtime key, one provider endpoint',()=>{
  // It imports the engine's own modules (that is the point) but never opens a connection to it.
  assert.doesNotMatch(script,/createClient|service_role|SUPABASE_|supabaseClient|\.rpc\(|\.from\(/);
  assert.doesNotMatch(script.replace(/from "\.\.\/supabase\/functions\/[^"]+"/g,''),/supabase/i);
  assert.equal((script.match(/https:\/\/api\.openai\.com\/v1\/responses/g)||[]).length,1);
  assert.match(script,/store: false/);
  assert.match(script,/OPENAI_API_KEY not available; the bench never retrieves a runtime key/);
  // The workflow runs by hand only, with the dedicated key.
  assert.match(workflow,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\n\s{2}(push|pull_request):/);
  assert.match(workflow,/secrets\.MINDS_PARITY_OPENAI_API_KEY/);
  assert.doesNotMatch(workflow,/OPENAI_API_KEY *: *\$\{\{ *secrets\.OPENAI/);
});

test('every moment is invented: no real person, client or project of Gari appears',()=>{
  // The real projects and the people he works with must never enter a file that is sent to a provider.
  for(const real of ['Bernried','Schwarz','Höhenweg','Titus','Bernhard','Augsburg','Montoro','Gerritz'])
    assert.equal(scenarios.includes(real),false,real);
  assert.match(scenarios,/Everything here is invented/);
});

test('the scenarios are well formed and score only what she does',()=>{
  assert.ok(SCENARIOS.length>=28,String(SCENARIOS.length));
  assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,SCENARIOS.length,'ids are unique');
  const empty={calls:[],text:'',deep:false,preloaded:false};
  for(const s of SCENARIOS){
    assert.ok(s.message&&s.about,s.id);
    const checks=s.expect(empty);
    assert.ok(Array.isArray(checks)&&checks.length>=1,s.id);
    for(const [name,ok] of checks){assert.equal(typeof name,'string',s.id);assert.equal(typeof ok,'boolean',s.id+':'+name);}
    // A turn that does nothing and says nothing never passes a moment.
    assert.equal(checks.every(([,ok])=>ok),false,s.id+' passes on an empty turn');
  }
});

test('the tools the moments expect exist, and the synthetic answers look like the real ones',()=>{
  const names=new Set(interactiveTools({clarification:true,followUps:FOLLOWUP_TOOLS,deeper:true}).map(t=>t.name));
  for(const expected of ['create_task','create_event','update_event','search_calendar','search_memory','search_work',
    'find_work_occurrences','browse_work_sources','propose_project_claim','propose_commitment','propose_expectation',
    'create_standing_intent','check_watch_capability','create_chat_reminder','search_routines','update_routine',
    'execute_artifact_task','load_skill','update_assistant_behavior','remember_information','think_deeper'])
    assert.ok(names.has(expected),expected);
  // A creation is authorized only when the excerpt is really his words, as the server decides.
  const scenario={message:'Apunta reunión con Mara mañana a las 10',history:[]};
  assert.equal(defaultToolResult('create_event',{direct_user_excerpt:'Apunta reunión con Mara'},scenario).status,'direct_creation_authorized');
  assert.equal(defaultToolResult('create_event',{},scenario).status,'pending_user_confirmation');
  assert.equal(defaultToolResult('create_event',{direct_user_excerpt:'Inventado'},scenario).status,'pending_user_confirmation');
  assert.equal(defaultToolResult('update_event',{},scenario).status,'pending_user_confirmation');
  const ctx=baseContext();
  assert.equal(ctx.current_local_datetime,NOW.date+' '+NOW.time);
  assert.ok(Array.isArray(ctx.today_tasks)&&ctx.radar_work.proyectos.length>=1);
});

test('both arms assemble, and the published one sends the same instructions every turn',()=>{
  const out=JSON.parse(execFileSync(process.execPath,['scripts/bench-isabella.mjs','--dry-run'],
    {cwd:new URL('../',import.meta.url),encoding:'utf8',maxBuffer:64*1024*1024}));
  assert.equal(out.mode,'assembly_check');
  assert.equal(out.problems,undefined);
  const own=out.results.assembly.map(r=>r.arms.find(a=>a.arm==='own'));
  const legacy=out.results.assembly.map(r=>r.arms.find(a=>a.arm==='legacy'));
  // The published arm: one text, the same on every turn except a Work thread and a skill catalogue.
  assert.ok(new Set(own.map(a=>a.instructions_chars)).size<=4,'own instructions vary more than expected');
  assert.ok(Math.max(...own.map(a=>a.instructions_chars))<24500);
  // The old path changed its instructions from the router's verdict, by up to twice as much.
  assert.ok(Math.max(...legacy.map(a=>a.instructions_chars))>45000);
  assert.ok(Math.max(...legacy.map(a=>a.context_chars))>Math.max(...own.map(a=>a.context_chars)));
  for(const a of [...own,...legacy])assert.equal(a.input_has_message,true);
});
