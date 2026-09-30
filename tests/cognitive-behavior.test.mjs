import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plain=p=>stripTypeScriptTypes(read(p).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,''));
function chain(result){const q={then:(a,b)=>Promise.resolve(result).then(a,b)};for(const k of ['select','eq','in','is','not','order','limit','maybeSingle','single','gt','gte','lte','lt','contains','or','update','insert','upsert'])q[k]=()=>q;return q;}
function edge(slug){
  const c=vm.createContext({Request,Response,URL,URLSearchParams,Date,console,TextEncoder,TextDecoder,Uint8Array,Map,Set,crypto:webcrypto,Deno:{env:{get:()=>undefined},serve:fn=>{c.handler=fn}},fetch:()=>{throw Error('Unexpected network')},createClient:()=>{throw Error('Unexpected database')}});
  vm.runInContext(plain('supabase/functions/_shared/cognitive.ts'),c);
  vm.runInContext(plain('supabase/functions/_shared/conversations.ts'),c);
  vm.runInContext(plain(`supabase/functions/${slug}/index.ts`),c);return c;
}
function proposalUI(){
  let nodes={},writes=0;const views=[];
  const c=vm.createContext({crypto:webcrypto,console,Date,Intl,Map,Set,window:{},state:{categories:[],projects:[],tasks:[],events:[]},$:s=>nodes[s],$$:()=>[],esc:s=>String(s??''),today:()=> '2026-09-29',cat:()=>'',project:()=>'',findTarget:()=>null,
    modal:(title,html)=>{views.push({title,html});nodes={};for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes['#'+id]={value:'',onclick:null,isConnected:true,disabled:false};},closeModal:()=>{},say:()=>{},save:()=>{},proposalFeedback:()=>{},applyProposal:()=>{writes++}});
  const s=read('apps/isabella/app.js');vm.runInContext(s.slice(s.indexOf('function proposalLabel('),s.indexOf('function findTarget(')),c);
  return {c,views,node:id=>nodes['#'+id],writes:()=>writes};
}
for(const [proposal,field] of [
  [{kind:'standing_intent',trigger_text:'Dachentwässerung',reminder_text:'Revisar acuerdo'},'standingTrigger'],
  [{kind:'commitment',title:'Continuidad',objective:'Mantener vivo este tema',scope:'global'},'commitmentObjective'],
  [{kind:'work_claim',project:'Bernried',statement:'Una afirmación de prueba'},'claimStatement'],
  [{kind:'skill_proposal',name:'Protocolo',instructions:'Verificar las fuentes'},'skillInstructions']]){
  test(`approval edit cancel and confirm work for ${proposal.kind}`,async()=>{
    const u=proposalUI();assert.equal(typeof u.c.proposalLabel(proposal),'string');assert.equal(u.views.length,0);
    u.c.confirmProposal(proposal);assert.equal(u.writes(),0);u.node('proposalEdit').onclick();assert.ok(u.node(field));
    u.node(field).value='corregido';u.node('proposalEditSave').onclick();assert.equal(u.views.at(-1).title,'Confirmar');assert.equal(u.writes(),0);
    u.node('proposalCancel').onclick();assert.equal(u.writes(),0);
    u.c.confirmProposal(proposal);const button=u.node('proposalConfirm');button.onclick();button.onclick();await Promise.resolve();assert.equal(u.writes(),1);
  });
}
test('invalid evidence cannot produce a success message',async()=>{
  const replies=[];let closed=false;
  const c=vm.createContext({crypto:webcrypto,window:{MINDS_SUPABASE:{rpc:async(name,params)=>{assert.equal(name,'minds_save_work_claim');assert.equal(params.p_confirmed,true);return {error:{message:'source inaccessible'}}}}},dbWorkProjectByName:async()=>({id:'project',name:'Bernried'}),$:()=>({}),say:(r,m)=>replies.push(m),closeModal:()=>{closed=true}});
  const s=read('apps/isabella/app.js');vm.runInContext(s.slice(s.indexOf('async function createWorkClaimProposal('),s.indexOf('async function createSkillProposal(')),c);
  await c.createWorkClaimProposal({project:'Bernried',statement:'Example',source_file_id:'bad'});assert.equal(closed,false);assert.match(replies[0],/No se guardó/);
});
test('router recognizes inflections, project followups, and leaves a greeting light',()=>{
  const c=edge('isabella-chat');const r=c.deterministicRoute('¿Recuerdas lo que acordamos sobre Bernried?',false);assert.equal(r.deep_memory,true);assert.equal(r.project,'Bernried');
  const f=c.deterministicRoute('Continúa con ese proyecto',false,{recent_local_conversation:[{role:'user',content:'Revisemos Bernried'}]});assert.equal(f.project,'Bernried');
  assert.equal(c.cognitiveBudget('Hola',[],false).depth,'light');assert.equal(c.cognitiveBudget('Analiza el proyecto'.repeat(70),[],false).compact,180000);
  assert.equal(c.userMessage('VOZ DE ISABELLA:\ntexto de estilo\nMENSAJE DE GARI:\nHola'),'Hola');
  assert.equal(c.workMatch({statement:'Revisar Dachentwässerung'},['puedes','dachentwässerung','bernried']),true);
  assert.equal(c.policyMode('propose_project_claim'),'confirm');assert.equal(c.policyMode('propose_skill'),'confirm');assert.equal(c.policyMode('propose_commitment'),'confirm');assert.equal(c.policyMode('search_commitments'),'allow');assert.equal(c.policyMode('unknown'),'deny');
  const cp=c.proposalFromTool('propose_commitment',{title:'Continuidad',objective:'No perder X',scope:'global',source_flush_id:'flush',source_open_loop:'Open X'});assert.equal(cp.kind,'commitment');assert.equal(cp.source_kind,'checkpoint');
  assert.ok(c.commitmentScore({title:'Bernried coordinación',objective:'Mantener decisiones vivas',status:'active',isabella_projects:{name:'Bernried'}},['decisiones'],'Bernried')>=7);
  const cv=c.commitmentView({id:'c',title:'Continuidad',objective:'Mantener X',scope:'global',status:'active',updated_at:'2026-09-30T00:00:00Z',metadata:{last_continuity:{signal_title:'Cambio X'}}});assert.equal(cv.last_continuity.signal_title,'Cambio X');
});
test('memory checkpoint covers every selected message and fails without advancing',async()=>{
  const c=edge('isabella-chat');let request,commit;
  const rows=Array.from({length:100},(_,i)=>({id:'message-'+i,role:i%2?'assistant':'user',content:'MESSAGE-'+i,created_at:'2026-09-29T00:00:00Z'}));
  c.fetch=async(url,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({output_text:'{"summary":"Explicit test data","open_loops":[]}'})}};
  const sb={from:t=>chain({data:t==='conversation_messages'?rows:null}),rpc:async(name,args)=>{commit=args;return {error:{message:'write rejected'}}}};
  const result=await c.memoryCheckpoint(sb,'fake','isabella','conv',async()=>{});
  assert.equal(result.status,'error');assert.equal(commit.p_message_ids.length,100);assert.ok(request.input[0].content.includes('[message-0]'));assert.ok(request.input[0].content.includes('[message-99]'));
  const big=[{content:'x'.repeat(110000),id:'first'},{content:'later',id:'second'}];const b=c.checkpointBatch(big);assert.equal(b.length,1);assert.equal(b[0].content.length,110000);
});
test('Sofia bridge retains original input, reasoning and call outputs in round two',async()=>{
  const c=edge('sofia-chat');c.Deno.env.get=n=>n==='OPENAI_API_KEY'?'fake':undefined;
  c.startRun=async()=>({id:'run'});c.finishRun=async()=>{};c.snapshot=async()=>({});c.skillCatalog=async()=>[];c.recordUsage=async()=>{};c.theorySearch=async()=>({documents:[]});
  const requests=[];c.fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>requests.length===1?{output:[{type:'reasoning',id:'r1',summary:[]},{type:'function_call',call_id:'c1',name:'search_theory_memory',arguments:'{"query":"Pawson"}'}]}:{output_text:'Evidence-based answer'}}};
  const r=await c.handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({message:'Pawson',background:true})}));assert.equal(r.status,200);assert.equal(requests.length,2);
  assert.equal(requests[1].input[0].content[0].text,'Pawson');assert.ok(requests[1].input.some(x=>x.type==='reasoning'));assert.ok(requests[1].input.some(x=>x.type==='function_call'));assert.equal(requests[1].input.at(-1).call_id,'c1');
});
test('transient context is not persisted in user messages; cleanup retains user content',()=>{
  const c=edge('isabella-chat');const user='Una idea con <etiquetas>';const raw=user+'\n\n<CONTEXTO_PRIVADO>\n{"old":"context"}\n</CONTEXTO_PRIVADO>';
  assert.equal(c.removeInjectedContext(raw),user);assert.equal(c.removeInjectedContext(user),user);assert.equal(c.removeInjectedContext(user+'\n\n<CONTEXTO_PRIVADO>\nno-json\n</CONTEXTO_PRIVADO>'),user+'\n\n<CONTEXTO_PRIVADO>\nno-json\n</CONTEXTO_PRIVADO>');
  assert.match(c.transientInstructions('system',{today:1}),/CONTEXTO TEMPORAL/);
});
test('Doctor distinguishes query failure, idle specialist and stalled runs',()=>{
  const s=read('apps/isabella/app.js'),c=vm.createContext({Date});vm.runInContext(s.slice(s.indexOf('function doctorCards('),s.indexOf('async function doctorPanel(')),c);
  const q=Object.fromEntries(['runsQ','routinesQ','heartQ','flushQ','skillsQ','claimsQ','filesQ','embedQ','usageQ'].map(k=>[k,{data:[]}]));q.routinesQ.error={message:'RLS unavailable'};
  q.runsQ.data=[{feature:'isabella_chat',status:'running',started_at:new Date(Date.now()-20*60000).toISOString()}];const cards=c.doctorCards(q);
  assert.equal(cards.find(x=>x[0]==='Rutinas')[1],'error');assert.equal(cards.find(x=>x[0]==='Isabella Chat')[1],'error');assert.equal(cards.find(x=>x[0]==='Sofía')[1],'idle');
});
test('standing intents honor zero cooldown, expiry, project and count',async()=>{
  const c=edge('isabella-chat');let rows=[];c.supabaseClient=()=>({from:()=>chain({data:rows})});
  const b={id:'i',trigger_text:'Dachentwässerung',reminder_text:'Review',trigger_terms:['dachentwässerung'],trigger_count:0,max_triggers:3,cooldown_minutes:0,last_trigger_at:new Date().toISOString()};
  rows=[b];assert.equal((await c.standingIntentMatches(new Request('https://test.invalid'),'Dachentwässerung','Bernried')).length,1);
  for(const patch of [{trigger_count:3},{expires_at:'2000-01-01'},{isabella_projects:{name:'Schwarz'}}]){rows=[{...b,...patch}];assert.equal((await c.standingIntentMatches(new Request('https://test.invalid'),'Dachentwässerung','Bernried')).length,0);}
});
test('heartbeat publication uses the atomic RPC and propagates errors',async()=>{
  const c=edge('isabella-heartbeat');let got;
  const sb={rpc:async(name,args)=>{got={name,args};return {error:{message:'write failed'}}}};
  await assert.rejects(c.publishCandidate(sb,'user',{surface:true,fingerprint:'same'}),/write failed/);assert.equal(got.name,'minds_publish_heartbeat');
});
