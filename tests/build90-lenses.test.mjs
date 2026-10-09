import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Build 90.1 provides primary desktop lenses without deleting existing routes',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  for(const screen of ['assistant','calendar','work','readings','feed','ideas']){
    assert.ok(shell.includes('class="lens-nav-item')&&shell.includes('data-nav="'+screen+'"'),'Missing desktop route '+screen);
    assert.ok(shell.includes('data-screen="'+screen+'"'),'Missing screen '+screen);
  }
  assert.ok(shell.includes('Situación'));
  assert.ok(shell.includes('OTRAS VISTAS'));
  assert.ok(app.includes("document.querySelectorAll('.lens-nav-item').forEach"));
  assert.ok(app.includes("document.querySelectorAll('.main-nav-item, .lens-nav-item')"));
  assert.ok(app.includes("x.setAttribute('aria-current','page')"));
});

test('Build 90.1 is desktop-only and preserves canonical Work and mobile nav',()=>{
  const shell=read('apps/isabella/shell.js');
  const css=read('apps/isabella/app.css');
  const work=read('apps/isabella/work.js');
  assert.ok(css.includes('.desktop-lenses{display:none}'));
  assert.ok(css.includes('@media(min-width:1100px)'));
  assert.ok(css.includes('#mainNav{display:none!important}'));
  assert.ok(shell.includes('<nav id="mainNav" class="main-nav"'));
  assert.ok(shell.includes('data-work-view="desktop"'));
  assert.ok(shell.includes('data-work-view="planner"'));
  assert.ok(shell.includes('data-work-view="knowledge"'));
  assert.ok(shell.includes('data-work-view="threads"'));
  assert.ok(work.includes('work_sort_order'));
});

test('Build 90.1 does not claim Feed already equals canonical Attention Economy',()=>{
  const doc=read('BUILD-90.md');
  assert.ok(doc.includes('Situación'));
  assert.ok(doc.includes('The first label is deliberately **Situación**, not yet **Ahora**'));
  assert.ok(doc.includes('No backend, schema, permission, data flow, Work file or task changes.'));
});
