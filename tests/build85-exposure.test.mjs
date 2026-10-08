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


test('Build 85.2 lexical recall admits only current scope plus global layer by default',()=>{
  const m=read('supabase/migrations/20261008152500_scoped_recall_v01.sql');
  assert.ok(m.includes('function public.isabella_recall_scoped'));
  assert.ok(m.includes("m.exposure_scope_key='global'"));
  assert.ok(m.includes('m.exposure_scope_key=q.scope_key'));
  assert.ok(m.includes('cm.exposure_scope_version=1'));
  assert.ok(m.includes('p_allow_cross_scope and cm.exposure_scope_version=0'));
  assert.ok(m.includes('source_scope_key'));
  assert.ok(m.includes('provenance_class'));
});

test('Build 85.2 legacy conversation embeddings are discarded rather than assigned guessed scope',()=>{
  const m=read('supabase/migrations/20261008152500_scoped_recall_v01.sql');
  assert.ok(m.includes("delete from public.isabella_embeddings where source_type='conversation'"));
  assert.ok(m.includes('isabella_embeddings_scope_idx'));
  assert.ok(m.includes('function public.isabella_semantic_recall_scoped'));
});

test('Build 85.2 every material lexical or semantic retrieval leaves an exposure receipt',()=>{
  const m=read('supabase/migrations/20261008152500_scoped_recall_v01.sql');
  assert.ok(m.includes('create table if not exists public.minds_exposure_receipts'));
  assert.ok(m.includes("admitted_reason in ('current_scope','global_layer','explicit_cross_scope','system_layer')"));
  assert.ok(chat.includes('async function recordExposureReceipts'));
  assert.ok(chat.includes('"lexical",scopeKey'));
  assert.ok(chat.includes('"semantic",scopeKey'));
  assert.ok(chat.includes('query_fingerprint'));
});

test('Build 85.2 cross-scope recall requires a deterministic explicit memory request',()=>{
  assert.ok(chat.includes('function explicitMemoryCrossScope'));
  assert.ok(chat.includes('const explicitCrossScope=explicitMemoryCrossScope(effectiveMessage)'));
  assert.ok(chat.includes('allow_cross_scope:!!allowCrossScope'));
  assert.ok(chat.includes('retrieved_is_not_new_memory:true'));
});

test('Build 85.2 memory sync preserves scope and provenance',()=>{
  assert.ok(sync.includes("exposure_scope_key:obj?.exposure_scope_key||obj?.metadata?.exposure_scope?.key||'global'"));
  assert.ok(sync.includes('provenance_class:provenance'));
  assert.ok(sync.includes("exposure_scope_key:m.exposure_scope_key||'global'"));
});
