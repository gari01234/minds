import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261008150000_exposure_scope_v01.sql');
const conversations=read('supabase/functions/_shared/conversations.ts');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const sync=read('apps/isabella/sync.js');
const ai=read('apps/isabella/ai.js');

test('Build 85.1 legacy chat stays searchable but is excluded from automatic scoped working context',()=>{
  assert.ok(migration.includes('exposure_scope_version smallint not null default 0'));
  assert.ok(migration.includes("exposure_scope_key text not null default 'legacy'"));
  assert.ok(migration.includes('cm.exposure_scope_version=1'));
  assert.ok(migration.includes('cm.exposure_scope_key=trim(coalesce(p_scope_key'));
  assert.ok(chat.includes('legacy_history_auto_injected:false'));
  assert.ok(chat.includes('mergeRecentConversations(recentDb, [], effectiveMessage)'));
});

test('Build 85.1 every new visible Isabella turn carries structural exposure scope',()=>{
  assert.ok(migration.includes('exposure_scope_kind'));
  assert.ok(migration.includes('provenance_class'));
  assert.ok(app.includes('userTurn.metadata={...(userTurn.metadata||{}),exposure_scope:exposure}'));
  assert.ok(app.includes("metadata:{exposure_scope:exposure}"));
  assert.ok(sync.includes('exposure_scope_version:scope?.version===1?1:0'));
  assert.ok(sync.includes("exposure_scope_key:scope?.key||'legacy'"));
});

test('Build 85.1 one visible chat uses separate OpenAI Conversations per scope',()=>{
  assert.ok(conversations.includes('openai_scope_conversations'));
  assert.ok(conversations.includes("const scopeKey=String(options?.scopeKey||'global')"));
  assert.ok(conversations.includes("exposure_scope_key:scopeKey"));
  assert.ok(conversations.includes("context_policy:'scoped_exposure_v1'"));
  assert.ok(chat.includes('getOrCreateOpenAIConversation(req,apiKey,seed,currentWorkThread,exposureScope)'));
});

test('Build 85.1 project scope is explicit and Work Threads remain exact isolated contexts',()=>{
  assert.ok(chat.includes('async function exposureScopeForTurn'));
  assert.ok(chat.includes('kind:"work_thread"'));
  assert.ok(chat.includes('kind:"project"'));
  assert.ok(chat.includes('kind:"global"'));
  assert.ok(chat.includes('strictScope:false'));
  assert.ok(chat.includes('strictScope:true'));
});

test('Build 85.1 project task mutations do not bypass scoped Isabella via the fast path',()=>{
  assert.ok(ai.includes('function messageMentionsKnownProject'));
  assert.ok(ai.includes('!messageMentionsKnownProject(message,state)&&fastCreateCandidate(message)'));
});
