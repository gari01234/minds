import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Desktop exposes specialist-reader deferral without treating it as failed or read',()=>{
 const work=read('apps/isabella/work.js');
 assert.match(work,/k==='waiting_parser'/);
 assert.match(work,/Pendiente · lector especializado/);
 assert.match(work,/Pendiente · archivo grande/);
 assert.match(work,/Pendiente · lector de formato/);
 assert.match(work,/Claims propuestos · texto aún no extraído/);
});
test('PWA installs updated Work UI with matching cache pins',()=>{
 const html=read('apps/isabella/index.html');
 const sw=read('apps/isabella/sw.js');
 assert.match(html,/work\.js\?v=28/);
 assert.match(sw,/work\.js\?v=28/);
 assert.match(sw,/isabella-shell-v160/);
});
