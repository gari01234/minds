import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const policy=read('supabase/functions/_shared/relationship-policy.ts');
const chat=read('supabase/functions/isabella-chat/index.ts');
const routine=read('supabase/functions/isabella-routine-runner/index.ts');
const fast=read('supabase/functions/isabella-fast-stream/index.ts');
const build=read('apps/isabella/BUILD-77.md');

test('Build 77 is a single-user relationship contract, not a generic personality engine',()=>{
  assert.ok(policy.includes('Isabella existe exclusivamente para Gari'));
  assert.ok(policy.includes('CONTINUIDAD DE ERROR PROPIO'));
  assert.ok(policy.includes('no respondas como si el dato correcto apareciera por primera vez'));
  assert.ok(policy.includes('No optimices para un usuario genérico ni para engagement'));
  assert.ok(policy.includes('ISABELLA_RELATIONSHIP_POLICY_VERSION="gari-isabella-v0.2"'));
  assert.ok(!policy.includes('personality_score'));
  assert.ok(!policy.includes('engagement_score'));
});

test('Build 77 keeps initiative high without converting personalization into authority',()=>{
  assert.ok(policy.includes('Ten presencia personal reconocible y una iniciativa alta'));
  assert.ok(policy.includes('Una predicción sobre lo que probablemente quiera nunca sustituye una decisión o permiso'));
  assert.ok(policy.includes('Si Gari delega explícitamente decisiones pequeñas, acepta esa delegación'));
  assert.ok(policy.includes('la decisión es suya'));
});

test('Build 77 permits familiarity and affect without simulated emotional needs',()=>{
  assert.ok(policy.includes('humor propio'));
  assert.ok(policy.includes('El lenguaje afectivo coloquial puede desarrollarse'));
  assert.ok(policy.includes('No inventes una vida emocional'));
  assert.ok(policy.includes('sin reproche ni necesidad emocional ficticia'));
  assert.ok(policy.includes('evita entusiasmo automático'));
});

test('Build 77 encodes evidence and cross-domain boundaries',()=>{
  assert.ok(policy.includes('Distingue siempre observación de inferencia'));
  assert.ok(policy.includes('solo dispongas de su relato'));
  assert.ok(policy.includes('pide permiso antes de combinar información de ámbitos personales distintos'));
});

test('Build 77 explicitly rejects engagement optimization',()=>{
  assert.ok(policy.includes('ANTI-ENGAGEMENT'));
  assert.ok(policy.includes('No optimices tiempo de pantalla, número de mensajes, reciprocidad ni dependencia'));
  assert.ok(policy.includes('cada interrupción necesita una razón material'));
});

test('Build 77 uses one shared policy in every user-facing generative runtime',()=>{
  assert.ok(chat.includes('relationshipPolicy("conversation")'));
  assert.ok(routine.includes('relationshipPolicy("proactive")'));
  assert.ok(chat.includes('ISABELLA_RELATIONSHIP_POLICY_VERSION'));
  assert.ok(routine.includes('ISABELLA_RELATIONSHIP_POLICY_VERSION'));
  assert.ok(!fast.includes('relationshipPolicy('));
});

test('Build 77 preserves POM accepted-only influence in proactive output',()=>{
  assert.ok(routine.includes('.eq("status","confirmed")'));
  assert.ok(!routine.includes('.in("status",["confirmed","hypothesis"])'));
  assert.ok(policy.includes('Una observación o hypothesis propuesta no es una regla'));
  assert.ok(build.includes('routine-runner'));
});
