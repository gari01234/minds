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
  assert.ok(skillRegistry.includes('tool_hints:toolHints.filter(x=>x.policy!=="deny")'));
  assert.ok(skillRegistry.includes('unavailable_tools:toolHints.filter(x=>x.policy==="deny")'));
});

test('Build 81 composes at most four deduplicated Skills',()=>{
  assert.ok(skillRegistry.includes('MAX_COMPOSED_SKILLS=4'));
  assert.ok(chat.includes('loadedSkillTrace.length>=MAX_COMPOSED_SKILLS'));
  assert.ok(chat.includes('composeSkillTrace(loadedSkillTrace,loaded.skill)'));
  assert.ok(chat.includes('loadedSkillManifests.get(requestedSlug)'));
});

test('Build 81 keeps personal Skill loading independent of the system-only legacy FK ledger',()=>{
  const loadStart=chat.indexOf('async function loadSkill');
  const loadEnd=chat.indexOf('function cognitiveBudget',loadStart);
  const block=chat.slice(loadStart,loadEnd);
  assert.ok(block.includes('source:"system"|"personal"'));
  assert.ok(block.includes('if(source==="system")'));
  assert.ok(block.includes('from("isabella_skill_runs").insert'));
  assert.ok(block.indexOf('if(source==="system")')<block.indexOf('from("isabella_skill_runs").insert'));
  assert.ok(block.includes('return {status:"loaded",skill}'));
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
  assert.ok(skillRegistry.includes('return {slug:s,name:n,version:version(x.version),source:src'));
  assert.ok(!skillRegistry.includes('SkillTraceV1={\n  slug:string;\n  name:string;\n  version:number;\n  source:SkillSource;\n  instructions'));
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
