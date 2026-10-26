import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Desktop distinguishes stored originals, queued reading and proposed partial evidence',()=>{
  const work=read('apps/isabella/work.js');
  assert.match(work,/function workKnowledgeStatus\(file\)/);
  assert.match(work,/Solo almacenado · aún sin leer/);
  assert.match(work,/Lectura pendiente/);
  assert.match(work,/Claims propuestos · texto aún no extraído/);
  assert.match(work,/No se pudo leer · revisar/);
  assert.match(work,/index_status,metadata,storage_path/);
  assert.match(work,/esc\(workKnowledgeStatus\(f\)\)/);
  assert.doesNotThrow(()=>new Script(work,{filename:'work.js'}));
});
test('PWA publishes visible knowledge statuses with coherent cache pins',()=>{
  assert.match(read('apps/isabella/index.html'),/work\.js\?v=30/);
  const sw=read('apps/isabella/sw.js');
  assert.match(sw,/work\.js\?v=30/);
  assert.match(sw,/isabella-shell-v166/);
});
