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
