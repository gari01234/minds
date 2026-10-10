import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const work=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
const start=work.indexOf('async function renderOverview(){');
const end=work.indexOf('const knowledgeStates=',start);
assert.ok(start>=0&&end>start);

test('Work Panorama binds all buttons and does not throw on successful source reads',async()=>{
  const body={classList:{add(){}},innerHTML:''};
  const go=[{dataset:{workGo:'planner'}},{dataset:{workGo:'desktop'}}],task=[{dataset:{workEditTask:'uuid'}}];
  const q=table=>({select(){return this},eq(){return this},is(){return this},in(){return this},order(){return this},limit(){return Promise.resolve({data:table==='isabella_tasks'?[{id:'uuid',title:'Revisar Grundriss'}]:[],count:table==='minds_work_files'?5:null,error:null})}});
  const ctx={
    project:{id:'bernried',name:'Bernried'},view:'overview',projectModelSnapshot:null,
    sb:{from:q,rpc:async()=>({data:{},error:null})},
    $:selector=>selector==='#workBody'?body:null,
    $$:selector=>selector==='[data-work-go]'?go:selector==='[data-work-edit-task]'?task:[],
    esc:x=>String(x),projectModelPanel:()=>'<div>Model</div>',
    window:{ISABELLA_APP:{openCanonicalTaskById:()=>{}}},
    document:{querySelector:()=>({click(){}})}
  };
  const fn=vm.runInNewContext('('+work.slice(start,end).trim()+')',ctx);
  await fn();
  assert.match(body.innerHTML,/Panorama de Bernried/);
  assert.match(body.innerHTML,/Revisar Grundriss/);
  assert.ok(go.every(x=>typeof x.onclick==='function'));
  assert.ok(task.every(x=>typeof x.onclick==='function'));
});
