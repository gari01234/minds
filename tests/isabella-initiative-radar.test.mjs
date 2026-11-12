// Gari, 08.11.2026: «Isabella no es nada proactiva… Tampoco sabe nada de los Threads o me comenta cosas
// que podrían ser importantes y yo no me haya dado cuenta». And: «¿hace que baje el nivel?».
// The radar gives her Work awareness; the core asks for initiative; the original detailed guidance comes
// back when a turn needs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRadar,workRadar,RADAR_LIMITS} from '../supabase/functions/_shared/isabella-radar.mjs';
import {ISABELLA_CORE,isabellaCoreInstructions,coreConversationContext} from '../supabase/functions/_shared/isabella-core.mjs';
import {CORE_DETAILS,detailKeys} from '../supabase/functions/_shared/isabella-core-details.mjs';
import {leanConversationContext} from '../supabase/functions/_shared/light-conversation-context.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');

const projects=[{id:'b',name:'Bernried',archived:false},{id:'s',name:'Schwarz',archived:false},{id:'x',name:'Alt',archived:true}];
const threads=[
  {id:'t1',project_id:'b',title:'Lichtplanung',updated_at:'2026-11-04T14:54:00Z',
    metadata:{themenblatt:{stand:'Angebote iGuzzini und Reggiani liegen vor; Entscheidung offen.',offene_fragen:['Welcher Hersteller?','Budget?','Termin?'],aktualisiert_am:'2026-11-04'}}},
  {id:'t2',project_id:'b',title:'Bodenbelag und Stellwände',summary:'Muster angefragt.',updated_at:'2026-11-02T14:46:00Z',metadata:{}},
  {id:'t3',project_id:'x',title:'Archivado',updated_at:'2026-11-05T10:00:00Z',metadata:{}}];
const memos=[
  {project_id:'b',memory_type:'deadline',title:'Präsentation Gemeinderat',status:'confirmed',occurred_at:'2026-11-10'},
  {project_id:'b',memory_type:'deadline',title:'Abgabe vor drei Wochen',status:'confirmed',occurred_at:'2026-10-01'},
  {project_id:'b',memory_type:'decision',title:'Hohlboden 10 cm',status:'proposed'},
  {project_id:'b',memory_type:'commitment',title:'Muster an Bauherrn senden',status:'proposed',metadata:{kind:'aufgabe'}},
  {project_id:'b',memory_type:'open_question',title:'Treppe Nord: Breite widerspricht Plan',status:'proposed',metadata:{kind:'widerspruch'}},
  {project_id:'s',memory_type:'deadline',title:'Video V2',status:'proposed',occurred_at:'2026-11-12'}];

test('The radar summarises topics, deadlines, pending confirmations and contradictions — no thread messages',()=>{
  const r=buildRadar({projects,threads,memos,today:'2026-11-08'});
  assert.deepEqual(r.proyectos.map(p=>p.proyecto),['Bernried','Schwarz']);
  const b=r.proyectos[0];
  assert.equal(b.temas[0].tema,'Lichtplanung');
  assert.match(b.temas[0].estado,/Entscheidung offen/);
  assert.equal(b.temas[0].abiertas.length,RADAR_LIMITS.questions);
  assert.deepEqual(b.fristen,[{que:'Präsentation Gemeinderat',fecha:'2026-11-10',confirmada:true}],'past deadlines are not news');
  assert.equal(b.por_confirmar,1);
  assert.deepEqual(b.tareas_propuestas,['Muster an Bauherrn senden']);
  assert.deepEqual(b.contradicciones,['Treppe Nord: Breite widerspricht Plan']);
  assert.equal(r.proyectos[1].por_confirmar,1);
  assert.ok(!JSON.stringify(r).includes('Archivado'),'archived projects stay out');
  assert.ok(JSON.stringify(r).length<4000);
  assert.equal(buildRadar({projects,threads:[],memos:[],today:'2026-11-08'}),null);
});

test('The radar reads with the caller\'s client and never breaks a turn',async()=>{
  const q=(data)=>new Proxy({},{get(_,k){if(k==='then')return (ok)=>ok({data,error:null});return ()=>q(data)}});
  const sb={from:t=>t==='isabella_projects'?q(projects):t==='minds_work_threads'?q(threads):q(memos)};
  const r=await workRadar(sb,{now:new Date('2026-11-08T10:00:00Z')});
  assert.equal(r.proyectos[0].proyecto,'Bernried');
  assert.equal(await workRadar({from:()=>{throw new Error('down')}}),null);
  assert.equal(await workRadar(null),null);
});

test('Global turns carry the radar (core and light); Work routes keep their own context',()=>{
  assert.match(chat,/const radarPending=ownMode\|\|\(isabellaCoreEligible&&exposureScope\.kind==="global"\)\?early\.radar:Promise/);
  assert.match(chat,/radar_work:radar,/);
  const radar={proyectos:[{proyecto:'Bernried'}]};
  assert.deepEqual(coreConversationContext({radar_work:radar}).radar_work,radar);
  assert.deepEqual(leanConversationContext({radar_work:radar}).radar_work,radar);
  const keys=Object.keys(coreConversationContext({radar_work:radar,current_local_datetime:'x',undated_tasks:[]}));
  assert.ok(keys.indexOf('radar_work')<keys.indexOf('undated_tasks'),'slow-changing, early in the cached prefix');
});

test('Initiative: she brings up what matters, offers concrete help, stays in personal moments',()=>{
  for(const must of ['No esperes a que te lo pidan todo','radar_work','probablemente no ha visto','aunque te haya preguntado por otra cosa',
    'Propón lo que puedes hacer por él de verdad','Preparar y enseñar está bien; aplicar sin su confirmación, no',
    'Si te pregunta por un día, mira también lo que viene después','En un momento personal','una propuesta concreta que puedes cumplir no es un cierre de cortesía'])
    assert.ok(ISABELLA_CORE.includes(must),must);
  assert.doesNotMatch(ISABELLA_CORE,/Como mucho una pregunta/);
  assert.doesNotMatch(ISABELLA_CORE,/Lo operativo va después, y solo si hace falta/);
});

test('Capability: the original detailed guidance returns when the turn needs it',()=>{
  const old=chat.slice(chat.indexOf('  const system = `Eres Isabella'),chat.indexOf('`;\n  const consolidated=await consolidatedPending;'));
  // Verbatim copies of the full prompt (Work excluded): nothing was paraphrased away.
  for(const [k,text] of Object.entries(CORE_DETAILS))
    for(const line of text.split('\n').filter(l=>l.length>60&&!/^(MATERIAL Y ENTREGABLES|DETALLE)/.test(l)))
      assert.ok(old.includes(line.replace(/ hasta 4 Skills /,' hasta ${MAX_COMPOSED_SKILLS} Skills ')),k+': '+line.slice(0,80));
  assert.deepEqual(detailKeys({light:true,route:{complexity:'deep'}}),[]);
  assert.deepEqual(detailKeys({route:{complexity:'standard'}}),['memory','settings']);
  assert.deepEqual(detailKeys({route:{complexity:'standard',material_deliverable:true}}),['memory','settings','artifacts']);
  assert.deepEqual(detailKeys({route:{complexity:'standard',specialists:['planning']}}),['memory','settings','continuity','specialists']);
  assert.ok(detailKeys({route:{complexity:'standard'},context:{active_mission_runs:[{id:1}]}}).includes('continuity'));
  assert.ok(detailKeys({route:{complexity:'standard',web:true}}).includes('web'));
  assert.ok(detailKeys({route:{},skills:[{slug:'s'}]}).includes('skills'));
  assert.match(CORE_DETAILS.skills,/usa propose_skill/,'learning from repeated corrections is back');
  assert.match(CORE_DETAILS.memory,/CONEXIONES OPERATIVAS/);
  assert.match(CORE_DETAILS.memory,/ENTIDADES NOMBRADAS/);
  assert.match(CORE_DETAILS.continuity,/notify_mode=interrupt_on_complete SOLO si el usuario pide explícitamente/);
  assert.doesNotMatch(CORE_DETAILS.continuity,/No finjas emociones/,'no contradiction with the relationship contract');
  const deep=isabellaCoreInstructions({relationship:'R',route:{complexity:'deep'}});
  assert.match(deep,/DETALLE PARA ESTE TURNO/);
  assert.match(chat,/scheduleAssessment,light:leanSurface,route,context:resolvedContext,details:detailsMode\}\)/);
  // Context back to the full tier's sizes, compact.
  const big=n=>Array.from({length:n},(_,i)=>({id:i,claim:'c'}));
  assert.equal(coreConversationContext({personal_model_claims:big(40)}).personal_model_claims.length,32);
  assert.equal(coreConversationContext({recalled_memory:big(20)}).recalled_memory.length,14);
});
