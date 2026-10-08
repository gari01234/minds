import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const task={title:'Comprar papel',category:'Casa'};
function fastRuntime({execution={status:'confirm'},error=null,recordError=null}={}){
  const calls=[];
  const chain={then:resolve=>Promise.resolve({data:{id:'run'}}).then(resolve)};
  for(const key of ['insert','update','select','eq','single'])chain[key]=()=>chain;
  const user={auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:execution,error}}};
  const service={from:()=>chain,rpc:async(name,args)=>{calls.push({name,args});return {error:recordError}}};
  const openAI=[{type:'response.output_item.done',item:{type:'function_call',name:'create_task',arguments:JSON.stringify(task)}},{type:'response.completed',response:{usage:{},output:[],status:'completed'}}];
  const c=vm.createContext({console,Request,Response,URL,ReadableStream,TextEncoder,TextDecoder,Date,Intl,crypto:webcrypto,
    Deno:{env:{get:n=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',OPENAI_API_KEY:'test'})[n]},serve:fn=>{c.handler=fn}},
    createClient:(_url,key)=>key==='service'?service:user,
    fetch:async()=>new Response(openAI.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''))});
  vm.runInContext(stripTypeScriptTypes(read('supabase/functions/isabella-fast-stream/index.ts').replace(/^import .*;\r?\n/gm,'')),c);
  return {c,calls,run:async(protocol='contextual_v1',clientRequestId=null)=>{
    const response=await c.handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({message:'Agrega Comprar papel en Casa',context:{},permission_protocol:protocol,client_request_id:clientRequestId})}));
    return (await response.text()).split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
  }};
}
test('Build 70 attestation requires literal user category and task, excludes active Work',()=>{
  const {c}=fastRuntime();const p=c.proposalFromCall('create_task',task);
  assert.equal(c.contextualFastContext('Agrega Comprar papel en Casa',p,{}).direct_request,true);
  for(const [message,proposal,ctx] of [
    ['Agrega Comprar papel',p,{}],['Agrega Comprar papel en casamiento',p,{}],
    ['Agrega eso en Casa',p,{}],['Agrega Comprar papel en Casa',p,{work_context:{active:true}}],
    ['Agrega Comprar papel en Casa',{...p,project:'Bernried'},{}],
    ['Agrega Comprar papel en Casa',{...p,title:'Cambiar un proyecto'},{}]
  ])assert.equal(c.contextualFastContext(message,proposal,ctx).direct_request,false);
});
test('Build 70 legacy clients always retain proposals, even with a granted permission',async()=>{
  const f=fastRuntime({execution:{status:'executed',receipt:{id:'receipt'}}});const events=await f.run('legacy');
  assert.equal(events.find(e=>e.type==='result').proposal.kind,'task');
  assert.equal(f.calls.some(c=>c.name==='minds_try_contextual_task'),false);
  assert.equal(f.calls[0].args.p_context.direct_request,false);
});
test('Build 70 records evidence first and a confirm result cannot execute or claim success',async()=>{
  const f=fastRuntime();const events=await f.run();
  assert.deepEqual(f.calls.map(x=>x.name),['minds_record_shadow_decision','minds_try_contextual_task']);
  const r=events.find(e=>e.type==='result');assert.equal(r.proposal.kind,'task');assert.equal(r.autonomy_execution,undefined);assert.match(r.reply,/para que lo revises/);
});
test('Build 70 only a database execution receipt removes the review proposal',async()=>{
  const f=fastRuntime({execution:{status:'executed',receipt:{id:'receipt',permission_id:'permission'}}});const events=await f.run();
  const r=events.find(e=>e.type==='result');assert.equal(r.proposal,null);assert.equal(r.autonomy_execution.id,'receipt');assert.match(r.reply,/permiso que autorizaste/);
});
test('Build 70 recorder and permission errors fail closed without a fallback or proposal',async()=>{
  for(const opts of [{recordError:{message:'unavailable'}},{error:{message:'connection lost'}},{execution:{status:'unknown'}}]){
    const f=fastRuntime(opts);const events=await f.run();
    assert.ok(events.some(e=>e.type==='error'));
    assert.equal(events.some(e=>['result','fallback'].includes(e.type)),false);
    if(opts.recordError)assert.equal(f.calls.length,1);
  }
});
test('Build 83 a lost fast response retries once idempotently and never falls through to full Isabella',async()=>{
  let requests=0,pulls=0,invokes=0,ids=[];
  const c=vm.createContext({console,Date,Intl,TextDecoder,URL,crypto:webcrypto,navigator:{language:'es'},window:{MINDS_SUPABASE_CONFIG:{url:'https://test.invalid',publishableKey:'public'},
    MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},functions:{invoke:()=>{invokes++;throw Error('Must not retry through full Isabella')}}},
    ISABELLA_SYNC_PULL_NOW:async()=>{pulls++}},fetch:async(_url,opts)=>{requests++;ids.push(JSON.parse(opts.body).client_request_id);throw Error('lost response')}});
  vm.runInContext(read('apps/isabella/ai.js'),c);
  await assert.rejects(c.window.ISABELLA_AI.ask('Agrega Comprar papel en Casa',{categories:[],projects:[],tasks:[],events:[],messages:[]}),/Perdí la conexión/);
  assert.equal(requests,2);assert.equal(new Set(ids).size,1);assert.equal(invokes,0);assert.equal(pulls,2);
});
test('Build 83 incomplete SSE retries once, while a verified gate refusal can still fall back',async()=>{
  const source=read('apps/isabella/ai.js');
  {
    let requests=0,pulls=0;
    const c=vm.createContext({Response,TextDecoder,crypto:webcrypto,sb:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},
      window:{MINDS_SUPABASE_CONFIG:{url:'https://test.invalid',publishableKey:'public'},ISABELLA_SYNC_PULL_NOW:async()=>{pulls++}},compact:()=>({}),
      fetch:async()=>{requests++;return new Response('event: status\ndata: {"type":"status"}\n\n')}});
    vm.runInContext(source.slice(source.indexOf('function parseFastSse'),source.indexOf('async function askDirectStream')),c);
    await assert.rejects(c.askFastStream('x',{}),/Perdí la conexión/);
    assert.equal(requests,2);assert.equal(pulls,1);
  }
  {
    let requests=0;
    const c=vm.createContext({Response,TextDecoder,crypto:webcrypto,sb:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},
      window:{MINDS_SUPABASE_CONFIG:{url:'https://test.invalid',publishableKey:'public'}},compact:()=>({}),
      fetch:async()=>{requests++;return new Response('',{status:409})}});
    vm.runInContext(source.slice(source.indexOf('function parseFastSse'),source.indexOf('async function askDirectStream')),c);
    assert.equal(await c.askFastStream('x',{}),null);assert.equal(requests,1);
  }
});

test('Build 83 fast server reuses the client request id for idempotent retries',async()=>{
  const requestId='123e4567-e89b-42d3-a456-426614174000';
  const f=fastRuntime();await f.run('contextual_v1',requestId);
  const record=f.calls.find(x=>x.name==='minds_record_shadow_decision');
  assert.equal(record.args.p_request_id,requestId);
});

test('Build 70 permission UI writes only after explicit review and renders sparse evidence honestly',async()=>{
  let nodes={},writes=0,html='';
  const c=vm.createContext({crypto:webcrypto,Date,console,Object,Number,window:{MINDS_SUPABASE:{rpc:async()=>{writes++;return {}}}},esc:s=>String(s??''),$:id=>nodes[id],
    modal:(_title,body)=>{html=body;nodes={};for(const [,id] of body.matchAll(/id="([^"]+)"/g))nodes['#'+id]={disabled:false,isConnected:true}},$$:()=>[]});
  vm.runInContext(read('shared/human-surface.js'),c);
  c.humanSurface=()=>c.window.MINDS_HUMAN_SURFACE;
  c.humanStateHTML=(value,technical='')=>'<b>'+value.headline+'</b><p>'+value.detail+'</p>'+technical;
  const s=read('apps/isabella/app.js');vm.runInContext(s.slice(s.indexOf('function autonomyContextLabel('),s.indexOf('function attentionRouteOptions(')),c);
  c.contextualAutonomyPanel=async()=>{};
  const unit={action:'create_task',context_key:'fast_task_undated_v1',scope_key:'category:test:project:none',scope_label:'Casa · sin proyecto',eligibility:'insufficient_evidence',accepted_unchanged:2,edited:0,rejected:0,review_days:1,evidence_version:'fresh'};
  assert.match(c.autonomyEvidenceHTML(unit),/Todavía estoy aprendiendo cómo prefieres resolver este caso/);
  c.reviewContextualPermission({...unit,eligibility:'eligible'},null,'allow');assert.equal(writes,0);assert.match(html,/Autorizar durante 30 días/);
  assert.match(html,/id="permissionCancel"/);assert.equal(writes,0);
  c.reviewContextualPermission(unit,{revision:1},'confirm');assert.match(html,/Revocar permiso/);
  const b=nodes['#permissionConfirm'];const pending=b.onclick();b.onclick();await pending;assert.equal(writes,1);
});
