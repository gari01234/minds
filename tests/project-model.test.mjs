import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const migration=read('supabase/migrations/20261008113000_project_model_v01.sql');
const chat=read('supabase/functions/isabella-chat/index.ts');
const corpus=JSON.parse(read('tests/fixtures/bernried-cognitive-integrity-v01.json'));

test('Build 84 adds stable Referents without making inferred identity project truth',()=>{
  assert.ok(migration.includes('create table if not exists public.minds_project_referents'));
  assert.ok(migration.includes("status in ('active','merged','retired')"));
  assert.ok(migration.includes('merged_into uuid null references public.minds_project_referents'));
  assert.ok(migration.includes("provenance jsonb not null default '{}'::jsonb"));
});

test('Build 84 extends Work claims with author, model kind and bitemporal learned-at semantics',()=>{
  assert.ok(migration.includes('add column if not exists referent_id'));
  assert.ok(migration.includes('add column if not exists author_kind'));
  assert.ok(migration.includes('add column if not exists model_kind'));
  assert.ok(migration.includes('add column if not exists learned_at'));
  assert.ok(migration.includes("author_kind in ('user','isabella','external','system')"));
  assert.ok(migration.includes("model_kind in ('structural','descriptive','diagnostic','evaluative','prescriptive','gap')"));
  assert.ok(migration.includes('valid_from'));
  assert.ok(migration.includes('valid_to'));
});

test('Build 84 represents contradiction and dependency as provenance-bearing claim relations',()=>{
  assert.ok(migration.includes('create table if not exists public.minds_work_claim_relations'));
  assert.ok(migration.includes("'contradicts'"));
  assert.ok(migration.includes("'depends_on'"));
  assert.ok(migration.includes("'supersedes'"));
  assert.ok(migration.includes('author_kind text not null'));
  assert.ok(migration.includes('provenance jsonb not null'));
});

test('Build 84 Perimeter distinguishes observation, readability, coverage and freshness',()=>{
  assert.ok(migration.includes('create table if not exists public.minds_project_perimeter'));
  assert.ok(migration.includes("observation_mode in ('autonomous','via_user','unobserved')"));
  assert.ok(migration.includes("readability in ('readable','partial','unreadable','unknown')"));
  assert.ok(migration.includes("coverage in ('complete','partial','missing','unknown')"));
  assert.ok(migration.includes('freshness_minutes'));
  assert.ok(migration.includes('last_checked_at'));
  assert.ok(migration.includes('last_seen_at'));
});

test('Build 84 preserves Task Expectation Commitment and Mission state machines behind one read-only Movement envelope',()=>{
  assert.ok(migration.includes('create or replace view public.minds_project_movements_v1'));
  for(const source of ["'task'::text","'expectation'::text","'commitment'::text","'mission'::text"])assert.ok(migration.includes(source));
  assert.ok(migration.includes("'gari'::text as actor_kind"));
  assert.ok(migration.includes("'world'::text"));
  assert.ok(migration.includes("'isabella'::text"));
  assert.ok(!migration.includes('drop table public.isabella_tasks'));
  assert.ok(!migration.includes('drop table public.minds_expectations'));
  assert.ok(!migration.includes('drop table public.minds_commitments'));
  assert.ok(!migration.includes('drop table public.minds_mission_runs'));
});

test('Build 84 makes Project Model revisions triggered, inspectable and single-current',()=>{
  assert.ok(migration.includes('create table if not exists public.minds_project_model_revisions'));
  assert.ok(migration.includes("trigger_kind in ('source','user_correction','time','reread','manual')"));
  assert.ok(migration.includes("where status='current'"));
  assert.ok(migration.includes('coverage_snapshot'));
  assert.ok(migration.includes('create table if not exists public.minds_project_model_elements'));
});

test('Build 84 Source is a projection of canonical Work files and Thread messages, not copied prose',()=>{
  assert.ok(migration.includes('create or replace view public.minds_project_sources_v1'));
  assert.ok(migration.includes("from public.minds_work_files f"));
  assert.ok(migration.includes("join public.conversation_messages m"));
  assert.ok(!migration.includes('source_body text'));
});

test('Build 84 exposes a bounded Project Model snapshot through search_work',()=>{
  assert.ok(migration.includes('function public.minds_project_model_snapshot'));
  assert.ok(chat.includes('minds_project_model_snapshot'));
  assert.ok(chat.includes('project_model:projectModel||null'));
  assert.ok(chat.includes("Project Model is Isabella's versioned interpretation"));
  assert.ok(chat.includes('Treat Isabella-authored Project Model elements as interpretation, not project truth.'));
});

test('Build 84 keeps the real Bernried cognitive-integrity corpus as acceptance evidence',()=>{
  assert.equal(corpus.project,'Bernried / Haus der Komischen Kunst / 3. BA / LPH 3');
  assert.equal(corpus.cases.length,20);
  const covered=new Set(corpus.cases.flatMap(x=>x.invariants));
  for(const invariant of corpus.invariants)assert.ok(covered.has(invariant));
});


test('Build 84.2 source-first ingestion is idempotent and atomically commits only proposed sourced claims',()=>{
  const m=read('supabase/migrations/20261008121500_project_source_ingestion_v01.sql');
  assert.ok(m.includes('create table if not exists public.minds_project_source_ingestions'));
  assert.ok(m.includes('unique(user_id,project_id,source_kind,source_ref,source_version)'));
  assert.ok(m.includes('function public.minds_commit_project_source_extraction'));
  assert.ok(m.includes("'already_indexed'"));
  assert.ok(m.includes("'proposed',v_conf,'project_source'"));
  assert.ok(m.includes("'external',null,now()"));
  assert.ok(m.includes("'source_first',true"));
  assert.ok(m.includes("'supports','reported'"));
});

test('Build 84.2 extractor sees only minimal Referent identity before reading a Source',()=>{
  assert.ok(chat.includes('async function analyzeProjectSource'));
  assert.ok(chat.includes('known_referents'));
  assert.ok(chat.includes('Known referents are provided only to resolve identity. They are not claims'));
  assert.ok(chat.includes('Read the Source before comparing it with any project interpretation.'));
  assert.ok(chat.includes('Do not diagnose, prioritize, recommend, or infer project truth.'));
  const start=chat.indexOf('async function analyzeProjectSource');
  const end=chat.indexOf('async function readWorkFile',start);
  const block=chat.slice(start,end);
  assert.ok(!block.includes('minds_project_model_snapshot'));
  assert.ok(!block.includes('minds_work_claims'));
});

test('Build 84.2 extraction becomes structured project evidence without confirming it',()=>{
  assert.ok(chat.includes('name:"analyze_project_source"'));
  assert.ok(chat.includes('This creates only proposed sourced Claims and working Referents with provenance'));
  assert.ok(chat.includes('minds_commit_project_source_extraction'));
  assert.ok(chat.includes('project_source_first_extraction'));
  assert.ok(chat.includes('accepted_fact:false'));
  assert.ok(chat.includes('source_first:true'));
});


test('Build 84.3 comparison receipts are baseline-versioned and authority-neutral',()=>{
  const m=read('supabase/migrations/20261008125500_project_source_comparison_v01.sql');
  assert.ok(m.includes('create table if not exists public.minds_project_source_comparisons'));
  assert.ok(m.includes('baseline_fingerprint text not null'));
  assert.ok(m.includes('unique(user_id,project_id,ingestion_id,baseline_fingerprint)'));
  assert.ok(m.includes("verdict in ('aligned','contradicts','modifies','adds','unclear')"));
  assert.ok(m.includes("'changes_claim_authority',false"));
  assert.ok(m.includes("'proposed'"));
  assert.ok(!m.includes("set status='confirmed'"));
  assert.ok(!m.includes("set status='disputed'"));
  assert.ok(!m.includes("set superseded_by"));
});

test('Build 84.3 compares only after source-first extraction and does not reread Source bytes',()=>{
  assert.ok(chat.includes('async function compareProjectSource'));
  assert.ok(chat.includes('comparison=await compareProjectSource'));
  assert.ok(chat.includes('compare_source_first_claims_against_project_baseline'));
  assert.ok(chat.includes('aligned = the new sourced proposition is materially compatible'));
  assert.ok(chat.includes('This is not authority confirmation.'));
  const start=chat.indexOf('async function compareProjectSource');
  const end=chat.indexOf('async function analyzeProjectSource',start);
  const block=chat.slice(start,end);
  assert.ok(block.includes('minds_project_source_ingestions'));
  assert.ok(block.includes('minds_work_claims'));
  assert.ok(block.includes('minds_commit_project_source_comparison'));
  assert.ok(!block.includes('.storage.from("minds-work").download'));
  assert.ok(!block.includes('minds_commit_project_source_extraction'));
});

test('Build 84.3 fails epistemically closed when baseline coverage is truncated',()=>{
  assert.ok(chat.includes('coverage.truncated&&!targetId&&verdict==="adds"'));
  assert.ok(chat.includes('verdict="unclear"'));
  assert.ok(chat.includes('baselineFingerprint=await sha256Hex'));
  assert.ok(chat.includes('comparison_is_inference:true'));
  assert.ok(chat.includes('changes_claim_authority:false'));
});

test('Build 84.3 exposes deliberate re-comparison without new authority',()=>{
  assert.ok(chat.includes('name:"compare_project_source"'));
  assert.ok(chat.includes('call.name==="compare_project_source"'));
  assert.ok(chat.includes('Compare one completed source-first ingestion against the current project Claim baseline.'));
});
