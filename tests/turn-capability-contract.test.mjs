import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {interactiveTurnContract,boundedScopedTurn,turnOutcomeReceipt,scopedHistoryReady}
  from "../supabase/functions/_shared/turn-capability-contract.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const client=read("apps/isabella/ai.js");
const server=read("supabase/functions/isabella-chat/index.ts");
const ui=read("apps/isabella/app.js");
const scenarios=[
 "Por favor corrígelo",
 "Por favor corrige la tarea que te dije que pusiera para mañana y la pusiste para el domingo",
 "No me has enviado nada a confirmar!",
 "Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz",
 "¿Puedes mover mi tarea al martes?",
 "Haz lo que te pedí antes",
 "Cámbiale la fecha",
 "Necesito que me ayudes con la reunión de Bernried",
 "Cómo va el proyecto",
 "¿Qué hora es?"
];
test("same capability contract for EVERY conversational formulation, without lexical exceptions",()=>{
 for(const message of scenarios){
   assert.ok(message.length>3);
   const choice=interactiveTurnContract({surface:"chat_browser",background:false,
     attachments:0,workThread:false});
   assert.equal(choice.lane,"tool_capable",message);
   assert.equal(choice.tools,"governed",message);
   assert.equal(choice.provider_history,"bounded_scoped",message);
 }
});
test("attachments and project threads do not silently downgrade to text-only",()=>{
 assert.equal(interactiveTurnContract({}).lane,"tool_capable"); // cached mobile client
 assert.equal(interactiveTurnContract({surface:"chat_browser",attachments:2}).lane,"tool_capable");
 const t=interactiveTurnContract({surface:"chat_browser",workThread:true});
 assert.equal(t.lane,"tool_capable");
 assert.equal(t.provider_history,"scoped_work_thread");
});
test("background and presence behavior retains existing delivery contracts",()=>{
 assert.equal(interactiveTurnContract({surface:"presence"}).lane,"legacy_nonbrowser");
 assert.equal(interactiveTurnContract({surface:"background",background:true}).lane,"legacy_background");
});
test("scoped evidence is bounded and excludes unrelated fake role values",()=>{
 const messages=Array.from({length:90},(_,i)=>({
   role:i%3===0?"system":i%2?"assistant":"user",
   content:"history"+i+":"+"x".repeat(15000),created_at:"2026-10-12T19:00:00Z"
 }));
 const context=boundedScopedTurn(messages,"Corrige la tarea Besprechungsnotiz");
 assert.ok(context.length<16000,context.length);
 assert.match(context,/MENSAJE ACTUAL/);
 assert.ok(context.includes("Besprechungsnotiz"));
 assert.ok(!context.includes("history0"));
 assert.ok(!context.includes("history75")); // not a privileged role
});
test("a text response is not an action receipt, regardless of its wording",()=>{
 assert.deepEqual(turnOutcomeReceipt({proposals:[]}),{
   outcome:"answered",proposal_count:0,applied_count:0
 });
 const p={action:"update",kind:"task",request_id:"req-sample",
   title:"Besprechungsnotiz",date:"2026-10-13"};
 assert.equal(turnOutcomeReceipt({proposals:[p]}).outcome,"proposal_created");
 assert.equal(turnOutcomeReceipt({proposals:[{...p,request_id:null}]}).outcome,"answered");
 assert.equal(turnOutcomeReceipt({applied:[{receipt_id:"applied"}]}).outcome,"action_applied");
});
test("browser preserves capability payload across normal, project, attachment and background turns",async()=>{
 for(const options of [{},{workThread:{id:'project-thread'}},{attachments:[{name:'synthetic.txt',type:'text/plain'}]},{background:true}]){
  const calls=[];
  const w={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async(endpoint,input)=>{calls.push({endpoint,input});return {data:{reply:'Answer'}}}}}};
  vm.runInNewContext(client,{window:w,navigator:{language:'es'},setTimeout,clearTimeout,console},{timeout:1000});
  const result=await w.ISABELLA_AI.ask('Explain the current context',{}, {...options,durableRequestId:'request-id'});
  assert.equal(result.reply,'Answer');assert.equal(calls.length,1);
  assert.equal(calls[0].endpoint,'isabella-chat');
  const body=calls[0].input.body;
  assert.equal(body.surface,options.background?'background':'chat_browser');
  assert.equal(body.client_message_id,'request-id');
  assert.equal(body.work_thread_id,options.workThread?.id||null);
  assert.equal(body.attachments.length,options.attachments?.length||0);
  assert.equal(body.stream,undefined);assert.equal(body.durable,undefined);
 }
});
test("server rejects BOTH text-only transports before any route or model call",()=>{
 const gate=server.indexOf('turnContract.lane==="tool_capable"');
 const routing=server.indexOf('const route=await routeRequest(',gate);
 assert.ok(gate>0&&routing>gate);
 assert.match(server.slice(gate,routing),/body\?\.durable===true\|\|body\?\.stream===true/);
 assert.match(server.slice(gate,routing),/turn_requires_capability_runtime/);
 assert.match(server,/if\(!background&&!boundedGlobalChat\)/);
 assert.match(server,/boundedScopedTurn\(recent,turnText\)/);
 assert.match(server,/!fastAgenda&&!boundedGlobalChat&&conversationInfo\.id/);
});
test("typed proposal counts use canonical registered proposals and UI still renders them",()=>{
 assert.match(server,/const outcomeReceipt=turnOutcomeReceipt\(\{proposals:toolProposals\}\)/);
 assert.match(server,/outcome:outcomeReceipt/);
 assert.match(server,/proposal:toolProposals\.length===1\?toolProposals\[0\]:null/);
 assert.match(ui,/MINDS_TURN_INTEGRITY\?\.validate\(result\)/);
 assert.match(ui,/if\(integrity\.proposals\.length\)/);
 assert.match(ui,/confirmProposals\(integrity\.proposals\)/);
 assert.match(ui,/proposalFeedback\('accepted',p\)/);
});

test("source-first conversation boundary: do not drop history when scoped messages are absent",()=>{
 const now="2026-10-12T21:50:00Z";
 assert.equal(scopedHistoryReady([],{now}),false); // real legacy-only history
 assert.equal(scopedHistoryReady([{role:"user",content:"corrige",created_at:now}],{now}),false);
 const rows=Array.from({length:6},(_,i)=>({
   role:i%2?"assistant":"user",content:"Turn "+i,
   created_at:"2026-10-12T21:"+(40+i)+":00Z"
 }));
 assert.equal(scopedHistoryReady(rows,{now}),true);
 assert.equal(scopedHistoryReady(rows,{now:"2026-10-13T09:00:00Z"}),false);
 assert.match(server,/const scopedWindowReady=scopedHistoryReady\(recent\)/);
 assert.doesNotMatch(server,/provider_legacy_continuity/);
 assert.match(server,/if\(!background&&!boundedGlobalChat\)/);
});
