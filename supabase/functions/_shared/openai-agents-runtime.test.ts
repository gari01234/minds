import {createOpenAIAgentsShadowAdapter} from "./openai-agents-runtime.ts";

function assert(condition:unknown,message="assertion_failed"):asserts condition{
  if(!condition)throw new Error(message);
}
function equal(actual:unknown,expected:unknown,message="not_equal"){
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(message+": "+JSON.stringify(actual)+" !== "+JSON.stringify(expected));
}
function jsonResponse(value:unknown,status=200){
  return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
}

Deno.test("72.5B OpenAI Agents adapter starts only shadow sessions with no tools or environment",async()=>{
  let createBody:any=null,turnCalls=0;
  const fetchImpl=async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/v1/agents/sessions")&&init?.method==="POST"){
      createBody=JSON.parse(String(init.body||"{}"));
      return jsonResponse({id:"sess_test",status:"in_progress",usage:{}},201);
    }
    if(url.includes("/sessions/sess_test/turns")){
      turnCalls++;
      return jsonResponse({data:[{id:"turn_test",status:"in_progress",usage:{input_tokens:10,output_tokens:2,total_tokens:12}}]});
    }
    throw new Error("unexpected_fetch:"+url);
  };
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const primary=await adapter.start({mode:"primary",run:{},snapshot:{mission_run_id:"r",workspace_id:"w"}});
  assert(!primary.ok&&primary.error==="openai_agents:primary_not_enabled","primary must stay disabled");

  const started=await adapter.start({
    mode:"shadow",
    run:{id:"r"},
    snapshot:{
      mission_run_id:"r",workspace_id:"w",instruction:"Advance",objective:"Test objective",
      recent_items:[{kind:"finding",content:"Known input",source_kind:"user",provenance_class:"agent"}]
    }
  });
  assert(started.ok,"shadow start should succeed");
  equal(started.value.lifecycle,"running");
  equal(started.value.provider_session_id,"sess_test");
  equal(turnCalls,1);
  equal(createBody.environment,{type:"none"});
  equal(createBody.agent.multi_agent,{enabled:false});
  assert(!("tools" in createBody.agent),"72.5B must expose no tools");
  equal(createBody.agent.text.format.type,"json_schema");
  equal(createBody.agent.text.format.strict,true);
  equal(createBody.metadata.minds_mode,"shadow");
  const snapshot=JSON.parse(createBody.input);
  equal(snapshot.version,"mission_snapshot_v1");
  equal(snapshot.recent_items[0].provenance_class,"user");
});

Deno.test("72.5B inspect collects only a completed final_answer structured result",async()=>{
  let turnCalls=0;
  const result={
    status:"waiting_for_user",
    summary:"A decision is required.",
    blocker_question:"Choose A or B?",
    items:[{
      kind:"decision",content:"Option A is preferable under the stated deadline.",
      source_kind:"system",provenance_class:"inferred",source_ref:null
    }],
    sources:[]
  };
  const fetchImpl=async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/v1/agents/sessions")&&init?.method==="POST")
      return jsonResponse({id:"sess_done",status:"in_progress",usage:{}},201);
    if(url.endsWith("/sessions/sess_done"))return jsonResponse({id:"sess_done",status:"idle",usage:{total_tokens:42}});
    if(url.includes("/sessions/sess_done/turns")){
      turnCalls++;
      const status=turnCalls===1?"in_progress":"completed";
      return jsonResponse({data:[{id:"turn_done",status,usage:{input_tokens:30,output_tokens:12,total_tokens:42}}]});
    }
    if(url.includes("/sessions/sess_done/items")){
      return jsonResponse({data:[
        {id:"u",type:"message",role:"user",phase:"commentary",status:"completed",content:[{type:"input_text",text:"input"}]},
        {id:"a",type:"message",role:"assistant",phase:"final_answer",status:"completed",content:[{type:"output_text",text:JSON.stringify(result)}]}
      ]});
    }
    throw new Error("unexpected_fetch:"+url);
  };
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const started=await adapter.start({mode:"shadow",run:{},snapshot:{mission_run_id:"r",workspace_id:"w",objective:"Test"}});
  assert(started.ok&&started.value.lifecycle==="running","start should be async");
  const inspected=await adapter.inspect(started.value);
  assert(inspected.ok,"inspect should succeed");
  equal(inspected.value.lifecycle,"succeeded");
  equal(inspected.value.provider_turn_id,"turn_done");
  equal(inspected.value.result?.status,"waiting_for_user");
  equal(inspected.value.result?.blocker_question,"Choose A or B?");
  equal(inspected.value.usage.total_tokens,42);
  const collected=await adapter.collect(inspected.value);
  assert(collected.ok,"completed result should collect");
  equal(collected.value,result);
});

Deno.test("72.5B fails closed on malformed structured agent output",async()=>{
  let turnCalls=0;
  const fetchImpl=async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/v1/agents/sessions")&&init?.method==="POST")
      return jsonResponse({id:"sess_bad",status:"in_progress"},201);
    if(url.endsWith("/sessions/sess_bad"))return jsonResponse({id:"sess_bad",status:"idle"});
    if(url.includes("/sessions/sess_bad/turns")){
      turnCalls++;
      return jsonResponse({data:[{id:"turn_bad",status:turnCalls===1?"in_progress":"completed"}]});
    }
    if(url.includes("/sessions/sess_bad/items")){
      return jsonResponse({data:[{type:"message",role:"assistant",phase:"final_answer",content:[{type:"output_text",text:"not-json"}]}]});
    }
    throw new Error("unexpected_fetch:"+url);
  };
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const started=await adapter.start({mode:"shadow",run:{},snapshot:{mission_run_id:"r",workspace_id:"w"}});
  assert(started.ok,"start should succeed");
  const inspected=await adapter.inspect(started.value);
  assert(!inspected.ok,"malformed output must not become a result");
  equal(inspected.error,"openai_agents_invalid_structured_output");
});

Deno.test("72.5B exposes provider durability without enabling later capabilities early",()=>{
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl:async()=>jsonResponse({})});
  equal(adapter.capabilities.persistent_session,true);
  equal(adapter.capabilities.inspect,true);
  equal(adapter.capabilities.steer,false);
  equal(adapter.capabilities.interrupt,false);
  equal(adapter.capabilities.multi_agent,false);
  equal(adapter.capabilities.computer_use,false);
  equal(adapter.capabilities.mcp,false);
});
