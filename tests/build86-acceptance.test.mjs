import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const prospective=read('supabase/migrations/20261008211500_prospective_memory_v02.sql');
const channels=read('supabase/migrations/20261008213500_watch_channel_contracts_v01.sql');
const watchRuntime=read('supabase/migrations/20261008215500_watch_heartbeat_v01.sql');
const acceptance=read('supabase/migrations/20261008223000_prospective_memory_acceptance_v01.sql');
const heartbeat=read('supabase/functions/isabella-heartbeat/index.ts');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');

test('Build 86.5 Reminder lifecycle is deterministic, idempotent and never monitoring',()=>{
  assert.ok(prospective.includes("mode='reminder' and status='armed'"));
  assert.ok(prospective.includes("last_trigger_at+make_interval(mins=>x.cooldown_minutes)>now()"));
  assert.ok(prospective.includes("status=case when next_count>=max_triggers then 'done' else 'armed' end"));
  assert.ok(prospective.includes('on conflict do nothing'));
  assert.ok(prospective.includes("'monitoring_claim',false"));
  assert.ok(prospective.includes("'coverage','via_user'"));
});

test('Build 86.5 unsupported Watch fails closed and cannot silently become a Reminder',()=>{
  assert.ok(chat.includes('name:"check_watch_capability"'));
  assert.ok(chat.includes('watch_unavailable'));
  assert.ok(channels.includes("raise exception 'Watch channel unavailable'"));
  assert.ok(channels.includes("raise exception 'Watch channel not verified'"));
  assert.ok(channels.includes("raise exception 'Watch channel verification stale'"));
  assert.ok(channels.includes('Explicit prospective-memory confirmation required'));
  assert.ok(channels.includes("v_mode='watch'"));
  assert.ok(channels.includes("v_mode not in ('reminder','watch')"));
  assert.ok(channels.includes("v_observation:='via_user'"));
  assert.ok(channels.includes("v_channel:='conversation'"));
  assert.equal(/v_mode\s*:=\s*'reminder'\s*;/.test(channels),false);
});

test('Build 86.5 no Watch can stay armed without autonomous freshness and runtime support',()=>{
  assert.ok(prospective.includes("observation_mode='autonomous'"));
  assert.ok(prospective.includes("channel_kind<>'conversation'"));
  assert.ok(prospective.includes('freshness_minutes is not null'));
  assert.ok(watchRuntime.includes('runtime_supported boolean not null default false'));
  assert.ok(watchRuntime.includes('Watch channel runtime adapter unavailable'));
  assert.ok(heartbeat.includes('const WATCH_ADAPTERS:Record<string,WatchAdapter>={}'));
});

test('Build 86.5 Watch firing routes through Attention Economy before lifecycle finalization',()=>{
  const observe=heartbeat.indexOf('minds_record_watch_check');
  const publish=heartbeat.indexOf('const publication=await publishCandidate',observe);
  const finalize=heartbeat.indexOf('minds_finalize_watch_fire',publish);
  assert.ok(observe>0);
  assert.ok(publish>observe);
  assert.ok(finalize>publish);
  assert.ok(heartbeat.includes('event_type:"watch_fired"'));
  assert.ok(heartbeat.includes('observation_mode:"autonomous"'));
});

test('Build 86.5 stale/error/unavailable observation cannot look like successful calm monitoring',()=>{
  assert.ok(watchRuntime.includes("if v_status<>'ok' then v_state:='unknown'"));
  assert.ok(watchRuntime.includes("if v_status='ok' and v_fresh>w.freshness_minutes"));
  assert.ok(watchRuntime.includes("'fire_ready',(v_status='ok' and v_state='matched')"));
  assert.ok(heartbeat.includes('status:"channel_unavailable"'));
  assert.ok(app.includes("'sin cobertura autónoma'"));
  assert.ok(app.includes('Última comprobación:'));
  assert.ok(app.includes("x.available?'disponible':'no disponible'"));
});

test('Build 86.5 expiry is heartbeat-driven even if a Reminder never matches again',()=>{
  assert.ok(acceptance.includes('function public.minds_expire_prospective_memory'));
  assert.ok(acceptance.includes("status in ('pending','armed','fired')"));
  assert.ok(acceptance.includes("set status='expired'"));
  assert.ok(acceptance.includes('expired_at=coalesce(expired_at,p_now)'));
  assert.ok(acceptance.includes("union select user_id from public.minds_standing_intents where status in ('pending','armed','fired')"));
  assert.ok(heartbeat.includes('minds_expire_prospective_memory'));
  assert.ok(heartbeat.includes('prospective_memory_expiry:expirySweep'));
});

test('Build 86.5 cancellation and expiry remain explicit and auditable',()=>{
  assert.ok(prospective.includes('Explicit prospective-memory cancellation required'));
  assert.ok(prospective.includes("set status='cancelled',cancelled_at=now()"));
  assert.ok(prospective.includes("if x.status='cancelled'"));
  assert.ok(prospective.includes("if x.status in ('done','expired')"));
  assert.ok(app.includes("minds_cancel_prospective_memory"));
  assert.ok(app.includes('p_confirmed:true'));
});

test('Build 86.5 production baseline cannot accidentally fake autonomous monitoring',()=>{
  assert.equal(/insert\s+into\s+public\.minds_watch_channels/i.test(channels),false);
  assert.ok(heartbeat.includes('const WATCH_ADAPTERS:Record<string,WatchAdapter>={}'));
  assert.ok(app.includes('No hay canales autónomos de observación conectados.'));
});
