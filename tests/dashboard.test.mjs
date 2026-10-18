import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const model=require('../apps/isabella/dashboard-model.js');

test('calendar grid uses 42 local days, Monday first, with stable month transitions',()=>{
  const days=model.monthCells('2026-10-18');
  assert.equal(days.length,42);
  assert.equal(days[0].key,'2026-09-28');
  assert.equal(days[41].key,'2026-11-08');
  assert.equal(model.monthShift('2026-10-31',1),'2026-11-01');
  assert.equal(model.addDays('2026-12-31',1),'2027-01-01');
  assert.equal(model.dateFromKey('2026-02-31'),null);
});
test('only actual due-date tasks appear, without inventing a time block',()=>{
  const state={tasks:[
    {id:'a',title:'A',date:'2026-10-19',sortOrder:20},
    {id:'c',title:'C',date:null},
    {id:'b',title:'B',date:'2026-10-19',sortOrder:10,done:true},
    {id:'d',title:'D',date:'2026-10-19',archivedAt:'2026-10-18T00:00Z'}
  ],events:[]};
  assert.deepEqual(model.tasksForDay(state,'2026-10-19').map(x=>x.id),['a','b']);
  assert.equal(model.timedEvents(state,'2026-10-19').length,0);
});
test('timeline derives positions exclusively from real timed events',()=>{
  const state={events:[
    {id:'timed',date:'2026-10-19',start:'09:00',duration:120},
    {id:'day',date:'2026-10-19',start:'10:00',duration:60,allDay:true},
    {id:'invalid',date:'2026-10-19',start:'11:00',duration:null},
    {id:'other',date:'2026-10-20',start:'14:00',duration:45}
  ]};
  const blocks=model.timedEvents(state,'2026-10-19',7,21);
  assert.equal(blocks.length,1);
  assert.equal(blocks[0].id,'timed');
  assert.equal(blocks[0].left,100*2/14);
  assert.equal(blocks[0].width,100*2/14);
});
test('workspace preferences reject unrecognized panels and impossible dimensions',()=>{
  const p=model.sanitizePreferences({focus:'plan',order:['today','today','nonsense'],
    minimized:['chat','calendar','plan','today'],width:9000,navCollapsed:true,selectedDate:'2026-02-31'});
  assert.equal(p.focus,'plan');
  assert.ok(!p.minimized.includes('plan'));
  assert.equal(p.width,460);
  assert.deepEqual(p.order,['today','calendar','plan']);
  assert.notEqual(p.selectedDate,'2026-02-31');
  assert.equal(p.navCollapsed,true);
});
test('untrusted task labels are escaped before insertion as HTML',()=>{
  assert.equal(model.escapeHtml('<img src=x onerror="a">'),
    '&lt;img src=x onerror=&quot;a&quot;&gt;');
});
