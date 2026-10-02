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

Deno.test("72.5B starts a durable shadow session with no tools, environment or multi-agent",async()=>{
  let createBody:any=null;
  const fetchImpl=async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/v1/agents/sessions")&&init?.method==="POST"){
      createBody=JSON.parse(String(init.body||"{}"));
      return jsonResponse({id:"sess_test",status:"in_progress",usage:{}},201);
    }
    if(url.includes("/sessions/sess_test/turns")){
      return jsonResponse({data:[{id:"turn_test",status:"in_progress",usage:{input_tokens:10,output_tokens:2,total_tokens:12}}]});
    }
    throw new Error("unexpected_fetch:"+url);
  };
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const primary=await adapter.start({mode:"primary",run:{},snapshot:{mission_run_id:"r",workspace_id:"w"}});
  assert(!primary.ok&&primary.error==="openai_agents:primary_not_enabled","primary must stay disabled");

  const started=await adapter.start({
    mode:"shadow",run:{id:"r"},
    snapshot:{
      mission_run_id:"r",workspace_id:"w",objective:"Test objective",
      recent_items:[{kind:"finding",content:"Known input",source_kind:"user",provenance_class:"agent"}]
    }
  });
  assert(started.ok,"shadow start should succeed");
  equal(started.value.lifecycle,"running");
  equal(started.value.provider_session_id,"sess_test");
  equal(createBody.environment,{type:"none"});
  equal(createBody.agent.multi_agent,{enabled:false});
  assert(!("tools" in createBody.agent),"72.5B must expose no tools");
  assert(!("text" in createBody.agent),"Managed Agents output stays provider-native");
  equal(createBody.metadata.minds_mode,"shadow");
});

Deno.test("72.5B normalizes a completed Agents final answer through strict Responses",async()=>{
  let turnCalls=0;
  let normalizerBody:any=null;
  const fetchImpl=async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith("/v1/agents/sessions")&&init?.method==="POST")
      return jsonResponse({id:"sess_done",status:"in_progress",usage:{}},201);
    if(url.endsWith("/sessions/sess_done"))return jsonResponse({id:"sess_done",status:"idle",usage:{}});
    if(url.includes("/sessions/sess_done/turns")){
      turnCalls++;
      return jsonResponse({data:[{id:"turn_done",status:turnCalls===1?"in_progress":"completed",usage:{input_tokens:30,output_tokens:12,total_tokens:42}}]});
    }
    if(url.includes("/sessions/sess_done/items")){
      return jsonResponse({data:[{
        id:"a",type:"message",role:"assistant",phase:"final_answer",status:"completed",
        content:[{type:"output_text",text:"Option A fits the deadline; B does not. No user decision is needed."}]
      }]});
    }
    if(url.endsWith("/v1/responses")&&init?.method==="POST"){
      normalizerBody=JSON.parse(String(init.body||"{}"));
      return jsonResponse({
        output_text:JSON.stringify({
          status:"completed",
          summary:"Option A fits the deadline; B does not.",
          blocker_question:null,
          items:[{kind:"decision",content:"Proposed outcome: Option A.",source_kind:"system",provenance_class:"agent",source_ref:null}],
          sources:[]
        }),
        usage:{input_tokens:50,output_tokens:20,total_tokens:70}
      });
    }
    throw new Error("unexpected_fetch:"+url);
  };

  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const snapshot={mission_run_id:"r",workspace_id:"w",objective:"Choose a feasible option"};
  const started=await adapter.start({mode:"shadow",run:{},snapshot});
  assert(started.ok&&started.value.lifecycle==="running","start should be async");

  started.value.metadata={...started.value.metadata,snapshot_for_normalizer:snapshot};
  const inspected=await adapter.inspect(started.value);
  assert(inspected.ok,"inspect should succeed");
  equal(inspected.value.lifecycle,"succeeded");
  equal(inspected.value.result?.status,"completed");
  equal(inspected.value.result?.summary,"Option A fits the deadline; B does not.");
  equal((inspected.value.usage as any).agent.total_tokens,42);
  equal((inspected.value.usage as any).normalizer.total_tokens,70);
  equal(normalizerBody.text.format.type,"json_schema");
  equal(normalizerBody.text.format.name,"mission_shadow_result");
  equal(normalizerBody.text.format.strict,true);
  assert(JSON.stringify(normalizerBody.input).includes("Option A fits the deadline"));
});

Deno.test("72.5B fails closed when the strict normalizer does not return valid JSON",async()=>{
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
      return jsonResponse({data:[{type:"message",role:"assistant",phase:"final_answer",content:[{type:"output_text",text:"analysis"}]}]});
    }
    if(url.endsWith("/v1/responses"))return jsonResponse({output_text:"not-json"});
    throw new Error("unexpected_fetch:"+url);
  };
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl});
  const snapshot={mission_run_id:"r",workspace_id:"w"};
  const started=await adapter.start({mode:"shadow",run:{},snapshot});
  assert(started.ok,"start should succeed");
  started.value.metadata={...started.value.metadata,snapshot_for_normalizer:snapshot};
  const inspected=await adapter.inspect(started.value);
  assert(!inspected.ok,"malformed normalized output must not become a result");
  equal(inspected.error,"openai_agents_normalizer_invalid_output");
});

Deno.test("72.5B exposes durability without enabling later capabilities early",()=>{
  const adapter=createOpenAIAgentsShadowAdapter({apiKey:"test-key",fetchImpl:async()=>jsonResponse({})});
  equal(adapter.capabilities.persistent_session,true);
  equal(adapter.capabilities.inspect,true);
  equal(adapter.capabilities.steer,false);
  equal(adapter.capabilities.interrupt,false);
  equal(adapter.capabilities.multi_agent,false);
  equal(adapter.capabilities.computer_use,false);
  equal(adapter.capabilities.mcp,false);
});
