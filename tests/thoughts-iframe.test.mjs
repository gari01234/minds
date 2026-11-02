import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('apps/isabella/shell.js');
const app=read('apps/isabella/app.js');
const css=read('apps/isabella/design-system.css');
const sw=read('apps/isabella/sw.js');

test('Thoughts stays reachable: a desktop lens and, on the phone and in the app, the ••• menu',()=>{
  const mobile=shell.slice(shell.indexOf('<nav id="mainNav"'),shell.indexOf('</nav>',shell.indexOf('<nav id="mainNav"')));
  const desktop=shell.slice(shell.indexOf('<nav id="desktopLenses"'),shell.indexOf('</nav>',shell.indexOf('<nav id="desktopLenses"')));
  const routes=['assistant','feed','calendar','work','bandeja','readings','thoughts'];
  const positions=routes.map(x=>desktop.indexOf('data-nav="'+x+'"'));
  assert.ok(positions.every((n,i)=>n>=0&&(i===0||n>positions[i-1])));
  assert.match(desktop,/data-nav="thoughts" aria-label="Thoughts"/);
  assert.ok(!mobile.includes('data-nav="thoughts"'));
  assert.ok(shell.includes('<button data-shell-nav="thoughts">Thoughts</button>'));
  assert.match(app,/\$\$\('#drawer \[data-shell-nav\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{closeDrawer\(\);showSection\(b\.dataset\.shellNav\)\}\)/);
  assert.equal((mobile.match(/class="main-nav-item/g)||[]).length,5);
  assert.equal((desktop.match(/class="lens-nav-item/g)||[]).length,7);
  assert.ok(shell.includes('NAV_ICONS.thoughts'));
  assert.ok(!mobile.includes('nav-label'));
  assert.ok(css.includes('min-height:44px'));
});

test('Thoughts is a live canonical iframe, not a reproduced WebGL engine',()=>{
  assert.match(app,/THOUGHTS_ORIGINAL_URL='https:\/\/gari01234\.github\.io\/architectures\/dear_thoughts\.html\?hide=1'/);
  assert.match(app,/frame\.setAttribute\('sandbox','allow-scripts'\)/);
  assert.match(app,/frame\.setAttribute\('referrerpolicy','no-referrer'\)/);
  assert.match(app,/frame\.setAttribute\('loading','eager'\)/);
  assert.match(app,/url\.searchParams\.set\('opened',String\(Date\.now\(\)\)\)/);
  assert.doesNotMatch(app,/frame\.setAttribute\('sandbox','[^']*allow-same-origin/);
  assert.doesNotMatch(app,/frame\.setAttribute\('sandbox','[^']*allow-top-navigation/);
  assert.ok(!shell.includes('src="https://gari01234.github.io/architectures/'));
  assert.ok(!shell.includes('<script src="https://cdn.jsdelivr.net/npm/three'));
});

test('WebGL document only lives while Thoughts is the active screen',()=>{
  assert.match(app,/if\(previous==='thoughts'&&name!=='thoughts'\)unmountThoughts\(\)/);
  assert.match(app,/if\(name==='thoughts'\)mountThoughts\(\)/);
  assert.match(app,/if\(frame\)frame\.remove\(\)/);
  assert.match(app,/if\(!host\|\|host\.querySelector\('iframe'\)\)return/);
  assert.ok(app.includes("'readings','thoughts']"));
  assert.ok(css.includes('.app .thoughts-frame{position:absolute;inset:0;'));
});

test('no shared frame bridge or authenticated state is sent to Thoughts',()=>{
  const start=app.indexOf('/* Dear: Thoughts stays authoritative');
  const end=app.indexOf('function placeGlobalMenu(',start);
  assert.ok(start>=0&&end>start);
  const logic=app.slice(start,end);
  assert.ok(!/postMessage|localStorage|sessionStorage|MINDS_SUPABASE|auth\.|document\.cookie|allow-same-origin/.test(logic));
  assert.ok(shell.includes('id="thoughtsFrameError"'));
  assert.ok(shell.includes('rel="noopener noreferrer"'));
  assert.ok(sw.includes("const CACHE_NAME = 'isabella-shell-v172'"));
  assert.doesNotThrow(()=>new Script(app,{filename:'app.js'}));
  assert.doesNotThrow(()=>new Script(shell,{filename:'shell.js'}));
});
