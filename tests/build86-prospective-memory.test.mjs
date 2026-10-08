import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261008211500_prospective_memory_v02.sql');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');

test('Build 86.1 reuses the Standing Intent store as one prospective-memory ledger',()=>{
  assert.ok(migration.includes("add column if not exists mode text not null default 'reminder'"));
  assert.ok(migration.includes("status in ('pending','armed','fired','done','cancelled','expired')"));
  assert.ok(migration.includes('create or replace view public.minds_prospective_memory_v1'));
  assert.ok(!migration.includes('create table if not exists public.minds_watches'));
});

test('Build 86.1 conversational prospective memory is explicitly a Reminder, not monitoring',()=>{
  assert.ok(migration.includes("v_observation:='via_user'"));
  assert.ok(migration.includes("v_channel:='conversation'"));
  assert.ok(migration.includes("'monitoring_claim',false"));
  assert.ok(chat.includes('.eq("mode","reminder").eq("status","armed")'));
  assert.ok(chat.includes('coverage:"via_user",monitoring:false'));
  assert.ok(chat.includes('This is NOT monitoring'));
  assert.ok(app.includes('No estaré vigilando una fuente externa'));
});

test('Build 86.1 true Watch rows require autonomous channel freshness and a defined condition',()=>{
  assert.ok(migration.includes("mode='reminder'"));
  assert.ok(migration.includes("observation_mode='autonomous'"));
  assert.ok(migration.includes("channel_kind<>'conversation'"));
  assert.ok(migration.includes('freshness_minutes is not null'));
  assert.ok(migration.includes("Watch channel contract must be registered before arming"));
});

test('Build 86.1 creation and cancellation require explicit reviewed owner acts',()=>{
  assert.ok(migration.includes('Explicit prospective-memory confirmation required'));
  assert.ok(migration.includes('Explicit prospective-memory cancellation required'));
  assert.ok(migration.includes('revoke all on public.minds_standing_intents from anon,authenticated'));
  assert.ok(app.includes("sb.rpc('minds_create_prospective_memory'"));
  assert.ok(app.includes("sb.rpc('minds_cancel_prospective_memory'"));
  assert.ok(!app.includes("from('minds_standing_intents').upsert"));
});

test('Build 86.1 delivery lifecycle is idempotent and records firing before re-arm/done',()=>{
  assert.ok(migration.includes('unique(user_id, intent_id, run_key)')||migration.includes('on conflict do nothing'));
  assert.ok(migration.includes("set status='fired'"));
  assert.ok(migration.includes("status=case when next_count>=max_triggers then 'done' else 'armed' end"));
  assert.ok(migration.includes('fired_at=now()'));
  assert.ok(migration.includes("mode='reminder' and status='armed'"));
});

test('Build 86.1 Human Surface exposes coverage instead of implying silent observation',()=>{
  assert.ok(app.includes('Recordatorio · visto a través de ti'));
  assert.ok(app.includes('No es vigilancia: MINDS detecta la condición cuando reaparece en la conversación.'));
  assert.ok(app.includes('No significan que MINDS esté vigilando una fuente externa.'));
});
