import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const ui=read('apps/isabella-presence/ui/presence.js');
const html=read('apps/isabella-presence/ui/index.html');
const cargo=read('apps/isabella-presence/src-tauri/Cargo.toml');
const rust=read('apps/isabella-presence/src-tauri/src/main.rs');
const config=JSON.parse(read('apps/isabella-presence/src-tauri/tauri.conf.json'));
const capability=JSON.parse(read('apps/isabella-presence/src-tauri/capabilities/presence.json'));
const protocol=read('apps/isabella/ISABELLA-PRESENCE-PROTOCOL-v0.1.md');
const build=read('apps/isabella/BUILD-80.md');

const forbiddenClientSecrets=['service_role','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','provider_response_id','gpt-6-astra','gpt-5.6-luna'];

test('Build 80 is a thin native shell over the existing MINDS state',()=>{
  assert.ok(protocol.includes('Presence no razona, no ejecuta, no decide autoridad'));
  assert.ok(protocol.includes('minds_capability_runs'));
  assert.ok(protocol.includes('minds_attention_events'));
  assert.ok(build.includes('always available, not always visible'));
  assert.ok(build.includes('No existe una credencial privilegiada en el cliente'));
});

test('Presence reads capability and Attention ledgers but does not invent a second backend',()=>{
  assert.ok(ui.includes("sb.from('minds_capability_runs')"));
  assert.ok(ui.includes("sb.from('minds_attention_events')"));
  assert.ok(ui.includes(".in('route',['ambient','interrupt'])"));
  assert.ok(ui.includes("event.route==='interrupt'&&event.requires_user===true"));
  assert.ok(ui.includes("sb.functions.invoke('isabella-capability-runtime'"));
  for(const forbidden of forbiddenClientSecrets)assert.ok(!ui.includes(forbidden),forbidden+' must not exist in desktop client');
});

test('Presence uses the same public Supabase boundary under RLS',()=>{
  assert.ok(ui.includes("https://lodexwyyynlarkqgkyhy.supabase.co"));
  assert.ok(ui.includes('sb_publishable_'));
  assert.ok(ui.includes('signInWithOtp'));
  assert.ok(ui.includes('shouldCreateUser:false'));
  assert.ok(ui.includes('verifyOtp'));
  assert.ok(!ui.includes('.insert('));
  assert.ok(!ui.includes('.update('));
  assert.ok(!ui.includes('.delete('));
});

test('Presence transport is replaceable polling rather than an assumed Realtime dependency',()=>{
  assert.ok(ui.includes('const POLL_MS=5000'));
  assert.ok(ui.includes('setInterval(()=>refresh(),POLL_MS)'));
  assert.ok(!ui.includes('.channel('));
  assert.ok(protocol.includes('no están publicados actualmente en `supabase_realtime`'));
});

test('Tauri provides only presence-level OS affordances',()=>{
  assert.equal(config.app.windows[0].label,'presence');
  assert.equal(config.app.windows[0].alwaysOnTop,true);
  assert.equal(config.app.windows[0].decorations,false);
  assert.equal(config.app.windows[0].skipTaskbar,true);
  assert.equal(config.app.withGlobalTauri,true);
  assert.deepEqual(config.app.security.capabilities,['presence']);
  assert.ok(rust.includes('TrayIconBuilder'));
  assert.ok(rust.includes('api.prevent_close()'));
  assert.ok(rust.includes('window.hide()'));
  assert.ok(!rust.includes('reqwest'));
  assert.ok(!rust.includes('openai'));
});

test('Tauri ACL is scoped to the single window and MINDS URL',()=>{
  assert.deepEqual(capability.windows,['presence']);
  assert.ok(capability.permissions.includes('core:window:allow-show'));
  assert.ok(capability.permissions.includes('core:window:allow-hide'));
  assert.ok(capability.permissions.includes('core:window:allow-set-size'));
  const opener=capability.permissions.find(x=>typeof x==='object'&&x.identifier==='opener:allow-open-url');
  assert.deepEqual(opener.allow,[{url:'https://gari01234.github.io/minds/isabella/'},{url:'https://gari01234.github.io/minds/isabella/*'}]);
});

test('Build 80 pins native and Supabase client dependencies',()=>{
  assert.ok(cargo.includes('tauri = { version = "=2.12.0"'));
  assert.ok(cargo.includes('tauri-build = { version = "=2.6.3"'));
  assert.ok(cargo.includes('tauri-plugin-opener = "=2.7.0"'));
  assert.ok(html.includes('@supabase/supabase-js@2.117.2'));
});

test('Presence delegates conversation and decisions to the canonical Isabella surface',()=>{
  assert.ok(ui.includes("const MINDS_URL='https://gari01234.github.io/minds/isabella/'"));
  assert.ok(ui.includes('Responder en Isabella'));
  assert.ok(html.includes('Hablar con Isabella'));
  assert.ok(!html.includes('chatInput'));
  assert.ok(!ui.includes('isabella-chat'));
});
