import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const read=x=>readFileSync(new URL('../apps/isabella/'+x,import.meta.url),'utf8');
const P=require('../apps/isabella/calendar-plan.js');
const taskDetail=read('task-detail.js'),team=read('task-team.js'),sync=read('sync.js');
const app=read('app.js'),work=read('work.js'),dashboard=read('dashboard.js'),html=read('index.html'),sw=read('sw.js');
const sql=readFileSync(new URL('../supabase/migrations/20261019225500_minds_task_team_allocations_v1.sql',import.meta.url),'utf8');

test('filter by either responsible on one and the same canonical task',()=>{
 const t={id:'canonical-task',title:'Grundriss 2OG',date:'2026-10-23',startDate:'2026-10-20',
   projectId:'schwarz',assigneePersonId:'a',assigneePersonIds:['a','b'],archivedAt:null};
 const state={tasks:[t]};
 assert.equal(P.qualifies(t,{personKey:'person:a'}),true);
 assert.equal(P.qualifies(t,{personKey:'person:b'}),true);
 assert.equal(P.qualifies(t,{personKey:'person:c'}),false);
 assert.equal(P.qualifies(t,{projectId:'bernried'}),false);
 const b=P.plan(state,'2026-10-19',1,{personKey:'person:b'});
 assert.equal(b.weeks[0].segments.length,1);
 assert.equal(b.weeks[0].segments[0].task,t);
 assert.equal(P.plan(state,'2026-10-19',1,{personKey:'person:c'}).weeks[0].segments.length,0);
});
test('team allocations are per person/day and never synthetic personal calendar events',()=>{
 assert.match(team,/minds_work_task_allocations/);
 assert.match(team,/onConflict:'task_id,person_id,work_date'/);
 assert.match(team,/planned_minutes/);
 assert.match(team,/No bloquea el calendario personal/);
 assert.match(sync,/teamAllocations=\(allocations\|\|\[\]\)\.map/);
 assert.match(sync,/taskId:taskKeys\.get\(a\.task_id\)/);
 assert.match(app,/nativePlanTeamAllocations/);
 assert.match(app,/min previstos/);
 assert.match(app,/minds-team-month-time/);
 assert.match(app,/filters\.personKey===/);
});
test('multiresponsibility uses atomic RPC, version check, stable person IDs',()=>{
 assert.match(team,/sb\.rpc\('minds_work_set_task_assignees'/);
 assert.match(team,/p_expected_updated_at:ctx\.task\.updated_at/);
 assert.match(team,/ctx\.teamIds=yes\(data\)/);
 assert.match(team,/data-team-person/);
 assert.match(team,/aria-pressed/);
 assert.match(taskDetail,/MINDS_TASK_TEAM\.selectorHtml\(ctx\)/);
 assert.match(taskDetail,/MINDS_TASK_TEAM\.allocationsHtml\(ctx\)/);
 assert.match(taskDetail,/await window\.MINDS_TASK_TEAM\.read\(task\.id\)/);
 assert.match(taskDetail,/assignee_person_id:null/);
 assert.match(taskDetail,/minds_work_set_task_assignees/);
 assert.match(work,/task\.assignee_person_ids/);
 assert.match(dashboard,/personIds\(entry\.task\)\.includes/);
});
test('database keeps strict owner RLS and membership provenance',()=>{
 assert.match(sql,/create table if not exists public\.minds_work_task_assignees/);
 assert.match(sql,/create table if not exists public\.minds_work_task_allocations/);
 assert.match(sql,/foreign key\(task_id,user_id\) references public\.isabella_tasks\(id,user_id\)/);
 assert.match(sql,/foreign key\(person_id,user_id\) references public\.isabella_people\(id,user_id\)/);
 assert.match(sql,/minds_work_project_people m/);
 assert.match(sql,/for select to authenticated using \(user_id=\(select auth\.uid\(\)\)\)/);
 assert.match(sql,/returns uuid\[\] language plpgsql security invoker/);
 assert.match(sql,/v_revision is distinct from p_expected_updated_at/);
 assert.match(sql,/Remove planned team days before unassigning this person/);
 assert.match(sql,/planned_minutes between 15 and 720/);
 assert.match(sql,/grant execute on function public\.minds_work_set_task_assignees/);
});
test('UI uses the existing task editor, no new team login, and respects one task',()=>{
 assert.match(team,/Horas previstas del equipo/);
 assert.match(team,/Planificación interna, sin horarios inventados/);
 assert.match(taskDetail,/if\(ctx\.teamIds\?\.length\)/);
 assert.match(taskDetail,/await sb\.rpc\('minds_work_set_task_assignees'/);
 assert.match(app,/data-team-task/);
 assert.match(sync,/assigneePersonIds:ids\.length\?ids/);
 assert.doesNotMatch(team,/signUp|inviteUser|sendEmail/);
});
test('PWA references matched files and versions',()=>{
 for(const path of ['task-team.js?v=1','task-team.css?v=1','app.js?v=126',
   'work.js?v=29','task-detail.js?v=3','sync.js?v=pwa38',
   'calendar-plan.js?v=2','dashboard.js?v=6']){
  assert.ok(html.includes(path),'HTML misses '+path);
  assert.ok(sw.includes(path),'SW misses '+path);
 }
 assert.match(sw,/isabella-shell-v161/);
 assert.ok(html.indexOf('task-team.js?v=1')<html.indexOf('task-detail.js?v=3'));
});