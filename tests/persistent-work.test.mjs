import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const runner=read('supabase/functions/isabella-mission-runner/index.ts');
const capabilityRunner=read('supabase/functions/isabella-capability-runner/index.ts');
const migration=read('supabase/migrations/20261005072000_persistent_work_v01.sql');
const presence=read('apps/isabella-presence/ui/presence.js');
const human=read('shared/human-surface.js');
const protocol=read('apps/isabella/PERSISTENT-WORK-PROTOCOL-v0.1.md');

test('Build 82 evolves Mission Runs rather than introducing a second job system',()=>{
  assert.ok(migration.includes("status in ('queued','running','waiting','waiting_for_user','paused','completed','failed','cancelled')"));
  assert.ok(migration.includes("wait_kind is null or wait_kind in ('time','capability','expectation')"));
  assert.ok(migration.includes('minds_apply_mission_step_v2'));
  assert.ok(migration.includes('minds_reactivate_mission_waits'));
  assert.ok(!migration.toLowerCase().includes('create table public.minds_persistent'));
  assert.ok(protocol.includes('Persistent Work is not a second agent'));
});

test('Build 82 keeps durable work bounded',()=>{
  assert.ok(migration.includes('max_iterations between 1 and 32'));
  assert.ok(migration.includes("v_wake_at>now()+interval '90 days'"));
  assert.ok(runner.includes('one bounded material deliverable'));
  assert.ok(chat.includes('boundedPersistentCheckpoints(args?.max_iterations,24)'));
});

test('Build 82 preserves Expectation epistemics',()=>{
  assert.ok(migration.includes("v_dep_status in ('fulfilled','not_occurred','cancelled')"));
  assert.ok(!migration.includes("'due_unconfirmed','fulfilled'"));
  assert.ok(!migration.includes("'missed'"));
  assert.ok(runner.includes('.in("status",["active","due_unconfirmed"])'));
  assert.ok(runner.includes('Do not invent an expectation id'));
});

test('Build 82 makes one confirmed Commitment start internal work',()=>{
  assert.ok(chat.includes('persistent_work:persistentWork'));
  assert.ok(chat.includes('mission_request_id:crypto.randomUUID()'));
  assert.ok(app.includes("sb.rpc('minds_create_commitment'"));
  assert.ok(app.includes("sb.rpc('minds_ensure_commitment_workspace'"));
  assert.ok(app.includes("sb.rpc('minds_start_mission_run'"));
  assert.ok(app.includes("p.mission_request_id"));
  assert.ok(!app.includes("from('minds_mission_runs').update"));
});

test('Build 82 delegates material work through Build 79 without duplicating delivery',()=>{
  assert.ok(runner.includes('startGeneralExecution'));
  assert.ok(runner.includes('origin_kind:"mission"'));
  assert.ok(runner.includes('delivery:"mission_parent"'));
  assert.ok(runner.includes('surface_hidden:true'));
  assert.ok(capabilityRunner.includes('missionParent'));
  assert.ok(capabilityRunner.includes('{deliver:!missionParent}'));
  assert.ok(runner.includes('generated artifact is a deliverable'));
});

test('Build 82 wakes a mission after any terminal subordinate capability result',()=>{
  assert.ok(migration.includes("v_dep_status in ('completed','failed','cancelled')"));
  assert.ok(runner.includes('JUST RESUMED FROM A WAIT'));
  assert.ok(runner.includes('capabilityRun=await startMissionCapability'));
});

test('Build 82 waiting is explicitly not a user blocker',()=>{
  assert.ok(human.includes("if(s==='waiting')"));
  assert.ok(human.includes('No necesitas hacer nada ahora.'));
  assert.ok(migration.includes("when v_outcome='waiting' then 'waiting'"));
  assert.ok(runner.includes('if(["completed","waiting_for_user"].includes(next.status))'));
  assert.ok(!runner.includes('["completed","waiting","waiting_for_user"]'));
});

test('Build 82 Presence projects the objective and hides subordinate machinery',()=>{
  assert.ok(presence.includes("sb.from('minds_mission_runs')"));
  assert.ok(presence.includes("if(run?.metadata?.surface_hidden===true)continue"));
  assert.ok(presence.includes("status==='waiting'?{kind:'waiting',label:'Esperando'}"));
  assert.ok(!presence.includes("['working','preparing','waiting'].includes(card.kind)"));
});

test('Build 82 preserves Skill and authority boundaries',()=>{
  assert.ok(chat.includes('skill_trace:normalizeSkillTrace(loadedSkillTrace)'));
  assert.ok(runner.includes('normalizeSkillTrace(run?.metadata?.skill_trace)'));
  assert.ok(runner.includes('general_execution'));
  assert.ok(protocol.includes('It gains no new authority.'));
  assert.ok(protocol.includes('Generated artifact ≠ project truth.'));
});
