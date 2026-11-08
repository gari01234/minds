// Point 4f (her own follow-ups, said and cancellable) and the nightly dream started from the heartbeat
// (08.11.2026). Gari about a reminder: «así es como me gustaría que funcionara Isabella».
// The repository is public: fixtures are neutral stand-ins, never real conversations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localToUtcIso,scheduleFollowUp,cancelFollowUp,splitFollowUps,FOLLOWUP_TOOLS,FOLLOWUP_KIND,FOLLOWUP_LIMITS}
  from '../supabase/functions/_shared/isabella-followups.mjs';
import {consolidatedMemoryView,runIsabellaDream,dreamDue,DREAM_NIGHT,DREAM_STATE_KEY} from '../supabase/functions/_shared/isabella-dream.mjs';
import {isabellaCoreInstructions,isabellaRoutineInstructions,workCoreConversationContext,capabilityNotes} from '../supabase/functions/_shared/isabella-core.mjs';
import {presenceGate,runIsabellaPresence,promisedKey,presenceKey,PRESENCE_INSTRUCTIONS} from '../supabase/functions/_shared/isabella-presence.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const U='u-1';

// supabase-js stand-in: filters eq/in/gt/limit; insert and upsert return rows with ids; upsert honours onConflict.
function fakeDb(tables){
  let seq=0;
  const from=table=>{
    const q={ops:[],write:null};
    const rows=()=>{let r=(tables[table]||[]).slice();
      for(const [op,col,val] of q.ops){
        if(op==='eq')r=r.filter(x=>x[col]===val);
        if(op==='in')r=r.filter(x=>val.includes(x[col]));
        if(op==='gt')r=r.filter(x=>String(x[col])>String(val));
        if(op==='limit')r=r.slice(0,col);
      }
      return r};
    const chain=new Proxy({},{get(_,name){
      if(name==='then')return (ok,bad)=>{
        let data=null;const t=(tables[table]=tables[table]||[]);
        if(q.write?.kind==='insert'){data=[].concat(q.write.row).map(r=>({id:'id-'+(++seq),...r}));t.push(...data)}
        else if(q.write?.kind==='update'){for(const x of rows())Object.assign(x,q.write.row)}
        else if(q.write?.kind==='upsert'){
          const keys=String(q.write.opts?.onConflict||'user_id,preference_key').split(',');
          const row={id:'id-'+(++seq),...q.write.row},i=t.findIndex(x=>keys.every(k=>x[k]===row[k]));
          if(i<0){t.push(row);data=[row]}else if(q.write.opts?.ignoreDuplicates)data=[];else{t[i]=row;data=[row]}
        }else data=rows();
        if(q.single)data=Array.isArray(data)?(data[0]||null):data;
        return Promise.resolve({data,error:null}).then(ok,bad)};
      return (...args)=>{
        if(['insert','update'].includes(name))q.write={kind:name,row:args[0]};
        else if(name==='upsert')q.write={kind:'upsert',row:args[0],opts:args[1]};
        else if(name==='maybeSingle'||name==='single')q.single=true;
        else if(name!=='select'||!q.write)q.ops.push([name,...args]);
        return chain};
    }});
    return chain;
  };
  return {from,tables};
}
const own=(over={})=>({user_id:U,kind:'conversation_thread',status:'ready',title:'Cómo fue la reunión con el Bauamt',reason:'Lo tenía en la cabeza.',
  metadata:{kind:FOLLOWUP_KIND,due_at:'2026-11-12T14:00:00.000Z',due_local:'2026-11-12 15:00',expires_at:'2026-11-14T14:00:00.000Z',source:'isabella_chat'},...over});

test('Local wall-clock times become UTC with the right offset, summer and winter',()=>{
  assert.equal(localToUtcIso('2026-11-12','15:00'),'2026-11-12T14:00:00.000Z');
  assert.equal(localToUtcIso('2026-07-01','09:00'),'2026-07-01T07:00:00.000Z');
  assert.equal(localToUtcIso('2026-10-25','12:00'),'2026-10-25T11:00:00.000Z','the day summer time ends');
  assert.equal(localToUtcIso('2026-11-12'),'2026-11-12T08:00:00.000Z','09:00 when no time is given');
  for(const [d,t] of [['12.11.2026','15:00'],['2026-11-12','25:00'],['2026-11-12','3pm']])assert.equal(localToUtcIso(d,t),null);
});

test('Scheduling: one row in the return queue, said and bounded; duplicates and limits refused',async()=>{
  const db=fakeDb({isabella_return_queue:[]}),now=new Date('2026-11-08T12:00:00Z');
  const r=await scheduleFollowUp(db,{userId:U,now,turnId:'run-1',args:{about:'Cómo fue la reunión con el Bauamt',day:'2026-11-12',time:'15:00',why:'Lo tenía en la cabeza.'}});
  assert.equal(r.status,'scheduled');assert.equal(r.due_local,'2026-11-12 15:00');assert.match(r.note,/qué harás, cuándo y por qué, y que puede cancelarlo/);
  const row=db.tables.isabella_return_queue[0];
  assert.equal(row.user_id,U);assert.equal(row.kind,'conversation_thread');assert.equal(row.status,'ready');
  assert.equal(row.metadata.kind,FOLLOWUP_KIND);assert.equal(row.metadata.due_at,'2026-11-12T14:00:00.000Z');
  assert.equal(row.metadata.expires_at,'2026-11-14T14:00:00.000Z','two days of grace');assert.equal(row.metadata.turn_id,'run-1');
  assert.equal(row.reactivate_after,row.metadata.due_at);
  assert.equal((await scheduleFollowUp(db,{userId:U,now,args:{about:'cómo fue la reunión con el bauamt.',day:'2026-11-13',why:'x'}})).status,'duplicate');
  for(let i=1;i<FOLLOWUP_LIMITS.open;i++)assert.equal((await scheduleFollowUp(db,{userId:U,now,args:{about:'Tema '+i,day:'2026-11-20',why:'x'}})).status,'scheduled');
  assert.equal((await scheduleFollowUp(db,{userId:U,now,args:{about:'Uno más',day:'2026-11-20',why:'x'}})).status,'limit');
  assert.equal((await scheduleFollowUp(fakeDb({}),{userId:U,now,args:{about:'a',day:'2026-11-01',why:'x'}})).status,'invalid','in the past');
  assert.equal((await scheduleFollowUp(fakeDb({}),{userId:U,now,args:{about:'a',day:'2027-03-01',why:'x'}})).status,'invalid','too far');
  assert.equal((await scheduleFollowUp(fakeDb({}),{userId:U,now,args:{about:'a',day:'2026-11-12'}})).status,'invalid','a reason is required');
  // Threads from the night never count against her follow-ups.
  const mixed=fakeDb({isabella_return_queue:[1,2,3,4,5].map(i=>({user_id:U,kind:'conversation_thread',status:'ready',title:'Hilo '+i,metadata:{source:'isabella_dream'}}))});
  assert.equal((await scheduleFollowUp(mixed,{userId:U,now,args:{about:'Nuevo',day:'2026-11-12',why:'x'}})).status,'scheduled');
});

test('Cancelling by a word, or closing as done; nothing else is touched',async()=>{
  const db=fakeDb({isabella_return_queue:[{id:'f1',...own()},{id:'d1',user_id:U,kind:'conversation_thread',status:'ready',title:'Otro hilo',metadata:{}}]});
  assert.equal((await cancelFollowUp(db,{userId:U,args:{about:'bauamt'}})).status,'cancelled');
  assert.equal(db.tables.isabella_return_queue[0].status,'dismissed');assert.equal(db.tables.isabella_return_queue[1].status,'ready');
  const db2=fakeDb({isabella_return_queue:[{id:'f1',...own()}]});
  assert.equal((await cancelFollowUp(db2,{userId:U,args:{id:'f1',done:true}})).status,'done');
  assert.equal(db2.tables.isabella_return_queue[0].status,'returned');
  const none=await cancelFollowUp(fakeDb({isabella_return_queue:[{id:'f2',...own({title:'Otra cosa'})}]}),{userId:U,args:{about:'nada parecido'}});
  assert.equal(none.status,'not_found');assert.equal(none.open[0].about,'Otra cosa');
  assert.deepEqual(FOLLOWUP_TOOLS.map(t=>t.name),['schedule_follow_up','cancel_follow_up']);
});

test('What a chat turn sees: due follow-ups first among the threads, the rest as scheduled, expired gone',()=>{
  const threads=[
    {id:'n1',title:'Hilo de la noche',reason:'r',metadata:{source:'isabella_dream',quote:'cita'}},
    {id:'f1',...own()},
    {id:'f2',...own({title:'Preparar la hoja de Lichtplanung',metadata:{...own().metadata,due_at:'2026-11-20T08:00:00.000Z',due_local:'2026-11-20',expires_at:'2026-11-22T08:00:00.000Z'}})},
    {id:'f3',...own({title:'Caducado',metadata:{...own().metadata,due_at:'2026-11-01T08:00:00.000Z',expires_at:'2026-11-03T08:00:00.000Z'}})}
  ];
  const before=consolidatedMemoryView([],threads,Date.parse('2026-11-10T10:00:00Z'));
  assert.deepEqual(before.hilos.map(h=>h.id),['n1']);
  assert.deepEqual(before.seguimientos_programados.map(s=>[s.id,s.cuando]),[['f1','2026-11-12 15:00'],['f2','2026-11-20']]);
  const after=consolidatedMemoryView([],threads,Date.parse('2026-11-12T16:00:00Z'));
  assert.deepEqual(after.hilos.map(h=>[h.id,!!h.seguimiento_propio]),[['f1',true],['n1',false]]);
  assert.deepEqual(after.seguimientos_programados.map(s=>s.id),['f2']);
  const split=splitFollowUps(threads,Date.parse('2026-11-12T16:00:00Z'));
  assert.deepEqual([split.due.length,split.scheduled.length,split.others.length],[1,1,1]);
  const work=workCoreConversationContext({memoria_de_isabella:after});
  assert.deepEqual([work.memoria_de_isabella.hilos.length,work.memoria_de_isabella.seguimientos_programados.length],[0,0],'Work turns do not carry them');
});

test('The rule travels with the tool: global chat only, never in routines or Work',()=>{
  const fn=n=>({type:'function',name:n});
  const withTool=isabellaCoreInstructions({tools:[fn('search_memory'),...FOLLOWUP_TOOLS]});
  assert.match(withTool,/SEGUIMIENTOS: si decides volver a algo más tarde por tu cuenta/);
  assert.match(withTool,/qué, cuándo y por qué, y que puede cancelarlo/);
  assert.doesNotMatch(isabellaCoreInstructions({tools:[fn('search_memory')]}),/schedule_follow_up/);
  assert.doesNotMatch(isabellaRoutineInstructions({}),/schedule_follow_up/);
  assert.equal(capabilityNotes(new Set(['cancel_follow_up'])).length,0);
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(chat,/\.\.\.\(isabellaCoreEligible&&exposureScope\.kind==="global"\?FOLLOWUP_TOOLS:\[\]\)/);
  assert.match(chat,/schedule_follow_up:"allow",cancel_follow_up:"allow"/);
  assert.match(chat,/call\.name==="schedule_follow_up"\|\|call\.name==="cancel_follow_up"/);
  assert.match(chat,/scheduleFollowUp\(sb, \{ userId: user\.id, args, tz, turnId, ownerName \}\)/);
  assert.match(chat,/\.eq\("status", "ready"\)\.order\("created_at", \{ ascending: false \}\)\.limit\(10\)/);
});

test('Presence: a due follow-up is a promise; it keeps the quiet rules but not the day\'s own message',()=>{
  const at=new Date('2026-11-12T15:00:00Z'); // 16:00 Berlin
  assert.equal(presenceGate({now:at,sentToday:true}).go,false);
  assert.deepEqual(presenceGate({now:at,sentToday:true,promised:true}),{go:true,reason:'promised'});
  assert.equal(presenceGate({now:at,promised:true,enabled:false}).go,false);
  assert.equal(presenceGate({now:at,promised:true,lastUserAt:'2026-11-12T14:40:00Z'}).reason,'conversation_active');
  assert.equal(presenceGate({now:new Date('2026-11-12T06:30:00Z'),promised:true}).go,true,'07:30 is fine for a promise');
  assert.equal(presenceGate({now:new Date('2026-11-12T21:30:00Z'),promised:true}).reason,'outside_hours');
  assert.equal(presenceGate({now:at,promised:true,state:{day:'2026-11-12',promised_calls:3}}).reason,'call_budget');
  assert.equal(presenceGate({now:at,promised:true,state:{day:'2026-11-12',calls:3}}).go,true,'the own budget is separate');
  assert.match(PRESENCE_INSTRUCTIONS,/sin presentarlo como recordatorio ni decir que lo tenías programado/);
  assert.equal(promisedKey('f1'),'presence:seguimiento:f1');
});

test('Presence end to end: she does what she said, under its own key, and the follow-up closes',async()=>{
  const now=new Date('2026-11-12T15:00:00Z');
  const tables={
    conversations:[{id:'c1',user_id:U,app_scope:'isabella'}],
    conversation_messages:[{user_id:U,conversation_id:'c1',role:'assistant',content:'Hola.',created_at:'2026-11-12T08:00:00Z',client_key:presenceKey('2026-11-12'),
      provisional:false,exposure_scope_version:1,exposure_scope_kind:'global',metadata:{source:'isabella_presence'}}],
    isabella_preferences:[],isabella_entities:[],isabella_tasks:[],isabella_events:[],
    isabella_return_queue:[{id:'f1',...own()}]
  };
  const db=fakeDb(tables);let seen=null;
  const out=await runIsabellaPresence({sb:db,now,callModel:async({input})=>{seen=input;
    return {value:{decision:'ahora',message:'¿Qué tal fue lo del Bauamt?',basis:'otro',thread_id:'',reason:'prometido'},payload:{usage:{}}}}});
  assert.equal(out.report[0].spoke,true,JSON.stringify(out));
  assert.equal(seen.momento.kind,'seguimiento_programado');
  const sent=tables.conversation_messages.at(-1);
  assert.equal(sent.client_key,promisedKey('f1'));assert.equal(sent.metadata.thread_id,'f1');
  assert.equal(tables.isabella_return_queue[0].status,'returned');
  const state=tables.isabella_preferences.find(p=>p.preference_key==='isabella_presence').value;
  assert.equal(state.promised_calls,1);assert.equal(state.calls||0,0,'the day\'s own check is untouched');
  // «Nada» (it already came up) closes it too; «más tarde» leaves it for the next check.
  for(const [decision,status] of [['nada','returned'],['mas_tarde','ready']]){
    const t={...tables,conversation_messages:[],isabella_preferences:[],isabella_return_queue:[{id:'f1',...own()}]};
    await runIsabellaPresence({sb:fakeDb(t),now,callModel:async()=>({value:{decision,message:'',basis:'nada',thread_id:'',reason:''},payload:{}})});
    assert.equal(t.isabella_return_queue[0].status,status,decision);
  }
});

test('The night\'s pass: 02:00–06:00 local, once, a few tries at most',()=>{
  const night=new Date('2026-11-09T02:00:00Z'); // 03:00 Berlin
  assert.equal(dreamDue({},new Date('2026-11-09T10:00:00Z')).reason,'outside_night');
  assert.equal(dreamDue({},new Date('2026-11-09T00:30:00Z')).reason,'outside_night','01:30 is still too early');
  const go=dreamDue({},night);assert.equal(go.go,true);assert.deepEqual([go.nightly.day,go.nightly.attempts,go.nightly.passes],['2026-11-09',1,1]);
  assert.equal(dreamDue({nightly:{day:'2026-11-09',done:true}},night).reason,'done_tonight');
  assert.equal(dreamDue({nightly:{day:'2026-11-08',done:true}},night).go,true,'yesterday\'s night does not count');
  assert.equal(dreamDue({more:true,nightly:{day:'2026-11-09',done:false,passes:2}},night).go,true,'a long backlog continues');
  assert.equal(dreamDue({nightly:{day:'2026-11-09',attempts:DREAM_NIGHT.attempts}},night).reason,'night_budget');
  assert.equal(dreamDue({nightly:{day:'2026-11-09',passes:DREAM_NIGHT.passes}},night).reason,'night_budget');
  assert.equal(dreamDue({nightly:{day:'2026-11-09',running_at:'2026-11-09T01:55:00Z'}},night).reason,'running');
});

test('The heartbeat path runs the dream once a night and settles its state; the manual run ignores the window',async()=>{
  const tables={conversations:[{id:'c1',user_id:U,app_scope:'isabella'}],conversation_messages:[],minds_memory_forget_tombstones:[],
    isabella_events:[],isabella_preferences:[],minds_agent_runs:[]};
  let calls=0;const callModel=async()=>{calls++;return {value:{},payload:{}}};
  const outside=await runIsabellaDream({sb:fakeDb(tables),callModel,due:true,now:new Date('2026-11-09T10:00:00Z')});
  assert.equal(outside.skipped,'outside_night');
  const night=new Date('2026-11-09T02:00:00Z');
  const first=await runIsabellaDream({sb:fakeDb(tables),callModel,due:true,now:night});
  assert.equal(first.users[0].status,'nothing_new');
  const st=tables.isabella_preferences.find(p=>p.preference_key===DREAM_STATE_KEY).value;
  assert.deepEqual([st.nightly.day,st.nightly.done,st.nightly.attempts,st.nightly.running_at,st.more],['2026-11-09',true,0,null,false]);
  const again=await runIsabellaDream({sb:fakeDb(tables),callModel,due:true,now:new Date('2026-11-09T02:15:00Z')});
  assert.equal(again.users[0].status,'done_tonight');
  const manual=await runIsabellaDream({sb:fakeDb(tables),callModel,now:new Date('2026-11-09T10:00:00Z')});
  assert.equal(manual.users[0].status,'nothing_new');assert.equal(calls,0,'no model call when there is nothing new');
});

test('Wiring: heartbeat starts the dream with its secret; the dream accepts it; the schedule left GitHub',()=>{
  const hb=read('supabase/functions/isabella-heartbeat/index.ts');
  assert.match(hb,/import \{dreamDue\} from "\.\.\/_shared\/isabella-dream\.mjs";/);
  assert.match(hb,/if\(dreamDue\(\{\},new Date\(\)\)\.go\)\{/);
  assert.match(hb,/fetch\(url\+"\/functions\/v1\/isabella-dream",\{method:"POST"/);
  assert.match(hb,/body:JSON\.stringify\(\{secret:String\(secret\.value\)\}\)/);
  assert.doesNotMatch(hb,/console\.log\("isabella_dream"[^\n]*diario/,'counts only in the log');
  const fn=read('supabase/functions/isabella-dream/index.ts');
  assert.match(fn,/\.eq\("key","heartbeat_runner"\)/);assert.match(fn,/timingSafeEqual/);
  assert.match(fn,/runIsabellaDream\(\{sb,model,due,/);assert.match(fn,/audience:DREAM_AUDIENCE/);
  const wf=read('.github/workflows/isabella-dream.yml');
  assert.doesNotMatch(wf,/schedule:/);assert.match(wf,/workflow_dispatch:/);
});

test('Brief and panel: today\'s follow-ups in the routine; «Cancelar» for hers in the memory panel',()=>{
  const runner=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(runner,/LO QUE LE DIJISTE QUE HARÍAS HOY/);
  assert.match(runner,/filter\(\(f:any\)=>String\(f\.cuando\|\|""\)\.startsWith\(today\)\)/);
  const app=read('apps/isabella/app.js');
  assert.match(app,/own\?'Cancelar':'Descartar'/);
  assert.match(app,/Volverá a esto: /);
  assert.match(app,/eq\('status','ready'\)\.order\('created_at',\{ascending:false\}\)\.limit\(10\)/);
});
