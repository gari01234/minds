import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
test('Work never calls array iteration on a single-element selector',()=>{
  const invalid=[...source.matchAll(/(?<!\$)\$\('[^']+'\)\.forEach\(/g)];
  assert.deepEqual(invalid,[],'Use $$ (querySelectorAll) for each collection');
});
test('Planner initializes Bucket action menu when querySelector returns a normal DOM element',async()=>{
  const start=source.indexOf('async function renderPlanner(){');
  const end=source.indexOf('async function toggleTask(',start);
  assert.ok(start>=0&&end>start,'Render boundary missing');
  const planner=source.slice(start,end).trim();
  const body={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],onclick:null,onkeydown:null};
  const ctx={
    loadPlanner:async()=>{},team:[],project:{id:'project'},tasks:[],
    buckets:[{id:'first',name:'Entwurf',sort_order:10},{id:'second',name:'Ausführungsplanung',sort_order:20}],
    localStorage:{getItem:()=>null},
    WORK_MOBILE_LAYOUT_KEY:'test-mobile-layout',
    window:{MINDS_WORK_TEAM:{members:async()=>[]}},
    $:selector=>selector==='#workBody'?body:null,
    $$:()=>[],
    esc:str=>String(str),workIcon:()=>'',taskCard:()=>'',hydratePlannerImages:async()=>{},
    console
  };
  const run=vm.runInNewContext('('+planner+')',ctx);
  await run();
  assert.match(body.innerHTML,/data-work-rename-bucket="first"/);
  assert.match(body.innerHTML,/data-work-archive-bucket="second"/);
  assert.match(body.innerHTML,/data-work-bucket-handle="first"/);
  assert.equal(typeof body.onclick,'function');
  assert.equal(typeof body.onkeydown,'function');
});
