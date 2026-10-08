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

test('message reactions use a compact quick pill and dedicated emoji sheet',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('reaction-popover'));
  assert.ok(app.includes("label:'<3'"));
  assert.ok(app.includes("label:'YE!'"));
  assert.ok(app.includes("label:'HA!'"));
  assert.ok(app.includes("label:'OK'"));
  assert.ok(app.includes("label:'NOPE'"));
  assert.ok(app.includes("label:':)'"));
  assert.ok(app.includes('function openEmojiReactionSheet(id)'));
  assert.ok(!app.includes("modal('Reaccionar'"));
  assert.ok(css.includes('.message-reaction-badge'));
  assert.ok(css.includes('.emoji-reaction-sheet'));
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

test('Chat opens at the latest message while preserving native text selection',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function scrollAssistantToLatest'));
  assert.ok(app.includes("if(name==='assistant'&&previous!=='assistant')setTimeout(()=>scrollAssistantToLatest(true),0)"));
  assert.ok(app.includes('data-message-react'));
  assert.ok(!app.includes("selectstart',e=>e.preventDefault()"));
  assert.ok(css.includes('user-select:text!important'));
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

test('Message reactions use an explicit action instead of hijacking long-press selection',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('class="message-react"'));
  assert.ok(app.includes('function openReactionPicker'));
  assert.ok(!app.includes("setTimeout(()=>{timer=null;if(!moved)openReactionPicker"));
  assert.ok(!app.includes("contextmenu',e=>{e.preventDefault();openReactionPicker"));
  assert.ok(css.includes('.reaction-backdrop'));
  assert.ok(css.includes('.message-react'));
  assert.ok(css.includes('overflow-wrap:anywhere!important'));
});


test('Presence review deep links resolve the exact pending shadow decision',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("searchParams.get('review')"));
  assert.ok(app.includes("sb.from('minds_shadow_decisions')"));
  assert.ok(app.includes(".eq('request_id',requestId).eq('status','pending')"));
  assert.ok(app.includes("show('assistant')"));
  assert.ok(app.includes("confirmProposal({...row.candidate,request_id:requestId})"));
});

test('Work binds project switches through querySelectorAll and cannot regress to singular querySelector.forEach',()=>{
  const work=read('apps/isabella/work.js');
  assert.ok(work.includes("$('[data-work-project]').forEach"));
  assert.equal(/(?<!\$)\$\('\[data-work-project\]'\)\.forEach/.test(work),false);
});

test('MINDS Calendar refreshes canonical task state when opened or when the browser regains focus',()=>{
  const app=read('apps/isabella/app.js'),sync=read('apps/isabella/sync.js');
  assert.ok(app.includes("if(previous!=='calendar')setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0)"));
  assert.ok(app.includes("document.addEventListener('visibilitychange'"));
  assert.ok(app.includes("state.screen==='calendar'"));
  assert.ok(sync.includes("priority:t.priority||'normal'"));
});

test('Chat and artifact images are lazy-hydrated to avoid repeated private Storage egress',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('function observeStorageImage'));
  assert.ok(app.includes("new IntersectionObserver"));
  assert.ok(app.includes("observeStorageImage(img,'isabella-uploads'"));
  assert.ok(app.includes("observeStorageImage(img,'minds-artifacts'"));
  assert.ok(app.includes('loading="lazy" data-chat-image-path'));
});


test('Build 83 chat accepts and preserves real document attachments',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  const server=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(shell.includes('accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.eml"'));
  assert.ok(app.includes('CHAT_UPLOAD_MAX_BYTES=12*1024*1024'));
  assert.ok(app.includes('CHAT_UPLOAD_MAX_TOTAL_BYTES=24*1024*1024'));
  assert.ok(app.includes('async function uploadChatFiles'));
  assert.ok(app.includes('data-chat-file-path'));
  assert.ok(server.includes('async function loadChatAttachments'));
  assert.ok(server.includes('type:"input_file"'));
  assert.ok(server.includes('filename'));
});

test('Build 83 Work uses one visible planner scroll surface so cards cannot collapse inside buckets',()=>{
  const css=read('apps/isabella/app.css');
  const work=read('apps/isabella/work.js');
  assert.ok(css.includes('.work-board{overflow-x:auto!important;overflow-y:auto!important;align-items:flex-start!important}'));
  assert.ok(css.includes('.work-bucket-scroll{flex:none!important'));
  assert.ok(work.includes("tasks.some(t=>!t.work_bucket_id)"));
  assert.ok(work.includes("name:'Ohne Bucket'"));
  assert.ok(work.includes("from('isabella_tasks')"));
});

test('browser entry scripts are syntactically valid JavaScript',()=>{
  for(const path of ['apps/isabella/app.js','apps/isabella/ai.js','apps/isabella/shell.js','apps/isabella/work.js']){
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

test('Isabella keeps its conversational voice in the shared relationship policy',()=>{
  const server=read('supabase/functions/isabella-chat/index.ts');
  const policy=read('supabase/functions/_shared/relationship-policy.ts');
  assert.ok(server.includes('relationshipPolicy("conversation")'));
  assert.ok(policy.includes('humor propio'));
  assert.ok(policy.includes('No burocratices la conversación'));
  assert.ok(policy.includes('No optimices tiempo de pantalla'));
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('message:String(message)'));
  assert.ok(!ai.includes('VOZ DE ISABELLA'));
});



test('Build 41 hydrates situational detail with personal context',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("surface_version:surface==='feed'?11"));
  assert.ok(ai.includes("context:compact(state)"));
  assert.ok(app.includes('function hydrateFeedStory'));
  assert.ok(app.includes('Buscando contexto y antecedentes'));
});

test('Chat now relies on native WebKit text selection instead of a custom word picker',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(!app.includes('function segmentMessageText'));
  assert.ok(!app.includes('function openMessageTextPicker'));
  assert.ok(!css.includes('.message-token.selected'));
  assert.ok(css.includes('-webkit-user-select:text!important'));
  assert.ok(css.includes('-webkit-touch-callout:default!important'));
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
  assert.ok(ai.includes("functions.invoke('isabella-ideas'"));
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
  assert.ok(sync.includes("kind:obj?normalizeMemoryKind(obj.kind):'context'"));
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
  assert.ok(shell.includes('Build 2026.10.08.86.5'));
  assert.ok(shell.includes('MINDS · TRABAJO'));
  assert.ok(index.includes('app.css?v=59'));
  assert.ok(index.includes('shell.js?v=89'));
  assert.ok(index.includes('app.js?v=97'));
  assert.ok(index.includes('sync.js?v=pwa31'));
  assert.ok(index.includes('ai.js?v=49'));
  assert.ok(sw.includes("const CACHE_NAME = 'isabella-shell-v107'"));
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


test('Build 43 makes Feed freshness state-driven instead of only timer-driven',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes("localStorage.setItem('isabella-feed-dirty','1')"));
  assert.ok(app.includes("dirty=localStorage.getItem('isabella-feed-dirty')==='1'"));
  assert.ok(app.includes("!dirty&&now-last<3*60*60*1000"));
  assert.ok(ai.includes('events:stable(state.events)'));
  assert.ok(ai.includes('tasks:stable(state.tasks)'));
  assert.ok(ai.includes('projects:stable(state.projects)'));
  assert.ok(ai.includes('Date.now()-newest<2*60*60*1000'));
});

test('Build 43 preserves Build 42 artifacts and usage observability',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(app.includes('artifactMarkup'));
  assert.ok(ai.includes("functions.invoke('isabella-artifact'"));
  assert.ok(app.includes("from('minds_ai_usage')"));
  assert.ok(shell.includes('data-action="aiusage"'));
});


test('Build 44 makes generated artifacts discoverable and images openable',()=>{
  const app=read('apps/isabella/app.js');
  const shell=read('apps/isabella/shell.js');
  const css=read('apps/isabella/app.css');
  assert.ok(shell.includes('data-action="artifacts"'));
  assert.ok(app.includes('async function artifactsPanel'));
  assert.ok(app.includes('openArtifactImage'));
  assert.ok(app.includes('data-artifact-open-image'));
  assert.ok(css.includes('.artifact-image-viewer'));
});

test('Build 44 preserves the reading position while chat rerenders',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('function captureAssistantScroll'));
  assert.ok(app.includes('function restoreAssistantScroll'));
  assert.ok(app.includes('restoreAssistantScroll(snapshot,forceBottom);'));
  assert.ok(app.includes("if(!forceBottom&&!snapshot?.nearBottom)requestAnimationFrame(()=>restoreAssistantScroll(snapshot,false))"));
});

test('Build 44 Enter inserts a newline and command-enter sends',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("e.key==='Enter'&&(e.metaKey||e.ctrlKey)"));
  assert.ok(!app.includes("e.key==='Enter'&&!e.shiftKey"));
});


test('Build 45 uses one authoritative Chat scroll container',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('.messages{\n  max-height:none!important;'));
  assert.ok(css.includes('overflow:visible!important;'));
  assert.ok(css.includes('.assistant-scroll{\n  overflow-y:auto!important;'));
  assert.ok(css.includes('scroll-behavior:auto!important;'));
});

test('Build 45 sync cannot force Chat to the bottom while the user is reading',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("if(name==='assistant'&&previous!=='assistant')"));
  assert.ok(app.includes("const visibleScreen=state.screen||'assistant'"));
  assert.ok(app.includes('save();renderMessages(false);renderToday();renderCalendar();'));
  assert.ok(!app.includes('renderMessages(true);renderToday();renderCalendar();show(state.screen'));
});

test('Build 45 reserves image geometry to avoid late-load scroll jumps',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('aspect-ratio:4/3;'));
  assert.ok(css.includes('aspect-ratio:1/1;'));
  assert.ok(css.includes('height:auto!important;'));
});


test('Build 46 adds Work as a private Desktop plus Planner surface',()=>{
  const shell=read('apps/isabella/shell.js'),app=read('apps/isabella/app.js'),work=read('apps/isabella/work.js'),index=read('apps/isabella/index.html');
  assert.ok(shell.includes('data-nav="work"'));
  assert.ok(shell.includes('data-work-view="desktop"'));
  assert.ok(shell.includes('data-work-view="planner"'));
  assert.ok(app.includes("'assistant','feed','ideas','work','calendar','readings'"));
  assert.ok(app.includes("window.MINDS_WORK?.render?.()"));
  assert.ok(index.includes('work.js?v=13'));
  assert.ok(work.includes("storage.from('minds-work').upload"));
  assert.ok(work.includes("from('minds_work_folders')"));
  assert.ok(work.includes("from('minds_work_buckets')"));
});

test('Build 46 Planner reuses Isabella tasks instead of duplicating todos',()=>{
  const work=read('apps/isabella/work.js'),sync=read('apps/isabella/sync.js');
  assert.ok(work.includes("from('isabella_tasks')"));
  assert.ok(work.includes('project_id:project.id'));
  assert.ok(work.includes('work_bucket_id'));
  assert.ok(work.includes('checklist'));
  assert.ok(work.includes('priority'));
  assert.ok(sync.includes('window.ISABELLA_SYNC_NOW'));
});


test('Build 47 keeps chat images stable across background rerenders',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('const signedAssetCache=new Map()'));
  assert.ok(app.includes('messageRenderKey'));
  assert.ok(app.includes('if(nextRenderKey===lastMessagesRenderKey)'));
  assert.ok(app.includes("observeStorageImage(img,'isabella-uploads'"));
  assert.ok(app.includes("signedAssetUrl(bucket,path,expires=3600)"));
  assert.ok(app.includes("const cached=cachedSignedAsset(bucket,path)"));
  assert.ok(app.includes('lastMessagesRenderKey=nextRenderKey'));
  assert.ok(app.includes("artifactSignedUrl(path,expires=3600){return signedAssetUrl('minds-artifacts',path,expires)}"));
});

test('Build 47 uses the requested navigation order',()=>{
  const shell=read('apps/isabella/shell.js');
  const nav=shell.slice(shell.indexOf('<nav id="mainNav"'),shell.indexOf('</nav>')+6);
  const order=['data-nav="assistant"','data-nav="calendar"','data-nav="feed"','data-nav="ideas"','data-nav="readings"','data-nav="work"'].map(x=>nav.indexOf(x));
  assert.ok(order.every((x,i)=>x>=0&&(i===0||x>order[i-1])));
});

test('Build 47 makes Work and MINDS responsive on desktop',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('@media(min-width:900px)'));
  assert.ok(css.includes('.app{width:100%;max-width:none}'));
  assert.ok(css.includes('width:min(100%,1600px)'));
});

test('Build 47 Planner supports checklist previews and real task attachments',()=>{
  const work=read('apps/isabella/work.js');
  assert.ok(work.includes('work-card-checks'));
  assert.ok(work.includes('workTaskAttachmentInput'));
  assert.ok(work.includes("storage.from('minds-work').upload"));
  assert.ok(work.includes('Erledigte Aufgaben'));
  assert.ok(work.includes('Ohne Bucket'));
});


test('Build 48 supports dragging week tasks to another day',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('data-week-date='));
  assert.ok(app.includes('function initWeekDateDrag()'));
  assert.ok(app.includes("'reorder':'move_date'"));
});

test('Build 48 keeps manual task edits from being dropped during sync',()=>{
  const sync=read('apps/isabella/sync.js');
  assert.ok(sync.includes('queuedSync'));
  assert.ok(sync.includes('if(opts.initial||opts.pullOnly)'));
  assert.ok(sync.includes('window.ISABELLA_SYNC_PULL_NOW'));
});

test('Build 48 Planner supports drag between buckets and task deletion',()=>{
  const work=read('apps/isabella/work.js');
  assert.ok(work.includes('draggable="true"'));
  assert.ok(work.includes('function persistWorkTaskOrder'));
  assert.ok(work.includes('function deleteWorkTask'));
  assert.ok(work.includes('workDeleteTask'));
  assert.ok(work.includes('work-bucket-scroll'));
});

test('Build 48 uses explicit reaction controls and normal text selection',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes('data-message-react'));
  assert.ok(!app.includes("el.addEventListener('selectstart',e=>e.preventDefault())"));
  assert.ok(css.includes('user-select:text!important'));
  assert.ok(css.includes('.message-react'));
});

test('Build 48 suppresses repeated proactive reminders',()=>{
  const app=read('apps/isabella/app.js'),ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('recentlyCoveredProactive'));
  assert.ok(app.includes('proactiveNudgeBusy'));
  assert.ok(ai.includes('un recordatorio por tema es suficiente'));
});


test('Build 50 keeps native partial text selection and separates message actions',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes("e.target.closest?.('.message,.message-actions,.composer-wrap"));
  assert.ok(css.includes('-webkit-user-select:text!important'));
  assert.ok(css.includes('-webkit-touch-callout:default!important'));
  assert.ok(app.includes('class="message-reaction-badge"'));
  assert.ok(app.includes('data-message-reply'));
});

test('Build 49 persists reactions and reply references in conversation metadata',()=>{
  const sync=read('apps/isabella/sync.js');
  assert.ok(sync.includes('reaction:m.reaction||null'));
  assert.ok(sync.includes('reply_to:m.replyTo?.id'));
  assert.ok(sync.includes("upsert(rows,{onConflict:'user_id,conversation_id,client_key'})"));
  assert.ok(!sync.includes("upsert(rows,{onConflict:'user_id,conversation_id,client_key',ignoreDuplicates:true})"));
  assert.ok(sync.includes('metadata:m.metadata||{}'));
});

test('Build 49 supports quoted replies that Isabella can resolve',()=>{
  const shell=read('apps/isabella/shell.js'),app=read('apps/isabella/app.js'),ai=read('apps/isabella/ai.js');
  assert.ok(shell.includes('id="chatReplyPreview"'));
  assert.ok(app.includes('function setReplyTarget(id)'));
  assert.ok(app.includes('message-reply-reference'));
  assert.ok(app.includes("say('user',text||'📷 Foto',{attachments:copy,replyTo})"));
  assert.ok(ai.includes('Gari está respondiendo específicamente a este mensaje previo'));
  assert.ok(ai.includes('reply_to:m.replyTo?.id'));
});

test('Build 49 contains expanded reactions within an Apple-like bounded panel',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('.reaction-popover.imessage-reactions.expanded'));
  assert.ok(css.includes('width:min(360px,calc(100vw - 20px))'));
  assert.ok(css.includes('grid-template-columns:repeat(6,minmax(0,1fr))'));
  assert.ok(css.includes('overflow-x:hidden'));
});


test('Build 50 reserves long press for native iOS text selection',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(!app.includes('function openMessageTextPicker'));
  assert.ok(!css.includes('custom reaction menu by default, native selection only after explicit Select text'));
  assert.ok(css.includes('.message,.message .message-text,.message .message-text *{'));
  assert.ok(css.includes('-webkit-user-select:text!important'));
  assert.ok(css.includes('-webkit-touch-callout:default!important'));
});

test('Build 50 uses separate quick reactions and compact emoji sheet',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes('const REACTION_QUICK='));
  assert.ok(app.includes('function openEmojiReactionSheet(id)'));
  assert.ok(app.includes('REACTION_CATEGORIES'));
  assert.ok(css.includes('.emoji-reaction-sheet'));
  assert.ok(css.includes('.emoji-sheet-tabs'));
  assert.ok(css.includes('.emoji-grid'));
});

test('Build 50 persists reaction metadata directly instead of waiting for full-state sync',()=>{
  const app=read('apps/isabella/app.js'),sync=read('apps/isabella/sync.js');
  assert.ok(app.includes('ISABELLA_SYNC_MESSAGE_META'));
  assert.ok(sync.includes('async function updateMessageMetadata'));
  assert.ok(sync.includes("update({metadata:next})"));
  assert.ok(sync.includes('window.ISABELLA_SYNC_MESSAGE_META'));
});

test('Build 50 renders reactions as attached message badges',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes('message-reaction-badge'));
  assert.ok(css.includes('.message-reaction-badge'));
});


test('Build 51 preserves local-only chat messages on initial server sync',()=>{
  const sync=read('apps/isabella/sync.js');
  assert.ok(sync.includes('function mergeConversationMessages'));
  assert.ok(sync.includes('mergeConversationMessages(remoteMessages,local.messages||[])'));
  assert.ok(sync.includes('if(opts.initial)await pushConversation(next.messages||[])'));
});


test('Build 52 maps the six typographic reactions to stable emoji values',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  for(const value of ["value:'❤️'","value:'👍'","value:'😂'","value:'👌'","value:'👎'","value:'😀'"])assert.ok(app.includes(value));
  assert.ok(app.includes('function typographicReaction'));
  assert.ok(app.includes('data-inline-reaction="${x.value}"'));
  assert.ok(css.includes('.minds-reaction-token.tone-love'));
  assert.ok(css.includes('.minds-reaction-token.tone-yes'));
  assert.ok(css.includes('.minds-reaction-token.tone-laugh'));
  assert.ok(css.includes('.minds-reaction-token.tone-ok'));
  assert.ok(css.includes('.minds-reaction-token.tone-nope'));
  assert.ok(css.includes('.minds-reaction-token.tone-smile'));
});

test('Build 52 keeps HA free of decorative rays',()=>{
  const css=read('apps/isabella/app.css');
  assert.ok(css.includes('.minds-reaction-token.tone-laugh::before,.minds-reaction-token.tone-laugh::after{display:none!important}'));
});


test('Build 54 keeps plus as the reaction trigger and uses traced SVG artwork',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes('aria-label="Reaccionar">＋</button>'));
  assert.ok(!app.includes('aria-label="Reaccionar">☺︎</button>'));
  assert.ok(app.includes('const REACTION_ART={'));
  assert.ok(app.includes('minds-reaction-art'));
  assert.ok(css.includes('.minds-reaction-art'));
});


test('Build 54 renders the approved reactions as reference-traced SVG artwork',()=>{
  const app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(app.includes('const REACTION_ART={'));
  assert.ok(app.includes('class="minds-reaction-art tone-'));
  assert.ok(app.includes('fill-rule="evenodd"'));
  assert.ok(app.includes("love:{w:79,h:82,color:'#e85780'"));
  assert.ok(app.includes("smile:{w:65,h:92,color:'#ea8250'"));
  assert.ok(css.includes('reaction artwork traced from the approved original concept'));
  assert.ok(css.includes('.minds-reaction-art'));
});


test('Build 55 exposes prospective memory, personal skills and MINDS Doctor',()=>{
  const app=read('apps/isabella/app.js'),shell=read('apps/isabella/shell.js'),ai=read('apps/isabella/ai.js');
  assert.ok(shell.includes('data-action="intents"'));
  assert.ok(shell.includes('data-action="doctor"'));
  assert.ok(app.includes('async function standingIntentsPanel'));
  assert.ok(app.includes('async function doctorPanel'));
  assert.ok(app.includes('async function createStandingIntentProposal'));
  assert.ok(app.includes('async function createWorkClaimProposal'));
  assert.ok(app.includes('async function createSkillProposal'));
  assert.ok(ai.includes("minds_user_skills"));
});


test('Build 56 shows Isabella and Sofia skills together and labels new adaptive usage',()=>{
  const ai=read('apps/isabella/ai.js'),app=read('apps/isabella/app.js');
  assert.ok(ai.includes("sb.from('sofia_skills')"));
  assert.ok(ai.includes("agent:'sofia'"));
  assert.ok(app.includes("SOFÍA"));
  assert.ok(app.includes("decision_router:'Router adaptativo'"));
  assert.ok(app.includes("memory_flush:'Checkpoint de memoria'"));
  assert.ok(app.includes("work_file_read:'Lectura Work'"));
});



test('Build 59 exposes Continuity and keeps the mobile More drawer scrollable',()=>{
  const shell=read('apps/isabella/shell.js'),app=read('apps/isabella/app.js'),css=read('apps/isabella/app.css');
  assert.ok(shell.includes('data-action="continuity"'));
  assert.ok(app.includes('async function continuityPanel()'));
  assert.ok(app.includes("from('minds_commitments')"));
  assert.ok(app.includes("from('minds_commitment_events')"));
  assert.ok(app.includes("document.body.classList.add('drawer-open')"));
  assert.ok(css.includes('max-height:calc(100dvh - env(safe-area-inset-top,0px) - 8px)'));
  assert.ok(css.includes('overflow-y:auto'));
  assert.ok(css.includes('-webkit-overflow-scrolling:touch'));
  assert.ok(css.includes('.drawer-head{position:sticky'));
});


test('Build 60 persists explicit task and event mutations without stale bulk overwrite',()=>{
  const sync=read('apps/isabella/sync.js');
  assert.ok(sync.includes('async function persistEntityMutation(detail)'));
  assert.ok(sync.includes("pendingEntityMutations.add(pendingKey)"));
  assert.ok(sync.includes("await persistEntityMutation(detail)"));
  assert.ok(sync.includes("upsert(tasks,{onConflict:'user_id,client_key',ignoreDuplicates:true})"));
  assert.ok(sync.includes("upsert(events,{onConflict:'user_id,client_key',ignoreDuplicates:true})"));
  assert.ok(sync.includes("mergePulledEntityState(remoteTasks,remoteEvents,app.getState(),local)"));
  assert.ok(sync.includes("tasks:mergeRemoteEntities(remoteTasks,freshest.tasks||[],'task')"));
  assert.ok(sync.includes("events:mergeRemoteEntities(remoteEvents,freshest.events||[],'event')"));
  assert.ok(sync.includes("updatedAt:t.updated_at||null"));
  assert.ok(sync.includes("updatedAt:e.updated_at||null"));
});

test('Build 60 resolves Shadow Agency observations from reviewed proposals',()=>{
  const sync=read('apps/isabella/sync.js'),app=read('apps/isabella/app.js'),chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(sync.includes("minds_resolve_shadow_decision"));
  assert.ok(chat.includes("minds_record_shadow_decision"));
  assert.ok(chat.includes("request_id:proposal.request_id||crypto.randomUUID()"));
  assert.ok(app.includes("card('Shadow Agency'"));
  assert.ok(app.includes("from('minds_shadow_decisions')"));
});


test('Build 61 adds a bounded invisible specialist runtime without visible agent switching',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const app=read('apps/isabella/app.js');
  const shell=read('apps/isabella/shell.js');
  const start=chat.indexOf('async function delegateSpecialist');
  const end=chat.indexOf('function deriveIntentTerms',start);
  const runtime=chat.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.ok(chat.includes('const SPECIALIST_ROLES=new Set(["research","work","planning","memory","document"])'));
  assert.ok(chat.includes('specialist_candidates:specialistCandidates(effectiveMessage,route)'));
  assert.ok(chat.includes('name:"delegate_specialist"'));
  assert.ok(chat.includes('specialistDelegations.length>=3'));
  assert.ok(chat.includes('specialistCache.has(fingerprint)'));
  assert.ok(chat.includes('startAgentRun(req,"specialist_"+specialist'));
  assert.ok(chat.includes('Sofía NO forma parte de este runtime'));
  assert.ok(runtime.includes('specialist==="research"?[{type:"web_search"'));
  assert.ok(!runtime.includes('create_task'));
  assert.ok(!runtime.includes('update_task'));
  assert.ok(!runtime.includes('create_event'));
  assert.ok(!runtime.includes('remember_information'));
  assert.ok(app.includes("card('Especialistas internos'"));
  assert.ok(!shell.includes('data-action="specialists"'));
});


test('Build 62 prevents an older pull from visually reverting a newer local task move',()=>{
  const sync=read('apps/isabella/sync.js');
  const start=sync.indexOf('function entityRevisionTime');
  const end=sync.indexOf('async function persistEntityMutation',start);
  assert.ok(start>0&&end>start);
  const source=sync.slice(start,end);
  const make=new Function('pendingEntityMutations',source+';return {mergeRemoteEntities};');
  const pending=new Set(),{mergeRemoteEntities}=make(pending);
  const oldRemote={id:'t1',date:'2026-09-30',updatedAt:'2026-09-30T10:00:00.000Z'};
  const movedLocal={id:'t1',date:'2026-10-01',updatedAt:'2026-09-30T10:01:00.000Z'};
  assert.equal(mergeRemoteEntities([oldRemote],[movedLocal],'task')[0].date,'2026-10-01');
  const newerRemote={...oldRemote,date:'2026-10-02',updatedAt:'2026-09-30T10:02:00.000Z'};
  assert.equal(mergeRemoteEntities([newerRemote],[movedLocal],'task')[0].date,'2026-10-02');
  pending.add('task:t1');
  assert.equal(mergeRemoteEntities([newerRemote],[movedLocal],'task')[0].date,'2026-10-01');
});

test('Build 62 orchestrates bounded specialists with explicit evidence routing',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('async function orchestrateSpecialists'));
  assert.ok(chat.includes('name:"orchestrate_specialists"'));
  assert.ok(chat.includes('specialist_plan_hint:specialistPlanHint(effectiveMessage,route)'));
  assert.ok(chat.includes('Dependencies must reference earlier steps'));
  assert.ok(chat.includes('Research cannot receive private upstream memos'));
  assert.ok(chat.includes('withheld_upstream'));
  assert.ok(chat.includes('fileIds=(index?.files||[]).map'));
  assert.ok(chat.includes('3-specialistDelegations.length'));
  assert.ok(chat.includes('specialistCache=new Map'));
  assert.ok(chat.includes('specialist_orchestrations:specialistOrchestrations'));
  const start=chat.indexOf('async function delegateSpecialist');
  const end=chat.indexOf('function deriveIntentTerms',start);
  const runtime=chat.slice(start,end);
  for(const forbidden of ['create_task','update_task','delete_task','create_event','update_event','remember_information','record_personal_model_claim']){
    assert.ok(!runtime.includes(forbidden),forbidden+' leaked into specialist runtime');
  }
});


test('Build 63 merges a completed stale pull against the live app state, not its captured snapshot',()=>{
  const sync=read('apps/isabella/sync.js');
  const start=sync.indexOf('function entityRevisionTime');
  const end=sync.indexOf('async function persistEntityMutation',start);
  assert.ok(start>0&&end>start);
  const source=sync.slice(start,end);
  const make=new Function('pendingEntityMutations',source+';return {mergePulledEntityState};');
  const {mergePulledEntityState}=make(new Set());
  const captured={tasks:[{id:'t1',date:'2026-09-30',updatedAt:'2026-09-30T14:00:00.000Z'}],events:[],deletedTaskIds:[],deletedEventIds:[]};
  const live={tasks:[{id:'t1',date:'2026-10-01',updatedAt:'2026-09-30T14:01:00.000Z'}],events:[],deletedTaskIds:[],deletedEventIds:[]};
  const remote=[{id:'t1',date:'2026-09-30',updatedAt:'2026-09-30T14:00:30.000Z'}];
  assert.equal(mergePulledEntityState(remote,[],live,captured).tasks[0].date,'2026-10-01');
  assert.ok(sync.includes('mergePulledEntityState(remoteTasks,remoteEvents,app.getState(),local)'));
  assert.ok(!sync.includes('hydrating=true;app.replaceState(local);hydrating=false'));
});

test('Build 63 permanently canonicalizes Feed preferences to situational personal mode',()=>{
  const app=read('apps/isabella/app.js'),sync=read('apps/isabella/sync.js');
  const start=app.indexOf('function canonicalFeedPreferences');
  const end=app.indexOf('const base=',start);
  const source=app.slice(start,end);
  const make=new Function(source+';return canonicalFeedPreferences;'),canonical=make();
  const clean=canonical({instructions:'Solo lo útil',weatherLocation:'Landsberg am Lech',topics:['Noticias'],following:['X'],followGraph:[{name:'X'}]});
  assert.equal(clean.mode,'situational_personal');
  assert.deepEqual(clean.topics,[]);
  assert.deepEqual(clean.following,[]);
  assert.deepEqual(clean.followGraph,[]);
  assert.equal(clean.instructions,'Solo lo útil');
  assert.ok(sync.includes('value:canonicalFeedPreferences(state.feedPreferences)'));
  assert.ok(sync.includes('canonicalFeedPreferences(pref.value)'));
});

test('Build 63 serializes proactive curiosity and refuses resolved legacy Feed questions',()=>{
  const app=read('apps/isabella/app.js'),ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('let proactiveCycleBusy=false,proactiveNudgeBusy=false,curiosityBusy=false'));
  assert.ok(app.includes('if(proactiveCycleBusy)return'));
  assert.ok(app.includes('if(curiosityBusy)return false'));
  assert.ok(app.indexOf("localStorage.setItem(key,String(now));")<app.indexOf("window.ISABELLA_AI.curiosity(state)"));
  assert.ok(app.includes('recentlyCoveredCuriosity(reply)'));
  assert.ok(ai.includes('No preguntes por categorías de contenido del Feed'));
  assert.ok(ai.includes('usa search_memory'));
  assert.ok(ai.includes('current_local_time'));
  assert.ok(ai.includes('current_daypart'));
});

test('Build 63 makes server-local time authoritative over historical greetings',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('function localTemporalContext'));
  assert.ok(chat.includes('COHERENCIA TEMPORAL:'));
  assert.ok(chat.includes('current_local_datetime:temporal.current_local_datetime'));
  assert.ok(chat.includes('current_local_time:temporal.current_local_time'));
  assert.ok(chat.includes('current_daypart:temporal.current_daypart'));
  assert.ok(chat.includes('Los saludos y referencias temporales de mensajes anteriores son históricos'));
  assert.ok(chat.includes('El Feed de MINDS es situacional, personal y productivo'));
});


test('Build 64 bounded OpenAI working context survives Build 85 as scope-local rolling windows',()=>{
  const conv=read('supabase/functions/_shared/conversations.ts');
  assert.ok(conv.includes('ROTATE_EVERY_MESSAGES=48'));
  assert.ok(conv.includes("minds_scoped_message_count"));
  assert.ok(conv.includes("reason:'rolling_scope_window'"));
  assert.ok(conv.includes(".slice(-24)"));
  assert.ok(conv.includes("rotation_message_count:messageCount"));
  assert.ok(conv.includes("Full visible history remains in Supabase"));
  assert.ok(conv.includes("openai_scope_conversations"));
});

test('Build 64 gives light turns a lower-latency cognitive budget without weakening deep turns',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('return {depth:"light",lexical:8,semantic:5,entities:8,claims:16,feedback:8,activity:14,indexBatch:20,rounds:3,compact:48000,reasoning:"low",maxOutput:1800}'));
  assert.ok(chat.includes('depth:"deep",lexical:18,semantic:14,entities:16,claims:40,feedback:24,activity:30,indexBatch:40,rounds:5,compact:180000,reasoning:"high"'));
  assert.ok(chat.includes('fastAgenda)budget={...budget,depth:"light"'));
  assert.ok(chat.includes('rounds:2,compact:32000,reasoning:"low",maxOutput:1200'));
});

test('Build 64 routes simple agenda mutations through a narrow fast path',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const a=chat.indexOf('function simpleAgendaMutation');
  const b=chat.indexOf('function directTextStreamEligible',a);
  assert.ok(a>=0&&b>a);
  const source=chat.slice(a,b);
  const make=new Function('normalizeText',source+';return simpleAgendaMutation;');
  const simple=make(value=>String(value||'').trim().replace(/\\s+/g,' ').toLowerCase());
  assert.equal(simple('Agrega para mañana una tarea: comprar una calculadora'),true);
  assert.equal(simple('Verschiebe die Aufgabe auf morgen'),true);
  assert.equal(simple('Investiga la arquitectura de Geoffrey Bawa'),false);
  assert.equal(simple('¿Qué tal?'),false);
  assert.ok(chat.includes('fastAgenda?fastAgendaTools'));
  assert.ok(chat.includes('background||budget.depth==="light"?Promise.resolve([]):skillCatalog(req)'));
  assert.ok(chat.includes('!background&&!fastAgenda&&route.project?searchWork'));
  const setStart=chat.indexOf('const fastAgendaToolNames=new Set(');
  const setEnd=chat.indexOf(');',setStart);
  const fastSet=chat.slice(setStart,setEnd);
  assert.ok(fastSet.includes('"create_task"'));
  assert.ok(fastSet.includes('"search_calendar"'));
  assert.ok(!fastSet.includes('"load_skill"'));
  assert.ok(!fastSet.includes('"delegate_specialist"'));
});

test('Build 64 exposes latency-path observability for real production measurement',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('fast_path:fastAgenda'));
  assert.ok(chat.includes('conversation_rotated:!!conversationInfo.rotated'));
  assert.ok(chat.includes('conversation_message_count:conversationInfo.messageCount||null'));
  assert.ok(chat.includes('context_policy:"scoped_exposure_v1"'));
  assert.ok(chat.includes('exposure_scope:exposureScope'));
});


test('Build 65 uses a strict one-round create gate before full Isabella',()=>{
  const ai=read('apps/isabella/ai.js');
  const start=ai.indexOf('function fastCreateCandidate');
  const end=ai.indexOf('function parseFastSse',start);
  assert.ok(start>0&&end>start);
  const source=ai.slice(start,end);
  const make=new Function(source+';return fastCreateCandidate;'),fast=make();
  assert.equal(fast('Agrega para mañana comprar una calculadora'),true);
  assert.equal(fast('Agrega para el lunes, proyecto Bernried, imprimir planos Wagner'),true);
  assert.equal(fast('Pon lo de Wagner para el lunes'),false);
  assert.equal(fast('Agrega la tarea si no choca con el Kick-off'),false);
  assert.equal(fast('Mueve la tarea de Wagner al lunes'),false);
  assert.ok(ai.includes("/functions/v1/isabella-fast-stream"));
  assert.ok(ai.includes("Never fall through"));
});

test('Build 70 fast transport uses SSE and delegates authorized writes to the guarded database RPC',()=>{
  const fast=read('supabase/functions/isabella-fast-stream/index.ts');
  assert.ok(fast.includes('"Content-Type":"text/event-stream; charset=utf-8"'));
  assert.ok(fast.includes('stream:true'));
  assert.ok(fast.includes('response.function_call_arguments.delta'));
  assert.ok(fast.includes('response.output_item.done'));
  assert.ok(fast.includes('parallel_tool_calls:false'));
  assert.ok(fast.includes('tool_choice:"required"'));
  assert.ok(fast.includes('minds_record_shadow_decision'));
  assert.ok(fast.includes('pending_user_confirmation')===false);
  assert.ok(!fast.includes('from("isabella_tasks").insert'));
  assert.ok(!fast.includes("from('isabella_tasks').insert"));
  assert.ok(!fast.includes('from("isabella_events").insert'));
  assert.ok(!fast.includes("from('isabella_events').insert"));
  assert.ok(fast.includes('name:"escalate_to_full_isabella"'));
});

test('Build 65 streams useful acknowledgement without persisting partial chat text',()=>{
  const fast=read('supabase/functions/isabella-fast-stream/index.ts');
  const ai=read('apps/isabella/ai.js');
  const app=read('apps/isabella/app.js');
  assert.ok(fast.includes('send("text_delta",{delta:"Entendido. "})'));
  assert.ok(fast.includes('streamed_reply:true'));
  assert.ok(ai.includes("event?.type==='text_delta'"));
  assert.ok(ai.includes('options.onTextDelta?.'));
  assert.ok(app.includes('function streamAssistantDelta'));
  assert.ok(app.includes("el.className='message assistant message-streaming'"));
  assert.ok(app.includes('clearAssistantStream();say('));
});

test('Build 65 config keeps the streaming function JWT-protected',()=>{
  const cfg=read('supabase/config.toml');
  assert.ok(cfg.includes('[functions.isabella-fast-stream]'));
  assert.ok(cfg.includes('entrypoint = "./functions/isabella-fast-stream/index.ts"'));
  const block=cfg.slice(cfg.indexOf('[functions.isabella-fast-stream]'),cfg.indexOf('[functions.sofia-chat]'));
  assert.ok(block.includes('verify_jwt = true'));
});


test('Build 66 streams ordinary tool-free Isabella responses with Responses SSE',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('function directTextStreamEligible'));
  assert.ok(chat.includes('wantsStream=body?.stream===true'));
  assert.ok(chat.includes('response.output_text.delta'));
  assert.ok(chat.includes('stream:true'));
  assert.ok(chat.includes('"Content-Type":"text/event-stream; charset=utf-8"'));
  assert.ok(chat.includes('direct_stream:true'));
  assert.ok(chat.includes('ttft_streamed:true'));
  assert.ok(chat.includes('tools:[]'));
});

test('Build 66 refuses streaming when tools or deep context may be required',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('if(background||attachments.length||simpleAgendaMutation(message)||likelyMaterialDeliverable(message))return false'));
  assert.ok(chat.includes('if(String(route?.complexity||"light")!=="light")return false'));
  assert.ok(chat.includes('if(route?.web||route?.work||route?.sofia||route?.deep_memory||route?.project)return false'));
  assert.ok(chat.includes('return json({fallback:true,reason:"tool_or_context_path"},409)'));
  assert.ok(chat.includes('const tools=background?['));
  assert.ok(chat.includes('name:"orchestrate_specialists"'));
  assert.ok(chat.includes('name:"read_work_file"'));
});

test('Build 66 client tries text streaming before buffered Isabella and preserves fallback',()=>{
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('async function askDirectStream'));
  assert.ok(ai.includes("Accept:'text/event-stream'"));
  assert.ok(ai.includes('stream:true'));
  assert.ok(ai.includes('if(response.status===409)'));
  assert.ok(ai.includes("event?.type==='text_delta'"));
  const stream=ai.indexOf('askDirectStream(message,state');
  const buffered=ai.indexOf("sb.functions.invoke('isabella-chat'",stream);
  assert.ok(stream>0&&buffered>stream);
});

test('Build 66 never persists partial streamed text and final result remains canonical',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("el.className='message assistant message-streaming'"));
  assert.ok(app.includes('clearAssistantStream();'));
  assert.ok(chat.includes('send("result",{'));
  assert.ok(chat.includes('reply:finalText.trim()'));
  assert.ok(chat.includes('standing_intent_delivery'));
  assert.ok(chat.includes('await closeConversation(supabaseClient(req),streamConversation)'));
});


test('Build 67 adds user-isolated Commitment workspaces with controlled mutation RPCs',()=>{
  const migration=read('supabase/migrations/20260930221237_commitment_workspaces_v01.sql');
  assert.ok(migration.includes('create table if not exists public.minds_commitment_workspaces'));
  assert.ok(migration.includes('create table if not exists public.minds_commitment_workspace_items'));
  assert.ok(migration.includes('alter table public.minds_commitment_workspaces enable row level security'));
  assert.ok(migration.includes('revoke insert,update,delete on public.minds_commitment_workspaces from authenticated,anon'));
  assert.ok(migration.includes('revoke insert,update,delete on public.minds_commitment_workspace_items from authenticated,anon'));
  assert.ok(migration.includes('function public.minds_ensure_commitment_workspace'));
  assert.ok(migration.includes('function public.minds_append_commitment_workspace_item'));
  assert.ok(migration.includes("v_status:=case when p_kind='decision' then 'proposed' else 'working' end"));
  assert.ok(migration.includes("when p_source_kind in ('work','document') then 'project_source'"));
});

test('Build 67 gives Isabella operational workspace tools without promoting scratchpad state to truth',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('async function commitmentWorkspaceContext'));
  assert.ok(chat.includes('name:"open_commitment_workspace"'));
  assert.ok(chat.includes('name:"read_commitment_workspace"'));
  assert.ok(chat.includes('name:"write_commitment_workspace"'));
  assert.ok(chat.includes('commitment_workspaces:missionWorkspaces'));
  assert.ok(chat.includes('operational_scratchpad_not_memory'));
  assert.ok(chat.includes('Una entrada kind=decision siempre queda en status proposed'));
  assert.ok(chat.includes('Nunca promociones automáticamente una entrada del workspace a personal memory'));
  assert.ok(chat.includes('commitment_workspace_used:'));
});

test('Build 67 keeps mission work out of direct text streaming and visible inside Continuity',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const app=read('apps/isabella/app.js');
  assert.ok(chat.includes('mantener vivo|avanza|avanzar|retoma|retomar'));
  assert.ok(app.includes('data-mission-workspace'));
  assert.ok(app.includes('async function missionWorkspacePanel'));
  assert.ok(app.includes("card('Mission Workspaces'"));
  assert.ok(app.includes('Aquí conservo el trabajo intermedio para poder continuar entre conversaciones'));
});


test('Build 68 persists bounded Durable Mission Runs with leases, retries and user control',()=>{
  const m=read('supabase/migrations/20261001064937_durable_mission_runtime_v01.sql');
  assert.ok(m.includes('create table if not exists public.minds_mission_runs'));
  assert.ok(m.includes('create table if not exists public.minds_mission_run_events'));
  assert.ok(m.includes("status in ('queued','running','waiting_for_user','paused','completed','failed','cancelled')"));
  assert.ok(m.includes('minds_mission_runs_one_live_per_workspace'));
  assert.ok(m.includes('function public.minds_start_mission_run'));
  assert.ok(m.includes('function public.minds_claim_mission_runs'));
  assert.ok(m.includes('function public.minds_apply_mission_step'));
  assert.ok(m.includes('function public.minds_fail_mission_step'));
  assert.ok(m.includes("lease_until=now()+interval '4 minutes'"));
  assert.ok(m.includes("v_outcome='continue' and v_run.iteration>=v_run.max_iterations"));
  assert.ok(m.includes("v_outcome:='waiting_for_user'"));
  assert.ok(m.includes("event_type in ('queued','claimed','checkpoint','waiting_for_user'"));
  assert.ok(m.includes("'minds-mission-runner'"));
});

test('Build 68 mission runner advances one checkpoint at a time and cannot mutate external user state',()=>{
  const r=read('supabase/functions/isabella-mission-runner/index.ts');
  assert.ok(r.includes('minds_claim_mission_runs'));
  assert.ok(r.includes('minds_apply_mission_step_v2'));
  assert.ok(r.includes('minds_fail_mission_step'));
  assert.ok(r.includes('feature:"mission_runtime"'));
  assert.ok(r.includes('tools:[{type:"web_search"'));
  assert.ok(r.includes('Advance this objective by one materially useful checkpoint.'));
  assert.ok(r.includes('Do not create or modify tasks, events, routines, memory, project claims, messages, external systems or project truth.'));
  assert.ok(!r.includes('from("isabella_tasks").insert'));
  assert.ok(!r.includes("from('isabella_tasks').insert"));
  assert.ok(!r.includes('from("isabella_events").insert'));
  assert.ok(!r.includes("from('isabella_events').insert"));
  assert.ok(r.includes('event_key:\`mission:\${run.id}:\${event}\`'));
  assert.ok(r.includes('minds_publish_attention'));
});

test('Build 68 lets Isabella start and control durable Missions only around approved workspaces',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('async function missionRunContext'));
  assert.ok(chat.includes('name:"start_mission_run"'));
  assert.ok(chat.includes('name:"read_mission_run"'));
  assert.ok(chat.includes('name:"control_mission_run"'));
  assert.ok(chat.includes('active_mission_runs:activeMissionRuns'));
  assert.ok(chat.includes('Usa start_mission_run directamente solo cuando el Commitment ya exista y Gari pida continuar ese objetivo.'));
  assert.ok(chat.includes('No prometas trabajo ilimitado: Persistent Work sigue teniendo checkpoints y reintentos acotados.'));
  assert.ok(chat.includes('durable_mission_used:'));
  assert.ok(chat.includes('avísame cuando|avisame cuando'));
});

test('Build 68 returns durable outcomes to Isabella through realtime without making partial work memory',()=>{
  const sync=read('apps/isabella/sync.js');
  const app=read('apps/isabella/app.js');
  const realtime=read('supabase/migrations/20261001065451_mission_realtime_delivery_v01.sql');
  assert.ok(sync.includes("sb.channel('isabella-mission-'"));
  assert.ok(sync.includes("['mission_runtime','attention_runtime'].includes"));
  assert.ok(sync.includes('syncNow({pullOnly:true})'));
  assert.ok(realtime.includes('alter publication supabase_realtime add table public.conversation_messages'));
  assert.ok(app.includes('Mission Run'));
  assert.ok(app.includes('missionRunControlUI'));
  assert.ok(app.includes("card('Durable Missions'"));
  assert.ok(app.includes('tampoco puedo ejecutar acciones externas o confirmar una decisión por mi cuenta'));
});

test('Build 68 mission runner is server-authenticated and scheduled independently',()=>{
  const cfg=read('supabase/config.toml');
  assert.ok(cfg.includes('[functions.isabella-mission-runner]'));
  const block=cfg.slice(cfg.indexOf('[functions.isabella-mission-runner]'));
  assert.ok(block.includes('verify_jwt = false'));
  const m=read('supabase/migrations/20261001064937_durable_mission_runtime_v01.sql');
  assert.ok(m.includes("values ('mission_runner',encode(gen_random_bytes(32),'hex'))"));
  assert.ok(m.includes("(select value from public.isabella_runtime_secrets where key='mission_runner')"));
  assert.ok(m.includes('revoke all on function public.minds_claim_mission_runs(integer) from public,anon,authenticated'));
});


test('Build 69 routes proactive events through an explainable four-channel attention ledger',()=>{
  const m=read('supabase/migrations/20261001072200_attention_economy_v01.sql');
  const m11=read('supabase/migrations/20261001072725_attention_economy_v011.sql');
  const m12=read('supabase/migrations/20261001073011_attention_economy_v012_preserve_continuity.sql');
  assert.ok(m.includes('create table if not exists public.minds_attention_events'));
  assert.ok(m.includes("route in ('interrupt','briefing','ambient','silent')"));
  assert.ok(m.includes('function public.minds_route_attention'));
  assert.ok(m.includes('function public.minds_publish_attention'));
  assert.ok(m.includes("'missionCompleted','briefing'"));
  assert.ok(m.includes("'overdueTasks','ambient'"));
  assert.ok(m.includes("v_reason:='explicit_user_request'"));
  assert.ok(m.includes("v_reason:='needs_user_input'"));
  assert.ok(m.includes("v_reason:='interruption_budget'"));
  assert.ok(m.includes("v_reason:='quiet_hours'"));
  assert.ok(m.includes("'attention_routing','allow'"));
  assert.ok(m11.includes('function public.minds_consume_attention_briefing'));
  assert.ok(m11.includes("metadata=jsonb_set(metadata,'{source}','\"situational_feed\"'::jsonb,true)"));
  assert.ok(m12.includes('public.minds_publish_continuity_signal'));
  assert.ok(m12.includes("'attention_route',a->>'route'"));
});

test('Build 69 gives explicit notification requests priority without making every Mission an interruption',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const runner=read('supabase/functions/isabella-mission-runner/index.ts');
  assert.ok(chat.includes('minds_start_mission_run_with_attention'));
  assert.ok(chat.includes('ATTENTION ECONOMY:'));
  assert.ok(chat.includes('notify_mode'));
  assert.ok(chat.includes('interrupt_on_complete'));
  assert.ok(chat.includes('silent_on_complete'));
  assert.ok(chat.includes('SOLO si el usuario pide explícitamente'));
  assert.ok(runner.includes('async function publishMissionAttention'));
  assert.ok(runner.includes('minds_publish_attention'));
  assert.ok(runner.includes('notify_mode'));
  assert.ok(runner.includes('requires_user:requiresUser'));
  assert.ok(!runner.includes('clientKey=\`mission:\${run.id}:\${event}\`'));
});

test('Build 69 consumes deferred attention only after the daily briefing is delivered',()=>{
  const r=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.ok(r.includes('attentionDigest'));
  assert.ok(r.includes('minds_attention_events'));
  assert.ok(r.includes('COSAS QUE DECIDISTE NO INTERRUMPIR ANTES:'));
  assert.ok(r.includes('attention_event_ids:attentionEventIds'));
  const delivered=r.indexOf('minds_deliver_routine');
  const consumed=r.indexOf('minds_consume_attention_briefing');
  assert.ok(delivered>0&&consumed>delivered);
  assert.ok(r.includes('attention_consumed:attentionConsumed'));
});

test('Build 69 preserves Continuity while heartbeat delegates surfacing to Attention Economy',()=>{
  const h=read('supabase/functions/isabella-heartbeat/index.ts');
  const m=read('supabase/migrations/20261001073011_attention_economy_v012_preserve_continuity.sql');
  assert.ok(h.includes('timezone:routineTz'));
  assert.ok(h.includes('heartbeat_attention_resolve'));
  assert.ok(m.includes('minds_publish_attention'));
  assert.ok(m.includes('minds_publish_continuity_signal'));
  assert.ok(m.includes("'fingerprint','heartbeat:'||e.fingerprint"));
  assert.ok(m.includes("'continuity',continuity"));
});

test('Build 69 keeps ambient Attention cards separate from generated Feed cleanup',()=>{
  const feed=read('supabase/functions/isabella-feed/index.ts');
  assert.ok(feed.includes('source:"situational_feed"'));
  assert.equal((feed.match(/contains\("metadata",\{source:"situational_feed"\}\)/g)||[]).length,2);
  const m=read('supabase/migrations/20261001072200_attention_economy_v01.sql');
  assert.ok(m.includes("'source','attention_runtime'"));
  assert.ok(m.includes("'attention_route','ambient'"));
});

test('Build 69 exposes attention policy, rationale and health without adding another top-level surface',()=>{
  const app=read('apps/isabella/app.js');
  const sync=read('apps/isabella/sync.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(app.includes('function canonicalAttentionPreferences'));
  assert.ok(app.includes('Cómo decide Isabella avisarte'));
  assert.ok(app.includes('async function attentionHistoryPanel'));
  assert.ok(app.includes("card('Attention Economy'"));
  assert.ok(app.includes('score oculto'));
  assert.ok(sync.includes("'attention_runtime'"));
  assert.ok(shell.includes('data-action="assistantprefs"'));
  assert.ok(!shell.includes('data-nav="attention"'));
});


test('Build 83.1 storage bucket accepts chat PDFs and common documents without becoming public',()=>{
  const m=read('supabase/migrations/20261008093000_build83_chat_upload_mime_types.sql');
  assert.ok(m.includes("where id = 'isabella-uploads'"));
  assert.ok(m.includes("'application/pdf'"));
  assert.ok(m.includes("'application/vnd.openxmlformats-officedocument.wordprocessingml.document'"));
  assert.ok(m.includes('file_size_limit = 12582912'));
  assert.ok(!m.includes('public = true'));
});

test('Build 83.1 Work and Calendar persist separate user ordering semantics',()=>{
  const m=read('supabase/migrations/20261008094500_build83_independent_work_task_order.sql');
  const work=read('apps/isabella/work.js');
  const app=read('apps/isabella/app.js');
  assert.ok(m.includes('add column if not exists work_sort_order integer'));
  assert.ok(work.includes('work_sort_order'));
  assert.ok(work.includes('persistWorkTaskOrder'));
  assert.ok(work.includes("data-work-task-list"));
  assert.ok(app.includes('commitTaskOrderFromContainer'));
  assert.ok(app.includes('initTaskDesktopDrag'));
  assert.ok(app.includes("mutation('task',t.date===before.date?'reorder':'move_date'"));
  assert.ok(app.includes('sortOrder=nextOrder'));
});
