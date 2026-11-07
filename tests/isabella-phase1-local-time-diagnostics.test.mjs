// Isabella Phase 1 (07.11.2026, decided by Gari): local hours and overdue tasks in the morning brief,
// and read-only turn diagnostics in the Window connector (to explain silences and the 12 moments).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localEventView,localDate,localTime} from '../supabase/functions/_shared/local-agenda.mjs';
import {createWindowTools,ToolError} from '../supabase/functions/_shared/window-tools.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Local event view: Berlin hours across the clock change, no storage timestamps', ()=>{
  // 03.11.2026 (CET, UTC+1): 09:00Z is 10:00 in Berlin; 20.10.2026 (CEST, UTC+2): 09:00Z is 11:00.
  assert.deepEqual(localEventView({title:'Bemusterung',starts_at:'2026-11-03T09:00:00Z',ends_at:'2026-11-03T11:00:00Z',all_day:false}),
    {title:'Bemusterung',local_date:'2026-11-03',all_day:false,local_start_time:'10:00',local_end_time:'12:00',timezone:'Europe/Berlin'});
  assert.equal(localTime('2026-10-20T09:00:00Z'),'11:00');
  assert.equal(localDate('2026-11-07T23:30:00Z'),'2026-11-08');
  const allDay=localEventView({title:'Urlaub',starts_at:'2026-11-09T23:00:00Z',ends_at:'2026-11-10T23:00:00Z',all_day:true});
  assert.equal(allDay.local_date,'2026-11-10');assert.equal(allDay.local_start_time,undefined);
  assert.equal('starts_at' in allDay,false);
});

test('Morning brief: local hours, overdue tasks, and an instruction not to convert', ()=>{
  const src=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(src,/const events=\(rawEvents\|\|\[\]\)\.map\(\(e:any\)=>localEventView\(e,tz\)\);/);
  assert.match(src,/\.is\("completed_at",null\)\.is\("archived_at",null\)\.lt\("due_date",today\)/);
  assert.match(src,/ya están en hora local; úsalos tal cual y no conviertas zonas horarias/);
  assert.match(src,/Tareas vencidas que siguen abiertas/);
});

test('turn_diagnostics: owner-scoped, chat runs only, no content, never_finished detected', async()=>{
  const ops=[];
  const rows=[
    {id:'r1',feature:'isabella_chat',status:'running',route:{complexity:'light',source:'decision_model'},metadata:{},error:null,started_at:'2026-11-03T21:06:30Z'},
    {id:'r2',feature:'isabella_chat',status:'success',route:{complexity:'standard'},latency_ms:5400,
      metadata:{context_tier:'full',provider_history_policy:'bounded_scoped',scoped_recent_count:12,turn_outcome:'answered',tools:['search_calendar'],secret_reply:'x'},error:null,started_at:'2026-11-03T20:00:00Z'}];
  const sb={from:t=>{const c=new Proxy({},{get(_,n){if(n==='then')return ok=>ok({data:t==='minds_agent_runs'?rows:[],error:null});return (...a)=>{ops.push([t,n,...a]);return c}}});return c}};
  const tools=createWindowTools({sb,userId:'u-1',now:()=>new Date('2026-11-04T08:00:00Z')});
  const r=await tools.turnDiagnostics({from:'2026-11-03',to:'2026-11-03'});
  assert.equal(r.runs[0].status,'never_finished');
  assert.equal(r.runs[1].context_tier,'full');assert.equal(r.runs[1].scoped_recent_count,12);
  assert.equal(r.runs[1].secret_reply,undefined,'only whitelisted metadata');
  assert.ok(ops.some(o=>o[1]==='eq'&&o[2]==='user_id'&&o[3]==='u-1'));
  assert.ok(ops.some(o=>o[1]==='in'&&o[2]==='feature'&&o[3].join()==='isabella_chat,isabella_background'));
  await assert.rejects(()=>tools.turnDiagnostics({status:'lost'}),ToolError);
  assert.match(read('supabase/functions/window-mcp/index.ts'),/registerTool\("turn_diagnostics",\{[^]*?annotations:READ\},run\(a=>tools\.turnDiagnostics\(a\)\)\)/);
});
