import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {Script} from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const app=read('apps/isabella/app.js');
const sync=read('apps/isabella/sync.js');
const ai=read('apps/isabella/ai.js');
const server=read('supabase/functions/isabella-chat/index.ts');

test('90.8.3: user request binding exists before the first save/sync',()=>{
  assert.match(app,/const durableRequestId=globalThis\.crypto\?\.randomUUID\?\.\(\)\|\|null;\s*const userTurn=say\('user',text\|\|'📷 Foto',\{attachments:copy,replyTo,\s*metadata:durableRequestId\?\{durable_request_id:durableRequestId\}:\{\}/);
  assert.match(app,/candidates\.length===1/);
  assert.match(app,/Math\.abs\(Date\.parse\(m\.at\|\|''\)-started\)<=90000/);
  assert.match(app,/at:job\.created_at/);
  assert.doesNotThrow(()=>new Script(app));
});

test('90.8.3: remote stale echo never removes locally established durable link',()=>{
  const fn=sync.slice(sync.indexOf('function mergeConversationMessages('),sync.indexOf('async function pullConversation('));
  const merge=new Function(fn+'\nreturn mergeConversationMessages;')();
  const remote=[{id:'a',role:'user',text:'mensaje',at:'2026-10-11T08:00:00Z',metadata:{source:'remote'}}];
  const local=[{id:'a',role:'user',text:'mensaje',at:'2026-10-11T08:00:00Z',metadata:{durable_request_id:'request-1'}}];
  const result=merge(remote,local);
  assert.equal(result.length,1);
  assert.equal(result[0].metadata.durable_request_id,'request-1');
  assert.equal(result[0].metadata.source,'remote');
  assert.doesNotThrow(()=>new Script(sync));
});

test('90.8.3: read-only daily agenda can use durable lane but mutations cannot',()=>{
  const code=ai.slice(ai.indexOf('function readOnlyDailyAgendaIntent('),ai.indexOf('async function ask(message,state,options={})'));
  const eligible=new Function(code+'\nreturn readOnlyDailyAgendaIntent;')();
  assert.equal(eligible('Dame una lista de lo que tengo para mañana, medio organizada porfa'),true);
  assert.equal(eligible('Revísalo bien, mañana lunes tengo muchas tareas'),true);
  assert.equal(eligible('Mueve mi cita de mañana al viernes'),false);
  assert.equal(eligible('Agrega una tarea mañana'),false);
  assert.match(server,/tomorrow_tasks:tomorrowTasks\.slice\(0,80\)/);
  assert.match(server,/tomorrow_events:tomorrowEvents\.slice\(0,50\)/);
  assert.match(server,/readOnlyDailyAgendaIntent\(effectiveMessage\)&&canonicalAgenda\.status!=="ok"/);
  assert.match(server,/usa exclusivamente tomorrow_date, tomorrow_tasks y tomorrow_events/);
  assert.match(ai,/\(!needsCalendarAssessment\(message\)\|\|readOnlyDailyAgendaIntent\(message\)\)/);
  assert.doesNotThrow(()=>new Script(ai));
});

test('90.8.4: menu reports current release and PWA pins all changed assets',()=>{
  const html=read('apps/isabella/index.html');
  const sw=read('apps/isabella/sw.js');
  const shell=read('apps/isabella/shell.js');
  assert.match(shell,/Build 2026\.10\.11\.90\.8\.3/);
  for(const asset of ['app.js?v=115','ai.js?v=53','shell.js?v=103','sync.js?v=pwa33']){
    assert.ok(html.includes(asset));assert.ok(sw.includes(asset));
  }
  assert.ok(sw.includes('isabella-shell-v137'));
});

test('90.8.4: acknowledgement does not append another assistant placeholder',()=>{
  const start=app.indexOf('if(result?.durable){');
  const stop=app.indexOf('if(durableRequestId){delete userTurn.metadata',start);
  const slice=app.slice(start,stop);
  assert.ok(slice.includes("state.messages.find(m=>m.role==='assistant'"));
  assert.ok(slice.includes('if(!existing){'));
  assert.ok(slice.includes('durable_request_id:result.durable_request_id'));
});