// Proactivity «como Sam» (Gari, 28.11.2026). Romy: «Guten Morgen» at 7:45 on workdays (P1); a deadline within three
// working days, a decision waiting for more than two days and a meeting that just ended are occasions to speak at a
// natural moment, never alarms (P2); nothing before 7:30 or after 19:00, nor at the weekend (P3); she proposes, he
// confirms (P4). She prepares instead of offering, does not repeat herself, and the «Demnächst … Beginnt um» lines
// leave the chat. Isabella keeps her own rhythm. Checked without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {presenceGate,morningGate,presenceMoment,presenceMotives,presenceMessage,rememberSaid,workdaysUntil,runIsabellaPresence,
  PRESENCE_RHYTHM,PRESENCE_INSTRUCTIONS,PRESENCE_SCHEMA,presenceKey,ownKey,morningKey,isWorkday} from '../supabase/functions/_shared/isabella-presence.mjs';
import {buildRadar} from '../supabase/functions/_shared/isabella-radar.mjs';

const office=PRESENCE_RHYTHM.office;
const at=s=>new Date(s);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Romy: nothing before 7:30 or after 19:00, nor at the weekend; Isabella keeps 9–21 every day',()=>{
  const base={hasMaterial:true,state:{}};
  // Monday 30.11.2026; Berlin is UTC+1.
  assert.equal(presenceGate({...base,now:at('2026-11-30T06:20:00Z'),rhythm:office}).reason,'outside_hours','7:20');
  assert.equal(presenceGate({...base,now:at('2026-11-30T06:35:00Z'),rhythm:office}).go,true,'7:35');
  assert.equal(presenceGate({...base,now:at('2026-11-30T18:05:00Z'),rhythm:office}).reason,'outside_hours','19:05');
  assert.equal(presenceGate({...base,now:at('2026-11-28T11:00:00Z'),rhythm:office}).reason,'weekend','Saturday');
  assert.equal(presenceGate({...base,now:at('2026-11-28T11:00:00Z'),promised:true,rhythm:office}).reason,'weekend','a promised follow-up waits for Monday');
  assert.equal(presenceGate({...base,now:at('2026-11-30T18:30:00Z'),promised:true,rhythm:office}).reason,'outside_hours','a promise keeps her hours');
  assert.equal(presenceGate({...base,now:at('2026-11-30T11:00:00Z'),rhythm:office,state:{day:'2026-11-30',calls:3}}).go,true,'room for more than one');
  assert.equal(presenceGate({...base,now:at('2026-11-30T11:00:00Z'),rhythm:office,state:{day:'2026-11-30',calls:5}}).reason,'call_budget');
  assert.equal(presenceGate({...base,now:at('2026-11-28T11:00:00Z')}).go,true,'Isabella also at the weekend');
  assert.equal(presenceGate({...base,now:at('2026-11-30T06:35:00Z')}).reason,'outside_hours','Isabella from 9');
  assert.equal(presenceGate({...base,now:at('2026-11-30T19:30:00Z')}).go,true,'Isabella until 21');
  assert.equal(isWorkday(at('2026-11-29T23:30:00Z')),true,'00:30 on Monday in Berlin is Monday');
  assert.equal(PRESENCE_RHYTHM.office.ownPerDay+1,3,'at most three a day: the morning and two more');
});

test('«Guten Morgen» on workdays from 7:45, checked once, with its own key; not while he writes; not for Isabella',()=>{
  const m={rhythm:office,state:{}};
  assert.deepEqual(morningGate({...m,now:at('2026-11-30T06:50:00Z')}),{go:true,reason:'morning'});
  assert.equal(morningGate({...m,now:at('2026-11-30T06:40:00Z')}).reason,'outside_hours','7:40');
  assert.equal(morningGate({...m,now:at('2026-11-30T08:31:00Z')}).reason,'outside_hours','9:31');
  assert.equal(morningGate({...m,now:at('2026-11-28T06:50:00Z')}).reason,'weekend');
  assert.equal(morningGate({...m,now:at('2026-11-30T06:50:00Z'),sentMorning:true}).reason,'already_greeted');
  assert.equal(morningGate({...m,now:at('2026-11-30T07:05:00Z'),state:{day:'2026-11-30',morning_at:'2026-11-30T06:50:00Z'}}).reason,'already_checked');
  assert.equal(morningGate({...m,now:at('2026-11-30T06:50:00Z'),lastUserAt:'2026-11-30T06:30:00Z'}).reason,'conversation_active');
  assert.equal(morningGate({...m,now:at('2026-11-30T06:50:00Z'),enabled:false}).reason,'turned_off');
  assert.equal(morningGate({now:at('2026-11-30T06:50:00Z')}).reason,'no_morning','Isabella keeps her own morning brief');
  assert.equal(morningKey('2026-11-30'),'presence:manana:2026-11-30');
  assert.equal(ownKey('2026-11-30',0),presenceKey('2026-11-30'));
  assert.equal(ownKey('2026-11-30',1),'presence:2026-11-30:2');
});

test('occasions, not alarms: deadlines within three working days, decisions waiting over two days; what she said rests',()=>{
  assert.equal(workdaysUntil('2026-11-27','2026-11-30'),1,'Friday → Monday is one working day');
  assert.equal(workdaysUntil('2026-11-30','2026-12-03'),3);
  assert.equal(workdaysUntil('2026-11-30','2026-12-04'),4);
  assert.equal(workdaysUntil('2026-11-30','2026-11-29'),-1);
  const radar={hoy:'2026-11-30',proyectos:[{proyecto:'Bernried',fristen:[{que:'Abgabe TWP',fecha:'2026-12-02'},{que:'Später',fecha:'2026-12-08'}],
    esperan:[{que:'Bodenbelag Eiche',desde:'2026-11-26'}]}],terminplan_fristen:[{project:'Bernried',title:'M03 Entwurf',date:'2026-12-03'}]};
  const m=presenceMotives(radar,{today:'2026-11-30'});
  assert.deepEqual(m.plazos.map(x=>[x.que,x.dias_laborables]),[['Abgabe TWP',2],['M03 Entwurf',3]]);
  assert.deepEqual(m.decisiones.map(x=>[x.que,x.esperando_desde]),[['Bodenbelag Eiche','2026-11-26']]);
  const said=rememberSaid({},[m.plazos[0].id],'2026-11-30');
  assert.deepEqual(presenceMotives(radar,{today:'2026-12-01',said}).plazos.map(x=>x.que),['M03 Entwurf'],'what she said does not come back');
  assert.deepEqual(rememberSaid(said,[],'2026-12-04'),{},'after three days it may come back');
  const moved=structuredClone(radar);moved.proyectos[0].fristen[0].fecha='2026-12-01';
  assert.ok(presenceMotives(moved,{today:'2026-12-01',said}).plazos.some(x=>x.que==='Abgabe TWP'),'a changed date is a new motive');
  assert.deepEqual(presenceMotives(null,{today:'2026-11-30'}),{plazos:[],decisiones:[]});
});

test('the radar names proposed decisions that have waited more than two days',()=>{
  const r=buildRadar({today:'2026-11-30',projects:[{id:'p1',name:'Bernried'}],threads:[],memos:[
    {project_id:'p1',memory_type:'decision',status:'proposed',title:'Bodenbelag Eiche',created_at:'2026-11-26T10:00:00Z'},
    {project_id:'p1',memory_type:'decision',status:'proposed',title:'Neu',created_at:'2026-11-29T10:00:00Z'}]});
  assert.deepEqual(r.proyectos[0].esperan,[{que:'Bodenbelag Eiche',desde:'2026-11-26'}]);
  assert.equal(r.proyectos[0].por_confirmar,2);
  const none=buildRadar({today:'2026-11-30',projects:[{id:'p1',name:'Bernried'}],threads:[],memos:[
    {project_id:'p1',memory_type:'decision',status:'proposed',title:'Neu',created_at:'2026-11-29T10:00:00Z'}]});
  assert.equal('esperan' in none.proyectos[0],false,'an empty list is left out');
});

test('she prepares instead of offering; only offered motives count as said; a meeting carries its project',()=>{
  assert.equal(PRESENCE_SCHEMA.required.at(-1),'motivos_usados');
  for(const line of[/Ocasiones, no alarmas/,/Prepara en vez de ofrecer: en lugar de «¿quieres que…\?»/,/«Besprechung nachbereiten»/,/Si momento es buenos_dias/,/no lo repitas/])
    assert.match(PRESENCE_INSTRUCTIONS,line);
  const material={hilos:[],motivos:{plazos:[{id:'p1'}],decisiones:[{id:'d1'}]}};
  assert.deepEqual(presenceMessage({decision:'ahora',message:'Hola.',basis:'work',thread_id:'',reason:'r',motivos_usados:['p1','x9']},material).motives,['p1']);
  assert.deepEqual(presenceMessage({decision:'ahora',message:'Hola.',basis:'work',thread_id:'',reason:'r'},{hilos:[]}).motives,[]);
  assert.equal(presenceMoment({now:at('2026-11-30T14:30:00Z'),tomorrowHasSomething:true,rhythm:office}).kind,'vispera','15:30');
  assert.equal(presenceMoment({now:at('2026-11-30T16:30:00Z'),todayHadEvents:true,rhythm:office}).kind,'cierre_del_dia','17:30');
  assert.equal(presenceMoment({now:at('2026-11-30T14:30:00Z'),tomorrowHasSomething:true}),null,'Isabella\'s eve starts at 16');
  const meeting={title:'Jour fixe',starts_at:'2026-11-30T09:00:00Z',ends_at:'2026-11-30T10:00:00Z',projekt:'Bernried'};
  assert.match(presenceMoment({now:at('2026-11-30T10:10:00Z'),events:[meeting],rhythm:office}).detail,/del proyecto Bernried/);
});

test('no «Demnächst … Beginnt um» lines for Romy: the reminder is recorded but routed silent',()=>{
  const hb=read('supabase/functions/isabella-heartbeat/index.ts');
  assert.match(hb,/candidates\.push\(\{\.\.\.\(assistantProfile\.multi_user\?\{silent_requested:true\}:\{\}\),event_type:"upcoming_event"/);
  const routing=read('supabase/migrations/20261011105500_durable_chat_attention_completion.sql');
  assert.match(routing,/elsif coalesce\(\(p_candidate->>'silent_requested'\)::boolean,false\) then\s+v_route:='silent'/);
});

function fakeSb(tables){
  const ops=[];
  const chain=(table)=>{
    const st={table,filters:[],op:'select',payload:null};
    const q=new Proxy({},{get(_,k){
      if(k==='then')return (ok,ko)=>Promise.resolve(result()).then(ok,ko);
      if(['insert','update','upsert'].includes(k))return (p)=>{st.op=k;st.payload=p;ops.push(st);return q};
      return (...a)=>{st.filters.push([k,...a]);return q};
    }});
    const result=()=>{
      if(st.op==='upsert')return {data:(tables.__upsertReturns??[{id:'m1'}]),error:null};
      if(st.op!=='select')return {data:null,error:null};
      const f=tables[table];return {data:typeof f==='function'?f(st):(f||[]),error:null};
    };
    return q;
  };
  return {sb:{from:chain},ops};
}

test('Romy greets on a Monday morning with its own key, in her words; the motive she names rests',async()=>{
  const {sb,ops}=fakeSb({
    conversations:(st)=>st.filters.some(f=>f[0]==='select'&&f[1]==='user_id')?[{user_id:'u'}]:[{id:'c1'}],
    office_members:()=>({display_name:'Ana Beispiel',is_active:true}),
    isabella_preferences:[{value:{curiosityEnabled:true}}],
    conversation_messages:[],
    isabella_return_queue:[],isabella_entities:[],isabella_tasks:[],isabella_events:[],minds_work_threads:[],
    isabella_projects:[{id:'p1',name:'Bernried'}],
    minds_work_memory:[{id:'w1',project_id:'p1',memory_type:'deadline',status:'confirmed',title:'Abgabe TWP',occurred_at:'2026-12-02T00:00:00Z',created_at:'2026-11-20T00:00:00Z',metadata:{}}]
  });
  let seen=null;
  const out=await runIsabellaPresence({sb,profile:'office',now:at('2026-11-30T06:50:00Z'),
    callModel:async({instructions,input})=>{seen={instructions,input};
      return {value:{decision:'ahora',message:'Guten Morgen, Ana. Die Abgabe an die TWP ist am Mittwoch.',basis:'agenda',thread_id:'',reason:'r',motivos_usados:[input.motivos.plazos[0].id]},payload:{usage:{}}}}});
  assert.deepEqual(out.report,[{spoke:true,reason:'agenda',moment:'buenos_dias',push_sent:0}]);
  assert.equal(seen.input.momento.kind,'buenos_dias');
  assert.deepEqual(seen.input.motivos.plazos.map(x=>[x.proyecto,x.que,x.dias_laborables]),[['Bernried','Abgabe TWP',2]]);
  assert.match(seen.instructions,/Romy/);assert.doesNotMatch(seen.instructions,/\bIsabella\b/);
  const deliver=ops.find(o=>o.table==='conversation_messages'&&o.op==='upsert');
  assert.equal(deliver.payload.client_key,morningKey('2026-11-30'),'the morning does not use up the day\'s own messages');
  assert.equal(deliver.payload.metadata.moment,'buenos_dias');
  assert.equal(deliver.payload.metadata.author,'romy');
  const states=ops.filter(o=>o.table==='isabella_preferences'&&o.op==='upsert').map(o=>o.payload.value);
  assert.equal(states[0].morning_at,'2026-11-30T06:50:00.000Z','checked once a day');
  assert.deepEqual(Object.values(states.at(-1).dichos),['2026-11-30'],'what she said is remembered for a few days');
});

test('Saturday: Romy stays silent without calling the model',async()=>{
  const {sb}=fakeSb({conversations:[{user_id:'u',id:'c1'}],office_members:()=>({display_name:'Ana Beispiel',is_active:true}),
    isabella_preferences:[{value:{curiosityEnabled:true}}]});
  let calls=0;
  const out=await runIsabellaPresence({sb,profile:'office',now:at('2026-11-28T09:00:00Z'),callModel:async()=>{calls++;return {value:{}}}});
  assert.equal(calls,0);assert.equal(out.report[0].reason,'weekend');
});
