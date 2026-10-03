import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

function loadHumanSurface(){
  const context={window:{}};
  vm.runInNewContext(read('shared/human-surface.js'),context,{filename:'human-surface.js'});
  return context.window.MINDS_HUMAN_SURFACE;
}

test('Build 72 exposes a small human-state contract instead of a second ontology',()=>{
  const hs=loadHumanSurface();
  assert.deepEqual(Object.keys(hs).sort(),['autonomy','commitment','metaLabels','mission','systemSummary','workspace'].sort());
  const working=hs.mission({status:'running'});
  assert.equal(working.headline,'Estoy trabajando en esto.');
  assert.equal(working.owner,'isabella');
  assert.equal(working.action,'none');
  assert.equal(working.certainty,'known');
  const waiting=hs.mission({status:'waiting_for_user',blocker_question:'¿A o B?'});
  assert.equal(waiting.headline,'Necesito que decidas algo antes de poder seguir.');
  assert.equal(waiting.owner,'you');
  assert.equal(waiting.action,'decide');
  assert.equal(waiting.detail,'¿A o B?');
});

test('Build 72 distinguishes done, uncertain and blocked states without pretending emotions',()=>{
  const hs=loadHumanSurface();
  assert.equal(hs.mission({status:'completed',result_summary:'Listo.'}).headline,'He terminado este trabajo.');
  assert.equal(hs.mission({status:'failed'}).headline,'No pude terminar este trabajo.');
  assert.equal(hs.commitment('unknown').certainty,'uncertain');
  const source=read('shared/human-surface.js');
  for(const phrase of ['siento que','me siento','estoy feliz','estoy triste'])assert.ok(!source.toLowerCase().includes(phrase));
});

test('Build 72 makes contextual autonomy understandable while preserving user authority',()=>{
  const hs=loadHumanSurface();
  const eligible=hs.autonomy({eligibility:'eligible'});
  assert.ok(eligible.headline.includes('si tú quieres'));
  assert.equal(eligible.owner,'you');
  assert.equal(eligible.action,'review');
  assert.ok(hs.autonomy({eligibility:'needs_review'}).headline.includes('conviene que te pregunte'));
  assert.ok(hs.autonomy({eligibility:'insufficient_evidence'}).detail.includes('seguiré pidiendo confirmación'));
});

test('Build 72 uses human state first and technical detail on demand in Isabella UI',()=>{
  const app=read('apps/isabella/app.js');
  const index=read('apps/isabella/index.html');
  const css=read('apps/isabella/app.css');
  assert.ok(index.includes('../shared/human-surface.js?v=1'));
  assert.ok(app.includes('function humanStateHTML'));
  assert.ok(app.includes('Ver detalle técnico'));
  assert.ok(app.includes("modal('Trabajo de Isabella'"));
  assert.ok(app.includes('Lo que sé hasta ahora'));
  assert.ok(app.includes('Dónde sigo aprendiendo cómo prefieres trabajar'));
  assert.ok(app.includes('Ver estado técnico de MINDS'));
  assert.ok(css.includes('.human-state'));
  assert.ok(css.includes('.human-tech'));
});

test('Build 72 keeps technical truth inspectable instead of deleting internal state',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes('Mission Workspace'));
  assert.ok(app.includes('Mission Run'));
  assert.ok(app.includes('Checkpoint'));
  assert.ok(app.includes('contextual_permission'));
  assert.ok(app.includes("card('Attention Economy'"));
  assert.ok(app.includes("card('Shadow Agency'"));
});

test('Build 72 teaches Isabella to translate internal ontology in conversation',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('HUMAN SURFACE:'));
  assert.ok(chat.includes('qué está pasando, quién tiene que actuar ahora'));
  assert.ok(chat.includes('No expongas espontáneamente nombres como Commitment, Mission Workspace, Mission Run'));
  assert.ok(chat.includes('No finjas emociones, conciencia ni necesidades humanas'));
  assert.ok(chat.includes('La abstracción nunca puede ocultar un fallo, una incertidumbre o una acción pendiente'));
});

test('Build 72 humanizes proactive durable-work messages and briefings',()=>{
  const mission=read('supabase/functions/isabella-mission-runner/index.ts');
  const routine=read('supabase/functions/isabella-routine-runner/index.ts');
  const push=read('supabase/functions/_shared/webpush.ts');
  assert.ok(mission.includes('Trabajo terminado:'));
  assert.ok(mission.includes('Necesito que decidas algo antes de poder seguir'));
  assert.ok(mission.includes('El progreso sigue guardado y no he hecho ningún cambio externo.'));
  assert.ok(!mission.includes('El progreso anterior sigue guardado en su Mission Workspace'));
  assert.ok(routine.includes('COSAS QUE DECIDISTE NO INTERRUMPIR ANTES:'));
  assert.ok(routine.includes('Tampoco expongas términos internos de MINDS'));
  assert.ok(push.includes('quotedSubject(title,"Trabajo terminado:")'));
  assert.ok(push.includes('quotedSubject(title,"No pude terminar:")'));
});

test('Build 72 does not create a new top-level product surface',()=>{
  const shell=read('apps/isabella/shell.js');
  assert.ok(shell.includes('Build 2026.10.03.74'));
  assert.ok(!shell.includes('data-nav="human"'));
  assert.ok(!shell.includes('data-nav="state"'));
  assert.ok(!shell.includes('Human Surface'));
});
