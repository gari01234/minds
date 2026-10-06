import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const chat=read('supabase/functions/isabella-chat/index.ts');
const presence=read('apps/isabella-presence/ui/presence.js');
const sync=read('apps/isabella/sync.js');
const config=JSON.parse(read('apps/isabella-presence/src-tauri/tauri.conf.json'));
const protocol=read('apps/isabella/ISABELLA-PRESENCE-PROTOCOL-v0.3.md');

test('Build 80.3 loads canonical agenda server-side for every Isabella surface',()=>{
  assert.ok(chat.includes('async function canonicalAgendaContext'));
  assert.ok(chat.includes('sb.from("isabella_tasks")'));
  assert.ok(chat.includes('sb.from("isabella_events")'));
  assert.ok(chat.includes('agenda_context_source:canonicalAgenda.status==="ok"?"server_canonical":"client_fallback"'));
  assert.ok(chat.includes('overdue_tasks:'));
  assert.ok(chat.includes('undated_tasks:'));
  assert.ok(chat.includes('AGENDA CANÓNICA:'));
});

test('Presence requests identify the surface and use idempotent message ids',()=>{
  assert.ok(presence.includes("surface:'presence'"));
  assert.ok(presence.includes('client_message_id:requestId'));
  assert.ok(presence.includes('globalThis.crypto?.randomUUID?.()'));
  assert.ok(chat.includes('const persistPresence=surface==="presence"'));
  assert.ok(chat.includes('"presence:"+clientMessageId+":user"'));
  assert.ok(chat.includes('"presence:"+clientMessageId+":assistant"'));
});

test('Presence turns persist in the canonical Isabella conversation',()=>{
  assert.ok(chat.includes('async function persistPresenceTurn'));
  assert.ok(chat.includes('sb.from("conversation_messages").upsert'));
  assert.ok(chat.includes('onConflict:"user_id,conversation_id,client_key"'));
  assert.ok(chat.includes('source:"presence"'));
  assert.ok(chat.includes('surface:"presence"'));
  assert.ok(!presence.includes("sb.from('conversation_messages').insert("));
  assert.ok(!presence.includes("sb.from('conversation_messages').update("));
  assert.ok(!presence.includes("sb.from('minds_mission_runs').update("));
  assert.ok(!presence.includes("sb.from('minds_attention_events').insert("));
});

test('Presence reloads durable canonical history',()=>{
  assert.ok(presence.includes('async function loadConversationHistory'));
  assert.ok(presence.includes("sb.from('conversations').select('id')"));
  assert.ok(presence.includes("sb.from('conversation_messages')"));
  assert.ok(presence.includes(".eq('app_scope','isabella')"));
});

test('Web Isabella reacts to Presence-originated conversation messages',()=>{
  assert.ok(sync.includes("const sharedSurface=source==='presence'"));
  assert.ok(sync.includes("syncNow({pullOnly:true})"));
  assert.ok(sync.includes("mergeConversationMessages"));
});

test('Build 80.3 remains one Isabella across multiple surfaces',()=>{
  const [major,minor,patch]=config.version.split('.').map(Number);
  assert.ok(major>0||minor>1||(minor===1&&patch>=3));
  assert.ok(protocol.includes('One Isabella, one operational context, one conversation history, multiple surfaces.'));
  assert.ok(!presence.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(!presence.includes('service_role'));
});
