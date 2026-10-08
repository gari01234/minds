import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plain=p=>stripTypeScriptTypes(read(p).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,''));

function chatRuntime(){
  const c=vm.createContext({
    Request,Response,URL,URLSearchParams,Date,Intl,console,TextEncoder,TextDecoder,Uint8Array,Map,Set,
    crypto:webcrypto,
    Deno:{env:{get:()=>undefined},serve:fn=>{c.handler=fn}},
    fetch:()=>{throw new Error('Unexpected network')},
    createClient:()=>{throw new Error('Unexpected database')}
  });
  vm.runInContext(plain('supabase/functions/_shared/cognitive.ts'),c);
  vm.runInContext(plain('supabase/functions/_shared/conversations.ts'),c);
  vm.runInContext(plain('supabase/functions/isabella-chat/index.ts'),c);
  return c;
}

test('Build 85.5 Bernried can leave working context without contaminating an unrelated personal turn and later resume',async()=>{
  const c=chatRuntime();
  c.resolveWorkProject=async(_req,value)=>String(value)==='Bernried'
    ?{id:'11111111-1111-4111-8111-111111111111',name:'Bernried',client_key:'bernried'}
    :null;

  const bernried=await c.exposureScopeForTurn({}, {project:'Bernried',source:'acceptance'}, null);
  assert.equal(bernried.kind,'project');
  assert.equal(bernried.key,'project:11111111-1111-4111-8111-111111111111');

  const personal=await c.exposureScopeForTurn({}, {project:null,source:'acceptance'}, null);
  assert.equal(personal.kind,'global');
  assert.equal(personal.key,'global');
  assert.notEqual(personal.key,bernried.key);

  const route=c.deterministicRoute('Continúa con ese proyecto',false,{exposure_hint_project:'Bernried'});
  assert.equal(route.project,'Bernried');
  const resumed=await c.exposureScopeForTurn({},route,null);
  assert.equal(resumed.key,bernried.key);
});

test('Build 85.5 explicit memory questions may cross scope, while ordinary project mentions may not',()=>{
  const c=chatRuntime();
  assert.equal(c.explicitMemoryCrossScope('¿Qué hablamos de Bernried la vez pasada?'),true);
  assert.equal(c.explicitMemoryCrossScope('Quiero revisar Bernried ahora.'),false);
  assert.equal(c.explicitMemoryCrossScope('Prepara una tarea para Bernried.'),false);
});

test('Build 85.5 recalled context cannot be re-extracted as a new autobiographical memory without current-user evidence',()=>{
  const c=chatRuntime();
  const recalled=c.currentUserEvidenceGate(
    'remember_information',
    {user_excerpt:'Trabajo en Titus Bernhard Architekten'},
    '¿Qué te conté antes sobre mi trabajo?',
    false,false
  );
  assert.equal(recalled.allowed,false);
  assert.equal(recalled.reason,'excerpt_not_found_in_current_user_message');

  const newFact=c.currentUserEvidenceGate(
    'remember_information',
    {user_excerpt:'Trabajo en Titus Bernhard Architekten'},
    'Trabajo en Titus Bernhard Architekten desde hace un tiempo.',
    false,false
  );
  assert.equal(newFact.allowed,true);
});

test('Build 85.5 web/tool taint and background sessions cannot manufacture personal facts',()=>{
  const c=chatRuntime();
  const args={user_excerpt:'Trabajo en Titus Bernhard Architekten'};
  assert.equal(c.currentUserEvidenceGate(
    'record_personal_model_claim',args,'Trabajo en Titus Bernhard Architekten.',false,true
  ).reason,'source_tainted_turn_cannot_write_autobiographical_memory');
  assert.equal(c.currentUserEvidenceGate(
    'record_personal_model_claim',args,'Trabajo en Titus Bernhard Architekten.',true,false
  ).reason,'background_session_cannot_write_autobiographical_memory');
});

test('Build 85.5 forgetting invalidates descendants and recall caches while keeping audit rows',()=>{
  const sql=read('supabase/migrations/20261008174000_memory_lineage_forgetting_v01.sql');
  assert.ok(sql.includes('with recursive affected(kind,id) as'));
  assert.ok(sql.includes('minds_memory_forget_tombstones'));
  assert.ok(sql.includes("set status='archived'"));
  assert.ok(sql.includes("set status='stale'"));
  assert.ok(sql.includes('delete from public.isabella_embeddings'));
  assert.ok(sql.includes('minds_forget_conversation'));
  assert.ok(!/delete\s+from\s+public\.isabella_memories\b/i.test(sql));
  assert.ok(!/delete\s+from\s+public\.isabella_model_claims\b/i.test(sql));
  assert.ok(!/delete\s+from\s+public\.minds_memory_lineage\b/i.test(sql));
});

test('Build 85.5 OpenAI working continuity is keyed by exposure scope instead of one latent global history',()=>{
  const conversations=read('supabase/functions/_shared/conversations.ts');
  assert.ok(conversations.includes('openai_scope_conversations'));
  assert.ok(conversations.includes('states[scopeKey]'));
  assert.ok(conversations.includes('exposure_scope_key:scopeKey'));
  assert.ok(conversations.includes("context_policy:'scoped_exposure_v1'"));
});
