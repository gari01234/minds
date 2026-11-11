// 07.11.2026, Gari: asked what was pending tomorrow, Isabella (like Romy in Office) left out a task
// that was overdue and still open. Tomorrow, and any other day, now include what is still open from before.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leanConversationContext,LIGHT_CONVERSATION_INSTRUCTIONS} from '../supabase/functions/_shared/light-conversation-context.mjs';
import {createWindowTools} from '../supabase/functions/_shared/window-tools.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=(read('supabase/functions/isabella-chat/index.ts')+read('supabase/functions/_shared/isabella-tools.mjs'));

test('Server agenda: still_open_before_tomorrow (overdue or due today, open) reaches every route', ()=>{
  assert.match(chat,/const openBeforeTomorrow=tasks\.filter\(\(x:any\)=>x\.date&&x\.date<tomorrowDate\)/);
  assert.match(chat,/\.map\(\(x:any\)=>\(\{\.\.\.x,overdue:x\.date<currentDate\}\)\);/);
  assert.match(chat,/still_open_before_tomorrow:openBeforeTomorrow\.slice\(0,40\),/);
  assert.match(chat,/still_open_before_tomorrow:canonicalAgenda\.status==="ok"\?\(canonicalAgenda\.still_open_before_tomorrow\|\|\[\]\):\[\],/);
  assert.match(chat,/still_open_before_tomorrow:\(canonicalAgenda\.still_open_before_tomorrow\|\|\[\]\)\.slice\(0,16\),/);
  assert.match(chat,/nunca digas que no hay nada pendiente para mañana si esa lista no está vacía/);
  const lean=leanConversationContext({still_open_before_tomorrow:[{id:'t',title:'Test',date:'2026-11-04',overdue:true}],secret:1});
  assert.deepEqual(lean.still_open_before_tomorrow,[{id:'t',title:'Test',date:'2026-11-04',overdue:true}]);
  assert.ok(LIGHT_CONVERSATION_INSTRUCTIONS.includes('Lo que venció antes y sigue abierto'));
});

test('search_calendar: include_open_before lists overdue open tasks for another day', ()=>{
  assert.match(chat,/include_open_before:\{type:"boolean"\}/);
  assert.match(chat,/args\?\.include_open_before===true&&/);
  assert.match(chat,/\.is\("completed_at",null\)\.is\("archived_at",null\)\n\s*\.lt\("due_date",from\)/);
  assert.match(chat,/open_before:\(openBefore\|\|\[\]\)\.filter\(has\)/);
});

test('Window connector: list_tasks with day includes what is still open from before', async()=>{
  const rows=[
    {id:'a',title:'Test',due_date:'2026-11-04',start_date:null,completed_at:null,project_id:null},
    {id:'b',title:'Hoy',due_date:'2026-11-07',start_date:null,completed_at:null,project_id:null},
    {id:'c',title:'Mañana',due_date:'2026-11-08',start_date:null,completed_at:null,project_id:null},
    {id:'d',title:'Varios días',due_date:'2026-11-10',start_date:'2026-11-06',completed_at:null,project_id:null},
    {id:'e',title:'Después',due_date:'2026-11-09',start_date:null,completed_at:null,project_id:null}];
  const ops=[];
  const sb={from:t=>{const c=new Proxy({},{get(_,n){if(n==='then')return ok=>ok({data:t==='isabella_tasks'?rows:[],error:null});return (...a)=>{ops.push([t,n,...a]);return c}}});return c}};
  const tools=createWindowTools({sb,userId:'u',now:()=>new Date('2026-11-07T18:00:00Z')});
  const r=await tools.listTasks({day:'2026-11-08'});
  assert.equal(r.range,'day');assert.equal(r.today,'2026-11-07');assert.equal(r.day,'2026-11-08');
  assert.deepEqual(r.tasks.map(t=>[t.id,!!t.overdue]),[['a',true],['b',false],['c',false],['d',false]]);
  assert.ok(ops.some(o=>o[1]==='or'&&o[2]==='due_date.lte.2026-11-08,start_date.lte.2026-11-08'));
  assert.match(read('supabase/functions/window-mcp/index.ts'),/day:z\.string\(\)\.optional\(\)/);
});
