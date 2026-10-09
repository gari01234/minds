import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const theory=readFileSync(new URL('../apps/theory/v09.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../apps/isabella/app.js',import.meta.url),'utf8');

test('90.5 embedded Sofía receives bridge commands only from its own parent',()=>{
  const start=theory.indexOf('function acceptsSofiaBridgeMessage(e){');
  const end=theory.indexOf("window.addEventListener('message',e=>{",start);
  assert.ok(start>=0&&end>start);
  const parent={frame:'canonical-parent'};
  const f=vm.runInNewContext('('+theory.slice(start,end).trim()+')',{
    location:{origin:'https://gari01234.github.io',search:'?embedded=1'},
    parent,URLSearchParams
  });
  assert.equal(f({origin:'https://gari01234.github.io',source:parent}),true);
  assert.equal(f({origin:'https://gari01234.github.io',source:{frame:'other'}}),false);
  assert.equal(f({origin:'https://foreign.example',source:parent}),false);
  assert.equal(f({origin:'https://gari01234.github.io'}),false);
  assert.match(app,/e\.source!==frame\?\.contentWindow/,'The parent also validates its expected iframe');
});

test('90.5 standalone Readings preserves established same-origin messaging behavior',()=>{
  const start=theory.indexOf('function acceptsSofiaBridgeMessage(e){');
  const end=theory.indexOf("window.addEventListener('message',e=>{",start);
  const f=vm.runInNewContext('('+theory.slice(start,end).trim()+')',{
    location:{origin:'https://gari01234.github.io',search:''},parent:{},URLSearchParams
  });
  assert.equal(f({origin:'https://gari01234.github.io',source:{}}),true);
  assert.equal(f({origin:'https://foreign.example',source:{}}),false);
});

test('90.5 changing lenses does not close Sofía or reset drafts',()=>{
  assert.doesNotMatch(app,/postMessage\(\{type:'minds:sofia-close'\}/);
  assert.match(app,/minds:sofia-state-request/);
  assert.match(theory,/minds:sofia-state-request/);
});
