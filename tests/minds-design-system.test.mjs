import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tokens=read('shared/minds-design-tokens.css');
const web=read('apps/isabella/design-system.css');
const reading=read('apps/theory/design-system.css');
const presence=read('apps/isabella-presence/ui/presence.css');
const appHtml=read('apps/isabella/index.html');
const theoryHtml=read('apps/theory/index.html');
const nativeHtml=read('apps/isabella-presence/ui/index.html');
const sw=read('apps/isabella/sw.js');
const shell=read('apps/isabella/shell.js');

function token(source,name){
  const i=source.indexOf('--'+name+':');
  assert.ok(i>=0,'Missing semantic token '+name);
  return source.slice(i+name.length+3).split(';',1)[0].trim().toLowerCase();
}
function luminance(hex){
  const raw=hex.slice(1);
  const normalized=raw.length===3?[...raw].map(ch=>ch+ch).join(''):raw;
  const rgb=[0,2,4].map(i=>parseInt(normalized.slice(i,i+2),16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function contrast(a,b){
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function checkCssBalance(source){
  const withoutComments=source.replace(/\/\*[\s\S]*?\*\//g,'');
  let depth=0;
  for(const ch of withoutComments){
    if(ch==='{')depth++;
    if(ch==='}')depth--;
    assert.ok(depth>=0,'Unbalanced CSS block');
  }
  assert.equal(depth,0,'Unclosed CSS block');
}

test('UX A.4 uses a semantic color system with legible informational text',()=>{
  for(const key of ['m-paper','m-surface','m-ink','m-ink-soft','m-border','m-information','m-success','m-attention','m-error']){
    assert.match(token(tokens,key),/^#[0-9a-f]{3,6}$/);
  }
  const paper=token(tokens,'m-paper');
  assert.ok(contrast(token(tokens,'m-ink'),paper)>=7);
  assert.ok(contrast(token(tokens,'m-ink-soft'),paper)>=4.5);
  assert.ok(contrast(token(tokens,'m-attention'),paper)>=4.5);
  assert.ok(contrast(token(tokens,'m-error'),paper)>=4.5);
});

test('UX A.4 loads design tokens and each surface layer after legacy CSS with PWA support',()=>{
  assert.ok(appHtml.indexOf('minds-design-tokens.css?v=1')<appHtml.indexOf('app.css?v=69'));
  assert.ok(appHtml.indexOf('app.css?v=69')<appHtml.indexOf('design-system.css?v=2'));
  assert.ok(theoryHtml.indexOf('v10.css?v=0115')<theoryHtml.indexOf('design-system.css?v=2'));
  assert.ok(theoryHtml.includes('../shared/minds-design-tokens.css?v=1'));
  for(const path of ['../shared/minds-design-tokens.css?v=1','./design-system.css?v=2']){
    assert.ok(sw.includes(path),'PWA precache missing '+path);
  }
  assert.ok(sw.includes('isabella-shell-v125'));
  assert.ok(nativeHtml.includes('presence.css?v=design1'));
});

test('UX A.4 uses one typographic and geometry vocabulary across distinct densities',()=>{
  for(const key of ['m-type-system','m-type-reading','m-size-meta','m-size-body',
    'm-space-3','m-space-4','m-radius-card','m-radius-pill','m-motion-normal']){
    assert.ok(tokens.includes('--'+key+':'),'Missing shared token '+key);
  }
  for(const css of [web,reading]){
    assert.match(css,/var\(--m-type-system\)/);
    assert.match(css,/var\(--m-ink-soft\)/);
    assert.match(css,/var\(--m-border\)/);
  }
  assert.match(web,/\.work-tabs\{[\s\S]*?flex-wrap:nowrap!important/);
  assert.match(web,/\.work-head h1\{[\s\S]*?position:absolute/);
  assert.match(web,/\.situation-heading h2\{[\s\S]*?position:absolute/);
  assert.match(web,/\.readings-topline \.readings-agent,\.app \.readings-title\{display:none\}/);
  assert.match(reading,/html\.embedded \.v09-reading-list article h2\{[\s\S]*?var\(--m-type-reading\)/);
});

test('UX A.4 does not resize Isabella ORB or remove validated routes and drag interaction',()=>{
  assert.doesNotMatch(web,/\.orb-(?:button|core|haze)\s*\{/);
  const oldCss=read('apps/isabella/app.css');
  assert.ok(oldCss.includes('.assistant-scroll.orb-compact .orb-button'));
  for(const route of ['assistant','calendar','feed','work','readings','ideas'])
    assert.ok(shell.includes('data-nav="'+route+'"'),'Existing lens removed: '+route);
  assert.ok(read('apps/isabella/work.js').includes('card.ondragstart'));
  assert.ok(!web.includes('data-work-move'));
});

test('UX A.4 shares progress semantics across Isabella, Threads and Presence',()=>{
  assert.ok(web.includes('.app .chat-activity'));
  assert.ok(web.includes('.app .work-thread-progress[data-phase="error"]'));
  assert.ok(web.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(reading.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(presence.includes('@media(prefers-reduced-motion:reduce)'));
  for(const name of ['m-paper','m-surface','m-ink','m-ink-soft','m-border','m-success','m-attention','m-error','m-focus']){
    assert.equal(token(presence,name),token(tokens,name),'Presence token drift: '+name);
  }
  assert.ok(!reading.includes('.orb-core'));
  const nativeLayer=presence.slice(presence.indexOf('/* MINDS UX A.4'));
  assert.doesNotMatch(nativeLayer,/\.orb\.(?:tiny|micro|medium|large)\s*\{/);
});

test('UX A.4 CSS layers have balanced rules',()=>{
  for(const css of [tokens,web,reading,presence])checkCssBalance(css);
});


test('UX A.4.1 retains one global More button and places it inside every contextual lens',()=>{
  const app=read('apps/isabella/app.js');
  assert.equal((shell.match(/id="menuButton"/g)||[]).length,1);
  for(const lens of ['feed','ideas','work','calendar','readings'])
    assert.ok(shell.includes('data-menu-slot="'+lens+'"'),'Menu destination missing: '+lens);
  assert.ok(app.includes('placeGlobalMenu(name)'));
  assert.ok(app.includes('host.appendChild(button)'));
  assert.ok(web.includes('body:not([data-section="assistant"]) .app .topbar{display:none!important}'));
  assert.ok(web.includes('grid-template-rows:0px minmax(0,1fr)'));
  assert.ok(web.includes('safe-area-inset-top'));
});

test('UX A.4.1 uses underline tabs for embedded reading filters',()=>{
  assert.match(reading,/\.v09-reading-filters button\.active\{[\s\S]*?border-bottom:2px solid var\(--m-ink\)/);
  assert.ok(reading.includes('min-height:44px'));
  assert.ok(read('apps/theory/v09.js').includes("['all','Todo']"));
});

test('UX A.4.1 hides empty attention sections but keeps unknown sources and scope visible',()=>{
  const src=read('apps/isabella/situation.js');
  assert.ok(src.includes('rowsExpect.length||!expectations.ok'));
  assert.ok(src.includes('rowsAttention.length||!attention.ok'));
  assert.ok(src.includes('pendingReviews?'));
  assert.ok(src.includes('details class="situation-scope"'));
  assert.ok(src.includes('No incluye todas las conversaciones'));
  assert.ok(!src.includes('situation-limit'));
});
