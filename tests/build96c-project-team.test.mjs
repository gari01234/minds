import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const team=read('work-team.js'),work=read('work.js'),sync=read('sync.js');
const html=read('index.html'),sw=read('sw.js');
const sql=readFileSync(new URL('../supabase/migrations/20261019115157_minds_work_project_team_v01.sql',import.meta.url),'utf8');

test('project team is owner-scoped and structurally linked, without coworker logins',()=>{
  assert.match(sql,/create table public\.minds_work_project_people/);
  assert.match(sql,/foreign key \(project_id,user_id\) references public\.isabella_projects\(id,user_id\)/);
  assert.match(sql,/foreign key \(person_id,user_id\) references public\.isabella_people\(id,user_id\)/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/for select to authenticated/);
  assert.match(sql,/for insert to authenticated/);
  assert.match(sql,/for update to authenticated/);
  assert.match(sql,/for delete to authenticated/);
  assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/foreign key \(project_id,assignee_person_id\)/);
  assert.match(sql,/references public\.minds_work_project_people\(project_id,person_id\)/);
  assert.doesNotMatch(sql,/create\s+(role|user)|auth\.users\s*insert|invite_user|send_email/i);
});

test('person records are reusable across projects and sorted by current name',async()=>{
  const calls=[];
  const sb={from(table){
    if(table==='minds_work_project_people')return {
      select(fields){assert.equal(fields,'person_id');return{
        async eq(key,value){calls.push(['membership',key,value]);return {data:[{person_id:'idB'},{person_id:'idA'}],error:null}}
      }}
    };
    if(table==='isabella_people')return{
      select(fields){assert.equal(fields,'id,name');return{
        async in(key,ids){calls.push(['people',key,...ids]);return{data:[{id:'idB',name:'Zoe'},{id:'idA',name:'Anna'}],error:null}}
      }}
    };
    throw new Error('Unknown table '+table);
  }};
  const context={window:{MINDS_SUPABASE:sb},document:{querySelector(){return null},querySelectorAll(){return []}}};
  vm.runInNewContext(team,context);
  const got=await context.window.MINDS_WORK_TEAM.members('bernried-id');
  assert.deepEqual(JSON.parse(JSON.stringify(got)),[{id:'idA',name:'Anna'},{id:'idB',name:'Zoe'}]);
  assert.deepEqual(calls[0],['membership','project_id','bernried-id']);
  assert.equal(calls[1][0],'people');
});

test('Work preserves legacy names and writes validated person ID only on explicit selection',()=>{
  assert.match(work,/data-work-team/);
  assert.match(work,/MINDS_WORK_TEAM\.members\(project\.id\)/);
  assert.match(work,/assignee_person_id/);
  assert.match(work,/selectedPerson==='__legacy__'/);
  assert.match(work,/assignee:chosen\?\.name\|\|oldAssignee,assignee_person_id:chosen\?\.id\|\|null/);
  assert.match(work,/Aus Bestand:/);
  assert.match(sync,/assigneePersonId:t\.assignee_person_id\|\|null/);
  const rowStart=sync.indexOf('function taskRow(t,maps){'),rowEnd=sync.indexOf('\nfunction eventRow(',rowStart);
  assert.ok(rowStart>0&&rowEnd>rowStart);
  assert.doesNotMatch(sync.slice(rowStart,rowEnd),/assignee_person_id\s*:/);
  assert.match(team,/Keine Einladung, kein MINDS-Zugang/);
});

test('PWA installs the private team UI before Work with matching cache pins',()=>{
  assert.ok(html.indexOf('work-team.js?v=1')<html.indexOf('work.js?v=29'));
  for(const asset of ['work-team.js?v=1','work.js?v=29','work-team.css?v=1','sync.js?v=pwa39']){
    assert.ok(html.includes(asset),'HTML: '+asset);
    assert.ok(sw.includes(asset),'SW: '+asset);
  }
  assert.match(sw,/isabella-shell-v164/);
});
