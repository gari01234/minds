import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
function extract(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing boundary '+start);
  return source.slice(a,b).trim();
}
const loadPlannerSource=extract('async function loadPlanner(){','function localIso(){');
const persistSource=extract('async function persistWorkTaskOrder(','async function addBucket(');

test('90.6 Planner canonical query has a stable UUID tie-break after Work and calendar sort',async()=>{
  const requests=[];
  const dataset=[
    {id:'task-b',work_sort_order:10,sort_order:10,work_bucket_id:null,assignee_person_id:'legacy-b'},
    {id:'task-a',work_sort_order:10,sort_order:10,work_bucket_id:null},
    {id:'task-c',work_sort_order:20,sort_order:10,work_bucket_id:null}
  ];
  const linked=[{task_id:'task-a',person_id:'person-a'}, {task_id:'task-a',person_id:'person-b'}];
  const builder=table=>{
    const fields=[],filters=[];
    const q={
      select(){return q},
      eq(){return q},
      is(){return q},
      in(column,values){filters.push({column,values});return q},
      order(column,options){fields.push([column,options]);return q},
      then(resolve,reject){
        requests.push({table,fields,filters});
        if(table==='minds_work_buckets')return Promise.resolve({data:[{id:'bucket',sort_order:10}],error:null}).then(resolve,reject);
        if(table==='minds_work_task_assignees'){
          const ids=filters.find(f=>f.column==='task_id')?.values||[];
          return Promise.resolve({data:linked.filter(l=>ids.includes(l.task_id)),error:null}).then(resolve,reject);
        }
        assert.equal(table,'isabella_tasks');
        const sorted=[...dataset].sort((a,b)=>a.work_sort_order-b.work_sort_order||a.sort_order-b.sort_order||a.id.localeCompare(b.id));
        return Promise.resolve({data:sorted,error:null}).then(resolve,reject);
      }
    };
    return q;
  };
  const ctx={sb:{from:builder},project:{id:'bernried'},buckets:[],tasks:[],DEFAULT_BUCKETS:[]};
  const fn=vm.runInNewContext('('+loadPlannerSource+')',ctx);
  await fn();
  assert.deepEqual(requests.filter(r=>r.table==='isabella_tasks')[0].fields.map(x=>x[0]),
    ['work_sort_order','sort_order','id']);
  assert.deepEqual(ctx.tasks.map(x=>x.id),['task-a','task-b','task-c']);
  assert.equal(ctx.tasks[0].work_sort_order,10);
  assert.deepEqual(ctx.tasks[0].assignee_person_ids,['person-a','person-b']);
  assert.deepEqual(ctx.tasks[1].assignee_person_ids,['legacy-b']);
  assert.deepEqual(ctx.tasks[2].assignee_person_ids,[]);
  const teamRequest=requests.find(r=>r.table==='minds_work_task_assignees');
  assert.deepEqual(teamRequest.filters,[{column:'task_id',values:['task-a','task-b','task-c']}]);
});

test('90.6 stable ordering never modifies task records or merges Work order with calendar order',()=>{
  assert.doesNotMatch(loadPlannerSource,/\.update\(|\.insert\(\{.*work_sort_order/s);
  assert.match(persistSource,/work_sort_order:\(i\+1\)\*10/);
  assert.doesNotMatch(persistSource,/^\s*sort_order\s*:/m);
  assert.match(source,/card\.ondragstart=/);
  assert.doesNotMatch(source,/data-work-move="up"|data-work-move="down"/);
});
