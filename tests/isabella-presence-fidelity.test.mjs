import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const chat=read('supabase/functions/isabella-chat/index.ts');
const relationship=read('supabase/functions/_shared/relationship-policy.ts');
const presence=read('apps/isabella-presence/ui/presence.js');
const html=read('apps/isabella-presence/ui/index.html');
const config=JSON.parse(read('apps/isabella-presence/src-tauri/tauri.conf.json'));
const build=read('apps/isabella/BUILD-80.4.md');

test('Build 80.4 removes timezone conversion from model reasoning',()=>{
  assert.ok(chat.includes('presentZonedRange'));
  assert.ok(chat.includes('local_start_time'));
  assert.ok(chat.includes('local_end_time'));
  assert.ok(chat.includes('display_time'));
  assert.ok(chat.includes('Para comunicar horas usa SIEMPRE esos campos locales'));
  assert.ok(chat.includes('starts_at/ends_at son timestamps de almacenamiento'));
  assert.ok(build.includes('2026-10-05T13:00:00Z → Europe/Berlin → 15:00'));
});

test('Relationship Contract v0.2 preserves continuity when Isabella corrects herself',()=>{
  assert.ok(relationship.includes('gari-isabella-v0.2'));
  assert.ok(relationship.includes('CONTINUIDAD DE ERROR PROPIO'));
  assert.ok(relationship.includes('no respondas como si el dato correcto apareciera por primera vez'));
  assert.ok(relationship.includes('reconoce explícitamente en una frase breve qué dijiste mal'));
});

test('Presence 0.1.7 is a top-edge contextual island',()=>{
  assert.equal(config.version,'0.1.7');
  assert.equal(config.app.windows[0].width,306);
  assert.equal(config.app.windows[0].height,60);
  assert.ok(presence.includes("const SIZES={pill:[306,60],status:[420,220],chat:[420,320]"));
  assert.ok(presence.includes('Math.round(origin.x+(area.width-w)/2)'));
  assert.ok(presence.includes("$('#app').dataset.mode=expanded?'home':'petit'"));
  assert.ok(html.includes('id="statusTab"'));
  assert.ok(html.includes('id="chatTab"'));
});

test('Decision events pin home while normal activity remains petit',()=>{
  assert.ok(presence.includes("if(candidate.needsUser){expanded=true;panelView='status'"));
  assert.ok(presence.includes("if(!expanded||chatBusy||lastCards.some(x=>x.needsUser)"));
  assert.ok(presence.includes("if(event.key==='Escape')"));
});

test('Presence formats assistant Markdown locally and safely',()=>{
  assert.ok(presence.includes('function inlineMarkdown(value)'));
  assert.ok(presence.includes('function markdownHtml(value)'));
  assert.ok(presence.includes("t.role==='assistant'?markdownHtml(t.text):esc(t.text)"));
  assert.ok(presence.includes("return esc(value)"));
});
