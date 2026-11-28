// «Un solo motor» (Gari, 28.11.2026): Romy's Work threads in the Office run on this engine instead of the older
// office-assistant. Office browsers may only insert their own user turns, so for the Office profile the server
// writes the thread turn and its reply into the thread's own conversation, like the main chat. Window's threads
// stay as they are (the app writes them). Checked on the source, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalBrowserOwnerRow,browserTurnId} from '../supabase/functions/_shared/browser-turn-ledger.mjs';
import {canonicalAssistantRow} from '../supabase/functions/_shared/chat-delivery.mjs';

const chat=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');
const start=chat.indexOf('async function persistCanonicalThreadOwnerTurn');
const fn=chat.slice(start,chat.indexOf('\n}\n',start)+3);

test('only Romy (multi_user) and only a browser thread turn with a request id is written by the server',()=>{
  assert.match(chat,/if\(surface==="chat_browser"&&!background&&currentWorkThread&&assistantProfile\.multi_user&&!voiceDelegation\)\{\n\s+if\(!browserTurnId\(clientMessageId\)\)/);
  assert.match(chat,/browserTurn=await persistCanonicalThreadOwnerTurn\(req,clientMessageId,effectiveMessage,exposureScope,currentWorkThread\)/);
  // The main chat keeps its own path; Window threads are not touched.
  assert.match(chat,/if\(surface==="chat_browser"&&!background&&!currentWorkThread\)\{/);
});

test('the thread turn goes only into the caller\'s own thread conversation, with the thread\'s scope',()=>{
  assert.match(fn,/\.eq\("user_id",user\.id\)\.eq\("app_scope","work_thread"\)\.maybeSingle\(\)/);
  assert.match(fn,/if\(owned\.error\|\|owned\.data\?\.id!==conversationId\)throw new Error\("thread_conversation_not_owned"\)/);
  assert.match(fn,/scope\?\.kind!=="work_thread"\|\|String\(scope\?\.ref\|\|""\)!==String\(thread\?\.id\|\|""\)/);
  assert.match(fn,/if\(!sameBrowserOwnerTurn\(existing\.data,canonical\)\)throw new Error\("browser_turn_id_conflict"\)/,'idempotent, never rewritten');
  const id='11111111-2222-4333-8444-555555555555',scope={version:1,kind:'work_thread',ref:'t1',key:'work_thread:t1'};
  assert.equal(browserTurnId(id),id);
  const row=canonicalBrowserOwnerRow({userId:'u',conversationId:'c',requestId:id,message:'Wie ist der Stand?',scope});
  assert.equal(row.exposure_scope_key,'work_thread:t1');assert.equal(row.provenance_class,'owner');assert.equal(row.role,'user');
  const reply=canonicalAssistantRow({userId:'u',conversationId:'c',requestId:id,content:'Der Stand ist …',scope,author:'romy'});
  assert.equal(reply.role,'assistant');assert.equal(reply.exposure_scope_kind,'work_thread');
});

test('the server reply may go into the main chat or the caller\'s own Work thread, nowhere else',()=>{
  const persist=chat.slice(chat.indexOf('async function persistServerAssistantTurn'),chat.indexOf('Deno.serve('));
  assert.match(persist,/\.eq\("id",row\.conversation_id\)\.in\("app_scope",\["isabella","work_thread"\]\)\.maybeSingle\(\)/);
  assert.match(persist,/if\(!owner\|\|owner\.id!==row\.user_id\)return false;/);
});
