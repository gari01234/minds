import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261009065000_presence_exact_decision_binding_v01.sql');
const presence=read('apps/isabella-presence/ui/presence.js');
const chat=read('supabase/functions/isabella-chat/index.ts');
const build=read('BUILD-88.md');

test('Build 88.1 gives decision-bearing Attention events a monotonic revision',()=>{
  assert.ok(migration.includes('request_revision integer not null default 1'));
  assert.ok(migration.includes('minds_attention_request_revision_guard'));
  assert.ok(migration.includes('old.body is distinct from new.body'));
  assert.ok(migration.includes('old.source_id is distinct from new.source_id'));
  assert.ok(migration.includes('old.requires_user is distinct from new.requires_user'));
  assert.ok(migration.includes('old.request_revision+1'));
});

test('Build 88.1 validates exact live decision revision server-side',()=>{
  assert.ok(migration.includes('function public.minds_validate_presence_reply_v01'));
  assert.ok(migration.includes("'revision_mismatch'"));
  assert.ok(migration.includes("v_event.status not in ('pending','delivered')"));
  assert.ok(migration.includes("v_event.route<>'interrupt'"));
  assert.ok(migration.includes("v_event.requires_user is not true"));
  assert.ok(migration.includes("v_mission.status<>'waiting_for_user'"));
});

test('Build 88.1 Presence carries the exact revision the user saw',()=>{
  assert.ok(presence.includes('request_revision:Number(event.request_revision||1)'));
  assert.ok(presence.includes('source_id,request_revision,metadata'));
  assert.ok(presence.includes('reply_context:replyContext'));
});

test('Build 88.1 rejects stale Presence replies before model routing or reasoning',()=>{
  const validateAt=chat.indexOf('minds_validate_presence_reply_v01');
  const routeAt=chat.indexOf('const route=await routeRequest');
  const runAt=chat.indexOf('const run=activeRun=await startAgentRun');
  assert.ok(validateAt>0);
  assert.ok(routeAt>validateAt);
  assert.ok(runAt>routeAt);
  assert.ok(chat.includes('error:"stale_decision"'));
  assert.ok(chat.includes('context.reply_context=binding.data.reply_context'));
});

test('Build 88.1 stale UI refreshes canonical state instead of applying an old answer',()=>{
  assert.ok(presence.includes("payload?.error==='stale_decision'"));
  assert.ok(presence.includes('Esa decisión cambió mientras respondías.'));
  assert.ok(presence.includes('await refresh({force:true})'));
});

test('Build 88 remains a thin Presence with no authority expansion',()=>{
  assert.ok(build.includes('Presence is a projection, not another runtime.'));
  assert.ok(build.includes('Stale answers fail closed before model reasoning or Mission resume.'));
  assert.ok(!migration.includes('update public.minds_mission_runs set'));
  assert.ok(!migration.includes('insert into public.minds_permissions'));
});
