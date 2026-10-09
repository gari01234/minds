import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const work=read('apps/isabella/work.js');
const css=read('apps/isabella/app.css');
function slice(start,end){
  const a=work.indexOf(start),b=work.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Expected Work function boundary: '+start);
  return work.slice(a,b).trim();
}
test('90.6 Work retains uncluttered drag interaction and canonical Work ordering',()=>{
  const card=slice('function taskCard(t){','async function hydratePlannerImages(');
  assert.match(card,/draggable="true"/);
  assert.match(work,/card\.ondragstart=/);
  assert.match(work,/bucket\.ondrop=/);
  assert.match(work,/work_sort_order:\(i\+1\)\*10/);
  assert.doesNotMatch(card,/data-work-move|work-task-move-controls/);
  assert.doesNotMatch(work,/data-work-move|moveWorkTaskByButton/);
  assert.doesNotMatch(css,/work-task-move-controls/);
});
test('90.6 Desktop file uploads disclose a mixed result instead of hiding errors',async()=>{
  const statuses=[],removed=[],registered=[],uploads=[];
  const sb={
    storage:{from:()=>({
      upload:async(path,file)=>{uploads.push(file.name);return {error:file.name==='bad.pdf'?new Error('upload refused'):null}},
      remove:async(paths)=>{removed.push(...paths);return{error:null}}
    })},
    from:()=>({insert:async(row)=>{registered.push(row.name);return{error:row.name==='metadata.docx'?new Error('metadata refused'):null}}})
  };
  let renderCount=0;
  const fn=vm.runInNewContext('('+slice('async function uploadFiles(list){','async function openFile(')+')',{
    getSession:async()=>({user:{id:'owner'}}),project:{id:'project',client_key:'bernried'},
    folderId:null,sb,setStatus:msg=>statuses.push(msg),safeName:s=>s,sourceKind:()=> 'document',
    renderDesktop:async()=>{renderCount++},Date,Math
  });
  await fn(['good.pdf','bad.pdf','metadata.docx'].map(name=>({name,type:'application/pdf',size:12})));
  assert.equal(renderCount,1);
  assert.deepEqual(uploads,['good.pdf','bad.pdf','metadata.docx']);
  assert.deepEqual(registered,['good.pdf','metadata.docx']);
  assert.equal(removed.length,1,'Unregistered storage object is rolled back');
  assert.match(statuses.at(-1),/1 archivo registrado; 2 sin guardar:/);
  assert.match(statuses.at(-1),/bad\.pdf/);
  assert.match(statuses.at(-1),/metadata\.docx/);
});
test('90.6 successful Desktop upload produces an explicit saved receipt',async()=>{
  let last='';
  const fn=vm.runInNewContext('('+slice('async function uploadFiles(list){','async function openFile(')+')',{
    getSession:async()=>({user:{id:'owner'}}),project:{id:'project',client_key:'bernried'},folderId:null,
    sb:{storage:{from:()=>({upload:async()=>({error:null})})},from:()=>({insert:async()=>({error:null})})},
    setStatus:msg=>{last=msg},safeName:s=>s,sourceKind:()=> 'document',renderDesktop:async()=>{},Date,Math
  });
  await fn([{name:'plan.pdf',type:'application/pdf',size:32}]);
  assert.match(last,/1 archivo guardado en Desktop/);
});
