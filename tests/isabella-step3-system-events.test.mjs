// Phase 1, step 3 (Gari, 08.11.2026): fixed app texts stop speaking as Isabella. They render as
// system lines, Isabella's model receives them as "sistema" (same history size, same budget), and
// the nightly dream never reads them as her words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SYSTEM_NOTICE_PATTERNS,isSystemNotice,isSystemAuthored} from '../supabase/functions/_shared/system-notice.mjs';
import {boundedScopedTurn,historyRole} from '../supabase/functions/_shared/turn-capability-contract.mjs';
import {calendarProposalReply} from '../supabase/functions/_shared/calendar-temporal-fastpath.mjs';
import {collectTranscript} from '../supabase/functions/_shared/isabella-dream.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('apps/isabella/app.js');

function browserIntegrity(){
  const root={};vm.runInNewContext(read('apps/isabella/turn-integrity.js'),{window:root,globalThis:root,Date,Intl});
  return root.MINDS_TURN_INTEGRITY;
}

test('Browser and server recognise exactly the same fixed texts',()=>{
  const client=browserIntegrity();
  assert.deepEqual(Array.from(client.SYSTEM_NOTICE_PATTERNS,String),SYSTEM_NOTICE_PATTERNS.map(String));
});

test('Every receipt and review text the app writes is recognised as a system notice',()=>{
  const {summary}=browserIntegrity();
  const p={kind:'task',action:'create',title:'Angebot ELT',date:'2026-11-09',request_id:'r'};
  const texts=[
    summary({ok:false}),summary({ok:true,outcome:'action_applied',applied_count:1}),
    summary({ok:true,outcome:'action_applied',applied_count:3}),
    summary({ok:true,outcome:'proposal_created',proposals:[p]}),
    summary({ok:true,outcome:'proposal_created',proposals:[{...p,kind:'event'}]}),
    summary({ok:true,outcome:'proposal_created',proposals:[{...p,action:'update'}]}),
    summary({ok:true,outcome:'proposal_created',proposals:[p,p]}),
    calendarProposalReply(p),calendarProposalReply({...p,action:'update'}),
    'Agregado.','Actualizado.','Eliminado.','Archivada.','Marcada como completada.','Sin cambios.','Guardado.',
    '«Treppen» queda para el martes.','«Jour fixe» está en tu calendario mañana.','Actualizado: «Treppen».',
    '7 tareas añadidas para hoy: A y B.','2 eventos añadidos: A (hoy) y B (mañana).',
    // Legacy wording still in the history.
    'Listo. Ya quedó agregado.','¿Añado «X» para mañana? Confírmalo y la guardo.','Isabella sigue trabajando…'];
  for(const t of texts)assert.equal(isSystemNotice(t),true,t);
  for(const t of ['Propuesta: algo'])assert.equal(isSystemNotice(t),true);
  assert.doesNotMatch(summary({ok:true,outcome:'proposal_created',proposals:[p]}),/Confírmalo|guardo|¿Añado/);
});

test('Isabella\'s own replies are never relabelled',()=>{
  for(const t of ['Y tú, ¿dormiste algo?','Mañana tienes la obra a las 9. ¿Quieres que lo preparemos hoy?',
    'Te entiendo. Fue un día largo.','Propongo que lo hablemos mañana con calma.'])
    assert.equal(isSystemNotice(t),false,t);
  assert.equal(isSystemNotice('Listo para hablar de eficiencia… '.repeat(20)),false,'long replies are hers');
  assert.equal(isSystemAuthored({role:'user',content:'Agregado.'}),false,'Gari\'s words are never system');
  assert.equal(isSystemAuthored({role:'assistant',content:'Hola',metadata:{author:'system'}}),true);
});

test('Model history: app lines become "sistema", same count and size, Isabella stays assistant',()=>{
  const msgs=[
    {role:'user',content:'Añade Angebot para mañana',created_at:'2026-11-08T10:00:00Z'},
    {role:'assistant',content:'Propuesta: añadir «Angebot» para mañana · pendiente de tu confirmación.',metadata:{author:'system'},created_at:'2026-11-08T10:00:05Z'},
    {role:'assistant',content:'Listo. Ya quedó agregado.',metadata:{},created_at:'2026-11-08T10:00:09Z'},
    {role:'assistant',content:'Ojalá te dé tiempo. ¿Cómo vas con lo de Bernried?',metadata:{},created_at:'2026-11-08T10:00:20Z'}];
  const out=boundedScopedTurn(msgs,'Bien');
  const items=JSON.parse(out.split('\n')[1]);
  assert.deepEqual(items.map(x=>x.role),['user','sistema','sistema','assistant']);
  assert.equal(items.length,msgs.length);
  assert.equal(historyRole(msgs[3]),'assistant');
  const before=JSON.stringify(msgs.map(m=>({role:m.role,content:m.content,at:m.created_at}))).length;
  const after=JSON.stringify(items).length;
  assert.ok(after<=before+12,'no extra tokens: only the role label changes');
  const index=read('supabase/functions/isabella-chat/index.ts');
  assert.match(index,/historyRole\(x\)==="sistema"\?"sistema":"assistant"/,'fast agenda history uses the same labels');
});

test('The dream never reads app lines as Isabella\'s words, marked or legacy',async()=>{
  const rows=[
    {id:'a',role:'user',content:'¿Y tú nunca duermes?',created_at:'2026-11-03T21:06:00Z',metadata:{}},
    {id:'b',role:'assistant',content:'Un poco, cuando tú duermes.',created_at:'2026-11-03T21:06:10Z',metadata:{}},
    {id:'c',role:'assistant',content:'No se pudo verificar el resultado; no se confirmó ningún cambio.',created_at:'2026-11-03T21:07:00Z',metadata:{author:'system'}},
    {id:'d',role:'assistant',content:'Agregado.',created_at:'2026-11-03T21:08:00Z',metadata:{}}];
  let selected='';
  const chain=(data)=>{const q=new Proxy({},{get(_,k){if(k==='then')return (ok)=>ok({data,error:null});
    if(k==='select')return (cols)=>{selected+=cols+'|';return q};return ()=>q}});return q};
  const sb={from:t=>t==='conversations'?chain([{id:'c1'}]):t==='conversation_messages'?chain(rows):chain([])};
  const t=await collectTranscript(sb,'u','2026-11-01T00:00:00Z');
  assert.deepEqual(t.messages.map(m=>m.autor+': '+m.texto),['Gari: ¿Y tú nunca duermes?','Isabella: Un poco, cuando tú duermes.']);
  assert.match(selected,/content,created_at,metadata/);
});

test('App: receipts go through sayEvent, verified summaries are marked, events render muted',()=>{
  assert.match(app,/function sayEvent\(text,meta=\{\}\)\{\n  return say\('assistant',text,\{\.\.\.meta,metadata:\{.*author:'system'\}\}\);/);
  for(const legacy of ["say('assistant','Listo","say('assistant',`Listo","say('assistant',confirmationText(","say('assistant','No pude","say('assistant','De acuerdo"])
    assert.ok(!app.includes(legacy),legacy);
  assert.match(app,/const receiptText=window\.MINDS_TURN_INTEGRITY\.summary\(integrity\);/);
  assert.match(app,/const authorMeta=receiptText\?\{author:'system'\}:\{\};/);
  assert.match(app,/metadata:\{\.\.\.authorMeta,exposure_scope:exposure,incomplete_response/);
  // A recovered model reply that replaces an error line is Isabella's again.
  assert.match(app,/assistant\.metadata=\{\.\.\.assistant\.metadata,author:null,/);
  assert.match(app,/answer\.metadata=\{\.\.\.\(answer\.metadata\|\|\{\}\),\.\.\.desiredMeta,author:null\}/);
  // Model replies and questions stay Isabella's.
  assert.match(app,/say\('assistant',result\.question,/);
  assert.match(app,/class="message \$\{m\.role\}\$\{event\?' is-event':''\}"/);
  assert.match(app,/m\.role==='assistant'&&!event\?`<div class="message-actions">/);
  assert.match(app,/m\.metadata\?\.author\|\|'',m\.replyTo/,'render key reacts to authorship');
  const css=read('apps/isabella/app.css');
  assert.match(css,/\.message\.assistant\.is-event\{[^}]*background:transparent!important/);
});

test('Rendered: a system line has no reactions and keeps the review button',()=>{
  const {isSystemNotice:clientNotice}=browserIntegrity();
  const begin=app.indexOf('function isEventMessage(m){'),end=app.indexOf('function replySnippet(');
  const ctx={window:{MINDS_TURN_INTEGRITY:{isSystemNotice:clientNotice}}};
  vm.runInNewContext(app.slice(begin,end),ctx);
  assert.equal(ctx.isEventMessage({role:'assistant',text:'Agregado.'}),true);
  assert.equal(ctx.isEventMessage({role:'assistant',text:'¿Cómo dormiste?'}),false);
  assert.equal(ctx.isEventMessage({role:'assistant',text:'¿Cómo dormiste?',metadata:{author:'system'}}),true);
  assert.equal(ctx.replyAuthor({role:'assistant',text:'Agregado.'}),'Aviso');
  assert.equal(ctx.replyAuthor({role:'assistant',text:'¿Cómo dormiste?'}),'Isabella');
});
