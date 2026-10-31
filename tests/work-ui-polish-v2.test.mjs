import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../apps/isabella/work-polish.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../apps/isabella/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../apps/isabella/sw.js',import.meta.url),'utf8');
const task=fs.readFileSync(new URL('../apps/isabella/task-detail.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');

test('Polish stylesheet loads last and is also precached for offline PWA',()=>{
  assert.match(html,/work-apple\.css\?v=1[^]*work-polish\.css\?v=1/);
  assert.match(sw,/work-polish\.css\?v=1/);
  assert.ok(html.indexOf('work-polish.css?v=1')>html.indexOf('task-team.css?v=1'));
  assert.match(css,/font-family:-apple-system/);
  assert.match(css,/\.modal-title/);
  assert.match(css,/body\[data-section="work"\] \.work-task-card/);
});
test('Real shared task detail, not unused fallback work form, gets scroll-shell and consistent fonts',()=>{
  assert.match(source,/window\.MINDS_TASK_DETAIL\?\.open/);
  assert.match(css,/#modal:has\(\.minds-task-detail\)\{/);
  assert.match(css,/overflow:hidden;/);
  assert.match(css,/#modal:has\(\.minds-task-detail\) #modalBody\{/);
  assert.match(css,/overflow-y:auto;/);
  assert.match(css,/scrollbar-gutter:stable;/);
  assert.match(css,/\.minds-task-detail-top>input/);
  assert.match(css,/font-family:inherit!important;/);
  assert.match(css,/\.minds-task-team-chip/);
});
test('Completion indicator is clean pending circle and explicit blue check on done state',()=>{
  assert.match(task,/minds-task-complete'\+\(t\.completed_at\?' is-done':''\)/);
  assert.match(task,/aria-pressed/);
  assert.match(task,/Reabrir tarea/);
  assert.match(task,/Marcar como completada/);
  assert.match(task,/<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(task,/t\.completed_at\?'✓':'○'/);
  assert.match(css,/\.minds-task-complete\.is-done/);
  assert.match(css,/background:#007aff;/);
});
test('Updated detail JS parses and keeps create/update/deletion authority unchanged',()=>{
  assert.doesNotThrow(()=>new Function(task));
  for(const pattern of [/async function perform\(ctx,patch/,/async function deleteTask/,/taskDetailComplete/,/MINDS_TASK_TEAM\.selectorHtml/,/data-task-action="archive"/,/data-task-action="delete"/]){
    assert.match(task,pattern);
  }
});
test('Dialog remains responsive, keyboard-visible and animation-safe',()=>{
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(prefers-contrast:more\)/);
  assert.match(css,/:focus-visible/);
});
