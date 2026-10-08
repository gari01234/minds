import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const chat=read('supabase/functions/isabella-chat/index.ts');
const skillRegistry=read('supabase/functions/_shared/skill-registry.ts');
const runtime=read('supabase/functions/isabella-capability-runtime/index.ts');
const sharedRuntime=read('supabase/functions/_shared/capability-runtime.ts');
const ai=read('apps/isabella/ai.js');
const app=read('apps/isabella/app.js');
const skillsReadme=read('apps/isabella/skills/README.md');
const build=read('apps/isabella/BUILD-81.md');
const meetingSkill=read('apps/isabella/skills/preparar-reunion/SKILL.md');
const organizeDaySkill=read('apps/isabella/skills/organizar-dia/SKILL.md');
const skillMigration=read('supabase/migrations/20261005093000_skills_composition_v01.sql');
const proactiveDayMigration=read('supabase/migrations/20261008083000_build83_proactive_day_skill_v2.sql');

test('Build 81 formalizes Skill as procedure without authority',()=>{
  assert.ok(skillRegistry.includes('SKILL_RUNTIME_VERSION="minds-skills-v0.1"'));
  assert.ok(skillRegistry.includes('authority:"inherits_runtime_policy"'));
  assert.ok(skillRegistry.includes('grants:[]'));
  assert.ok(skillsReadme.includes('Skills teach. Tools act. MINDS governs.'));
  assert.ok(build.includes('A Skill is a versioned, inspectable procedure.'));
});

test('Build 81 resolves preferred tools through the real runtime policy',()=>{
  assert.ok(chat.includes('normalizeSkillRecord(x,"system",policyMode)'));
  assert.ok(chat.includes('normalizeSkillRecord(x,"personal",policyMode)'));
  assert.ok(chat.includes('web_search:"allow"'));
  assert.ok(chat.includes('search_work_threads:"allow"'));
  assert.ok(skillRegistry.includes('tool_hints:toolHints.filter(x=>x.policy!=="deny")'));
  assert.ok(skillRegistry.includes('unavailable_tools:toolHints.filter(x=>x.policy==="deny")'));
});

test('Build 81 composes at most four deduplicated Skills',()=>{
  assert.ok(skillRegistry.includes('MAX_COMPOSED_SKILLS=4'));
  assert.ok(chat.includes('loadedSkillTrace.length>=MAX_COMPOSED_SKILLS'));
  assert.ok(chat.includes('composeSkillTrace(loadedSkillTrace,loaded.skill)'));
  assert.ok(chat.includes('loadedSkillManifests.get(requestedSlug)'));
});

test('Build 81 audits system and personal Skills in one provenance ledger',()=>{
  const loadStart=chat.indexOf('async function loadSkill');
  const loadEnd=chat.indexOf('function cognitiveBudget',loadStart);
  const block=chat.slice(loadStart,loadEnd);
  const migration=read('supabase/migrations/20261005093000_skills_composition_v01.sql');
  assert.ok(block.includes('source:"system"|"personal"'));
  assert.ok(block.includes('from("isabella_skill_runs").insert'));
  assert.ok(block.includes('skill_source:skill.source'));
  assert.ok(block.includes('skill_name:skill.name'));
  assert.ok(migration.includes('drop constraint if exists isabella_skill_runs_skill_slug_fkey'));
  assert.ok(migration.includes("check (skill_source in ('system','personal'))"));
  assert.ok(migration.includes('isabella_skill_runs_user_source_slug_created_idx'));
});

test('Build 81 records sanitized Skill trace in parent and capability runs',()=>{
  assert.ok(chat.includes('skill_runtime:SKILL_RUNTIME_VERSION'));
  assert.ok(chat.includes('skills:normalizeSkillTrace(loadedSkillTrace)'));
  assert.ok(chat.includes('skill_trace:normalizeSkillTrace(loadedSkillTrace)'));
  assert.ok(runtime.includes('const skillTrace=normalizeSkillTrace'));
  assert.ok(runtime.includes('skill_trace:skillTrace'));
  assert.ok(sharedRuntime.includes('skill_trace:normalizeSkillTrace(run?.metadata?.skill_trace)'));
});

test('Build 81 does not leak Skill instructions into capability provenance',()=>{
  const traceStart=skillRegistry.indexOf('export type SkillTraceV1={');
  const traceEnd=skillRegistry.indexOf('};',traceStart);
  const traceType=skillRegistry.slice(traceStart,traceEnd);
  assert.ok(traceStart>=0);
  assert.ok(traceType.includes('slug:string'));
  assert.ok(traceType.includes('version:number'));
  assert.ok(traceType.includes('source:SkillSource'));
  assert.ok(!traceType.includes('instructions'));
  assert.ok(!traceType.includes('preferred_tools'));
  assert.ok(runtime.includes('normalizeSkillTrace(body?.skill_trace??body?.context?.skill_trace)'));
});

test('Build 81 preserves existing reviewed personal Skill UI and version history',()=>{
  assert.ok(ai.includes("sb.from('minds_user_skills')"));
  assert.ok(app.includes('Crear habilidad personal'));
  assert.ok(app.includes("minds_user_skill_versions"));
  assert.ok(app.includes('Versiones de '));
  assert.ok(app.includes('No se activa hasta que confirmes esta revisión.'));
});

test('Build 81 keeps a single general material runtime',()=>{
  assert.ok(sharedRuntime.includes('CAPABILITY_RUNTIME_VERSION="capability-runtime-v0.3.0"'));
  assert.ok(chat.includes('name:"execute_artifact_task"'));
  for(const forbidden of ['make_excel','make_xlsx','make_powerpoint','make_pptx','edit_word']){
    assert.ok(!chat.includes('name:"'+forbidden+'"'));
  }
});


test('Build 81 acceptance meeting Skill v2 composes Work without new authority',()=>{
  assert.ok(meetingSkill.includes('version: 2'));
  assert.ok(meetingSkill.includes('Threads'));
  assert.ok(meetingSkill.includes('Capability Runtime general'));
  assert.ok(skillMigration.includes("where slug = 'preparar-reunion'"));
  assert.ok(skillMigration.includes("'search_work_threads'"));
  assert.ok(skillMigration.includes("'execute_artifact_task'"));
  assert.ok(skillMigration.includes('version = 2'));
  assert.ok(skillMigration.includes("'search_memory'"));
  assert.ok(skillMigration.includes("'search_commitments'"));
  assert.equal((skillMigration.match(/where slug = 'preparar-reunion'/g)||[]).length,1);
  assert.ok(build.includes('Acceptance Skill — preparar-reunion v2'));
});


test('Build 83 day planning turns clear narrated commitments into canonical proposals without extra prompting',()=>{
  assert.ok(organizeDaySkill.includes('no te limites a devolver un plan en texto'));
  assert.ok(organizeDaySkill.includes('No esperes a que Gari diga “agrégalo”'));
  assert.ok(organizeDaySkill.includes('proactividad no equivale a autoridad'));
  assert.ok(proactiveDayMigration.includes("where slug = 'organizar-dia'"));
  assert.ok(proactiveDayMigration.includes('version = 2'));
  assert.ok(proactiveDayMigration.includes('prepara en el mismo turno las propuestas correspondientes'));
});
