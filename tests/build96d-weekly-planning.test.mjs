import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const M=require('../apps/isabella/dashboard-model.js');
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const dashboard=read('dashboard.js'),css=read('dashboard-week.css');
const html=read('index.html'),sw=read('sw.js');

test('week is a Monday-to-Sunday local calendar span across month and year',()=>{
  assert.equal(M.weekStart('2026-10-19'),'2026-10-19');
  assert.equal(M.weekStart('2026-10-25'),'2026-10-19');
  assert.equal(M.weekStart('2027-01-01'),'2026-12-28');
  assert.equal(M.weekStart('nonsense'),'');
  assert.deepEqual(M.weeklyPlan({},'invalid').days,[]);
});

const task=(id,date,startDate,more={})=>({
  id,title:id,date,startDate,projectId:'bernried',done:false,archivedAt:null,
  assigneePersonId:null,assignee:null,...more
});
const session=(id,taskId,date,start='09:00')=>({
  id,title:'Old title',date,start,duration:45,projectId:'bernried',
  metadata:{kind:'task_work_session_v1',task_client_key:taskId}
});

test('one multi-day canonical task has one row and several independently editable sessions',()=>{
  const main=task('taskA','2026-10-22','2026-10-19',{assigneePersonId:'person-uuid',assignee:'Persona'});
  const other=task('taskB','2026-10-23',null);
  const idle=task('undated',null,null);
  const overdue=task('late','2026-10-15',null);
  const openEnded=task('open-ended',null,'2026-10-12');
  const later=task('later','2026-11-05',null);
  const foreign=task('schwarz-task','2026-10-20',null,{projectId:'schwarz'});
  const completed=task('completed','2026-10-22',null,{done:true});
  const e1=session('session1','taskA','2026-10-19');
  const e2=session('session2','taskA','2026-10-21','14:00');
  const e3=session('completed-session','completed','2026-10-20');
  const orphan=session('orphan','missing','2026-10-22');
  const meeting={id:'meeting',title:'TWP meeting',date:'2026-10-19',start:'10:00',projectId:'bernried',metadata:{kind:'meeting'}};
  const state={tasks:[main,other,idle,overdue,openEnded,later,foreign,completed],
    events:[e1,e2,e3,orphan,meeting]};
  const w=M.weeklyPlan(state,'2026-10-21','bernried');
  assert.equal(w.start,'2026-10-19');
  assert.equal(w.end,'2026-10-25');
  assert.deepEqual(w.rows.map(r=>r.task.id),['taskA','taskB']);
  assert.equal(w.rows[0].cells.filter(c=>c.inWindow).length,4);
  assert.equal(w.rows[0].cells[0].begins,true);
  assert.equal(w.rows[0].cells[3].due,true);
  assert.deepEqual(w.rows[0].cells.flatMap(c=>c.sessions.map(e=>e.id)),['session1','session2']);
  assert.equal(w.rows[0].task,main);
  assert.deepEqual(w.unscheduled.map(r=>r.task.id).sort(),['open-ended','undated']);
  assert.deepEqual(w.overdue.map(r=>r.task.id),['late']);
  assert.deepEqual(w.events.map(e=>e.id),['meeting','completed-session','orphan']);
  assert.equal(state.tasks.length,8);
});

test('tasks with sessions outside their due day remain a single task, even without dates',()=>{
  const a=task('unplanned',null,null),due=task('one-day','2026-10-22',null);
  const state={tasks:[a,due],events:[session('a1','unplanned','2026-10-20'),session('a2','unplanned','2026-10-23'),
    session('d1','one-day','2026-10-19')]};
  const w=M.weeklyPlan(state,'2026-10-19');
  assert.deepEqual(w.rows.map(r=>r.task.id),['one-day','unplanned']);
  assert.equal(w.unscheduled.length,0);
  assert.equal(w.rows[1].noDates,true);
  assert.equal(w.rows[0].cells[0].sessions.length,1);
  assert.equal(w.rows[0].cells[3].inWindow,true);
  assert.equal(w.events.length,0);
});

test('invalid start and delivery dates never fabricate an interval',()=>{
  const wrong=task('wrong','2026-10-20','2026-10-23');
  const w=M.weeklyPlan({tasks:[wrong],events:[]},'2026-10-19');
  assert.equal(w.rows[0].invalid,true);
  assert.equal(w.rows[0].cells.filter(c=>c.inWindow).length,1);
  assert.equal(w.rows[0].cells[1].due,true);
});

test('view preserves stable person keys, filters and explicit booking actions',()=>{
  const pref=M.sanitizePreferences({...M.defaultPreferences(),planMode:'week',planProject:'schwarz',
    planPerson:'person:member-id',planGrouping:'person'});
  assert.equal(pref.planMode,'week');
  assert.equal(pref.planProject,'schwarz');
  assert.equal(pref.planPerson,'person:member-id');
  assert.equal(pref.planGrouping,'person');
  assert.equal(M.sanitizePreferences({planMode:'wrong',planGrouping:'wrong'}).planMode,'day');
  assert.match(dashboard,/M\.weeklyPlan\(state,prefs\.selectedDate,projectId\)/);
  assert.match(dashboard,/task\.assigneePersonId\?'person:'/);
  assert.match(dashboard,/data-desk-week-book/);
  assert.match(dashboard,/planTaskSession\?\.\(button\.dataset\.deskWeekBook,date\)/);
  assert.match(dashboard,/data-desk-week-project/);
  assert.match(dashboard,/data-desk-week-person/);
  assert.match(dashboard,/data-desk-week-group/);
  assert.match(dashboard,/MINDS_SUPABASE/);
  assert.match(css,/desk-week-scroll/);
  assert.match(css,/desk-week-cell\.is-window/);
});

test('PWA updates model, interface and stylesheet as one cached release',()=>{
  for(const asset of ['dashboard-model.js?v=5','dashboard.js?v=5','dashboard-week.css?v=1']){
    assert.ok(html.includes(asset),asset+' missing in HTML');
    assert.ok(sw.includes(asset),asset+' missing in SW');
  }
  assert.match(sw,/isabella-shell-v159/);
});
