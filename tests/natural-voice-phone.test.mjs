// Isabella's voice (one natural confirmation, no internal systems, human dates), phone polish, Fristen in Tiempo.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nearDuplicate} from '../supabase/functions/_shared/akte-pflege.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('apps/isabella/app.js'),css=read('apps/isabella/minds-calendar-shell.css'),chat=read('supabase/functions/isabella-chat/index.ts');
const helpers=vm.runInNewContext(app.slice(app.indexOf('function naturalDay('),app.indexOf('function renderMessages('))+';({naturalDay,confirmationText})',{Date,Math,Number,String,Set,Array});
const NOW=new Date(2026,10,1,14,0);// Sunday 1 Nov 2026

test('Confirmations read like a person: one sentence, natural dates, no internal systems',()=>{
  const {naturalDay,confirmationText}=helpers;
  assert.equal(naturalDay('2026-11-01',NOW),'hoy');assert.equal(naturalDay('2026-11-02',NOW),'mañana');
  assert.equal(naturalDay('2026-11-05',NOW),'el jueves');assert.equal(naturalDay('2026-11-13',NOW),'el viernes 13 de noviembre');
  const seven=['Lavar chupones','Ventilar','Sacar basura','Anuncio Ezi','Lavar ropa','Baños','Quitar decoración de Halloween'].map(title=>({kind:'task',action:'create',title,date:'2026-11-01'}));
  assert.equal(confirmationText(seven,NOW),'Listo, añadí 7 tareas para hoy: Lavar chupones, Ventilar, Sacar basura, Anuncio Ezi, Lavar ropa, Baños y Quitar decoración de Halloween.');
  assert.equal(confirmationText([{kind:'task',action:'update',title:'Treppen',date:'2026-11-03'}],NOW),'Listo, «Treppen» queda para el martes.');
  assert.equal(confirmationText([{kind:'event',action:'create',title:'Jour fixe',date:'2026-11-02'}],NOW),'Listo, «Jour fixe» está en tu calendario mañana.');
  assert.match(confirmationText([{kind:'task',title:'A',date:'2026-11-01'},{kind:'task',title:'B',date:'2026-11-02'}],NOW),/^Listo, añadí 2 tareas: A \(hoy\) y B \(mañana\)\.$/);
  // No user-facing "Supabase" in chat confirmations or task saving.
  for(const s of ['Confirmé en Supabase','verificado en Supabase','Guardando en Supabase','verificada en Supabase','He guardado y verificado'])assert.ok(!app.includes(s),s);
  assert.ok(!read('apps/isabella/turn-integrity.js').includes('recibo de ejecución'));
  // Inline and batch reviews confirm once (the proposal message itself), not once per task.
  assert.match(app,/applyProposal\(p,\{quiet:true\}\)\)\.then/);
  assert.match(app,/if\(appliedTasks\.length&&!marked\)say\('assistant',confirmationText\(appliedTasks\)\)/);
});

test('Isabella\'s prompt sets a natural voice',()=>{
  assert.match(chat,/VOZ \(cómo suenas\):/);
  assert.match(chat,/no nombres sistemas internos \(Supabase/);
  assert.match(chat,/Nunca AAAA-MM-DD/);
  assert.match(chat,/fastCalendarInstructions=`Eres Isabella[^`]*UNA frase natural/);
});

test('Phone: no iOS zoom on focus, floating ••• in chat, round task checkboxes',()=>{
  assert.match(css,/@media \(hover:none\) and \(pointer:coarse\)\{\s*input:not\(\[type="checkbox"\]\)[^}]*textarea,select\{font-size:16px!important\}/);
  assert.match(css,/body\[data-section="assistant"\]:not\(\.desk-enabled\) \.app \.topbar \.top-actions\{\s*position:fixed/);
  assert.match(css,/backdrop-filter:blur\(16px\)/);
  assert.match(css,/body \.app \.agenda-item \.task-check\{width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important\}/);
});

test('Confirmed Fristen from the Akte appear read-only in Tiempo and open the project',()=>{
  assert.match(app,/from\('minds_work_memory'\)\.select\('id,project_id,title,occurred_at,isabella_projects\(name,client_key\)'\)\s*\.eq\('memory_type','deadline'\)\.eq\('status','confirmed'\)/);
  assert.match(app,/for\(const f of fristen\)h\+=fristAgendaRow\(f\);/);
  assert.match(app,/akteFristenOn\(x\.di\)\.map\(fristChip\)/);
  assert.match(app,/window\.MINDS_WORK\?\.open\?\.\(b\.dataset\.fristProject,'overview'\)/);
  assert.match(read('apps/isabella/work.js'),/window\.MINDS_WORK=\{render,open:/);
  assert.match(read('apps/isabella/work.js'),/label:'Próximo plazo'/);
});

test('Akte-Pflege skips proposals that restate an existing entry',()=>{
  assert.equal(nearDuplicate('Rückmeldungen und Angebote der Hersteller auswerten','Angebote und Rückmeldungen der Hersteller auswerten, Ausstellungsleuchten festlegen'),true);
  assert.equal(nearDuplicate('Lichtplan mit Elektroplanung abstimmen','Bei ERCO die Lichtströme anfragen'),false);
});
