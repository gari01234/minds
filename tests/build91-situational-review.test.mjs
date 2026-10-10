import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {
  SITUATIONAL_REVIEW_VERSION,localClock,dayOffset,eligibleTasks,eligibleToReview,
  weatherProof,validateReview,reviewFingerprint,reviewMessage,evaluateReviewDecision,calendarDays,verifyAlternative,planProposalText
} from '../supabase/functions/_shared/situational-review.mjs';
import {runSituationalReview} from '../supabase/functions/_shared/situational-review-runner.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const task={id:'11111111-1111-4111-8111-111111111111',title:'Podar los arbustos',due_date:'2026-10-10',updated_at:'2026-10-10T08:00:00Z'};
const clock={date:'2026-10-10',hour:18,time:'18:00'};
const weather=weatherProof({location:'Landsberg am Lech, Bayern',observed_at:'2026-10-10T16:00:00Z',condition:'lluvia',precipitation_mm:1.5,today_forecast:'lluvia 85%'});
const proposal={propose:true,task_id:task.id,reason:'La tarea de exterior sigue abierta y la estación configurada indica lluvia.',suggestion:'¿Quieres que compruebe el próximo fin de semana y te proponga otra fecha?',evidence:['task','weather'],time_sensitive:true};

test('Build 91: time-zone local clock, inclusive day range and bounded cadence',()=>{
  assert.deepEqual(localClock('Europe/Berlin',new Date('2026-10-10T16:00:00Z')),clock);
  assert.equal(dayOffset('2026-10-10',2),'2026-10-12');
  assert.equal(eligibleTasks([task,{id:'x',due_date:'2026-10-13'}],'2026-10-10').length,1);
  assert.equal(eligibleToReview(clock,[task]),true);
  assert.equal(eligibleToReview({...clock,hour:22},[task]),false);
});

test('Build 91: material weather opportunity is grounded, but never edits the task',()=>{
  const result=validateReview(proposal,{clock,tasks:[task],events:[],weather});
  assert.ok(result);
  assert.equal(result.timeSensitive,true);
  assert.equal(result.task.id,task.id);
  assert.match(reviewMessage(result,weather),/Landsberg am Lech/);
  assert.match(reviewMessage(result,weather),/quieres/i);
  assert.equal(reviewFingerprint(result,clock,weather),reviewFingerprint(result,clock,weather));
  assert.equal(task.due_date,'2026-10-10');
});

test('Build 91: unsupported or unconfirmed evidence is rejected',()=>{
  const base={clock,tasks:[task],events:[],weather:null};
  assert.equal(validateReview(proposal,base),null,'no weather source');
  assert.equal(validateReview({...proposal,task_id:'unknown'},{...base,weather}),null,'invented task');
  assert.equal(validateReview({...proposal,evidence:['task']},{...base,weather}),null,'mere pending task');
  assert.equal(validateReview({...proposal,evidence:['task','calendar']},{...base,weather}),null,'calendar not available');
  assert.equal(validateReview({...proposal,propose:false},{...base,weather}),null,'model explicitly abstained');
  assert.equal(validateReview({...proposal,evidence:['task','time'],time_sensitive:true},{...base,clock:{...clock,hour:13}})?.timeSensitive,false);
});

test('Build 91: ordinary contextual review stays non-urgent',()=>{
  const value=validateReview({...proposal,evidence:['task','calendar'],time_sensitive:true},
    {clock,tasks:[task],events:[{id:'evt',starts_at:null}],weather:null});
  assert.ok(value);
  assert.equal(value.timeSensitive,false);
});

test('Build 91: skipped server review cannot call AI or publish',async()=>{
  const sb={from:()=>{throw Error('no DB call allowed outside review hours')}};
  const r=await runSituationalReview(sb,'one','Europe/Berlin',new Date('2026-10-10T22:00:00Z'),
    ()=>{throw Error('must not publish')});
  assert.deepEqual(r,{status:'skipped',reason:'outside_review_hours'});
});

test('Build 91: Heartbeat owns review clock and uses approved Attention Economy',()=>{
  const heartbeat=read('supabase/functions/isabella-heartbeat/index.ts');
  const runner=read('supabase/functions/_shared/situational-review-runner.mjs');
  const migration=read('supabase/migrations/20261010173000_situational_review_attention_v01.sql');
  const config=read('supabase/config.toml');
  assert.ok(heartbeat.includes('runSituationalReview(sb,userId,routineTz,now'));
  assert.ok(heartbeat.includes('situational_review:situationalReview'));
  assert.ok(runner.includes('feature:"situational_review"'));
  assert.ok(runner.includes('3*3600000'));
  assert.ok(runner.includes('proposal_only'));
  assert.ok(runner.includes('publish({'));
  assert.ok(runner.includes('status:review?"proposed":"nothing_material"'));
  assert.ok(runner.includes('decision:"proposal_only"'));
  assert.ok(!runner.includes('.update({due_date:'));
  assert.ok(migration.includes("when 'situational_review' then"));
  assert.ok(migration.includes("v_route:=case when p_candidate->>'urgency'='urgent' then 'interrupt' else 'ambient' end"));
  assert.ok(migration.includes("when 'contextual_reassessment'"));
  assert.ok(config.includes('[functions.isabella-heartbeat]\nverify_jwt = false'));
  assert.equal(SITUATIONAL_REVIEW_VERSION,'situational-review-v0.2');
});

test('Build 91.1: explain abstention vs rejected evidence without recording hidden reasoning',()=>{
  const ctx={clock,tasks:[task],events:[],weather};
  assert.deepEqual(evaluateReviewDecision({propose:false},ctx),
    {status:'abstained',reason_code:'model_abstained',review:null});
  assert.equal(evaluateReviewDecision({...proposal,evidence:['task']},ctx).reason_code,'insufficient_evidence');
  assert.equal(evaluateReviewDecision({...proposal,task_id:'bad'},ctx).reason_code,'unverified_task');
  assert.equal(evaluateReviewDecision(proposal,ctx).status,'accepted');
  const runner=read('supabase/functions/_shared/situational-review-runner.mjs');
  assert.ok(runner.includes('decision_code:decision.reason_code'));
  assert.ok(runner.includes('evidence_used:review?.anchors'));
  assert.ok(!runner.includes('raw_model_output:'));
});

test('Build 91.2: a candidate is checked against recorded calendar only',()=>{
  const ctx={clock,tasks:[task],events:[],weather};
  const review=evaluateReviewDecision(proposal,ctx).review;
  const events=[{id:'a',starts_at:'2026-10-11T12:00:00+02:00'}];
  const days=calendarDays(clock,events,'Europe/Berlin',14);
  assert.equal(days.length,14);
  assert.equal(days[0].date,'2026-10-11');
  assert.equal(days[0].registered_event_starts,1);
  assert.equal(verifyAlternative({alternative_date:'2026-10-11'},review,days),null);
  const option=verifyAlternative({alternative_date:'2026-10-17'},review,days);
  assert.deepEqual(option,{date:'2026-10-17',scope:'registered_events_only',registered_event_starts:0});
  assert.match(planProposalText(review,weather,option),/no garantiza disponibilidad total/);
  assert.match(planProposalText(review,weather,option),/¿Quieres que cambie/);
  assert.equal(verifyAlternative({alternative_date:'2026-11-21'},review,days),null);
});
