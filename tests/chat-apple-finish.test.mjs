import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stylesheet=read('apps/isabella/chat-apple-finish.css');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const dashboard=read('apps/isabella/dashboard.js');
const shell=read('apps/isabella/shell.js');

test('Final Chat finish loads after Work/Chat shared surface and survives offline shell',()=>{
  assert.match(index,/minds-unified-surface\.css\?v=1[\s\S]*chat-apple-finish\.css\?v=1/);
  assert.match(sw,/chat-apple-finish\.css\?v=1/);
  assert.match(stylesheet,/body\[data-section="assistant"\]\.desk-enabled/);
  assert.doesNotMatch(stylesheet,/@font-face|@import/);
});
test('Panel, calendar and footer icons are real inline vectors with original action hooks',()=>{
  assert.match(dashboard,/const DESK_ICONS=\{/);
  for(const action of ['expand','minimize','left','right','plus','arrow'])
    assert.ok(dashboard.includes("deskIcon('"+action+"')"),action);
  assert.match(dashboard,/data-desk-focus=/);
  assert.match(dashboard,/data-desk-minimize=/);
  assert.match(dashboard,/data-desk-month=/);
  assert.match(dashboard,/data-desk-add-task/);
  assert.match(dashboard,/data-desk-open-time/);
  assert.doesNotMatch(dashboard,/title="Ampliar">↗/);
  assert.doesNotMatch(dashboard,/title="Minimizar">−/);
  assert.doesNotMatch(dashboard,/Mes anterior">‹/);
  assert.match(dashboard,/toLocaleUpperCase\('es-ES'\)/);
  assert.match(stylesheet,/text-transform:none!important/);
});
test('Composer uses vector controls but keeps stable IDs used by existing chat actions',()=>{
  for(const id of ['attachButton','micButton','sendButton']){
    assert.match(shell,new RegExp('id="'+id+'"[^\\n]*<svg'));
  }
  assert.match(shell,/id="chatInput"/);
  assert.match(shell,/id="chatImageInput"/);
  assert.match(stylesheet,/\.chat-ui-icon/);
});
test('Calendar focus, compact panel, plan segment and message controls stay accessible',()=>{
  assert.match(stylesheet,/\.desk-month-day\.is-selected/);
  assert.match(stylesheet,/\.desk-month-day\.is-today:not\(\.is-selected\)/);
  assert.match(stylesheet,/\.desk-plan-view-switch button\.is-selected/);
  assert.match(stylesheet,/\.desk-add-task/);
  assert.match(stylesheet,/\.desk-panel-footer button/);
  assert.match(stylesheet,/prefers-reduced-motion:reduce/);
  assert.match(stylesheet,/prefers-contrast:more/);
  assert.match(stylesheet,/max-height:720px/);
  assert.doesNotMatch(stylesheet,/pointer-events:none!important/);
});
test('Dashboard and shell JavaScript parse without altering behavior',()=>{
  assert.doesNotThrow(()=>new Function(dashboard));
  assert.doesNotThrow(()=>new Function(shell));
});
