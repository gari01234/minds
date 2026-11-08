// Phase 1, steps 5–8 (Gari, 08.11.2026: «Adelante… Ten cuidado con el consumo de tokens»).
// Step 6: one core for every global conversational turn, smaller than the full prompt.
// Step 5: the recent window as dialogue, same scope and window.
// Step 7: Isabella's words next to the app's line on turns with pending changes, never a false "done".
// Step 8: she writes first at most once a day, from the server, and the browser's background turns stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ISABELLA_CORE,isabellaCoreInstructions,capabilityNotes,coreConversationContext,toolNamesOf} from '../supabase/functions/_shared/isabella-core.mjs';
import {leanConversationContext} from '../supabase/functions/_shared/light-conversation-context.mjs';
import {dialogueTurnInput,boundedScopedTurn,localStamp} from '../supabase/functions/_shared/turn-capability-contract.mjs';
import {claimsCompletion,verifiedPendingProse} from '../supabase/functions/_shared/reply-verification.mjs';
import {presenceGate,presenceMoment,presenceMessage,runIsabellaPresence,PRESENCE_INSTRUCTIONS,PRESENCE_SCHEMA,trustedPresenceWorkflow,presenceKey} from '../supabase/functions/_shared/isabella-presence.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const app=read('apps/isabella/app.js');

const fn=n=>({type:'function',name:n});
const ALL_TOOLS=[{type:'web_search'},...['request_clarification','create_task','create_event','update_task','search_calendar','search_routines','create_routine',
  'create_chat_reminder','create_standing_intent','check_watch_capability','remember_information','record_personal_model_claim','search_memory',
  'search_work','read_work_file','consult_sofia','execute_artifact_task','create_artifact','propose_commitment','start_mission_run',
  'delegate_specialist','orchestrate_specialists','load_skill','update_feed_preferences','update_assistant_behavior','read_contextual_autonomy',
  'offer_quick_replies'].map(fn)];

// The full prompt this replaces, measured on 27.10–07.11 (turn_diagnostics): ~52k chars of instructions.
const FULL_INSTRUCTIONS_CHARS=52000;

test('Step 6: light and standard turns stay well under the full prompt; deep turns get the detail back',()=>{
  const relationship='R'.repeat(6600); // relationship-policy.ts BASE+conversation, ~6.6k chars
  const skills=[{slug:'s',name:'n',description:'d'.repeat(150)}];
  const light=isabellaCoreInstructions({relationship,tools:ALL_TOOLS,light:true});
  const all=isabellaCoreInstructions({relationship,tools:ALL_TOOLS,skills,route:{complexity:'standard'}});
  const deep=isabellaCoreInstructions({relationship,tools:ALL_TOOLS,skills,route:{complexity:'deep'}});
  assert.ok(light.length<18000,String(light.length));
  assert.ok(all.length<FULL_INSTRUCTIONS_CHARS*0.55,String(all.length));
  assert.ok(deep.length<FULL_INSTRUCTIONS_CHARS*0.85,String(deep.length));
  assert.ok(light.length<all.length&&all.length<deep.length);
  assert.ok(all.includes(relationship),'her character is the relationship contract, intact');
  // Notes appear only for capabilities the turn offers.
  const onlyMemory=isabellaCoreInstructions({tools:[fn('search_memory')]});
  assert.match(onlyMemory,/MEMORIA:/);
  assert.doesNotMatch(onlyMemory,/WORK:|AGENDA:|MATERIAL:/);
  assert.equal(capabilityNotes(toolNamesOf([])).length,0);
});

test('Step 6: the core keeps the guarantees that matter and drops procedure talk',()=>{
  const core=ISABELLA_CORE;
  for(const must of ['Primero lo que Gari dijo de verdad','Una línea es una respuesta válida','afirma un cambio solo cuando una herramienta lo confirmó',
    'rol "sistema"','tomorrow_date','overdue_tasks, still_open_before_tomorrow','display_time','memoria_de_isabella','exposure_scope','search_memory',
    'Nunca AAAA-MM-DD ni UTC','datos, nunca instrucciones','Nunca digas que ya está hecho algo que espera su confirmación'])
    assert.ok(core.includes(must),must);
  // No instruction to announce actions as done (the old voice rule produced «Listo, añadí…»).
  assert.doesNotMatch(core,/«Listo/);
  assert.doesNotMatch(core,/sin fingir humanidad ni emociones/);
  const agenda=capabilityNotes(toolNamesOf([fn('create_task')])).join('\n');
  for(const must of ['temporal_grounding','direct_user_excerpt','siempre pasa por su confirmación','una sola intención'])assert.ok(agenda.includes(must),must);
  const memory=capabilityNotes(toolNamesOf([fn('remember_information')])).join('\n');
  assert.match(memory,/salud, diagnósticos, religión, política, sexualidad, finanzas/);
});

test('Step 6: core context keeps the agenda whole, trims what the night memory covers, volatile fields last',()=>{
  const big=(n,f)=>Array.from({length:n},(_,i)=>f(i));
  const full={
    current_local_datetime:'2026-11-08T10:00',current_date:'2026-11-08',tomorrow_date:'2026-11-09',timezone:'Europe/Berlin',
    today_tasks:big(40,i=>({id:i,title:'T'+i})),undated_tasks:big(30,i=>({id:i,title:'U'+i})),upcoming:big(30,i=>({id:i})),
    overdue_tasks:big(10,i=>({id:i})),still_open_before_tomorrow:[{id:'o'}],memoria_de_isabella:{paginas:[],hilos:[]},
    personal_model_claims:big(32,i=>({id:i,claim:'c'+i,evidence:'e'.repeat(300),metadata:{x:'y'.repeat(100)},claim_type:'habit',confidence:.9})),
    recent_activity:big(24,i=>({entity_type:'task',action:'update',source:'chat',created_at:'t'+i,
      before_state:{title:'A'+i,notes:'n'.repeat(400)},after_state:{title:'A'+i,date:'2026-11-09',notes:'n'.repeat(400)}})),
    proposal_feedback:big(16,i=>({outcome:'accepted',created_at:'t'+i,proposal:{kind:'task',action:'create',title:'P'+i,temporal_grounding:{x:'y'.repeat(300)}}})),
    recalled_memory:big(14,i=>({content:'m'+i})),routed_work_context:null,memory_checkpoint:{summary:'s',open_loops:[]},
    preferences:{assistant_behavior_rules:[{rule:'r'}]},exposure_scope:{key:'global'},route:{complexity:'standard'}
  };
  const core=coreConversationContext(full);
  assert.equal(core.today_tasks.length,40);assert.equal(core.undated_tasks.length,30);assert.equal(core.upcoming.length,30);
  assert.deepEqual(core.still_open_before_tomorrow,[{id:'o'}]);
  assert.equal(core.personal_model_claims.length,32);
  assert.ok(!('evidence' in core.personal_model_claims[0]));
  assert.equal(core.recent_activity.length,10);
  assert.deepEqual(core.recent_activity[0].item,{title:'A14',date:'2026-11-09'});
  assert.equal(core.proposal_feedback.length,8);
  assert.equal(core.recalled_memory.length,14);
  assert.ok(core.memory_checkpoint,'the running summary of older conversation stays');
  const keys=Object.keys(core);
  assert.equal(keys.at(-1),'current_local_datetime','the per-minute field goes last (cache-friendly prefix)');
  assert.ok(keys.indexOf('preferences')<keys.indexOf('undated_tasks'));
  assert.ok(JSON.stringify(core).length<JSON.stringify(full).length*0.5);
});

test('Step 6: wiring — global turns use the core, Work uses its shared core with legacy fallback',()=>{
  assert.match(chat,/const isabellaCoreEligible=!background&&!fastAgenda&&!currentWorkThread&&!route\.work;/);
  assert.match(chat,/const coreSurface=!leanSurface&&isabellaCoreEligible;/);
  assert.match(chat,/\(leanSurface\|\|coreSurface\|\|workCoreSurface\)\?isabellaCoreInstructions\(\{relationship:relationshipPolicy\("conversation"\),tools,/);
  assert.match(chat,/system\+\(scheduleAssessment\?/,'the full legacy Work prompt remains for ISABELLA_WORK_CORE=off');
  assert.match(chat,/Deno\.env\.get\("ISABELLA_WORK_CORE"\)!=="off"/);
  assert.match(chat,/\(footprint as any\)\.core_version=workCoreSurface\|\|coreSurface\|\|leanSurface\?ISABELLA_CORE_VERSION:null;/);
});

test('Step 5: the recent window arrives as dialogue, same scope and size class',()=>{
  const msgs=[
    {role:'user',content:'Hoy fue largo.',created_at:'2026-11-02T21:00:00Z'},
    {role:'assistant',content:'¿Largo de cansado o de lleno?',created_at:'2026-11-02T21:00:10Z'},
    {role:'assistant',content:'Agregado.',created_at:'2026-11-02T21:01:00Z',metadata:{}},
    {role:'system',content:'should never pass'},
    {role:'user',content:'De lleno. Al final todo va de tener margen.',created_at:'2026-11-02T21:02:00Z'}];
  const input=dialogueTurnInput(msgs,'¿Y tú?');
  assert.deepEqual(input.map(x=>x.role),['user','assistant','user','user','user']);
  assert.match(input[0].content,/^\[lun, 2 nov, 22:00\] Hoy fue largo\.$/);
  assert.equal(input[1].content,'¿Largo de cansado o de lleno?','her words stay hers, no stamp to imitate');
  assert.match(input[2].content,/\[Aviso de la app, no lo escribió Gari ni tú\] Agregado\./);
  assert.equal(input.at(-1).content[0].text,'¿Y tú?');
  assert.ok(!JSON.stringify(input).includes('should never pass'));
  // Budget: 12 messages; the last four up to 2400 chars, older 1200. At most +4.8k over the old exhibit.
  const long=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(5000),created_at:'2026-11-02T21:00:00Z'}));
  const size=JSON.stringify(dialogueTurnInput(long,'ok')).length;
  const old=boundedScopedTurn(long,'ok').length;
  assert.ok(size-old<5600,String(size-old));
  assert.equal(dialogueTurnInput(long,'ok').length,13);
  assert.equal(localStamp('nope'),'');
  assert.match(chat,/boundedGlobalChat&&isabellaCoreEligible\n\s+\/\/ Phase 1, step 5[^\n]*\n\s+\?dialogueTurnInput\(recent,turnText,/);
  assert.match(chat,/metadata: item\?\.metadata \|\| null/,'the author marker survives the history merge');
});

test('Step 5: Isabella sees her own morning brief when Gari answers it',()=>{
  const runner=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(runner,/\.update\(\{exposure_scope_version:1,exposure_scope_kind:"global"\}\)\s*\n\s*\.eq\("id",delivered\.message_id\)\.eq\("user_id",routine\.user_id\)\.eq\("exposure_scope_version",0\)/);
});

test('Step 7: pending changes — her words travel only when they do not claim it is done',()=>{
  for(const t of ['Listo, añadí la tarea para mañana.','Hecho.','He añadido «Angebot».','Ya está.','Quedó guardada.','Moví la reunión al jueves.',
    'Erledigt, ist eingetragen.','Done, I added it.'])assert.equal(claimsCompletion(t),true,t);
  for(const t of ['Te lo dejo para que lo confirmes; ojo, el jueves ya va lleno.','Lo tienes listo para confirmar abajo.',
    'Para mañana, entonces. ¿Le pongo hora o lo dejas sin hora?'])assert.equal(claimsCompletion(t),false,t);
  assert.equal(verifiedPendingProse('Propuesta: añadir «X» · pendiente de tu confirmación.'),null,'a template is never her words');
  assert.equal(verifiedPendingProse(''),null);
  assert.equal(verifiedPendingProse('x'.repeat(2000)),null);
  assert.match(chat,/const isabellaReply=toolProposals\.length&&\(isabellaCoreEligible\|\|workCoreSurface\)\?verifiedPendingProse\(modelProse\):null;/);
  assert.match(chat,/isabella_reply:isabellaReply,/);
  assert.match(chat,/"Todavía no está aplicado: Gari lo confirma en la tarjeta\. No digas que está hecho\."/);
  // The app line stays the authority: her words go first, the system line with the card right after.
  assert.match(app,/if\(isabellaProse&&receiptText\)say\('assistant',isabellaProse,\{metadata:\{exposure_scope:exposure,commentary_for:'review'\}\}\);\n\s+sayKeyed\(receiptText\?null:assistantKeyFor\(durableRequestId\),'assistant',verifiedReply/);
  assert.match(app,/if\(isabellaProse\)say\('assistant',isabellaProse,\{metadata:\{exposure_scope:exposure,commentary_for:'direct_creation'\}\}\);/);
});

test('Step 8: the gate — once a day, waking hours, never while Gari is talking, a small call budget',()=>{
  const noon=new Date('2026-11-08T11:00:00Z'); // 12:00 Berlin
  assert.deepEqual(presenceGate({now:noon}),{go:true,reason:'check'});
  assert.equal(presenceGate({now:noon,enabled:false}).reason,'turned_off');
  assert.equal(presenceGate({now:noon,sentToday:true}).reason,'already_wrote_today');
  assert.equal(presenceGate({now:new Date('2026-11-08T07:30:00Z')}).reason,'outside_hours');
  assert.equal(presenceGate({now:new Date('2026-11-08T20:10:00Z')}).reason,'outside_hours');
  assert.equal(presenceGate({now:noon,lastUserAt:'2026-11-08T10:40:00Z'}).reason,'conversation_active');
  assert.equal(presenceGate({now:noon,lastAnyAt:'2026-11-08T10:30:00Z'}).reason,'just_wrote');
  assert.equal(presenceGate({now:noon,hasMaterial:false}).reason,'nothing_to_say');
  assert.equal(presenceGate({now:noon,state:{day:'2026-11-08',calls:3}}).reason,'call_budget');
  assert.equal(presenceGate({now:noon,state:{day:'2026-11-08',calls:1,last_call_at:'2026-11-08T10:15:00Z'}}).reason,'waited_recently');
  assert.equal(presenceGate({now:noon,state:{day:'2026-11-07',calls:3}}).go,true,'yesterday\'s budget does not count');
  assert.ok(trustedPresenceWorkflow({repository:'gari01234/minds',repository_id:'1387794687',ref:'refs/heads/main',
    workflow_ref:'gari01234/minds/.github/workflows/isabella-presence.yml@refs/heads/main',event_name:'schedule',run_id:'1'}));
  assert.ok(!trustedPresenceWorkflow({repository:'gari01234/minds',repository_id:'1387794687',ref:'refs/heads/main',
    workflow_ref:'gari01234/minds/.github/workflows/isabella-dream.yml@refs/heads/main',event_name:'schedule',run_id:'1'}));
});

test('Step 8 v2: she speaks at real moments, not at fixed hours',()=>{
  const at=iso=>new Date(iso);
  const meeting={title:'Termin Lighting Design',starts_at:'2026-11-09T11:00:00Z',ends_at:'2026-11-09T12:00:00Z'};
  assert.equal(presenceMoment({now:at('2026-11-09T12:20:00Z'),events:[meeting]}).kind,'reunion_terminada');
  assert.equal(presenceMoment({now:at('2026-11-09T12:20:00Z'),events:[meeting,{title:'Siguiente',starts_at:'2026-11-09T12:40:00Z',ends_at:'2026-11-09T13:00:00Z'}]}),null,'not right before the next one');
  assert.equal(presenceMoment({now:at('2026-11-09T12:20:00Z'),events:[meeting],usedMoments:['reunion_terminada']}),null,'each kind once a day');
  assert.equal(presenceMoment({now:at('2026-11-09T09:00:00Z'),seenAt:'2026-11-09T08:50:00Z',lastUserAt:'2026-11-08T20:00:00Z'}).kind,'app_abierta');
  assert.equal(presenceMoment({now:at('2026-11-09T09:00:00Z'),seenAt:'2026-11-09T08:50:00Z',lastUserAt:'2026-11-09T08:40:00Z'}),null,'he is writing');
  assert.equal(presenceMoment({now:at('2026-11-09T14:00:00Z'),lastUserAt:'2026-11-09T12:30:00Z',hasThread:true}).kind,'conversacion_terminada');
  assert.equal(presenceMoment({now:at('2026-11-09T16:30:00Z'),tomorrowHasSomething:true}).kind,'vispera');
  assert.equal(presenceMoment({now:at('2026-11-09T18:30:00Z'),todayHadEvents:true}).kind,'cierre_del_dia');
  assert.equal(presenceMoment({now:at('2026-11-09T10:00:00Z')}),null,'no moment, no model call');
  const wf=read('.github/workflows/isabella-presence.yml');
  assert.match(wf,/cron: '7,37 7-19 \* \* \*'/);
  assert.match(app,/preference_key:'presence_seen',value:\{at\}/);
  assert.match(app,/void markPresenceSeen\(\);\n\s+document\.addEventListener\('visibilitychange'/);
});

test('Step 8: now, later or nothing; no profile questions; a thread is cited only if it exists',()=>{
  assert.match(PRESENCE_INSTRUCTIONS,/"mas_tarde": hay algo, pero este no es el momento/);
  assert.match(PRESENCE_INSTRUCTIONS,/algo de su trabajo que probablemente no ha visto/);
  assert.match(PRESENCE_INSTRUCTIONS,/No hagas preguntas para conocerle «en general»/);
  assert.match(PRESENCE_INSTRUCTIONS,/No inventes urgencia/);
  assert.deepEqual(PRESENCE_SCHEMA.required,['decision','message','basis','thread_id','reason']);
  const material={hilos:[{id:'h1'}]};
  assert.equal(presenceMessage({decision:'nada',message:'x'},material),null);
  assert.equal(presenceMessage({decision:'mas_tarde',message:'x'},material),null);
  assert.equal(presenceMessage({decision:'ahora',message:''},material),null);
  assert.equal(presenceMessage({decision:'ahora',message:'x'.repeat(700)},material),null);
  assert.equal(presenceMessage({decision:'ahora',message:'Me quedé pensando en lo del margen.',basis:'hilo',thread_id:'h1',reason:'r'},material).thread_id,'h1');
  assert.equal(presenceMessage({decision:'ahora',message:'Hola.',basis:'hilo',thread_id:'invented',reason:'r'},material).thread_id,null);
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

test('Step 8: one pass delivers one scoped message, marks the thread, records counts only',async()=>{
  const {sb,ops}=fakeSb({
    conversations:(st)=>st.filters.some(f=>f[0]==='select'&&f[1]==='user_id')?[{user_id:'u'}]:[{id:'c1'}],
    isabella_preferences:[{value:{curiosityEnabled:true}}],
    conversation_messages:(st)=>st.filters.some(f=>f[0]==='like')?[]:[
      {role:'user',content:'Al final todo va de tener margen.',created_at:'2026-11-08T09:00:00Z',metadata:{}},
      {role:'assistant',content:'Agregado.',created_at:'2026-11-08T09:01:00Z',metadata:{}}].reverse(),
    isabella_return_queue:[{id:'h1',title:'El margen frente al ritmo',reason:'quedó abierto',metadata:{quote:'Tiempo…',expires_at:'2026-11-20T00:00:00Z'}}],
    isabella_entities:[],isabella_tasks:[],isabella_events:[],isabella_projects:[],minds_work_threads:[],minds_work_memory:[]
  });
  let seen=null,pushed=0;
  const out=await runIsabellaPresence({sb,now:new Date('2026-11-08T11:00:00Z'),relationship:'REL',
    callModel:async({instructions,input})=>{seen={instructions,input};return {value:{decision:'ahora',message:'Me quedé con lo que dijiste del margen.',basis:'hilo',thread_id:'h1',reason:'apertura'},payload:{usage:{input_tokens:3000,output_tokens:60}}}},
    push:async()=>{pushed++;return {sent:1}}});
  assert.deepEqual(out.report,[{spoke:true,reason:'hilo',moment:'conversacion_terminada',push_sent:1}]);
  assert.equal(seen.input.momento.kind,'conversacion_terminada');
  const state=ops.find(o=>o.table==='isabella_preferences'&&o.op==='upsert');
  assert.equal(state.payload.preference_key,'isabella_presence');assert.equal(state.payload.value.calls,1);
  assert.match(seen.instructions,/REL$/);
  assert.deepEqual(seen.input.conversacion_reciente.length,1,'app notices are not part of what she remembers saying');
  const deliver=ops.find(o=>o.table==='conversation_messages'&&o.op==='upsert');
  assert.equal(deliver.payload.client_key,presenceKey('2026-11-08'));
  assert.equal(deliver.payload.exposure_scope_version,1);
  assert.equal(deliver.payload.metadata.author,'isabella');
  assert.ok(ops.some(o=>o.table==='isabella_return_queue'&&o.op==='update'&&o.payload.status==='returned'));
  const run=ops.find(o=>o.table==='minds_agent_runs');
  assert.ok(!JSON.stringify(run.payload).includes('Me quedé'),'the run record holds no message content');
  assert.equal(pushed,1);
  assert.ok(JSON.stringify(seen.input).length<16000,'small input: no full prompt, no full context');
});

test('Step 8: no model call when the gate is closed; the browser no longer runs background turns',async()=>{
  const {sb}=fakeSb({conversations:[{user_id:'u',id:'c1'}],isabella_preferences:[{value:{curiosityEnabled:false}}]});
  let calls=0;
  const out=await runIsabellaPresence({sb,now:new Date('2026-11-08T11:00:00Z'),callModel:async()=>{calls++;return {value:{}}}});
  assert.equal(calls,0);assert.equal(out.report[0].reason,'turned_off');
  const cycle=app.slice(app.indexOf('async function afterSync(){'),app.indexOf('/* Dear: Thoughts stays authoritative'));
  assert.doesNotMatch(cycle,/maybeProactiveNudge\(\)|maybeCuriosityQuestion\(\)/);
  assert.match(app,/Isabella puede escribirme primero \(como mucho una vez al día, solo si vale la pena\)/);
  const wf=read('.github/workflows/isabella-presence.yml');
  assert.match(wf,/audience=minds-isabella-presence/);
  assert.match(wf,/jq -c '\{ok,users,report:\[\.report\[\]\?\|\{spoke,reason,moment\}\]\}'/,'workflow logs counts, reasons and moment kinds only');
  assert.match(read('supabase/config.toml'),/\[functions\.isabella-presence\]\nverify_jwt = false/);
});
