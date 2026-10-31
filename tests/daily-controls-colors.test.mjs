import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const colors=require('../apps/isabella/calendar-colors.js');
const app=read('apps/isabella/app.js');
const desk=read('apps/isabella/dashboard.js');
const css=read('apps/isabella/daily-controls.css');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const shell=read('apps/isabella/shell.js');

const state={
  projects:[{id:'faro',color:'#2F6FB0'},{id:'rio',color:'#4F8A62'}],
  categories:[{id:'personal',color:'#D08A6A'}],
  tasks:[
    {id:'a',date:'2026-10-29',projectId:'faro'},
    {id:'b',date:'2026-10-29',categoryId:'personal'},
    {id:'c',date:'2026-10-29',projectId:'faro'},
    {id:'d',date:'2026-10-29',projectId:'rio'},
    {id:'hidden',date:'2026-10-29',projectId:'rio',archivedAt:'2026-10-27'}
  ],
  events:[{id:'e',date:'2026-10-29',projectId:'faro'}]
};

test('Calendario principal y miniatura consumen la misma identidad cromática',()=>{
  assert.deepEqual(colors.colorsForDay(state,'2026-10-29'),['#2F6FB0','#D08A6A','#4F8A62']);
  assert.deepEqual(colors.colorsForDay(state,'2026-10-30'),[]);
  assert.equal(colors.itemColor(state,{projectId:'faro',categoryId:'personal'}),'#2F6FB0');
  assert.equal(colors.itemColor(state,{categoryId:'personal'}),'#D08A6A');
  assert.equal(colors.itemColor(state,{id:'unknown'}),colors.fallbackColor('unknown'));
  assert.deepEqual(colors.colorsForItems(state,[...state.events,...state.tasks].filter(x=>!x.archivedAt)),
    colors.colorsForDay(state,'2026-10-29'));
  assert.match(app,/return window\.MINDS_CALENDAR_COLORS\.itemColor\(state,item\)/);
  assert.match(app,/window\.MINDS_CALENDAR_COLORS\.colorsForItems\(state,\[\.\.\.events,\.\.\.tasks\]\)/);
  assert.match(desk,/MINDS_CALENDAR_COLORS\.colorsForDay\(state,cell\.key\)/);
});
test('Bootstrap y Service Worker mantienen orden y cache coherentes',()=>{
  const positions=['dashboard-model.js?v=5','calendar-colors.js?v=1','app.js?v=131','dashboard.js?v=7'].map(x=>index.indexOf('./'+x));
  assert.ok(positions.every(x=>x>=0));
  assert.ok(positions.every((x,i)=>!i||x>positions[i-1]));
  for(const asset of ['calendar-colors.js?v=1','daily-controls.css?v=1','app.js?v=131','dashboard.js?v=7']){
    assert.ok(index.includes('./'+asset));
    assert.ok(sw.includes("'./"+asset+"'"));
  }
  assert.match(sw,/isabella-shell-v172/);
  assert.match(index,/<link rel="stylesheet" href="\.\/daily-controls\.css\?v=1">/);
  assert.ok(index.indexOf('daily-controls.css?v=1')>index.indexOf('dashboard-daily-polish.css?v=1'));
});
test('Solo la barra del dashboard diario cambia de estilo',()=>{
  assert.match(css,/@media\(min-width:950px\)/);
  assert.match(css,/\.desk-stage \.desk-panel--chat \.composer/);
  assert.match(css,/flex:0 0 44px/);
  assert.match(css,/\:focus-visible|\:focus-within/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.desk-month-day\.is-today:not\(\.is-selected\)/);
  assert.match(css,/\.desk-month-day\.is-selected/);
  assert.match(css,/\.mc\.selected \.mn/);
  assert.match(css,/\.mc\.today:not\(\.selected\) \.mn/);
  assert.match(shell,/id="attachButton" class="attach"/);
  assert.match(shell,/id="micButton" class="mic"/);
  assert.match(shell,/id="sendButton" class="send"/);
  assert.match(shell,/id="menuButton" class="dots"/);
});
