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
function makeCards(ids){
  const list={dataset:{workListBucket:'bucket-bernried'},cards:[]};
  list.insertBefore=(card,before)=>{
    const old=list.cards.indexOf(card);if(old>=0)list.cards.splice(old,1);
    const index=list.cards.indexOf(before);
    list.cards.splice(index<0?list.cards.length:index,0,card);
  };
  for(const id of ids){
    const card={dataset:{workTask:id},matches:selector=>selector==='[data-work-task]',
      closest:selector=>selector==='[data-work-task-list]'?list:null};
    Object.defineProperties(card,{
      previousElementSibling:{get(){return list.cards[list.cards.indexOf(this)-1]||null}},
      nextElementSibling:{get(){return list.cards[list.cards.indexOf(this)+1]||null}}
    });
    list.cards.push(card);
  }
  const button=(id,direction)=>({
    dataset:{workMove:direction},
    closest:selector=>selector==='[data-work-task]'?list.cards.find(c=>c.dataset.workTask===id):null
  });
  return {list,button,ids:()=>list.cards.map(c=>c.dataset.workTask)};
}
test('90.6 explicit keyboard/touch order moves canonical Work list, not calendar order',async()=>{
  const events=[];
  const fn=vm.runInNewContext('('+slice('async function moveWorkTaskByButton(button){','async function persistWorkTaskOrder(')+')',{
    persistWorkTaskOrder:async(id,bucket,list)=>events.push({id,bucket,ids:list.cards.map(c=>c.dataset.workTask)})
  });
  const {list,button,ids}=makeCards(['a','b','c']);
  assert.equal(await fn(button('b','up')),true);
  assert.deepEqual(ids(),['b','a','c']);
  assert.equal(await fn(button('b','down')),true);
  assert.deepEqual(ids(),['a','b','c']);
  assert.equal(await fn(button('c','down')),false);
  assert.equal(events.length,2);
  assert.deepEqual(events[0],{id:'b',bucket:'bucket-bernried',ids:['b','a','c']});
  assert.match(work,/work_sort_order:\(i\+1\)\*10/);
  assert.doesNotMatch(slice('async function moveWorkTaskByButton(button){','async function addBucket('),/\bsort_order\s*:/);
  assert.match(work,/data-work-move="up"/);
  assert.match(work,/data-work-move="down"/);
  assert.match(work,/\$\$\('\[data-work-move\]'\)\.forEach/);
  assert.match(css,/work-task-move-controls/);
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
