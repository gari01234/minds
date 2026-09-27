import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Isabella collection selectors use querySelectorAll before forEach',()=>{
  const source=read('apps/isabella/app.js');
  const singular=/(?<!\$)\$\(([^)\n]+)\)\.forEach/g;
  assert.deepEqual([...source.matchAll(singular)].map(m=>m[0]),[]);
});

test('unified MINDS navigation wires all five destinations',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  for(const name of ['assistant','feed','ideas','calendar','readings']){
    assert.ok(shell.includes(`data-nav="${name}"`),`missing nav: ${name}`);
    assert.ok(app.includes(`'${name}'`),`missing route: ${name}`);
  }
  assert.ok(app.includes("$$('.main-nav-item').forEach"));
});

test('ORB compact mode is driven by conversation state',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function syncOrbCompact'));
  assert.ok(app.includes("m.role==='user'"));
  assert.ok(css.includes('.assistant-scroll.orb-compact .orb-button'));
});


test('Feed is a situational surface with weather and Now, not an editorial news feed',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('feed-weather-section'));
  assert.ok(app.includes('feed-section-title">Ahora'));
  assert.ok(!app.includes('feed-section-title">Noticias'));
  assert.ok(!app.includes('feed-section-title">Para mí'));
  assert.ok(ai.includes("surface_version:surface==='feed'?11"));
  assert.ok(ai.includes("return 'feed11-'"));
});

test('message reactions stay attached to messages instead of opening a large modal',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('reaction-popover'));
  assert.ok(app.includes("const quick=['❤️','👍','👎','😂','‼️','❓']"));
  assert.ok(!app.includes("modal('Reaccionar'"));
  assert.ok(css.includes('.reaction-chip'));
});

test('Feed exposes preferences and expandable weather',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(shell.includes('id="feedSettings"'));
  assert.ok(shell.includes('data-action="feedprefs"'));
  assert.ok(app.includes('function feedPreferencesPanel'));
  assert.ok(app.includes('weather-toggle'));
  assert.ok(app.includes('weather-week'));
  assert.ok(ai.includes('weather_location'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
});

test('Sofia chat is a first-class messaging surface inside Readings',()=>{
  const js=read('apps/theory/v09.js');
  const css=read('apps/theory/v10.css');
  assert.ok(js.includes("openSheet('MINDS · SOFÍA'"));
  assert.ok(js.includes('Escríbele a Sofía...'));
  assert.ok(js.includes('v09-chat-mic'));
  assert.ok(js.includes("functions.invoke('sofia-chat'"));
  assert.ok(js.includes("/functions/v1/isabella-transcribe"));
  assert.ok(js.includes('minds:sofia-state'));
  assert.ok(js.includes('v09-reaction-popover'));
  assert.ok(css.includes('html.embedded .v09-sheet[data-kind="chat"]'));
  assert.ok(css.includes('html.embedded .v09-sheet[data-kind="chat"] .v09-chat-form'));
  assert.ok(css.includes('.v09-chat-mic'));
});

test('embedded Readings keeps annotations contextual instead of over the reading',()=>{
  const css=read('apps/theory/v10.css');
  assert.ok(css.includes('html.embedded .reader-tools'));
  assert.ok(css.includes('.reader-tools.mobile-open'));
  assert.ok(css.includes('transform:translateY(calc(100% + 40px))'));
});


test('legacy assistant-calendar swipe navigation is disabled',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(!app.includes(';initSwipe();initVoice();'));
  assert.ok(app.includes(';initVoice();'));
});

test('Sofia chat informs the parent when opened and closed',()=>{
  const js=read('apps/theory/v09.js');
  const css=read('apps/theory/v10.css');
  assert.ok(js.includes("sheet.dataset.kind=kind"));
  assert.ok(js.includes("classList.add('sofia-chat-open')"));
  assert.ok(js.includes("open:false"));
  assert.ok(css.includes('html.embedded.sofia-chat-open .v09-sheet[data-kind="chat"].open'));
});


test('Build 19 removes the redundant calendar shortcut and hides closed embedded sheets',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  const theoryCss=read('apps/theory/v10.css');
  assert.ok(!shell.includes('id="calendarButton"'));
  assert.ok(!app.includes("$('#calendarButton').onclick"));
  assert.ok(css.includes('margin:auto auto 0!important'));
  assert.ok(theoryCss.includes('html.embedded .v09-sheet:not(.open)'));
  assert.ok(theoryCss.includes('visibility:hidden!important'));
});


test('Build 20 keeps Isabella chat continuous and compact ORB unclipped',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('/* Build 20 — continuous chat flow; compact ORB stays fully visible */'));
  assert.ok(css.includes('max-height:none!important'));
  assert.ok(css.includes('margin:0 auto!important'));
});

test('Readings removes explanatory overlays and duplicate reader controls',()=>{
  const v05=read('apps/theory/v05.js');
  const v09=read('apps/theory/v09.js');
  const css=read('apps/theory/v10.css');
  assert.ok(!v05.includes('Texto recuperado de la conversación. Las lecturas son análisis del asistente'));
  assert.ok(!v05.includes('Selecciona un pasaje y usa «Subrayar selección» o «Añadir nota».'));
  assert.ok(v09.includes("drawer.querySelectorAll('.v09-reader-tools').forEach(el=>el.remove())"));
  assert.ok(css.includes('html.embedded .reader-tools{display:none!important}'));
  assert.ok(css.includes('html.embedded .reader-tools.mobile-open'));
});

test('Sofia routes automatically and mirrors Isabella message typography with an ORB',()=>{
  const js=read('apps/theory/v09.js');
  const css=read('apps/theory/v10.css');
  assert.ok(!js.includes("Modo: '+(conv.mode"));
  assert.ok(!js.includes('data-mode="memory"'));
  assert.ok(js.includes('sofia-orb-button'));
  assert.ok(js.includes("form.querySelector('.v09-chat-mic')?.click()"));
  assert.ok(css.includes('.sofia-orb-core'));
  assert.ok(css.includes('font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,Arial,sans-serif!important'));
});



test('Build 41 Feed no longer exposes topic curation or a follow graph',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('El Feed ya no se cura por temas ni noticias'));
  assert.ok(!app.includes('id="feedCustomTopics"'));
  assert.ok(!app.includes('Tu constelación'));
  assert.ok(!ai.includes('feed_follow_graph'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
});

test('Build 21 removes redundant surface headings and Readings explainer',()=>{
  const shell=read('apps/isabella/shell.js');
  const theory=read('apps/theory/v09.js');
  assert.ok(!shell.includes('<h1>Feed</h1>'));
  assert.ok(!shell.includes('<h1>Ideas</h1>'));
  assert.ok(!theory.includes('Leer, marcar, preguntar, volver.'));
  assert.ok(!theory.includes('La memoria de lectura vive aquí'));
});

test('Build 27 opens at the latest message without relying on Safari native selection',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function scrollAssistantToLatest'));
  assert.ok(app.includes("if(name==='assistant')setTimeout(()=>scrollAssistantToLatest(true),0)"));
  assert.ok(app.includes("contextmenu',e=>{e.preventDefault();openReactionPicker"));
  assert.ok(app.includes("selectstart',e=>e.preventDefault()"));
  assert.ok(css.includes('.message-text-picker'));
});


test('Build 22 keeps Feed generations stable and conversations inside Feed',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(app.includes('function openFeedStory'));
  assert.ok(app.includes('function submitFeedStoryQuestion'));
  assert.ok(app.includes('feedThreads'));
  assert.ok(!app.includes('data-news-more'));
  assert.ok(ai.includes('generation_id:generationId'));
  assert.ok(ai.includes("const cached=await loadSurface('feed','isabella',{allowStale:true})"));
  assert.ok(ai.includes('async function feedStory'));
  assert.ok(shell.includes('id="feedDetail"'));
  assert.ok(shell.includes('Preguntar sobre esto...'));
});


test('Build 41 Feed settings are limited to weather and attentional policy',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes("modal('Ajustar Feed'"));
  assert.ok(app.includes('id="weatherLocation"'));
  assert.ok(app.includes('id="feedInstructions"'));
  assert.ok(ai.includes('weather_location'));
  assert.ok(ai.includes('feed_instructions'));
});

test('Build 24 uses a long-press message context with reactions and text actions',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes("setTimeout(()=>{timer=null;if(!moved)openReactionPicker"));
  assert.ok(app.includes('Seleccionar texto'));
  assert.ok(app.includes('Copiar'));
  assert.ok(app.includes('selectMessageText'));
  assert.ok(app.includes('copyMessageText'));
  assert.ok(css.includes('.reaction-backdrop'));
  assert.ok(css.includes('.message-action-menu'));
  assert.ok(css.includes('overflow-wrap:anywhere!important'));
});


test('browser entry scripts are syntactically valid JavaScript',()=>{
  for(const path of ['apps/isabella/app.js','apps/isabella/ai.js','apps/isabella/shell.js']){
    assert.doesNotThrow(()=>new Function(read(path)),path+' must parse');
  }
});



test('Build 41 refresh re-evaluates the situation instead of demanding novelty',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes("startFeedRefresh?.(state,{force,currentItems:visible})"));
  assert.ok(ai.includes('current_titles:currentTitles'));
  assert.ok(app.includes('Reevaluando tu situación…'));
  assert.ok(app.includes("status.textContent='Al día'"));
});

test('Build 24 news detail can render immediate context and optional verified media',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(shell.includes('id="feedDetailMedia"'));
  assert.ok(shell.includes('id="feedDetailArticle"'));
  assert.ok(app.includes('image_url'));
  assert.ok(app.includes('feed-detail-copy'));
  assert.ok(app.includes('feed-detail-copy'));
  assert.ok(app.includes('image_url'));
  assert.ok(ai.includes('async function feedStory'));
});

test('Build 24 gives Isabella a warmer conversational voice without changing surface prompts',()=>{
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('VOZ DE ISABELLA'));
  assert.ok(ai.includes('humor suave'));
  assert.ok(ai.includes('no sacrifiques rigor por cercanía'));
  assert.ok(ai.includes('options.surface'));
});



test('Build 41 hydrates situational detail with personal context',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("surface_version:surface==='feed'?11"));
  assert.ok(ai.includes("context:compact(state)"));
  assert.ok(app.includes('function hydrateFeedStory'));
  assert.ok(app.includes('Buscando contexto y antecedentes'));
});

test('Build 27 uses a deterministic word and emoji picker instead of WebKit selection',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function segmentMessageText'));
  assert.ok(app.includes('function openMessageTextPicker'));
  assert.ok(app.includes('new Intl.Segmenter'));
  assert.ok(app.includes('Copiar selección'));
  assert.ok(!app.includes('range.selectNodeContents'));
  assert.ok(!app.includes('message-selection-active'));
  assert.ok(css.includes('.message-token.selected'));
});

test('Build 27 docks the same Isabella ORB in the top bar instead of floating over chat',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(shell.includes('id="orbDock"'));
  assert.ok(shell.includes('id="orbHome"'));
  assert.ok(app.includes("const target=docked?dock:home"));
  assert.ok(app.includes('target.appendChild(orb)'));
  assert.ok(css.includes('.orb-dock'));
  assert.ok(css.includes('position:relative!important'));
});


test('Build 26 supports confirmed server-side Isabella routines',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  assert.ok(shell.includes('data-action="routines"'));
  assert.ok(app.includes("p.kind==='routine'"));
  assert.ok(app.includes("from('isabella_routines').insert"));
  assert.ok(app.includes('async function routinesPanel'));
  assert.ok(app.includes("await maybeProactiveNudge()"));
  assert.ok(!app.includes("const briefed=await maybeDailyBrief()"));
});


test('Build 27 supports one-time server chat reminders without requiring push permission',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("p.schedule_kind==='once'"));
  assert.ok(app.includes("kind==='once'?{date:p.date||today()}"));
  assert.ok(app.includes("notificaciones del sistema son opcionales"));
  assert.ok(app.includes("sch.kind==='once'"));
});



test('Build 41 preserves Feed preferences as weather plus attentional instructions',()=>{
  const app=read('apps/isabella/app.js');
  const sync=read('apps/isabella/sync.js');
  assert.ok(app.includes("p.kind==='feed_preferences'"));
  assert.ok(app.includes('function applyFeedPreferencesProposal'));
  assert.ok(app.includes('weather_location'));
  assert.ok(sync.includes("preference_key:'feed'"));
  assert.ok(sync.includes("from('isabella_preferences').upsert"));
});


test('Build 41 Feed cache is situational-policy aware and refresh has visible state',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(ai.includes('function feedPreferenceSignature'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
  assert.ok(ai.includes("preference_signature:signature"));
  assert.ok(app.includes('Reevaluando tu situación…'));
  assert.ok(shell.includes('id="feedRefreshStatus"'));
});

test('Build 29 lets Isabella ask sparse non-sensitive curiosity questions',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('function maybeCuriosityQuestion'));
  assert.ok(app.includes('curiosityCadenceHours'));
  assert.ok(ai.includes('async function curiosity'));
  assert.ok(ai.includes('NO_QUESTION'));
  assert.ok(ai.includes('No preguntes por salud'));
});

test('Build 29 supports confirmed behavioral self-improvement',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const sync=read('apps/isabella/sync.js');
  assert.ok(ai.includes('isabella_improvement'));
  assert.ok(app.includes("p.kind==='assistant_preferences'"));
  assert.ok(app.includes('function applyAssistantPreferencesProposal'));
  assert.ok(sync.includes("preference_key:'assistant'"));
  assert.ok(app.includes('Proactividad de Isabella'));
});



test('Build 41 Feed renders cached situational content before slow re-evaluation',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('Leyendo tu situación…'));
  assert.ok(app.includes("loadSurface?.('feed','isabella',{allowStale:true})"));
  assert.ok(ai.includes("const cached=await loadSurface('feed','isabella',{allowStale:true})"));
  assert.ok(ai.includes("surface_version:surface==='feed'?11"));
  assert.ok(ai.includes("return 'feed11-'"));
});


test('Build 41 Feed re-evaluation is asynchronous and keeps engaged signals reachable',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('async function startFeedRefresh'));
  assert.ok(ai.includes('async function waitForFeedRefresh'));
  assert.ok(ai.includes("from('minds_feed_jobs')"));
  assert.ok(ai.includes("String(x?.lifecycle_state||'')==='seen'"));
  assert.ok(app.includes('Sigo reevaluando en segundo plano…'));
  assert.ok(app.includes('feed-ongoing'));
  assert.ok(ai.includes("return 'feed11-'"));
});


test('Build 41 separates Calendar from Feed and keeps only situational signals',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('feed-weather-section'));
  assert.ok(app.includes('feed-now-empty'));
  assert.ok(app.includes("!['weather','clear','news','commitment','pending','research'].includes"));
  assert.ok(!app.includes('feed-section-title">Hoy'));
  assert.ok(!app.includes('feed-section-title">Noticias'));
  assert.ok(app.includes('Leer más'));
});

test('Build 33 Feed learns from explicit card feedback and explains personalization',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes("data-feed-feedback=\"liked\""));
  assert.ok(app.includes("data-feed-feedback=\"not_relevant\""));
  assert.ok(app.includes("data-feed-feedback=\"dismissed\""));
  assert.ok(app.includes("from('minds_surface_feedback').insert"));
  assert.ok(app.includes('¿Por qué esto?'));
  assert.ok(ai.includes("why:String(x.why||'').trim()||null"));
});

test('Build 33 exposes a structured personal model with confirm and correct controls',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("from('isabella_model_claims')"));
  assert.ok(app.includes('Modelo personal'));
  assert.ok(app.includes('data-model-confirm'));
  assert.ok(app.includes('data-model-correct'));
  assert.ok(app.includes("status:'contradicted'"));
});


test('Build 41 Ideas keep lifecycle but only generate producible proposals',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('data-idea-sleep'));
  assert.ok(app.includes('data-idea-dismiss'));
  assert.ok(app.includes("from('isabella_return_queue').insert"));
  assert.ok(ai.includes('deliverable'));
  assert.ok(ai.includes("surface==='idea'?4"));
  assert.ok(ai.includes('Una Idea NO es una observación'));
});


test('Build 41 morning brief uses weather and situational observations without news',()=>{
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('pronóstico breve del clima'));
  assert.ok(ai.includes('observaciones situacionales'));
  assert.ok(ai.includes('No incluyas noticias generales'));
});

test('Build 41 keeps autonomous research available without turning Feed into a research inbox',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("functions.invoke('isabella-research'"));
  assert.ok(ai.includes("from('isabella_research_queue')"));
  assert.ok(ai.includes('async function startResearch'));
  assert.ok(ai.includes('async function loadResearchReady'));
  assert.ok(app.includes('maybePrewarmResearch'));
  assert.ok(!app.includes('Avances de Isabella'));
});

test('Build 34 reactivates sleeping ideas when their return date arrives',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('async function maybeReactivateIdeas'));
  assert.ok(app.includes("from('isabella_return_queue')"));
  assert.ok(app.includes("lifecycle_state:'changed'"));
});


test('Build 35 supports low-friction Isabella quick replies',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('message-quick-replies'));
  assert.ok(app.includes('data-quick-message'));
  assert.ok(app.includes('quickReplies:result.quick_replies'));
  assert.ok(app.includes('handle(q.value)'));
});

test('Build 35 Feed proposals can confirm weather location cross-links',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('proposalWeatherLocation'));
  assert.ok(app.includes("if(Object.prototype.hasOwnProperty.call(p,'weather_location')||weather!==currentWeather)next.weather_location=weather"));
  assert.ok(app.includes("weatherChanged=Object.prototype.hasOwnProperty.call(p,'weather_location')"));
});


test('Build 36 sanitizes legacy memory kinds before Supabase sync',()=>{
  const app=read('apps/isabella/app.js');
  const sync=read('apps/isabella/sync.js');
  assert.ok(app.includes('function normalizeMemoryKind(kind)'));
  assert.ok(sync.includes('function normalizeMemoryKind(kind)'));
  assert.ok(sync.includes(".filter(m=>typeof m!=='object'||m.status!=='deleted')"));
  assert.ok(sync.includes("kind:typeof m==='object'?normalizeMemoryKind(m.kind):'context'"));
  assert.ok(sync.includes("['active','corrected','rejected','archived'].includes"));
});


test('Build 37 opens calendar on today and keeps today visually marked after another selection',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes("if(name==='calendar'&&previous!=='calendar')state.date=today()"));
  assert.ok(app.includes('month-weekdays'));
  assert.ok(css.includes('.mc.today:not(.selected) .mn{color:#e84d62'));
  assert.ok(css.includes('.mc.selected .mn{background:#111;color:#fff}'));
});

test('Build 37 supports undated tasks without forcing them into the calendar',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const sync=read('apps/isabella/sync.js');
  assert.ok(app.includes("const undated=pending.filter(t=>!t.date).length"));
  assert.ok(app.includes("Fecha (opcional)"));
  assert.ok(ai.includes('undated_tasks:undatedTasks'));
  assert.ok(sync.includes('due_date:t.date||null'));
});

test('Build 37 allows private photo attachments in Isabella chat',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(shell.includes('id="chatImageInput"'));
  assert.ok(app.includes("storage.from('isabella-uploads').upload"));
  assert.ok(app.includes('hydrateChatImages'));
  assert.ok(ai.includes('attachments:Array.isArray(options.attachments)'));
});


test('Build 38 organizes tasks as lists with drill-down and completion toggles',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('task-group-card'));
  assert.ok(app.includes('function taskGroupPanel(group)'));
  assert.ok(app.includes('function toggleTaskDone(id)'));
  assert.ok(app.includes('data-task-toggle'));
});

test('Build 38 uses a dedicated Feed detail worker',()=>{
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("functions.invoke('isabella-feed-story'"));
  assert.ok(ai.includes('45000'));
});

test('Build 38 gives accepted Ideas persistent isolated workspaces and deliverables',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(shell.includes('id="ideaWorkspace"'));
  assert.ok(app.includes("from('minds_idea_workspaces')"));
  assert.ok(app.includes("from('minds_idea_messages')"));
  assert.ok(app.includes('artifact_content'));
  assert.ok(ai.includes("functions.invoke('minds-idea-worker'"));
});

test('Build 39 keeps Feed loading transient and makes contextual questions visibly progress',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('const feedOverviewRequests=new Set(),feedQuestionRequests=new Set()'));
  assert.ok(app.includes("delete thread.overviewLoading"));
  assert.ok(!app.includes('thread.overviewLoading=true'));
  assert.ok(app.includes('Buscando una respuesta…'));
  assert.ok(app.includes("if(!result?.reply)throw new Error('La respuesta del Feed llegó vacía.')"));
});


test('Build 41 exposes the new situational/productive architecture and fresh PWA assets',()=>{
  const shell=read('apps/isabella/shell.js');
  const index=read('apps/isabella/index.html');
  const sw=read('apps/isabella/sw.js');
  assert.ok(shell.includes('Build 2026.09.27.42'));
  assert.ok(shell.includes('MINDS · TRABAJO'));
  assert.ok(index.includes('app.css?v=39'));
  assert.ok(index.includes('shell.js?v=42'));
  assert.ok(index.includes('app.js?v=51'));
  assert.ok(index.includes('ai.js?v=35'));
  assert.ok(sw.includes("const CACHE_NAME = 'isabella-shell-v49'"));
});

test('Build 41 Ideas transition from proposals into production and durable artifacts',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('Convertir en trabajo'));
  assert.ok(app.includes('En producción'));
  assert.ok(app.includes('Producido'));
  assert.ok(app.includes('ARTEFACTO'));
  assert.ok(app.includes('toggleIdeaWorkspaceStatus'));
  assert.ok(app.includes("ideaWork?.(w,message,w.messages||[],state)"));
  assert.ok(ai.includes('context:state?compact(state):{}'));
});

test('Build 41 shows visible AI activity around action buttons',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function setWorking'));
  assert.ok(app.includes("setWorking($('#sendButton'),true)"));
  assert.ok(app.includes("setWorking(refresh,true)"));
  assert.ok(css.includes('.send.is-working::before'));
  assert.ok(css.includes('@keyframes minds-ai-ring'));
});


test('Build 42 adds real artifacts, selective Ideas, Retomar and usage monitoring',()=>{const app=read('apps/isabella/app.js'),ai=read('apps/isabella/ai.js'),sync=read('apps/isabella/sync.js'),shell=read('apps/isabella/shell.js');assert.equal((app.match(/async function renderIdeas\(force=false\)/g)||[]).length,1);assert.ok(!app.includes("sofiaSurface?.('idea'"));assert.ok(ai.includes("functions.invoke('isabella-ideas'"));assert.ok(ai.includes("functions.invoke('isabella-artifact'"));assert.ok(app.includes('artifactMarkup'));assert.ok(app.includes('feed-section-title">Retomar'));assert.ok(!app.includes('feed-section-title">En conversación'));assert.ok(app.includes("from('minds_ai_usage')"));assert.ok(shell.includes('data-action="aiusage"'));assert.ok(sync.includes('artifacts:Array.isArray(m.artifacts)'));});
