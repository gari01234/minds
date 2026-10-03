import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261003112450_expectation_engine_v01.sql');
const heartbeat=read('supabase/functions/isabella-heartbeat/index.ts');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const shell=read('apps/isabella/shell.js');

test('Build 76 models expectations separately from tasks commitments and standing intents',()=>{
  assert.ok(migration.includes('create table public.minds_expectations'));
  assert.ok(migration.includes("expectation_type in ('reply','delivery','decision','document','external_event','other')"));
  assert.ok(migration.includes("status in ('active','due_unconfirmed','fulfilled','missed','cancelled')"));
  assert.ok(migration.includes("observability in ('manual')"));
  assert.ok(!migration.includes('references public.isabella_tasks'));
  assert.ok(!migration.includes('references public.minds_commitments'));
  assert.ok(!migration.includes('references public.minds_standing_intents'));
});

test('Build 76 keeps absence of evidence distinct from confirmed failure',()=>{
  assert.ok(migration.includes("case when v_due<=now() then 'due_unconfirmed' else 'active' end"));
  assert.ok(migration.includes("if e.status<>'due_unconfirmed' or e.due_at>now() then raise exception 'Expectation is not due'"));
  assert.ok(heartbeat.includes('Todavía no tengo confirmación de que haya ocurrido.'));
  assert.ok(heartbeat.includes('status:"due_unconfirmed"'));
  assert.ok(!heartbeat.includes('status:"missed"'));
  assert.ok(!heartbeat.includes("status:'missed'"));
});

test('Build 76 requires explicit reviewed mutation and preserves receipts',()=>{
  assert.ok(migration.includes('create table public.minds_expectation_reviews'));
  assert.ok(migration.includes('previous_due_at timestamptz not null'));
  assert.ok(migration.includes('next_due_at timestamptz null'));
  assert.ok(migration.includes('v_previous_due:=e.due_at'));
  assert.ok(migration.includes('p_confirmed is distinct from true'));
  assert.ok(migration.includes('unique(user_id,request_id)'));
  assert.ok(migration.includes('revoke all on public.minds_expectations from anon,authenticated'));
  assert.ok(migration.includes('grant select on public.minds_expectations to authenticated'));
  assert.ok(!migration.includes('grant insert on public.minds_expectations to authenticated'));
  assert.ok(!migration.includes('grant update on public.minds_expectations to authenticated'));
});

test('Build 76 keeps privileged review behind private functions and invoker wrappers',()=>{
  assert.ok(migration.includes('create or replace function minds_private.create_expectation'));
  assert.ok(migration.includes('create or replace function minds_private.review_expectation'));
  assert.ok(migration.includes('security definer set search_path=\'\''));
  const createWrapper=migration.slice(migration.indexOf('create or replace function public.minds_create_expectation'),migration.indexOf('create or replace function public.minds_review_expectation'));
  const reviewWrapper=migration.slice(migration.indexOf('create or replace function public.minds_review_expectation'),migration.indexOf('revoke all on function minds_private.expectation_due_at'));
  assert.ok(createWrapper.includes('language sql set search_path=\'\''));
  assert.ok(reviewWrapper.includes('language sql set search_path=\'\''));
  assert.ok(!createWrapper.includes('security definer'));
  assert.ok(!reviewWrapper.includes('security definer'));
});

test('Build 76 routes due expectations through Attention Economy without hard interruption',()=>{
  assert.ok(migration.includes("when 'expectation_due' then v_route:='ambient';v_reason:='expectation_due'"));
  assert.ok(migration.includes('Algo que esperabas alcanzó su fecha límite y todavía no está confirmado.'));
  assert.ok(heartbeat.includes('event_type:"expectation_due"'));
  assert.ok(heartbeat.includes('fingerprint:`expectation_due:${e.id}:${e.due_at}`'));
  assert.ok(heartbeat.includes('.in("event_type",["overdue_digest","upcoming_event","routine_failure","expectation_due"])'));
});

test('Build 76 proposal semantics distinguish the four kinds of future state',()=>{
  assert.ok(chat.includes('name:"propose_expectation"'));
  assert.ok(chat.includes('This is NOT a task for the user, NOT a situation-triggered standing reminder, and NOT a Commitment.'));
  assert.ok(chat.includes('kind:"expectation"'));
  assert.ok(chat.includes('active_expectations:expectations||[]'));
  assert.ok(chat.includes('Ausencia de confirmación no significa que el hecho no ocurrió.'));
  assert.ok(chat.includes('propose_expectation:"confirm"'));
});

test('Build 76 integrates expectations into Future Memory instead of a new top-level surface',()=>{
  assert.ok(app.includes("p.kind==='expectation'"));
  assert.ok(app.includes("rpc('minds_create_expectation'"));
  assert.ok(app.includes("rpc('minds_review_expectation'"));
  assert.ok(app.includes('Expectativas con fecha'));
  assert.ok(app.includes('Recordatorios por situación'));
  assert.ok(app.includes('Pendiente de comprobar'));
  assert.ok(app.includes('Sí, ocurrió'));
  assert.ok(app.includes('No ocurrió'));
  assert.ok(shell.includes('data-action="intents">Memoria futura'));
  assert.ok(!shell.includes('data-nav="expectations"'));
  assert.ok(!shell.includes('data-action="expectations"'));
});
