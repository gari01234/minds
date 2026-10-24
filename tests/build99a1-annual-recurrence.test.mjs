import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const P=require('../apps/isabella/time-plan-model.js');
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const ui=read('time-plan.js'),html=read('index.html'),sw=read('sw.js');
const event=(day,recurrence={text:'annual'},allDay=true)=>{
  const start=new Date(day+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
  return {client_key:'anniversary',starts_at:start.toISOString(),ends_at:end.toISOString(),all_day:allDay,recurrence,metadata:{}};
};
const localKey=iso=>P.dateKey(new Date(iso));

test('annual all-day events expand on their actual anniversary, not every day',()=>{
  const birthday=event('2026-10-08');
  const thisWeek=P.expandRecurrence([birthday],'2026-10-19','2026-10-23');
  assert.equal(thisWeek.unsupported,false);
  assert.equal(thisWeek.events.length,0);
  const next=P.expandRecurrence([birthday],'2027-10-07','2027-10-09');
  assert.equal(next.unsupported,false);
  assert.equal(next.events.length,1);
  assert.equal(localKey(next.events[0].starts_at),'2027-10-08');
  assert.equal(localKey(next.events[0].ends_at),'2027-10-09');
  assert.deepEqual(next.events[0].recurrence,{});
  assert.equal(birthday.recurrence.text,'annual');
});
test('two annual events do not prevent safe planning on unrelated dates',()=>{
  const events=[event('2026-10-08'),event('2026-10-13')];
  const expanded=P.expandRecurrence(events,'2026-10-19','2026-10-23');
  assert.equal(expanded.unsupported,false);
  assert.equal(expanded.events.length,0);
  const task={client_key:'t',start_date:'2026-10-19',due_date:'2026-10-23',metadata:{planning:{estimated_minutes:90}}};
  const result=P.suggest({task,events:expanded.events,today:'2026-10-19',
    now:new Date('2026-10-19T07:00:00')});
  assert.equal(result.reason,'ready');
  assert.equal(result.plannedMinutes,90);
});
test('an annual birthday within the scheduling window blocks that day',()=>{
  const expanded=P.expandRecurrence([event('2026-10-20')],'2026-10-19','2026-10-23');
  const task={client_key:'t',start_date:'2026-10-20',due_date:'2026-10-20',
    metadata:{planning:{estimated_minutes:60}}};
  const result=P.suggest({task,events:expanded.events,today:'2026-10-19',
    now:new Date('2026-10-19T07:00:00')});
  assert.equal(result.reason,'partial');
  assert.equal(result.slots.length,0);
  assert.equal(result.unplannedMinutes,60);
});
test('unknown recurrences, timed annual recurrences, and malformed dates abstain',()=>{
  assert.equal(P.expandRecurrence([event('2026-10-20',{text:'weekly'})],'2026-10-19','2026-10-23').unsupported,true);
  assert.equal(P.expandRecurrence([event('2026-10-20',{text:'annual'},false)],'2026-10-19','2026-10-23').unsupported,true);
  const bad=event('2026-10-20');bad.ends_at=bad.starts_at;
  assert.equal(P.expandRecurrence([bad],'2026-10-19','2026-10-23').unsupported,true);
});
test('Feb 29 does not silently slide an annual event into a nonleap year',()=>{
  const leap=event('2028-02-29');
  const upcoming=P.expandRecurrence([leap],'2029-02-27','2029-03-02');
  assert.equal(upcoming.unsupported,false);
  assert.equal(upcoming.events.length,0);
});
test('PWA pins, confirmation and original safety guards remain intact',()=>{
  assert.match(ui,/M\.expandRecurrence\(events\|\|\[\],today,until\)/);
  assert.match(ui,/if\(expanded\.unsupported\)/);
  assert.match(ui,/await window\.ISABELLA_SYNC_NOW\?\.\(\)/);
  assert.match(ui,/!M\.sameSlots\(slots,rebuilt\.slots\)/);
  assert.match(ui,/\.insert\(inserted\)\.select\('client_key'\)/);
  assert.match(sw,/isabella-shell-v165/);
  for(const pin of ['time-plan-model.js?v=2','time-plan.js?v=3']){
    assert.ok(html.includes(pin),'HTML '+pin);
    assert.ok(sw.includes(pin),'SW '+pin);
  }
});