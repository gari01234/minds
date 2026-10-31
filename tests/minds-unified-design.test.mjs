import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const css=read('apps/isabella/minds-unified-surface.css');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const html=read('apps/isabella/shell.js');
test('Unified design is the final stylesheet and part of offline shell',()=>{
  assert.match(index,/work-polish\.css\?v=1[\s\S]*minds-unified-surface\.css\?v=1/);
  assert.match(sw,/minds-unified-surface\.css\?v=1/);
  assert.match(css,/--minds-ui-accent:#007aff/);
  assert.match(css,/-apple-system/);
});
test('Work canvas switches to white without losing the grouped gray buckets',()=>{
  assert.match(css,/body\[data-section="work"\] #workScreen\.work-screen,/);
  assert.match(css,/body\[data-section="work"\] #workScreen \.work-body,/);
  assert.match(css,/body\[data-section="work"\] #workScreen \.work-board\{\s*background:#fff/);
  assert.match(css,/body\[data-section="work"\] #workScreen \.work-bucket\{\s*background:#f1f3f6/);
  assert.match(css,/body\[data-section="work"\] #workScreen \.work-task-card\{\s*background:#fff/);
});
test('Isabella Chat uses Work system colors and typography without markup replacement',()=>{
  assert.match(css,/body\[data-section="assistant"\]\.desk-enabled \.desk-shell\{\s*background:#fff!important/);
  assert.match(css,/body\[data-section="assistant"\]\.desk-enabled \.desk-panel\{/);
  assert.match(css,/body\[data-section="assistant"\] \.composer \.send\{/);
  assert.match(css,/background:var\(--minds-ui-accent\)!important/);
  assert.match(css,/body\[data-section="assistant"\] \.message\.user/);
  assert.match(css,/\.desk-panel-title/);
  assert.match(html,/id="assistantScreen"/);
  assert.match(html,/id="workScreen"/);
  assert.match(html,/id="chatInput"/);
});
test('Styling does not change workflow state, screen layout or data access',()=>{
  assert.doesNotMatch(css,/@import|url\(|@font-face|display:none!important/);
  assert.doesNotMatch(css,/work-task.*pointer-events:none/);
  assert.match(css,/@media\(max-width:949px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(prefers-contrast:more\)/);
});
