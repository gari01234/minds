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

test('Feed keeps Hoy, Noticias and Para mí as explicit information layers',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('feed-section-title">Hoy'));
  assert.ok(app.includes('feed-section-title">Noticias'));
  assert.ok(app.includes('feed-section-title">Para mí'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
  assert.ok(ai.includes('preference_signature'));
  assert.ok(ai.includes("surface_version:surface==='feed'?10"));
  assert.ok(ai.includes('source_url'));
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


test('Build 21 Feed supports free interests, followed entities and deeper news',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('feedCustomTopics'));
  assert.ok(app.includes('followGraph'));
  assert.ok(app.includes('data-news-key'));
  assert.ok(app.includes('Leer más'));
  assert.ok(ai.includes('feed_custom_topics'));
  assert.ok(ai.includes('feed_following'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
  assert.ok(ai.includes('feed_follow_graph'));
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

test('Build 22 adds an explicit personal follow graph',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('followGraph'));
  assert.ok(app.includes('Tu constelación'));
  assert.ok(app.includes('data-follow-focus'));
  assert.ok(app.includes('data-feed-follow-name'));
  assert.ok(ai.includes('feed_follow_graph'));
  assert.ok(ai.includes('feedPreferenceSignature'));
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


test('Build 24 refresh requests a genuinely new Feed edition',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes("startFeedRefresh?.(state,{force,currentItems:visible})"));
  assert.ok(ai.includes('currentItems=[]'));
  assert.ok(ai.includes("force:!!force"));
  assert.ok(ai.includes('current_titles:currentTitles'));
  assert.ok(app.includes("status.textContent=force?'Actualizando…':'Completando en segundo plano…'"));
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


test('Build 25 invalidates old Feed editions and hydrates news detail into the article',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("surface_version:surface==='feed'?10"));
  assert.ok(ai.includes('feedPreferenceSignature'));
  assert.ok(app.includes('function hydrateFeedStory'));
  assert.ok(app.includes('function renderFeedOverview'));
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


test('Build 28 lets Isabella propose and persist Feed curation changes',()=>{
  const app=read('apps/isabella/app.js');
  const sync=read('apps/isabella/sync.js');
  assert.ok(app.includes("p.kind==='feed_preferences'"));
  assert.ok(app.includes('function applyFeedPreferencesProposal'));
  assert.ok(app.includes('add_entities'));
  assert.ok(app.includes('followGraph:graph'));
  assert.ok(sync.includes("preference_key:'feed'"));
  assert.ok(sync.includes("from('isabella_preferences').upsert"));
  assert.ok(sync.includes("eq('preference_key','feed')"));
});


test('Build 29 Feed cache is preference-aware and refresh has visible state',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(ai.includes('function feedPreferenceSignature'));
  assert.ok(ai.includes("functions.invoke('isabella-feed'"));
  assert.ok(ai.includes("preference_signature:signature"));
  assert.ok(app.includes("status.textContent=force?'Actualizando…':'Completando en segundo plano…'"));
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


test('Build 30 Feed renders cached content before slow generation and reloads server-persisted edition',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('Abriendo tu Feed…'));
  assert.ok(app.includes("status.textContent=force?'Actualizando…':'Completando en segundo plano…'"));
  assert.ok(app.includes("loadSurface?.('feed','sofia',{allowStale:true})"));
  assert.ok(ai.includes("const cached=await loadSurface('feed','isabella',{allowStale:true})"));
  assert.ok(ai.includes("surface_version:surface==='feed'?10"));
  assert.ok(ai.includes("return 'feed10-'"));
});


test('Build 31 Feed refresh is asynchronous and keeps stale content usable',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('async function startFeedRefresh'));
  assert.ok(ai.includes('async function waitForFeedRefresh'));
  assert.ok(ai.includes("from('minds_feed_jobs')"));
  assert.ok(ai.includes("allowStale:true"));
  assert.ok(app.includes('Actualizando en segundo plano…'));
  assert.ok(app.includes('Se terminará de actualizar en segundo plano'));
  assert.ok(app.includes("window.addEventListener('isabella:synced'"));
  assert.ok(app.includes('maybePrewarmFeed'));
  assert.ok(ai.includes("return 'feed10-'"));
});


test('Build 32 keeps Hoy deterministic and Feed exploration inside Feed',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('function fixedTodayFeedItems'));
  assert.ok(app.includes("filter(x=>x.date===td"));
  assert.ok(app.includes("filter(x=>sectionOf(x)!=='today'&&sectionOf(x)!=='work')"));
  assert.ok(app.includes("const feedStory=surface==='feed'&&!operational"));
  assert.ok(app.includes('Leer más'));
  assert.ok(app.includes("newsItems=generated.filter(x=>sectionOf(x)==='news').slice(0,10)"));
  assert.ok(ai.includes("return 'feed10-'"));
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

test('Build 33 gives Ideas a sleep/discard lifecycle and return queue',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('data-idea-sleep'));
  assert.ok(app.includes('data-idea-dismiss'));
  assert.ok(app.includes("from('isabella_return_queue').insert"));
  assert.ok(ai.includes('research_candidate'));
  assert.ok(ai.includes("surface==='idea'?3"));
});

test('Build 33 morning brief includes weather and news',()=>{
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes('pronóstico breve del clima'));
  assert.ok(ai.includes('noticias realmente relevantes'));
});


test('Build 34 runs a small autonomous research queue and surfaces finished work',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(ai.includes("functions.invoke('isabella-research'"));
  assert.ok(ai.includes("from('isabella_research_queue')"));
  assert.ok(app.includes('maybePrewarmResearch'));
  assert.ok(app.includes('Avances de Isabella'));
  assert.ok(app.includes('researchItems'));
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
