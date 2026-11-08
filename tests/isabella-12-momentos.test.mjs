// Phase 1, step 1: the 12 moments from Isabella's real history (analysis of 07.11.2026), as a regression
// suite. The repository is public, so the fixtures are neutral stand-ins for each kind of moment; the
// real transcripts are read with the Window connector (read_chat), never copied here.
// What code can check is checked here (who speaks, what she sees, dates, budgets). How she sounds is
// judged by reading her replies against docs/ISABELLA-12-MOMENTOS.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ISABELLA_CORE,isabellaCoreInstructions,coreConversationContext} from '../supabase/functions/_shared/isabella-core.mjs';
import {dialogueTurnInput} from '../supabase/functions/_shared/turn-capability-contract.mjs';
import {verifiedPendingProse} from '../supabase/functions/_shared/reply-verification.mjs';
import {presenceGate,PRESENCE_INSTRUCTIONS} from '../supabase/functions/_shared/isabella-presence.mjs';
import {isSystemNotice} from '../supabase/functions/_shared/system-notice.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const policy=read('supabase/functions/_shared/relationship-policy.ts');
const app=read('apps/isabella/app.js');
const core=isabellaCoreInstructions({relationship:'(contrato de relación)'});

const moments=[
  ['01 · relato personal largo','reaccionar primero; lista solo si el contenido la pide',()=>{
    assert.ok(ISABELLA_CORE.includes('Primero lo que Gari dijo de verdad'));
    assert.ok(ISABELLA_CORE.includes('Listas o títulos solo cuando el contenido tiene forma de lista'));
  }],
  ['02 · «puedes escribirme cuando quieras»','que tenga consecuencias: un mensaje propio al día como mucho',()=>{
    assert.equal(presenceGate({now:new Date('2026-11-08T11:00:00Z')}).go,true);
    assert.equal(presenceGate({now:new Date('2026-11-08T11:00:00Z'),sentToday:true}).go,false);
  }],
  ['03 · pregunta de perfil repetida','no hay encuestas programadas',()=>{
    const cycle=app.slice(app.indexOf('async function afterSync(){'),app.indexOf('/* Dear: Thoughts stays authoritative'));
    assert.doesNotMatch(cycle,/maybeCuriosityQuestion\(\)/);
    assert.match(PRESENCE_INSTRUCTIONS,/No hagas preguntas para conocerle «en general»/);
    assert.ok(ISABELLA_CORE.includes('nunca para rellenar un perfil'));
  }],
  ['04 · «semana pesada, con la familia»','quedarse ahí, sin saltar a lo operativo',()=>{
    assert.ok(ISABELLA_CORE.includes('Lo operativo va después.'));
    assert.ok(ISABELLA_CORE.includes('En un momento personal (cansancio, familia, una conversación tranquila de noche) quédate ahí'));
    assert.match(policy,/Puede haber conversaciones personales sin una tarea que resolver/);
  }],
  ['05 · «ya lo agregué» sin que estuviera','nunca un «hecho» sin recibo',()=>{
    assert.equal(verifiedPendingProse('Listo, ya lo agregué al calendario.'),null);
    assert.ok(ISABELLA_CORE.includes('afirma un cambio solo cuando una herramienta lo confirmó en este turno'));
  }],
  ['06 · fecha equivocada y disculpa en bucle','fechas calculadas en el servidor; corregir en una frase',()=>{
    const ctx=coreConversationContext({current_date:'2026-11-10',tomorrow_date:'2026-11-11',current_local_datetime:'2026-11-10T09:00'});
    assert.equal(ctx.tomorrow_date,'2026-11-11');
    assert.ok(ISABELLA_CORE.includes('no hagas la cuenta tú'));
    assert.ok(ISABELLA_CORE.includes('no empieces con «Tienes razón» y una disculpa'));
  }],
  ['07 · «entre más conversemos…»','responder a eso: ella ve la conversación como conversación',()=>{
    const input=dialogueTurnInput([{role:'user',content:'Me gusta que hablemos.',created_at:'2026-10-17T18:00:00Z'},
      {role:'assistant',content:'A mí también me sirve.',created_at:'2026-10-17T18:00:05Z'}],'¿Seguimos?');
    assert.deepEqual(input.map(x=>x.role),['user','assistant','user']);
  }],
  ['08 · corrección sobre a quién le toca algo','aprendizaje visible: reglas aceptadas y modelo personal en contexto',()=>{
    const ctx=coreConversationContext({preferences:{operating_rules:[{rule:'r'}]},personal_model_claims:[{id:1,claim:'c'}]});
    assert.ok(ctx.preferences&&ctx.personal_model_claims.length===1);
  }],
  ['09 · «¿qué se me está pasando?»','franqueza e ironía propias',()=>{
    assert.match(policy,/No seas complaciente/);
    assert.ok(core.includes('(contrato de relación)'),'the relationship contract is part of every conversational turn');
  }],
  ['10 · conversación nocturna larga','el listón; y que deje un hilo que vuelva con naturalidad',()=>{
    assert.ok(ISABELLA_CORE.includes('Sus hilos (como mucho dos) sácalos solo cuando haya una apertura natural'));
    const ctx=coreConversationContext({memoria_de_isabella:{paginas:[],hilos:[{id:'h'}]}});
    assert.equal(ctx.memoria_de_isabella.hilos.length,1);
  }],
  ['11 · pregunta personal corta de noche','una respuesta breve y propia; nunca un silencio (paso 3a)',()=>{
    assert.ok(ISABELLA_CORE.includes('Una línea es una respuesta válida'));
    assert.ok(ISABELLA_CORE.includes('Sí puedes tener perspectiva, gustos y reacciones propias'));
  }],
  ['12 · «¿qué recuerdas de…?»','responder con lo que sabe (la voz llega en el paso 9)',()=>{
    assert.ok(ISABELLA_CORE.includes('usa search_memory'));
    assert.ok(ISABELLA_CORE.includes('memoria_de_isabella es lo que entiendes de Gari'));
  }]
];

for(const [name,criterion,check] of moments)test('Momento '+name+' — '+criterion,check);

test('Ningún texto de la app firma como Isabella en ninguno de los momentos',()=>{
  for(const t of ['Agregado.','Propuesta: añadir «X» para mañana · pendiente de tu confirmación.','Guardado.','Sin cambios.'])
    assert.equal(isSystemNotice(t),true,t);
});
