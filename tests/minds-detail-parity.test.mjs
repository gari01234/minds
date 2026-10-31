import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('apps/isabella/minds-detail-parity.css');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const dashboard=read('apps/isabella/dashboard.js');
const chat='body\\[data-section="assistant"\\]\\.desk-enabled ';

test('Detail parity is the last stylesheet and part of the offline shell',()=>{
  assert.match(index,/chat-apple-finish\.css\?v=1">\s*<link rel="stylesheet" href="\.\/minds-detail-parity\.css\?v=1">\s*<\/head>/);
  assert.match(sw,/chat-apple-finish\.css\?v=1',\s*'\.\/minds-detail-parity\.css\?v=1'/);
  assert.doesNotMatch(css,/@import|@font-face|url\(/);
});

test('Desk panel header uses the Planner bucket header scale and grip',()=>{
  assert.match(css,new RegExp(chat+'\\.desk-panel-title\\{[^}]*font-size:15px;[^}]*font-weight:650'));
  assert.match(css,new RegExp(chat+'\\.desk-panel-grip\\{[^}]*color:#9b9da4'));
  assert.match(dashboard,/class="desk-panel-grip"[^>]*>⠿</);
  assert.doesNotMatch(dashboard,/>⋮⋮</);
  assert.match(css,/\.desk-panel-actions button\[data-desk-focus\]:disabled\{\s*display:none/);
});

test('Hoy reuses Planner add row, 24px completion control and 14px item titles',()=>{
  assert.match(css,new RegExp(chat+'\\.desk-add-task\\{[^}]*min-height:42px;[^}]*font-size:12\\.5px'));
  assert.match(css,/\.desk-task-check\{[^}]*width:24px!important;height:24px!important/);
  assert.match(css,new RegExp(chat+'\\.desk-task-detail strong\\{[^}]*font-size:14px;[^}]*font-weight:625'));
  assert.match(css,/\.desk-task-list>\.desk-task-row:last-child/);
  assert.match(css,/\.desk-plan-task-row:has\(\+ \.desk-panel-footer\)/);
});

test('Row tools are vectors and stay reachable by touch and keyboard',()=>{
  assert.ok(dashboard.includes("clock:'<circle"));
  assert.ok(dashboard.includes("+deskIcon('clock')+"));
  assert.match(dashboard,/Reservar tiempo para ' \+ E\(item\.title\) \+ '">'\+deskIcon\('plus'\)\+'<\/button>/);
  for(const hook of ['data-desk-estimate','data-desk-plan-task','data-desk-sort-handle','data-desk-complete'])
    assert.ok(dashboard.includes(hook),hook);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/:is\(:hover,:focus-within\)/);
});

test('Work cards drop empty footers; Panorama rows lose native button borders',()=>{
  assert.match(css,/\.work-task-card footer:not\(:has\(\.work-task-chips \*,\.work-card-assignee\)\)\{\s*display:none/);
  assert.match(css,/\.work-overview-task\{\s*border:0;/);
});

test('Motion and contrast preferences are honoured',()=>{
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-contrast:more/);
});
