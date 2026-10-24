import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const M=require('../apps/isabella/day-layout.js');
const get=x=>readFileSync(new URL('../apps/isabella/'+x,import.meta.url),'utf8');
const app=get('app.js'),tp=get('time-plan.js'),sw=get('sw.js'),html=get('index.html'),css=get('day-interactions.css');
const e=(id,start,duration)=>({id,start,duration});

test('events sharing real time use separate parallel columns and do not obscure one another',()=>{
 const lanes=M.layout([e('meeting','09:00',60),e('session','09:15',90),e('next','10:45',60)]);
 assert.equal(lanes.get('meeting').columns,2);
 assert.equal(lanes.get('session').columns,2);
 assert.notEqual(lanes.get('meeting').lane,lanes.get('session').lane);
 assert.equal(lanes.get('next').columns,1);
 assert.equal(lanes.get('next').lane,0);
 assert.equal(lanes.get('session').top,135);
 assert.equal(lanes.get('session').height,88);
});
test('adjacent sessions do not physically overlap; overlapping chains keep a stable width',()=>{
 const lanes=M.layout([e('a','09:00',15),e('b','09:15',60),e('c','09:45',60)]);
 assert.equal(lanes.get('a').height,13);
 assert.equal(lanes.get('a').columns,1);
 assert.equal(lanes.get('b').columns,2);
 assert.equal(lanes.get('c').columns,2);
});
test('time labels and malformed events never crash layout',()=>{
 assert.equal(M.clock('09:15'),555);
 assert.equal(M.clock('24:00'),null);
 const lanes=M.layout([e('invalid','bad',60),e('ok','11:00',30),e('zero','10:00',0)]);
 assert.equal(lanes.size,1);
 assert.equal(lanes.get('ok').columns,1);
});
test('one click approves the time plan, no extra native confirmation',()=>{
 assert.doesNotMatch(tp,/window\.confirm\('¿Reservar '/);
 assert.match(tp,/explicit 'Reservar N sesiones' button is the user's authorization/);
 assert.match(tp,/const fresh=await readSnapshot\(ctx\.taskId\)/);
 assert.match(tp,/\.insert\(inserted\)\.select\('client_key'\)/);
});
test('resizing sessions updates original event, not task or guessed worked time',()=>{
 assert.match(app,/function bindDayResize\(\)/);
 assert.match(app,/pointerdown/);
 assert.match(app,/pointermove/);
 assert.match(app,/Math\.round\(\(original\+event\.clientY-startY\)\/15\)\*15/);
 assert.match(app,/async function resizeDayEvent\(clientKey,duration\)/);
 assert.match(app,/\.from\('isabella_events'\)/);
 assert.match(app,/\.eq\('updated_at',row\.updated_at\)/);
 assert.match(app,/ends_at:end\.toISOString\(\)/);
 assert.match(app,/window\.ISABELLA_SYNC_PULL_NOW/);
 assert.match(css,/day-resize-handle/);
});
test('dragging a multiday task is already authorization; toast offers Undo',()=>{
 const from=app.indexOf('async function nativePlanChangeDates(');
 const until=app.indexOf('function renderCalendar()',from);
 const segment=app.slice(from,until);
 assert.ok(from>0&&until>from);
 assert.doesNotMatch(segment,/window\.confirm/);
 assert.match(segment,/nativePlanToast\(label/);
 assert.match(segment,/undoPatch/);
 assert.match(segment,/updated_at/);
 assert.match(css,/minds-calendar-toast/);
});
test('PWA loads layout before app and updates all asset versions',()=>{
 for(const file of ['day-layout.js?v=1','day-interactions.css?v=1','app.js?v=129','time-plan.js?v=3']){
  assert.ok(sw.includes(file),'sw '+file);assert.ok(html.includes(file),'html '+file);
 }
 assert.ok(html.indexOf('day-layout.js?v=1')<html.indexOf('app.js?v=129'));
 assert.match(sw,/isabella-shell-v165/);
});