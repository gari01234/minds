import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {
  SITUATIONAL_REVIEW_VERSION,localClock,dayOffset,eligibleTasks,eligibleToReview,
  weatherProof,validateReview,reviewFingerprint,reviewMessage
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
  assert.equal(SITUATIONAL_REVIEW_VERSION,'situational-review-v0.1');
});
