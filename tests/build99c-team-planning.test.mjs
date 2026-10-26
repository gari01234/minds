import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const read=x=>readFileSync(new URL('../apps/isabella/'+x,import.meta.url),'utf8');
const P=require('../apps/isabella/calendar-plan.js');
const taskDetail=read('task-detail.js'),team=read('task-team.js'),sync=read('sync.js');
const app=read('app.js'),work=read('work.js'),dashboard=read('dashboard.js'),html=read('index.html'),sw=read('sw.js');
const sql=readFileSync(new URL('../supabase/migrations/20261023083324_minds_task_team_allocations_v1.sql',import.meta.url),'utf8');

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
 assert.match(taskDetail,/await window\.MINDS_TASK_TEAM\.read\(task\.id,task\.assignee_person_id\)/);
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
 for(const path of ['task-team.js?v=1','task-team.css?v=1','app.js?v=130',
   'work.js?v=30','task-detail.js?v=4','sync.js?v=pwa39',
   'calendar-plan.js?v=2','dashboard.js?v=7']){
  assert.ok(html.includes(path),'HTML misses '+path);
  assert.ok(sw.includes(path),'SW misses '+path);
 }
 assert.match(sw,/isabella-shell-v167/);
 assert.ok(html.indexOf('task-team.js?v=1')<html.indexOf('task-detail.js?v=4'));
});

test('project membership is referentially enforced for primary and secondary assignees',()=>{
 assert.match(sql,/project_id uuid not null/);
 assert.match(sql,/foreign key\(project_id,person_id\) references public\.minds_work_project_people\(project_id,person_id\) on delete restrict/);
 assert.match(sql,/where t\.id=new\.task_id and t\.user_id=new\.user_id and t\.project_id=new\.project_id/);
 assert.match(sql,/minds_work_task_assignees_membership_idx on public\.minds_work_task_assignees\(project_id,person_id\)/);
 assert.match(sql,/insert into public\.minds_work_task_assignees\(task_id,person_id,project_id,user_id\)/);
 assert.match(sql,/select p_task_id,p,v_project,v_owner from unnest\(v_ids\)/);
 // Allocations may never be cascade-deleted by a direct unassignment.
 assert.match(sql,/foreign key\(task_id,person_id\) references public\.minds_work_task_assignees\(task_id,person_id\)\s+on delete no action deferrable initially deferred/);
 assert.match(sql,/foreign key\(task_id,user_id\) references public\.isabella_tasks\(id,user_id\) on delete cascade/);
 assert.match(read('work-team.js'),/re\.code==='23503'/);
});

test('reading team rows preserves the authoritative primary and deterministic secondary order',async()=>{
 const vm=await import('node:vm');
 const responses={
  minds_work_task_assignees:[
   {person_id:'third',created_at:'2026-10-20T15:00:00Z'},
   {person_id:'secondary',created_at:'2026-10-19T10:00:00Z'},
   {person_id:'primary',created_at:'2026-10-21T10:00:00Z'}
  ],
  minds_work_task_allocations:[{person_id:'secondary',work_date:'2026-10-23',planned_minutes:120}]
 };
 const calls=[];
 const sb={from(table){
  const q={
   select(){return q},eq(){return q},
   order(field){calls.push([table,field]);return q},
   then(resolve,reject){return Promise.resolve({data:responses[table]||[],error:null}).then(resolve,reject)}
  };
  return q;
 }};
 const ctx={window:{MINDS_SUPABASE:sb},document:{}};
 vm.runInNewContext(team,ctx);
 const readTeam=ctx.window.MINDS_TASK_TEAM.read;
 const result=await readTeam('canonical-task','primary');
 assert.deepEqual(Array.from(result.ids),['primary','secondary','third']);
 assert.equal(result.allocations.length,1);
 assert.deepEqual(Array.from((await readTeam('canonical-task')).ids),['secondary','third','primary']);
 assert.deepEqual(Array.from((await readTeam('canonical-task','unknown')).ids),['secondary','third','primary']);
 assert.ok(calls.some(([table,col])=>table==='minds_work_task_assignees'&&col==='created_at'));
 assert.match(taskDetail,/MINDS_TASK_TEAM\.read\(task\.id,task\.assignee_person_id\)/);
 assert.match(team,/read\(ctx\.task\.id,ctx\.task\.assignee_person_id\)/);
});


test('Work and calendar sync retain the same primary-first order for any database row order',async()=>{
 const vm=await import('node:vm');
 const people=[
  {person_id:'secondary',created_at:'2026-10-19T13:00:00Z'},
  {person_id:'primary',created_at:'2026-10-21T09:00:00Z'},
  {person_id:'third',created_at:'2026-10-20T09:00:00Z'}
 ];
 const extractTeamOrder=src=>{
  const start=src.indexOf('  const teamIdsFor=(links,primary)=>{');
  const end=src.indexOf('\n  };',start);
  assert.ok(start>=0&&end>start,'Missing deterministic responsible ordering');
  return vm.runInNewContext('('+src.slice(start,end+4).trim().replace(/^const teamIdsFor=/,'')+')');
 };
 for(const src of [work,sync]){
  const fn=extractTeamOrder(src);
  assert.deepEqual(Array.from(fn(people,'primary')),['primary','secondary','third']);
  assert.deepEqual(Array.from(fn([...people].reverse(),'primary')),['primary','secondary','third']);
  assert.deepEqual(Array.from(fn(people,'missing')),['secondary','third','primary']);
 }
 assert.match(work,/\.select\('task_id,person_id,created_at'\)/);
 assert.match(sync,/\.select\('task_id,person_id,created_at'\)/);
 assert.match(work,/teamIdsFor\(\(links\|\|\[\]\)\.filter/);
 assert.match(sync,/teamIdsFor\(assignedByTask\.get\(t\.id\)\|\|\[\],t\.assignee_person_id\)/);
 assert.match(dashboard,/const primary=task\.assigneePersonId;/);
});
