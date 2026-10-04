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
const protocolV1=read('apps/isabella/ISABELLA-PRESENCE-PROTOCOL-v0.1.md');
const protocolV2=read('apps/isabella/ISABELLA-PRESENCE-PROTOCOL-v0.2.md');
const build=read('apps/isabella/BUILD-80.md');
const build82=read('apps/isabella/BUILD-80.2.md');

const forbiddenClientSecrets=['service_role','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','provider_response_id','gpt-6-astra','gpt-5.6-luna'];

test('Presence remains a thin native shell over canonical MINDS state',()=>{
  assert.ok(protocolV1.includes('Presence no razona, no ejecuta, no decide autoridad'));
  assert.ok(protocolV2.includes('NO crea otro chat backend'));
  assert.ok(protocolV2.includes('minds_attention_events'));
  assert.ok(build.includes('always available, not always visible'));
  assert.ok(build82.includes('fallo de aceptación de experiencia'));
  for(const forbidden of forbiddenClientSecrets)assert.ok(!ui.includes(forbidden),forbidden+' must not exist in desktop client');
});

test('Presence reads capability and Attention ledgers and uses existing runtimes only',()=>{
  assert.ok(ui.includes("sb.from('minds_capability_runs')"));
  assert.ok(ui.includes("sb.from('minds_attention_events')"));
  assert.ok(ui.includes(".in('route',['ambient','interrupt'])"));
  assert.ok(ui.includes("event.route==='interrupt'&&event.requires_user===true"));
  assert.ok(ui.includes("sb.functions.invoke('isabella-capability-runtime'"));
  assert.ok(ui.includes("sb.functions.invoke('isabella-chat'"));
  assert.ok(!ui.includes('presence-chat'));
  assert.ok(!ui.includes('presence-runtime'));
});

test('Inline conversation delegates to canonical Isabella and does not confirm proposals',()=>{
  assert.ok(html.includes('id="chatInput"'));
  assert.ok(html.includes('Escribe a Isabella'));
  assert.ok(ui.includes("pendingReview=!!data?.proposal"));
  assert.ok(ui.includes("$('#reviewInMinds').onclick=()=>openMinds()"));
  assert.ok(ui.includes("lastQuickReplies"));
  assert.ok(!ui.includes('confirm_proposal'));
  assert.ok(!ui.includes('allow_proposal'));
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

test('Presence is hidden by default and behaves as a pill rather than a dashboard',()=>{
  assert.equal(config.app.windows[0].visible,false);
  assert.equal(config.app.windows[0].focus,false);
  assert.equal(config.app.windows[0].width,284);
  assert.equal(config.app.windows[0].height,74);
  assert.ok(html.includes('id="pill"'));
  assert.ok(html.includes('id="collapseButton"'));
  assert.ok(ui.includes("const SIZES={pill:[284,74],panel:[370,472]"));
  assert.ok(ui.includes("expanded=false;manualOpen=true"));
});

test('Presence positions only its own window near the active monitor edge',()=>{
  assert.ok(ui.includes('currentMonitor'));
  assert.ok(ui.includes('setPosition'));
  assert.ok(capability.permissions.includes('core:window:allow-set-position'));
  assert.ok(capability.permissions.includes('core:window:allow-set-size'));
  assert.deepEqual(capability.windows,['presence']);
});

test('Presence transport remains replaceable polling rather than assumed Realtime',()=>{
  assert.ok(ui.includes('const POLL_MS=5000'));
  assert.ok(ui.includes('setInterval(()=>refresh(),POLL_MS)'));
  assert.ok(!ui.includes('.channel('));
  assert.ok(protocolV1.includes('no están publicados actualmente en `supabase_realtime`'));
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

test('Tauri ACL remains scoped to the single window and MINDS URL',()=>{
  const opener=capability.permissions.find(x=>typeof x==='object'&&x.identifier==='opener:allow-open-url');
  assert.deepEqual(opener.allow,[{url:'https://gari01234.github.io/minds/isabella/'},{url:'https://gari01234.github.io/minds/isabella/*'}]);
});

test('Presence dependencies remain pinned',()=>{
  assert.ok(cargo.includes('tauri = { version = "=2.12.0"'));
  assert.ok(cargo.includes('tauri-build = { version = "=2.7.1"'));
  assert.ok(cargo.includes('tauri-plugin-opener = "=2.7.0"'));
  assert.ok(html.includes('@supabase/supabase-js@2.117.2'));
});
