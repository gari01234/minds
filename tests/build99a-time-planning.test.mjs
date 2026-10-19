import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const P=require('../apps/isabella/time-plan-model.js');
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const ui=read('time-plan.js'),detail=read('task-detail.js'),html=read('index.html'),sw=read('sw.js');
const date='2026-10-19';
const now=new Date('2026-10-19T07:00:00');
const task=(minutes=360,from=date,to='2026-10-23')=>({
  id:'db-uuid',client_key:'canonical-task',title:'Grundrisse',
  start_date:from,due_date:to,
  metadata:{planning:{estimated_minutes:minutes}}
});
const event=(key,day,start,duration,other={})=>{
  const a=new Date(day+'T'+start+':00');
  return {client_key:key,starts_at:a.toISOString(),ends_at:new Date(a.getTime()+duration*60000).toISOString(),...other};
};
const suggest=(t,events=[],settings={})=>
  P.suggest({task:t,events,settings:{...P.defaults(),...settings},today:date,now});

test('Build 99A proposes multiple blocks without writing, duplicating, or redefining tasks',()=>{
  const t=task();
  const result=suggest(t);
  assert.equal(result.reason,'ready');
  assert.equal(result.plannedMinutes,360);
  assert.equal(result.unplannedMinutes,0);
  assert.deepEqual(result.slots.map(s=>[s.date,s.start,s.duration]),[
    ['2026-10-19','09:00',90],['2026-10-19','10:30',90],
    ['2026-10-20','09:00',90],['2026-10-20','10:30',90]
  ]);
  assert.equal(t.metadata.planning.estimated_minutes,360);
  assert.ok(!('slots' in t));
});

test('appointments and prior task sessions are excluded; booked work is not actual worked time',()=>{
  const meetings=[
    event('meeting','2026-10-19','09:00',60),
    event('reserved','2026-10-19','11:30',60,
      {metadata:{kind:'task_work_session_v1',task_client_key:'canonical-task'}})
  ];
  const result=suggest(task(240),meetings,{block:60,dailyCap:120});
  assert.equal(result.alreadyReservedMinutes,60);
  assert.equal(result.plannedMinutes,180);
  assert.equal(result.unplannedMinutes,0);
  for(const slot of result.slots){
    const start=slot.startsMs,end=slot.endsMs;
    for(const meeting of meetings){
      const a=Date.parse(meeting.starts_at),b=Date.parse(meeting.ends_at);
      assert.ok(start>=b||a>=end,'proposed block must never overlap '+meeting.client_key);
    }
  }
  assert.equal(result.reason,'ready');
});

test('all-day commitments block planning windows and weekend exclusion is the default',()=>{
  const booked=event('all-day','2026-10-19','00:00',24*60,{all_day:true});
  const got=suggest(task(180),[booked],{block:90,dailyCap:180});
  assert.ok(got.slots.every(s=>s.date!=='2026-10-19'));
  const weekend=P.suggest({task:task(60,'2026-10-24','2026-10-25'),events:[],
    settings:P.defaults(),today:'2026-10-24',now:new Date('2026-10-24T07:00:00')});
  assert.equal(weekend.reason,'partial');
  assert.equal(weekend.slots.length,0);
  assert.equal(weekend.unplannedMinutes,60);
});

test('a missing estimate, missing deadline and impossible interval abstain',()=>{
  assert.equal(suggest(task(0)).reason,'missing_estimate');
  assert.equal(suggest({...task(),due_date:null}).reason,'missing_deadline');
  assert.equal(suggest(task(120,'2026-10-26','2026-10-23')).reason,'inconsistent_dates');
  assert.equal(suggest(task(120,'2026-10-01','2026-10-12')).reason,'overdue');
  assert.equal(suggest(task(120,'2026-10-19','2027-05-10')).reason,'horizon_too_long');
  assert.equal(suggest(task(60),[],{from:'18:00',until:'09:00'}).reason,'invalid_hours');
});

test('only remaining estimated work is proposed, not fabricated capacity',()=>{
  const old=event('already','2026-10-19','09:00',180,
    {metadata:{kind:'task_work_session_v1',task_client_key:'canonical-task'}});
  const complete=suggest(task(150),[old]);
  assert.equal(complete.reason,'already_reserved');
  assert.equal(complete.slots.length,0);
  const full=event('busy','2026-10-19','00:00',5*24*60);
  const noSpace=suggest(task(240),[full]);
  assert.equal(noSpace.reason,'partial');
  assert.equal(noSpace.unplannedMinutes,240);
  assert.equal(noSpace.slots.length,0);
});

test('re-evaluation detects changed slots, including a newly conflicting meeting',()=>{
  const original=suggest(task(90));
  const changed=suggest(task(90),[event('new','2026-10-19','09:00',90)]);
  assert.equal(P.sameSlots(original.slots,changed.slots),false);
  assert.equal(P.sameSlots(original.slots,original.slots),true);
  assert.equal(P.sameSlots(original.slots,[]),false);
});

test('UI requires direct approval, checks remote schedule twice, writes one atomic batch',()=>{
  assert.doesNotMatch(ui,/window\.confirm\('¿Reservar '/);
  assert.match(ui,/const flushed=await window\.ISABELLA_SYNC_NOW\?\.\(\)/);
  assert.match(ui,/if\(\(events\|\|\[\]\)\.some\(e=>!M\.rangeMs\(e\)\)\)/);
  assert.match(ui,/const fresh=await readSnapshot\(ctx\.taskId\)/);
  assert.match(ui,/!M\.sameSlots\(slots,rebuilt\.slots\)/);
  assert.match(ui,/\.insert\(inserted\)\.select\('client_key'\)/);
  assert.match(ui,/await window\.ISABELLA_SYNC_PULL_NOW\?\.\(\)/);
  assert.match(ui,/seen!==keys\.size/);
  assert.match(ui,/origin:'isabella_time_planning_v1',approval:'user_confirmed'/);
  assert.match(ui,/No se pudo confirmar/);
  assert.match(ui,/M\.expandRecurrence\(events\|\|\[\],today,until\)/);
  assert.match(ui,/tu calendario personal/);
  assert.doesNotMatch(ui,/\.update\(\{.*assignee_person_id/);
});

test('unified task editor routes to proposed blocks only after pending saves complete',()=>{
  assert.match(detail,/id="taskDetailPropose"/);
  assert.match(detail,/await ctx\.queue/);
  assert.match(detail,/if\(ctx\.blocked\)/);
  assert.match(detail,/MINDS_TIME_PLANNING\.open\(\{taskId:ctx\.task\.id\}\)/);
});

test('PWA includes model, UI, CSS and matching task-detail/cache version',()=>{
  for(const asset of ['time-plan-model.js?v=2','time-plan.js?v=3','time-plan.css?v=1','task-detail.js?v=2']){
    assert.ok(html.includes(asset),'HTML misses '+asset);
    assert.ok(sw.includes(asset),'service worker misses '+asset);
  }
  assert.ok(html.indexOf('time-plan-model.js?v=2')<html.indexOf('time-plan.js?v=3'));
  assert.match(sw,/isabella-shell-v160/);
});