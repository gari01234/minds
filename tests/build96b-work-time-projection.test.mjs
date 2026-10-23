import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const sync=read('sync.js'),html=read('index.html'),sw=read('sw.js'),work=read('work.js');

function projection(t,categoryPairs=[],projectPairs=[]){
  const start=sync.indexOf('function projectTaskRow(t,catKey,projKey){');
  const end=sync.indexOf('\nasync function pullState(',start);
  assert.ok(start>0&&end>start);
  const ctx={t,catKey:new Map(categoryPairs),projKey:new Map(projectPairs)};
  vm.runInNewContext(sync.slice(start,end),ctx);
  return JSON.parse(JSON.stringify(vm.runInNewContext('projectTaskRow(t,catKey,projKey)',ctx)));
}

test('Work fields remain readable in Tiempo without claiming another task identity',()=>{
  const raw={id:'database-id',client_key:'canonical-client-id',title:'Fassadenschnitte',
    due_date:'2026-10-22',start_date:'2026-10-19',assignee:'Persona A',
    category_id:'cat-id',project_id:'project-id',priority:'high',
    work_status:'in_progress',work_bucket_id:'bucket-id',work_sort_order:20,
    labels:['fase-3'],checklist:[{id:'one',text:'Comprobar',done:false}],
    attachments:[{path:'private/attachment.pdf'}],links:[{url:'https://example.org'}],
    metadata:{planning:{estimated_minutes:720}},updated_at:'2026-10-19T09:00:00Z'};
  const out=projection(raw,[['cat-id','trabajo']],[['project-id','bernried']]);
  assert.equal(out.id,'canonical-client-id');
  assert.equal(out.projectId,'bernried');
  assert.equal(out.startDate,'2026-10-19');
  assert.equal(out.date,'2026-10-22');
  assert.equal(out.assignee,'Persona A');
  assert.equal(out.workStatus,'in_progress');
  assert.equal(out.workBucketId,'bucket-id');
  assert.equal(out.workSortOrder,20);
  assert.deepEqual(out.labels,['fase-3']);
  assert.equal(out.checklist[0].text,'Comprobar');
  assert.equal(out.attachments[0].path,'private/attachment.pdf');
  assert.deepEqual(out.links,[{url:'https://example.org'}]);
  assert.equal(out.metadata.planning.estimated_minutes,720);
  assert.equal(out.updatedAt,raw.updated_at);
});

test('missing advanced data stays explicitly unassigned, undated and zero-order',()=>{
  const out=projection({id:'db-id',title:'Sin plan',due_date:null,assignee:null,start_date:null});
  assert.equal(out.id,'db-id');
  assert.equal(out.assignee,null);
  assert.equal(out.startDate,null);
  assert.equal(out.workBucketId,null);
  assert.equal(out.workSortOrder,0);
  assert.deepEqual(out.attachments,[]);
  assert.deepEqual(out.checklist,[]);
  assert.deepEqual(out.labels,[]);
});

test('native writes remain intentionally limited to native fields',()=>{
  const start=sync.indexOf('function taskRow(t,maps){'),end=sync.indexOf('\nfunction eventRow(',start);
  assert.ok(start>=0&&end>start);
  const nativeWrite=sync.slice(start,end);
  for(const column of ['assignee','start_date','work_status','work_bucket_id','work_sort_order','labels','checklist','attachments','links']){
    assert.ok(!new RegExp('\\b'+column+'\\s*:').test(nativeWrite),'Native writes must not overwrite '+column);
  }
  assert.match(work,/assignee:chosen\?\.name\|\|oldAssignee,assignee_person_id:chosen\?\.id\|\|null/);
  assert.match(sync,/projectTaskRow\(t,catKey,projKey\)/);
});

test('the updated PWA caches a matching Work/Time bridge',()=>{
  assert.ok(html.includes('sync.js?v=pwa38'));
  assert.ok(sw.includes('sync.js?v=pwa38'));
  assert.ok(sw.includes('isabella-shell-v162'));
});
