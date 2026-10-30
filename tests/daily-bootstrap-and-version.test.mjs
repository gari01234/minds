import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const html=read('apps/isabella/index.html');
const app=read('apps/isabella/app.js');
const shell=read('apps/isabella/shell.js');
const build=read('scripts/build.mjs');
test('Calendar projection loads before any synchronous app initialization',()=>{
  const m=html.indexOf('<script src="./dashboard-model.js?v=5"></script>');
  const a=html.indexOf('<script src="./app.js?v=131"></script>');
  assert.ok(m>0&&a>m,'dashboard-model.js must precede app.js');
  assert.match(app,/MINDS_DESK_MODEL\.monthAgendaGroups/);
  assert.match(app,/function init\(\)\{/);
  assert.match(app,/renderCalendar\(\)/);
});
test('Global More drawer keeps every original action and opens via same button',()=>{
  assert.match(shell,/id="menuButton" class="dots" aria-label="Menú"/);
  for(const action of ['tasks','new','memory','assistantprefs','push','permissions',
    'reviews','routines','intents','continuity','skills','doctor','feedprefs',
    'artifacts','aiusage','categories'])
    assert.ok(shell.includes('data-action="'+action+'"'),action);
  assert.match(app,/\$\('#menuButton'\)\.onclick=openDrawer/);
  assert.match(app,/function placeGlobalMenu\(name\)/);
});
test('Displayed version comes from the actually served HTML, never a stale manually copied label',()=>{
  assert.match(html,/<meta name="minds-build-sha" content="local">/);
  assert.match(build,/process\.env\.GITHUB_SHA/);
  assert.match(build,/const publishedIndex = new URL\('isabella\/index.html',dist\)/);
  assert.match(shell,/id="currentBuildInfo"/);
  assert.match(app,/meta\[name="minds-build-sha"\]/);
  assert.match(app,/Versión cargada · commit/);
  assert.doesNotMatch(shell,/Build 2026\.10\.12\.138\.2/);
});
