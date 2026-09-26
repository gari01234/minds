import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Isabella collection selectors use querySelectorAll before forEach',()=>{
  const source=read('apps/isabella/app.js');
  const singular=/(?<!\\$)\\$\\(([^)\\n]+)\\)\\.forEach/g;
  assert.deepEqual([...source.matchAll(singular)].map(m=>m[0]),[]);
});

test('unified MINDS navigation wires all five destinations',()=>{
  const shell=read('apps/isabella/shell.js');
  const app=read('apps/isabella/app.js');
  for(const name of ['assistant','feed','ideas','calendar','readings']){
    assert.ok(shell.includes(`data-nav="${name}"`),`missing nav: ${name}`);
    assert.ok(app.includes(`'${name}'`),`missing route: ${name}`);
  }
  assert.ok(app.includes("$$('.main-nav-item').forEach"));
});

test('ORB compact mode is driven by conversation state',()=>{
  const app=read('apps/isabella/app.js');
  const css=read('apps/isabella/app.css');
  assert.ok(app.includes('function syncOrbCompact'));
  assert.ok(app.includes("m.role==='user'"));
  assert.ok(css.includes('.assistant-scroll.orb-compact .orb-button'));
});

test('Feed keeps Hoy and Para mí as explicit information layers',()=>{
  const app=read('apps/isabella/app.js');
  const ai=read('apps/isabella/ai.js');
  assert.ok(app.includes('feed-section-title">Hoy'));
  assert.ok(app.includes('feed-section-title">Para mí'));
  assert.ok(ai.includes('"section":"today"|"for_me"'));
  assert.ok(ai.includes('"kind":"weather"'));
  assert.ok(ai.includes('"kind":"architecture"'));
  assert.ok(ai.includes('"kind":"ai"'));
  assert.ok(ai.includes('"kind":"family"'));
  assert.ok(ai.includes('"kind":"project"'));
});
