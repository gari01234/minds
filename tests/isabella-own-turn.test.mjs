// 11.11.2026 — Gari's steps 1 and 3: one author (no router model before her) and short purpose
// notes instead of the long instruction blocks. These tests pin what must stay true.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {REASONING_CONTRACT,ROUTINE_READ,namedProject,bareGreeting,DIALOGUE_WINDOW,onDemandWorkContext,onDemandProjectModel,
  conversationContext,turnInstructions} from '../supabase/functions/_shared/isabella-turn.mjs';
import {interactiveTools,DEEPER_TOOL,CONVERSATION_TOOLS,CALENDAR_TOOLS} from '../supabase/functions/_shared/isabella-tools.mjs';
import {FOLLOWUP_TOOLS} from '../supabase/functions/_shared/isabella-followups.mjs';
import {ISABELLA_CORE,capabilityNotes,toolNamesOf} from '../supabase/functions/_shared/isabella-core.mjs';
import {CORE_DETAILS} from '../supabase/functions/_shared/isabella-core-details.mjs';
import {dialogueTurnInput} from '../supabase/functions/_shared/turn-capability-contract.mjs';
import {profileTools} from '../supabase/functions/_shared/assistant-profile.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const tools=interactiveTools({clarification:true,followUps:FOLLOWUP_TOOLS,deeper:true});
const relationship='R'.repeat(6600);

test('a project is settled before she reads only when the message names it, never guessed',()=>{
  const projects=[{name:'Bernried'},{name:'Schwarz'},{name:'Villa Höhenweg'},{name:'Casa'},{name:'EL'}];
  assert.equal(namedProject('¿Cómo va lo de Bernried?',projects),'Bernried');
  assert.equal(namedProject('wie steht es um BERNRIED, 3. BA',projects),'Bernried');
  assert.equal(namedProject('Agrega Comprar papel en Casa',projects),'Casa');
  assert.equal(namedProject('la villa hohenweg otra vez',projects),'Villa Höhenweg','accents and case aside');
  // Two projects, part of a word, a partial name or a two-letter name: nothing is decided for her.
  assert.equal(namedProject('compara Bernried con Schwarz',projects),null);
  assert.equal(namedProject('Bernrieder Straße 5',projects),null);
  assert.equal(namedProject('lo del Höhenweg',projects),null);
  assert.equal(namedProject('el plano',projects),null);
  assert.equal(namedProject('¿qué tengo mañana?',projects),null);
  assert.equal(namedProject('',projects),null);
  assert.equal(namedProject('Bernried',null),null);
});

test('the greeting lane only recognises a bare greeting, thanks or acknowledgement',()=>{
  for(const yes of ['Hola','hola!','¡Buenos días, Isabella!','Guten Morgen Romy','Danke dir','gracias','ok','Vale.','Moin','Perfecto'])
    assert.equal(bareGreeting(yes),true,yes);
  for(const no of ['Hola, ¿qué tengo hoy?','Mueve la cita','ok, bórralo','gracias, y apunta lo de Hans','¿Hola?  y el plano','','sí','Guten Morgen, was steht heute an?'])
    assert.equal(bareGreeting(no),false,no);
  // It changes deliberation and nothing else: same tools, same context, same instructions.
  assert.match(chat,/const greeting=bareGreeting\(effectiveMessage\)&&!attachments\.length&&!context\?\.reply_context&&!verifiedContinuation;/);
  assert.match(chat,/budget=\{\.\.\.budget,depth:"standard",rounds:6,reasoning:greeting\?"low":"medium",maxOutput:currentWorkThread\?6200:4800\};/);
});

test('by default no second model reads the message before her; one switch restores it',()=>{
  assert.match(chat,/const routerOn=Deno\.env\.get\("ISABELLA_ROUTER"\)==="on";/);
  assert.match(chat,/const ownMode=!routerOn&&!background;/);
  assert.match(chat,/const route=ownMode\?await ownRoute\(req,effectiveMessage\):await routeRequest\(/);
  const own=chat.slice(chat.indexOf('async function ownRoute('),chat.indexOf('function canonicalWorkFilename('));
  assert.doesNotMatch(own,/fetch\(|api\.openai\.com|recordUsage/,'ownRoute never calls a model');
  assert.match(own,/namedProject\(message,catalog\.data\|\|\[\]\)/);
  assert.match(own,/source:"own\+named_project"/);
  // The router is still there, untouched, behind the switch.
  assert.match(chat,/async function routeRequest\(req:Request,message:string,apiKey:string,background:boolean,context:any=\{\}\)/);
  assert.match(chat,/recordUsage\(req,"decision_router"/);
  // The sticky-scope hint only fed the router.
  assert.match(chat,/const exposureHint=currentWorkThread\|\|ownMode\?null:await latestExposureHint\(req\);/);
});

test('nothing is preloaded: a named project is a pointer and she reads it with her tools',()=>{
  const pointer=onDemandWorkContext('Bernried');
  assert.equal(pointer.status,'not_preloaded');assert.equal(pointer.project,'Bernried');assert.equal(pointer.recover_with,'search_work');
  assert.ok(JSON.stringify(pointer).length<400);
  assert.match(chat,/ownMode\?Promise\.resolve\(route\.project\?onDemandWorkContext\(route\.project\):null\):/);
  // A pointer is not something she read: the turn is not tainted and no admission failure is logged.
  assert.match(chat,/let sourceTainted=\(!!routedWork&&routedWork\.status!=="not_preloaded"\)\|\|!!routedSofia;/);
  // search_work returns what matches; the whole Project Model only when she asks for it.
  assert.match(chat,/const focused=ownMode&&args\?\.include_project_model!==true;/);
  assert.equal(onDemandProjectModel().status,'not_included');
  const searchWork=CONVERSATION_TOOLS.find(t=>t.name==='search_work');
  assert.equal(searchWork.parameters.properties.include_project_model.type,'boolean');
  assert.match(searchWork.description,/set include_project_model:true when the question is about the structure of the project as a whole/);
  assert.deepEqual(searchWork.parameters.required,['project']);
});

test('her one conversation reads back its last turns whatever project each was about; legacy rows never',()=>{
  assert.match(chat,/history:recentConversation\(req,effectiveMessage,currentWorkThread\?\.conversation_id\|\|null,tentativeScope,currentWorkThread\?false:ownMode\?"conversation":true\)/);
  const reader=chat.slice(chat.indexOf('async function recentConversation('),chat.indexOf('const chronological = messages.reverse()'));
  assert.match(reader,/if\(strictScope==="conversation"\)\{/);
  assert.match(reader,/\.eq\("conversation_id",cid\)\.eq\("exposure_scope_version",1\)\.in\("role",\["user","assistant"\]\)/);
  assert.match(chat,/ownMainChat\|\|exposureScope\.key===tentativeScope\?early\.history:recentConversation\(/);
  // 24 messages, the last six nearly whole.
  assert.deepEqual({...DIALOGUE_WINDOW},{limit:24,chars:1600,recentChars:4000,recentCount:6});
  assert.match(chat,/dialogueTurnInput\(recent,turnText,\{\.\.\.\(ownMode\?DIALOGUE_WINDOW:\{\}\),/);
  const long='x'.repeat(5000);
  const history=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:i===29?long:'m'+i,created_at:'2026-11-11T10:00:00Z'}));
  const input=dialogueTurnInput(history,'ahora',DIALOGUE_WINDOW);
  assert.equal(input.length,25);
  assert.equal(input.at(-2).content.length,4000);
});

test('an earlier «sí» no longer swallows a later one in the history she reads',()=>{
  const start=chat.indexOf('function mergeRecentConversations(');
  const end=chat.indexOf('\nfunction ',start+10);
  const merge=vm.runInNewContext(stripTypeScriptTypes(chat.slice(start,end))+';mergeRecentConversations',
    {normalizeText:v=>String(v||'').trim().toLowerCase()});
  const rows=[
    {role:'assistant',content:'¿Te lo apunto?'},{role:'user',content:'Sí'},
    {role:'assistant',content:'Hecho.'},{role:'assistant',content:'Hecho.'},
    {role:'assistant',content:'¿Y lo de Hans también?'},{role:'user',content:'Sí'},
    {role:'user',content:'¿Qué más queda?'}];
  const merged=merge(rows,[],'¿Qué más queda?');
  assert.deepEqual(Array.from(merged,m=>m.content),['¿Te lo apunto?','Sí','Hecho.','¿Y lo de Hans también?','Sí']);
});

test('one stable text for every turn of a conversation: core, relationship and what each capability is for',()=>{
  const skills=[{slug:'s',name:'n',description:'d'.repeat(150)}];
  const text=turnInstructions({relationship,tools,skills});
  assert.ok(text.startsWith(REASONING_CONTRACT+'\n\n'+ROUTINE_READ+'\n\n'+ISABELLA_CORE));
  assert.ok(text.includes(relationship),'her character is the relationship contract, intact');
  assert.match(text,/LO QUE PUEDES HACER EN ESTE TURNO/);
  for(const note of ['AGENDA:','RUTINAS Y RECORDATORIOS:','RECORDATORIOS SITUACIONALES Y VIGILANCIAS:','MEMORIA:','WORK:','SOFÍA:','WEB:','MATERIAL:',
    'OBJETIVOS Y TRABAJO DE VARIAS ETAPAS:','SEGUNDA PASADA:','HABILIDADES:','AJUSTES:','SEGUIMIENTOS:','RESPUESTAS RÁPIDAS:','PENSAR A FONDO:'])
    assert.ok(text.includes(note),note);
  // No long block, whatever the turn is about: nothing here depends on a verdict about the message.
  assert.doesNotMatch(text,/DETALLE PARA ESTE TURNO|DETALLE WORK PARA ESTE TURNO/);
  assert.equal(text,turnInstructions({relationship,tools,skills,context:{active_mission_runs:[{id:1}],active_commitments:[{id:2}]}}));
  assert.ok(text.length<24000,String(text.length));
  // A Work thread adds one paragraph.
  const thread=turnInstructions({relationship,tools,skills,thread:true});
  assert.match(thread,/ESTE HILO: estás en un Thread de Work \(current_work_thread\)/);
  assert.ok(thread.length-text.length<400);
  // The switch brings the long blocks back.
  const legacy=turnInstructions({relationship,tools,skills,details:'legacy'});
  assert.match(legacy,/DETALLE PARA ESTE TURNO/);
  assert.ok(legacy.includes(CORE_DETAILS.memory)&&legacy.includes(CORE_DETAILS.settings));
  assert.ok(turnInstructions({relationship,tools,skills,details:'legacy',thread:true}).includes(CORE_DETAILS.work));
  assert.ok(legacy.length-text.length>9000,'the short notes save about ten thousand characters on a standard turn');
});

test('what the long blocks said about purpose lives in the notes; the mechanics live in the tools',()=>{
  const notes=capabilityNotes(toolNamesOf(tools)).join('\n');
  for(const kept of [
    'queda «pendiente de comprobar»: no digas que falló',                       // expectations
    'un resumen automático o algo que dijiste tú no es un hecho confirmado por él', // provenance of recall
    'everywhere:true para toda vuestra historia',                               // looking beyond the scope
    'un fragmento extraído es contenido del archivo, no una decisión',           // Work excerpts
    'find_work_occurrences y browse_work_sources recorren el corpus',            // exhaustive comparisons
    'lo que se va a imprimir, firmar, rellenar, presentar o reutilizar es un archivo', // deliverables
    'pásalo como input_files',                                                   // editing an existing file
    'quién tiene la pelota',                                                     // long work
    'No reabras una preferencia que ya contestó',                                // settings
    'salud, diagnósticos, religión, política, sexualidad, finanzas'              // what is never stored
  ])assert.ok(notes.includes(kept),kept);
  const all=[...CONVERSATION_TOOLS,...CALENDAR_TOOLS];
  const description=name=>JSON.stringify(all.find(t=>t.name===name)||{});
  // Mechanics that used to be repeated in the blocks are stated where she uses them.
  assert.match(description('start_mission_run'),/notify_mode/);
  assert.match(description('remember_information'),/user_excerpt/);
  assert.match(description('execute_artifact_task'),/input_files/);
  assert.match(description('find_work_occurrences'),/exhaustive|cursor|coverage/i);
  assert.match(description('create_standing_intent'),/NOT monitoring|not monitoring/i);
  assert.match(description('search_memory'),/everywhere:true when the owner refers to something said or decided before/);
});

test('she asks for deeper reasoning herself; nothing else decides how hard she thinks',()=>{
  assert.equal(DEEPER_TOOL.name,'think_deeper');
  assert.match(DEEPER_TOOL.description,/Call it FIRST and alone/);
  assert.ok(interactiveTools({deeper:true}).some(t=>t.name==='think_deeper'));
  assert.ok(!interactiveTools({}).some(t=>t.name==='think_deeper'));
  assert.ok(profileTools(tools,'office','Alex').some(t=>t.name==='think_deeper'),'Romy has it too');
  assert.match(chat,/\.\.\.\(ownMode\?\[DEEPER_TOOL\]:\[\]\)/);
  const block=chat.slice(chat.indexOf('if(ownMode&&!deeperModel&&calls.some('),chat.indexOf('if(calls.some((x:any)=>x.name==="request_clarification")){'));
  assert.match(block,/deeperModel=chatTurnModel\(\{complexity:"deep",depth:"deep"/);
  assert.match(block,/reasoningEffort="high"/);
  assert.match(block,/tools\.filter\(\(t:any\)=>t\?\.name!=="think_deeper"\)/,'only once per turn');
  // Her main conversation restarts the round on the deeper model; a provider-held conversation answers the call.
  assert.match(block,/if\(!\(!fastAgenda&&!boundedGlobalChat&&conversationInfo\.id\)\)\{round--;continue;\}/);
  assert.match(chat,/\}else if\(call\.name==="think_deeper"\)\{\s+outputs\.push\(/);
  assert.match(chat,/think_deeper:"allow"/);
  // Without the router the turn starts on the everyday model (a Work thread on the capable one).
  assert.match(chat,/let model=turnModel\.model;/);
});

test('the context of a turn is one compact tier, without the router\'s verdict',()=>{
  const full={relationship_policy_version:'v',preferences:{a:1},memoria_de_isabella:{paginas:[]},radar_work:{proyectos:[]},
    today_tasks:[{title:'x'}],upcoming:[],recalled_memory:[{id:1}],exposure_scope:{key:'global'},current_local_datetime:'now',
    route:{complexity:'standard'},cognitive_depth:'standard',specialist_candidates:[],specialist_plan_hint:null,semantic_memory:[],
    current_work_thread:{id:'t1',title:'Lichtplanung'},routed_work_context:onDemandWorkContext('Bernried'),
    personal_model_claims:[],active_commitments:[],memory_checkpoint:{summary:'s'}};
  const c=conversationContext(full);
  for(const gone of ['route','cognitive_depth','specialist_candidates','specialist_plan_hint','semantic_memory'])assert.ok(!(gone in c),gone);
  for(const kept of ['preferences','memoria_de_isabella','radar_work','today_tasks','upcoming','recalled_memory','exposure_scope',
    'current_local_datetime','current_work_thread','routed_work_context','active_commitments','memory_checkpoint'])assert.ok(kept in c,kept);
  assert.deepEqual(conversationContext(null),{});
  // A long objective's scratchpad: where it stands and its latest notes; the rest she reads when she works on it.
  const ws={id:'w1',commitment_id:'c1',title:'Comparación de luminarias',status:'active',summary:'s',
    items:Array.from({length:10},(_,i)=>({id:'i'+i,kind:'note',status:'open',content:'n'.repeat(900),created_at:'2026-11-0'+(i%9+1)}))};
  const compact=conversationContext({commitment_workspaces:[ws]}).commitment_workspaces[0];
  assert.equal(compact.items.length,4);assert.equal(compact.items_total,10);assert.equal(compact.rest_with,'read_commitment_workspace');
  assert.equal(compact.items.at(-1).id,'i9');assert.equal(compact.items[0].content.length,320);
  assert.equal(compact.title,'Comparación de luminarias');
  assert.match(chat,/const modelContext=ownMode\?conversationContext\(resolvedContext\):/);
  assert.match(chat,/const modelInstructions=ownMode\?turnInstructions\(\{relationship:relationshipPolicy\("conversation"\),tools,/);
  // Radar, her nightly memory and the follow-up tools belong to every turn of her conversation.
  assert.match(chat,/const ownMainChat=ownMode&&!currentWorkThread;/);
  assert.match(chat,/const detailsMode:"short"\|"legacy"=detailsEnv==="legacy"\|\|\(routerOn&&detailsEnv!=="short"\)\?"legacy":"short";/);
});

test('she decides when to look beyond the scope of the conversation, in any language',()=>{
  const call=chat.slice(chat.indexOf('}else if(call.name==="search_memory"){'),chat.indexOf('}else if(call.name==="read_self_review"){'));
  assert.match(call,/explicitMemoryCrossScope\(effectiveMessage\)\|\|\(ownMode&&args\?\.everywhere===true\)/);
  assert.match(call,/if\(named\?\.id\)memoryScope="project:"\+named\.id;/);
});
