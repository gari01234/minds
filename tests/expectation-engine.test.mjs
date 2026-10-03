import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const v01=read('supabase/migrations/20261003112450_expectation_engine_v01.sql');
const reconcile=read('supabase/migrations/20261003113300_expectation_engine_v01.sql');
const ambient=read('supabase/migrations/20261003113506_expectation_engine_v011_ambient_due.sql');
const singleDetector=read('supabase/migrations/20261003113943_expectation_engine_v012_heartbeat_single_detector.sql');
const heartbeat=read('supabase/functions/isabella-heartbeat/index.ts');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');
const shell=read('apps/isabella/shell.js');

test('Build 76 models Expectations separately from tasks commitments and standing intents',()=>{
  assert.ok(v01.includes('create table public.minds_expectations'));
  assert.ok(v01.includes("expectation_type in ('reply','delivery','decision','document','external_event','other')"));
  assert.ok(v01.includes("observability in ('manual')"));
  assert.ok(!v01.includes('references public.isabella_tasks'));
  assert.ok(!v01.includes('references public.minds_commitments'));
  assert.ok(!v01.includes('references public.minds_standing_intents'));
});

test('Build 76 reconciles the interrupted schema to explicit not_occurred semantics',()=>{
  assert.ok(reconcile.includes('rename column missed_at to not_occurred_at'));
  assert.ok(reconcile.includes("status in ('active','due_unconfirmed','fulfilled','not_occurred','cancelled')"));
  assert.ok(reconcile.includes("decision in ('fulfilled','not_occurred','cancel','reschedule')"));
  assert.ok(reconcile.includes("resolution_source is null or resolution_source in ('user','observable_source')"));
  assert.ok(reconcile.includes("if e.status<>'due_unconfirmed' or e.due_at>now() then raise exception 'Expectation is not due and unconfirmed'"));
  assert.ok(reconcile.includes("set status='not_occurred',not_occurred_at=now()"));
  assert.ok(reconcile.includes("resolution_source='user'"));
});

test('Build 76 never infers failure from a deadline',()=>{
  assert.ok(heartbeat.includes('status:"due_unconfirmed"'));
  assert.ok(heartbeat.includes('Todavía no tengo confirmación de que haya ocurrido.'));
  assert.ok(!heartbeat.includes('status:"not_occurred"'));
  assert.ok(!heartbeat.includes("status:'not_occurred'"));
  assert.ok(!heartbeat.includes('not_occurred_at'));
  assert.ok(app.includes('Pendiente de comprobar'));
  assert.ok(app.includes('La fecha ya llegó, pero MINDS no sabe todavía si ocurrió.'));
});

test('Build 76 requires explicit reviewed mutation and durable receipts',()=>{
  assert.ok(v01.includes('create table public.minds_expectation_reviews'));
  assert.ok(v01.includes('previous_due_at timestamptz not null'));
  assert.ok(v01.includes('next_due_at timestamptz null'));
  assert.ok(reconcile.includes('p_confirmed is distinct from true'));
  assert.ok(reconcile.includes('pg_advisory_xact_lock'));
  assert.ok(v01.includes('unique(user_id,request_id)'));
  assert.ok(reconcile.includes('revoke all on public.minds_expectations from anon,authenticated'));
  assert.ok(reconcile.includes('grant select on public.minds_expectations to authenticated'));
  assert.ok(!reconcile.includes('grant insert on public.minds_expectations to authenticated'));
  assert.ok(!reconcile.includes('grant update on public.minds_expectations to authenticated'));
});

test('Build 76 keeps privileged mutation behind private functions and invoker wrappers',()=>{
  assert.ok(reconcile.includes('create or replace function minds_private.create_expectation'));
  assert.ok(reconcile.includes('create or replace function minds_private.review_expectation'));
  assert.ok(reconcile.includes('security definer'));
  const createWrapper=reconcile.slice(reconcile.indexOf('create or replace function public.minds_create_expectation'),reconcile.indexOf('create or replace function public.minds_review_expectation'));
  const reviewWrapper=reconcile.slice(reconcile.indexOf('create or replace function public.minds_review_expectation'),reconcile.indexOf('grant usage on schema minds_private'));
  assert.ok(createWrapper.includes('language sql'));
  assert.ok(reviewWrapper.includes('language sql'));
  assert.ok(!createWrapper.includes('security definer'));
  assert.ok(!reviewWrapper.includes('security definer'));
});

test('Build 76 routes due expectations through existing Heartbeat and Attention Economy',()=>{
  assert.ok(v01.includes("when 'expectation_due' then v_route:='ambient';v_reason:='expectation_due'"));
  assert.ok(v01.includes('Algo que esperabas alcanzó su fecha límite y todavía no está confirmado.'));
  assert.ok(heartbeat.includes('event_type:"expectation_due"'));
  assert.ok(heartbeat.includes('expectation_due:'));
  assert.ok(heartbeat.includes('.in("event_type",["overdue_digest","upcoming_event","routine_failure","expectation_due"])'));
  assert.ok(heartbeat.includes('.in("status",["active","due_unconfirmed"])'));
  assert.ok(singleDetector.includes("cron.unschedule('minds-expectation-sweep')"));
  assert.ok(singleDetector.includes('drop function if exists minds_private.sweep_expectations()'));
});

test('Build 76 production history records ambient uncertainty before consolidating on Heartbeat',()=>{
  assert.ok(ambient.includes("'event_type','expectation_due'"));
  assert.ok(ambient.includes("'requires_user',false"));
  assert.ok(ambient.includes("'epistemic_state','unknown'"));
});

test('Build 76 proposal semantics distinguish the four kinds of future state',()=>{
  assert.ok(chat.includes('name:"propose_expectation"'));
  assert.ok(chat.includes('This is NOT a task for the user, NOT a situation-triggered standing reminder, and NOT a Commitment.'));
  assert.ok(chat.includes('kind:"expectation"'));
  assert.ok(chat.includes('active_expectations:expectations||[]'));
  assert.ok(chat.includes('Ausencia de confirmación no significa que el hecho no ocurrió.'));
  assert.ok(chat.includes('propose_expectation:"confirm"'));
});

test('Build 76 integrates Expectations into Future Memory instead of a new top-level surface',()=>{
  assert.ok(app.includes("p.kind==='expectation'"));
  assert.ok(app.includes("rpc('minds_create_expectation'"));
  assert.ok(app.includes("rpc('minds_review_expectation'"));
  assert.ok(app.includes('Expectativas con fecha'));
  assert.ok(app.includes('Recordatorios por situación'));
  assert.ok(app.includes("status==='not_occurred'?'No ocurrió'"));
  assert.ok(app.includes('data-expectation-decision="not_occurred">No ocurrió'));
  assert.ok(!app.includes('data-expectation-decision="missed"'));
  assert.ok(app.includes('not_occurred_at'));
  assert.ok(shell.includes('data-action="intents">Memoria futura'));
  assert.ok(!shell.includes('data-nav="expectations"'));
  assert.ok(!shell.includes('data-action="expectations"'));
});
