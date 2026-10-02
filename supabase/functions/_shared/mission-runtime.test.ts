import {
  createMissionRuntimeRegistry,
  createNativeMindsRuntimeAdapter,
  normalizeMissionRuntimeResult,
  normalizeMissionRuntimeSnapshot
} from "./mission-runtime.ts";

function assert(condition:unknown,message="assertion_failed"):asserts condition{
  if(!condition)throw new Error(message);
}
function equal(actual:unknown,expected:unknown,message="not_equal"){
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(message+": "+JSON.stringify(actual)+" !== "+JSON.stringify(expected));
}

Deno.test("72.5A snapshot is bounded, minimal and credential-free",()=>{
  const snapshot=normalizeMissionRuntimeSnapshot({
    mission_run_id:"run-1",workspace_id:"workspace-1",instruction:"Advance",
    objective:"Resolve the issue",completion_criterion:"Evidence assembled",
    iteration:2,max_iterations:6,latest_user_input:"Use option B",
    recent_items:[
      {kind:"decision",content:"Use option B",source_kind:"user",provenance_class:"agent"},
      {kind:"finding",content:"Drawing says X",source_kind:"document",provenance_class:"agent"},
      {kind:"source",content:"External reference",source_kind:"web",provenance_class:"agent",source_ref:"https://example.com"}
    ],
    project_context:{project:{name:"Test"}}
  });
  equal(snapshot.version,"mission_snapshot_v1");
  equal(snapshot.recent_items[0].provenance_class,"user");
  equal(snapshot.recent_items[1].provenance_class,"project_source");
  equal(snapshot.recent_items[2].provenance_class,"external");
  assert(!("user_id" in snapshot),"snapshot must not carry user identity");
  let rejected=false;
  try{
    normalizeMissionRuntimeSnapshot({
      mission_run_id:"run-1",workspace_id:"workspace-1",
      project_context:{nested:{service_role_key:"must-not-cross-boundary"}}
    });
  }catch(error){
    rejected=String(error).includes("mission_runtime_credentials_forbidden");
  }
  assert(rejected,"credential-shaped keys must be rejected");
});

Deno.test("72.5A result keeps Mission Workspace vocabulary and bounds",()=>{
  const result=normalizeMissionRuntimeResult({
    status:"waiting_for_user",
    summary:"Need one decision",
    blocker_question:"A or B?",
    items:[
      {kind:"decision",content:"Choose A",source_kind:"system",provenance_class:"agent"},
      {kind:"finding",content:"Web evidence",source_kind:"web",provenance_class:"agent"}
    ],
    sources:[{title:"Example",url:"https://example.com"},{title:"Bad",url:"javascript:alert(1)"}]
  });
  equal(result.status,"waiting_for_user");
  equal(result.blocker_question,"A or B?");
  equal(result.items[0].kind,"decision");
  equal(result.items[1].provenance_class,"external");
  equal(result.sources.length,1);
  const completed=normalizeMissionRuntimeResult({status:"completed",blocker_question:"should disappear"});
  equal(completed.blocker_question,null);
});

Deno.test("72.5A native adapter is a compatibility backend, not a new authority",async()=>{
  let calls=0;
  const adapter=createNativeMindsRuntimeAdapter({
    async execute_checkpoint({snapshot}){
      calls++;
      return {
        status:"continue",
        summary:"Checkpoint complete",
        items:[{kind:"note",content:snapshot.objective,source_kind:"system",provenance_class:"agent"}]
      };
    }
  });
  equal(adapter.provider,"native_minds");
  equal(adapter.capabilities.persistent_session,false);
  equal(adapter.capabilities.steer,false);
  const started=await adapter.start({
    mode:"primary",run:{id:"run-1"},
    snapshot:{mission_run_id:"run-1",workspace_id:"workspace-1",objective:"Objective"}
  });
  assert(started.ok,"native start should execute one checkpoint");
  equal(calls,1);
  equal(started.value.lifecycle,"succeeded");
  equal(started.value.provider_session_id,null);
  const collected=await adapter.collect(started.value);
  assert(collected.ok,"completed native checkpoint should be collectable");
  equal(collected.value.status,"continue");
  const inspect=await adapter.inspect(started.value);
  assert(!inspect.ok&&inspect.error.endsWith("inspect_unsupported"),"native provider must not pretend durable inspect support");
});

Deno.test("72.5A registry requires native fallback and rejects duplicate providers",()=>{
  const native=createNativeMindsRuntimeAdapter({execute_checkpoint:async()=>({status:"continue"})});
  const registry=createMissionRuntimeRegistry([native]);
  equal(registry.providers(),["native_minds"]);
  equal(registry.get("native_minds").provider,"native_minds");

  let missing=false;
  try{createMissionRuntimeRegistry([])}catch(error){missing=String(error).includes("native_minds_runtime_required")}
  assert(missing,"registry must retain native fallback");

  let duplicate=false;
  try{createMissionRuntimeRegistry([native,native])}catch(error){duplicate=String(error).includes("duplicate_mission_runtime_provider")}
  assert(duplicate,"duplicate runtime providers must be rejected");
});
