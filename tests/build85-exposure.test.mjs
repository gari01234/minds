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


test('Build 85.3 autobiographical writes require exact evidence from the current user message',()=>{
  assert.ok(chat.includes('const AUTOBIOGRAPHICAL_WRITE_TOOLS=new Set'));
  assert.ok(chat.includes('currentUserEvidenceGate'));
  assert.ok(chat.includes('current_user_excerpt_required'));
  assert.ok(chat.includes('excerpt_not_found_in_current_user_message'));
  assert.ok(chat.includes('excerpt_too_weak_for_durable_memory'));
  assert.ok(chat.includes('background_session_cannot_write_autobiographical_memory'));
  assert.ok(chat.includes('source_tainted_turn_cannot_write_autobiographical_memory'));
  assert.ok(chat.includes('required:["kind","content","user_excerpt"]'));
  assert.ok(chat.includes('required:["claim_type","claim","status","user_excerpt"]'));
  assert.ok(chat.includes('required:["claim_id","status","user_excerpt"]'));
  assert.ok(chat.includes('required:["subject_type","subject_name","predicate","object_type","object_name","user_excerpt"]'));
});

test('Build 85.3 durable memory candidates preserve current-user evidence and cannot masquerade as accepted facts',()=>{
  assert.ok(chat.includes('evidence_kind:"current_user_excerpt"'));
  assert.ok(chat.includes('message_fingerprint:currentUserMessageFingerprint'));
  assert.ok(chat.includes('recall_loop_safe:true'));
  assert.ok(chat.includes('accepted_fact:false'));
  assert.ok(chat.includes('provenance_class:"agent"'));
  assert.ok(chat.includes('memory_provenance_policy:"current_user_evidence_v1"'));
});

test('Build 85.3 source taint is turn-local and blocks autobiographical promotion after external tools',()=>{
  assert.ok(chat.includes('let sourceTainted=false'));
  assert.ok(chat.includes('if((payload.output||[]).some((x:any)=>x.type==="web_search_call"))sourceTainted=true'));
  assert.ok(chat.includes('if(["search_generated_artifacts","search_work","search_work_threads","read_work_file","analyze_project_source","compare_project_source","consult_sofia"].includes(call.name))sourceTainted=true'));
  assert.ok(chat.includes('currentUserEvidenceGate(String(call.name||""),args,effectiveMessage,background,sourceTainted)'));
  assert.ok(chat.includes('status:"blocked_by_memory_provenance"'));
});


test('Build 85.4 records lineage and forget tombstones without deleting audit rows',()=>{
  const migration=read('supabase/migrations/20261008174000_memory_lineage_forgetting_v01.sql');
  assert.ok(migration.includes('create table if not exists public.minds_memory_lineage'));
  assert.ok(migration.includes('create table if not exists public.minds_memory_forget_tombstones'));
  assert.ok(migration.includes('minds_capture_memory_lineage_trigger'));
  assert.ok(migration.includes('minds_capture_model_claim_lineage_trigger'));
  assert.ok(migration.includes('minds_capture_entity_lineage_trigger'));
  assert.ok(migration.includes('minds_capture_entity_link_lineage_trigger'));
  assert.ok(migration.includes("set status='archived'"));
  assert.ok(migration.includes("set status='stale'"));
  assert.ok(migration.includes("'forgotten_at'"));
});

test('Build 85.4 forgetting a conversation invalidates descendants and removes recalled embeddings',()=>{
  const migration=read('supabase/migrations/20261008174000_memory_lineage_forgetting_v01.sql');
  assert.ok(migration.includes('with recursive affected(kind,id) as'));
  assert.ok(migration.includes("source_kind='conversation'"));
  assert.ok(migration.includes('delete from public.isabella_embeddings'));
  assert.ok(migration.includes('create or replace function public.minds_forget_conversation'));
  assert.ok(migration.includes('create or replace function public.isabella_recall_scoped'));
  assert.ok(migration.includes('create or replace function public.isabella_semantic_recall_scoped'));
});

test('Build 85.4 explicit memory deletion uses the lineage-aware server RPC',()=>{
  const sync=read('apps/isabella/sync.js');
  assert.ok(sync.includes("m.status==='deleted'"));
  assert.ok(sync.includes("sb.rpc('minds_forget_memory'"));
  assert.ok(sync.includes('p_client_key:clientKey'));
});

test('Build 85.4 new autobiographical objects carry conversation lineage as well as run lineage',()=>{
  assert.ok(chat.includes('conversation_id:provenance?.conversation_id||null'));
  assert.ok(chat.includes('conversation_id:conversationInfo?.dbId||null'));
  assert.ok(chat.includes('minds_memory_forget_tombstones'));
  assert.ok(chat.includes('forgottenConversations'));
  assert.ok(chat.includes('forgottenMemories'));
});
