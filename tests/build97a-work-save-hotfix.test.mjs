import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=n=>readFileSync(new URL('../apps/isabella/'+n,import.meta.url),'utf8');
const work=read('work.js'),html=read('index.html'),sw=read('sw.js');

test('Work saveTask can enumerate an empty checklist and persist an update',async()=>{
  assert.match(work,/const checklist=\$\$\('\.work-check-row'\)\.map\(/);
  const start=work.indexOf('async function saveTask(existing){');
  const end=work.indexOf('\nasync function loadThreads(){',start);
  assert.ok(start>0&&end>start,'saveTask function must be extractable');
  let updatePayload=null,updatedId=null,closed=false,rerendered=false;
  const elements={
    '#workTaskTitle':{value:'Actualización real'},
    '#workTaskStatus':{value:'not_started'},
    '#workTaskBucket':{value:''},
    '#workTaskAssignee':{value:''},
    '#workTaskPriority':{value:'normal'},
    '#workTaskStart':{value:'2026-10-19'},
    '#workTaskDue':{value:'2026-10-23'},
    '#workTaskLabels':{value:'TGA'},
    '#workTaskNotes':{value:'Notas reales'}
  };
  const ctx={
    $:key=>elements[key]||null,
    $$:()=>[],
    team:[],tasks:[],project:{id:'project-uuid'},
    pendingTaskFiles:[],editingAttachments:[],
    sb:{from(table){assert.equal(table,'isabella_tasks');return{
      update(row){updatePayload=row;return{async eq(key,value){assert.equal(key,'id');updatedId=value;return{error:null}}}}
    }}},
    window:{ISABELLA_APP:{closeModal(){closed=true}},ISABELLA_SYNC_PULL_NOW:async()=>true},
    renderPlanner:async()=>{rerendered=true},setStatus:msg=>{throw new Error(msg)},setTimeout:()=>{}
  };
  vm.runInNewContext(work.slice(start,end),ctx);
  await vm.runInNewContext('saveTask({id:"task-uuid",work_bucket_id:null,work_sort_order:10})',ctx);
  assert.equal(updatedId,'task-uuid');
  assert.equal(updatePayload.title,'Actualización real');
  assert.deepEqual(JSON.parse(JSON.stringify(updatePayload.checklist)),[]);
  assert.equal(updatePayload.start_date,'2026-10-19');
  assert.equal(updatePayload.due_date,'2026-10-23');
  assert.equal(closed,true);
  assert.equal(rerendered,true);
});
test('PWA serves fixed Work save module with rotated cache',()=>{
  assert.match(html,/work\.js\?v=28/);
  assert.match(sw,/work\.js\?v=28/);
  assert.match(sw,/isabella-shell-v157/);
});