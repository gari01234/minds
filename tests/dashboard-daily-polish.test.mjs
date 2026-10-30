import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('apps/isabella/dashboard-daily-polish.css');
const html=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const desk=read('apps/isabella/dashboard.js');
const mobile=read('apps/isabella/mobile-refinement.css');

function luminance(hex){
  const channels=[0,2,4].map(i=>parseInt(hex.slice(1+i,3+i),16)/255)
    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}
const ratio=(fg,bg='#ffffff')=>{
  const a=luminance(fg),b=luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
};
test('UX A.6 daily desktop takes full browser height through all nested panels',()=>{
  assert.match(css,/@media\s*\(min-width:950px\)/);
  for(const rule of [
    'body[data-section="assistant"].desk-enabled .app',
    'body[data-section="assistant"].desk-enabled #swipeArea',
    'body[data-section="assistant"].desk-enabled #assistantScreen.screen.active',
    'body[data-section="assistant"].desk-enabled #assistantScreen>.desk-shell',
    'body[data-section="assistant"].desk-enabled .desk-layout'
  ])assert.ok(css.includes(rule),'Missing viewport layout segment '+rule);
  assert.match(css,/\.app\{[\s\S]*?min-block-size:100dvh;[\s\S]*?max-block-size:100dvh/);
  assert.match(css,/#assistantScreen\.screen\.active\{[\s\S]*?inset:0;/);
  assert.match(css,/#assistantScreen>\.desk-shell\{[\s\S]*?flex:1 1 0/);
  assert.match(css,/\.desk-layout\{[\s\S]*?min-block-size:0/);
  assert.ok(desk.includes("screen.append(shell)"),'Existing canonical desktop shell must remain');
  assert.ok(desk.includes('parts.chat.append(originalScroll,originalComposer)'));
  assert.ok(desk.includes('stage = elt(\'div\',\'desk-stage\')'));
});
test('UX A.6 improves legibility without losing quiet white desktop',()=>{
  const matches=[...css.matchAll(/(?<![a-zA-Z-])color:(#[0-9a-fA-F]{6});/g)].map(x=>x[1]);
  assert.ok(matches.length>=14,'Semantic text colors missing');
  for(const c of matches)assert.ok(ratio(c)>=4.5,c+' contrast '+ratio(c).toFixed(2)+' < 4.5 on white');
  assert.match(css,/\.desk-panel-actions button\{[\s\S]*?width:34px;[\s\S]*?height:34px/);
  assert.match(css,/\.desk-task-detail small\{[\s\S]*?font-size:11px/);
  assert.match(css,/\.desk-month-day\.is-outside\{/);
  assert.match(css,/textarea::placeholder\{/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/\.orb|data-work-view|\.work-board|\.work-bucket/);
  assert.doesNotMatch(css,/@media\s*\(max-width/);
});
test('UX A.6 ships an additive and offline precached stylesheet',()=>{
  const path='./dashboard-daily-polish.css?v=1';
  assert.ok(html.includes('<link rel="stylesheet" href="'+path+'">'));
  assert.ok(sw.includes("'"+path+"'"));
  assert.ok(html.indexOf(path)>html.indexOf('./mobile-refinement.css?v=1'));
  assert.match(sw,/const CACHE_NAME = 'isabella-shell-v171'/);
  assert.match(html,/dashboard\.js\?v=7/);
  assert.match(html,/work\.js\?v=33/);
  assert.match(mobile,/@media\(max-width:620px\)/);
  let depth=0;
  for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){
    if(c==='{')depth++;
    if(c==='}')depth--;
    assert.ok(depth>=0,'CSS block closed before opening');
  }
  assert.equal(depth,0);
});
test('UX A.6 keeps all daily instrument destinations and original handlers',()=>{
  for(const panel of ["chat:'Isabella'","calendar:'Calendario'","today:'Hoy'","plan:'Plan de trabajo'"])
    assert.ok(desk.includes(panel));
  for(const token of [
    'data-desk-month','data-desk-complete','data-desk-task',
    'data-desk-add-task','data-desk-plan-mode','data-desk-plan-task',
    'data-desk-open-time','data-desk-focus','data-desk-minimize',
    'data-desk-sort-handle'
  ])assert.ok(desk.includes(token),'Lost canonical interaction '+token);
  assert.ok(!css.includes('display:none'));
});
