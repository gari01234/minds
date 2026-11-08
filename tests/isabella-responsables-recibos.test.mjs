// 08.11.2026, from Gari's chat: (1) asked whether tomorrow's tasks were all his, Isabella said no assignee
// was recorded while Work showed Yvonne and Antonia; (2) after he confirmed a card, she kept saying the
// change was pending, because the receipt never reached the conversation she reads.
// Neutral fixtures: the repository is public.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {taskResponsibles,responsibleField} from '../supabase/functions/_shared/task-responsibles.mjs';
import {ISABELLA_CORE,isabellaCoreInstructions} from '../supabase/functions/_shared/isabella-core.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function fakeSb(tables){
  const calls=[];
  return {calls,from(table){
    const q={table,filters:[]};calls.push(q);
    const chain={select(){return chain},in(c,v){q.filters.push(['in',c,v]);return chain},eq(c,v){q.filters.push(['eq',c,v]);return chain},limit(){return chain},
      then(ok,bad){let rows=(tables[table]||[]).slice();for(const [op,c,v] of q.filters)rows=rows.filter(r=>op==='in'?v.includes(r[c]):r[c]===v);
        return Promise.resolve({data:rows,error:null}).then(ok,bad)}};
    return chain;
  }};
}

test('Who carries each task: assignee text, main person and team, without duplicates',async()=>{
  const sb=fakeSb({
    minds_work_task_assignees:[{task_id:'t2',person_id:'p1',user_id:'u'},{task_id:'t2',person_id:'p2',user_id:'u'},{task_id:'t3',person_id:'p1',user_id:'other'}],
    isabella_people:[{id:'p1',name:'Persona Uno',user_id:'u'},{id:'p2',name:'Persona Dos',user_id:'u'}]
  });
  const rows=[{id:'t1',assignee:'Persona Uno'},{id:'t2',assignee_person_id:'p1'},{id:'t3'},{id:'t4'}];
  const map=await taskResponsibles(sb,rows,{userId:'u'});
  assert.deepEqual(map.get('t1'),['Persona Uno']);
  assert.deepEqual(map.get('t2'),['Persona Uno','Persona Dos']);
  assert.equal(map.has('t3'),false,'a service client only sees the owner\'s rows');
  assert.deepEqual(responsibleField(map,rows[3]),{},'nobody assigned: no field');
  assert.deepEqual(responsibleField(map,rows[0]),{responsable:['Persona Uno']});
  assert.ok(sb.calls.every(c=>c.filters.some(([op,col,v])=>op==='eq'&&col==='user_id'&&v==='u')));
  assert.equal((await taskResponsibles({from(){throw new Error('down')}},rows)).size,0,'never blocks the agenda');
});

test('The agenda, search_calendar and the brief carry it; the model knows what it means',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(chat,/notes,priority,start_date,assignee,assignee_person_id"\)\n\s+\.is\("completed_at",null\)/);
  assert.match(chat,/const responsibles=await taskResponsibles\(sb,taskQ\.data\|\|\[\]\);/);
  assert.match(chat,/\.\.\.\(who\?\.length\?\{responsable:who\}:\{\}\)/);
  assert.match(chat,/const responsibles=await taskResponsibles\(sb,\[\.\.\.\(tasks\|\|\[\]\),\.\.\.\(openBefore\|\|\[\]\)\]\);/);
  assert.match(chat,/reminder_time:x\.reminder_time,\.\.\.who\(x\)\}\)\)/);
  const routine=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(routine,/taskResponsibles\(sb,\[\.\.\.\(rawTasks\|\|\[\]\),\.\.\.overdueRows\],\{userId:routine\.user_id\}\)/);
  assert.match(routine,/Distingue lo de Gari de lo que lleva su equipo\./);
  const fn=n=>({type:'function',name:n});
  assert.match(isabellaCoreInstructions({tools:[fn('search_calendar')]}),/responsable = quién la lleva en Work; sin ese campo no hay nadie asignado\./);
});

test('A receipt joins the conversation Isabella reads, in the scope of the turn it answers',()=>{
  const app=read('apps/isabella/app.js');
  const begin=app.indexOf('function latestExposureScope(){'),end=app.indexOf('// Step 3a: Isabella\'s answer to a browser turn has a key');
  const scope={version:1,kind:'project',ref:'p-1',key:'project:p-1'};
  const state={messages:[{id:'u1',role:'user',text:'Mueve la tarea',metadata:{exposure_scope:scope}},{id:'a1',role:'assistant',text:'Propuesta…',metadata:{exposure_scope:scope,author:'system'}}]};
  const said=[];
  const ctx={state,say:(role,text,meta)=>{const m={id:'r1',role,text,metadata:meta.metadata};said.push(m);return m}};
  vm.runInNewContext(app.slice(begin,end),ctx);
  const receipt=ctx.sayEvent('La tarea queda para el miércoles.');
  assert.equal(receipt.metadata.author,'system');
  assert.equal(JSON.stringify(receipt.metadata.exposure_scope),JSON.stringify(scope));
  assert.notEqual(receipt.metadata.exposure_scope,scope,'a copy, not the same object');
  // sync.js only pushes scoped messages: this one now goes to the server.
  const sync=read('apps/isabella/sync.js');
  const s0=sync.indexOf('function scopedTurnReady(message){'),s1=sync.indexOf('async function pushConversation(');
  const sctx={};vm.runInNewContext(sync.slice(s0,s1),sctx);
  assert.equal(sctx.scopedTurnReady(receipt),true);
  // With no scoped message yet, nothing is invented.
  const empty={state:{messages:[]},say:(r,t,m)=>({role:r,text:t,metadata:m.metadata})};
  vm.runInNewContext(app.slice(begin,end),empty);
  assert.equal(empty.sayEvent('Guardado.').metadata.exposure_scope,undefined);
  assert.ok(ISABELLA_CORE.includes('Si después de una propuesta hay un aviso de que se guardó, ya está hecha: no digas que falta confirmarla.'));
});
