import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const fixture=JSON.parse(read('tests/fixtures/bernried-cognitive-integrity-v01.json'));

test('unreviewed personal-model hypotheses are never exposed to Isabella context',()=>{
  const start=chat.indexOf('async function personalModel(');
  const end=chat.indexOf('async function personalModelPolicy(',start);
  assert.ok(start>=0&&end>start);
  const block=chat.slice(start,end);
  assert.ok(block.includes('.eq("status", "confirmed")'));
  assert.ok(!block.includes('"hypothesis","confirmed"'));
  assert.ok(!block.includes("'hypothesis','confirmed'"));
});

test('Bernried acceptance corpus contains twenty source-grounded cognitive integrity cases',()=>{
  assert.equal(fixture.version,'0.1');
  assert.equal(fixture.cases.length,20);
  assert.equal(new Set(fixture.cases.map(x=>x.id)).size,20);
  for(const c of fixture.cases){
    assert.match(c.id,/^B\\d{2}$/);
    assert.ok(c.title&&c.source&&c.given&&c.expected);
    assert.ok(Array.isArray(c.invariants)&&c.invariants.length>0);
    for(const invariant of c.invariants)assert.ok(fixture.invariants.includes(invariant));
  }
});

test('Bernried corpus exercises all four cognitive integrity invariants',()=>{
  const covered=new Set(fixture.cases.flatMap(x=>x.invariants));
  assert.deepEqual([...covered].sort(),fixture.invariants.slice().sort());
});

test('Bernried corpus contains live time anchors from Fachplaner coordination through LPH3 handover',()=>{
  const text=JSON.stringify(fixture.cases);
  for(const marker of ['08.10','09.10','23.10','02.11','09.11','20.11','04.12','10.12','16.12','18.12']){
    assert.ok(text.includes(marker),marker);
  }
});
