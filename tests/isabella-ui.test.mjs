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
  assert.ok(ai.includes('"section":"today"|"news"|"for_me"'));
  for(const kind of ['weather','news','architecture','ai','family','project']){
    assert.ok(ai.includes('"'+kind+'"'),`missing Feed kind: ${kind}`);
  }
  assert.ok(ai.includes('source_url'));
  assert.ok(ai.includes('web_search'));
});


test('message reactions stay attached to messages instead of opening a large modal',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('reaction-popover'));
  assert.ok(app.includes("const quick=['❤️','👍','😂','😮','😢','👏']"));
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
  assert.ok(ai.includes('"details":[]'));
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
