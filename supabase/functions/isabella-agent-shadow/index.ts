import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {
  normalizeMissionRuntimeResult,
  normalizeMissionRuntimeSnapshot,
  type MissionRuntimeExecution,
  type MissionRuntimeResult
} from "../_shared/mission-runtime.ts";
import {
  createOpenAIAgentsShadowAdapter,
  MISSION_SHADOW_SCHEMA
} from "../_shared/openai-agents-runtime.ts";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
function responseText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  const out:string[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message"||item?.phase&&item.phase!=="final_answer")continue;
    for(const part of item?.content||[]){
      if(part?.type==="output_text"&&typeof part?.text==="string")out.push(part.text);
      else if(typeof part?.text==="string")out.push(part.text);
    }
  }
  return out.join("").trim();
}
function parseJSON(text:string){
  try{return JSON.parse(String(text||"").trim())}catch{throw new Error("native_shadow_invalid_structured_output")}
}
async function sha256(value:unknown){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function loadSnapshot(sb:any,runId:string){
  const {data:run,error:rErr}=await sb.from("minds_mission_runs")
    .select("id,user_id,workspace_id,instruction,status,phase,iteration,max_iterations,metadata,created_at,updated_at")
    .eq("id",runId).maybeSingle();
  if(rErr||!run)throw new Error("shadow_run_missing");

  const {data:workspace,error:wErr}=await sb.from("minds_commitment_workspaces")
    .select("id,commitment_id,project_id,title,objective_snapshot,completion_criteria_snapshot,status,summary")
    .eq("id",run.workspace_id).eq("user_id",run.user_id).maybeSingle();
  if(wErr||!workspace)throw new Error("shadow_workspace_missing");

  const [commitQ,itemsQ]=await Promise.all([
    sb.from("minds_commitments")
      .select("title,objective,status,completion_criteria,scope")
      .eq("id",workspace.commitment_id).eq("user_id",run.user_id).maybeSingle(),
    sb.from("minds_commitment_workspace_items")
      .select("kind,status,content,provenance_class,source_kind,source_ref,created_at")
      .eq("workspace_id",workspace.id).eq("user_id",run.user_id)
      .order("created_at",{ascending:true}).limit(120)
  ]);
  if(commitQ.error||!commitQ.data)throw new Error("shadow_commitment_missing");
  if(itemsQ.error)throw new Error("shadow_workspace_items_failed");

  let projectContext:any=null;
  if(workspace.project_id){
    const [projectQ,claimsQ,memoryQ,tasksQ,filesQ]=await Promise.all([
      sb.from("isabella_projects").select("name").eq("id",workspace.project_id).eq("user_id",run.user_id).maybeSingle(),
      sb.from("minds_work_claims")
        .select("claim_type,statement,status,confidence,provenance_class,subject,topic,discipline,updated_at")
        .eq("project_id",workspace.project_id).eq("user_id",run.user_id)
        .in("status",["confirmed","proposed","disputed","resolved"]).order("updated_at",{ascending:false}).limit(40),
      sb.from("minds_work_memory")
        .select("memory_type,title,body,status,provenance,occurred_at,updated_at")
        .eq("project_id",workspace.project_id).eq("user_id",run.user_id)
        .in("status",["confirmed","proposed","resolved"]).order("updated_at",{ascending:false}).limit(30),
      sb.from("isabella_tasks")
        .select("title,due_date,completed_at,priority,work_status,notes,updated_at")
        .eq("project_id",workspace.project_id).eq("user_id",run.user_id)
        .is("archived_at",null).order("updated_at",{ascending:false}).limit(30),
      sb.from("minds_work_files")
        .select("name,mime_type,source_kind,index_status,updated_at")
        .eq("project_id",workspace.project_id).eq("user_id",run.user_id)
        .order("updated_at",{ascending:false}).limit(30)
    ]);
    projectContext={
      project:projectQ.data?{name:projectQ.data.name}:null,
      claims:claimsQ.data||[],
      memory:memoryQ.data||[],
      tasks:tasksQ.data||[],
      files:filesQ.data||[]
    };
  }

  const snapshot=normalizeMissionRuntimeSnapshot({
    mission_run_id:run.id,
    workspace_id:workspace.id,
    instruction:run.instruction,
    objective:workspace.objective_snapshot||commitQ.data.objective||"",
    completion_criterion:workspace.completion_criteria_snapshot||commitQ.data.completion_criteria||null,
    summary:workspace.summary||"",
    iteration:run.iteration,
    max_iterations:run.max_iterations,
    latest_user_input:run.metadata?.last_user_input||null,
    recent_items:(itemsQ.data||[]).slice(-60),
    project_context:projectContext
  });
  return {run,workspace,commitment:commitQ.data,snapshot,snapshotHash:await sha256(snapshot)};
}
async function getExecution(sb:any,runId:string,provider:string){
  const {data,error}=await sb.from("minds_mission_runtime_executions")
    .select("*").eq("mission_run_id",runId).eq("provider",provider).eq("mode","shadow").maybeSingle();
  if(error)throw new Error("shadow_execution_read_failed:"+error.message);
  return data||null;
}
async function createExecution(sb:any,run:any,provider:string,snapshotHash:string,model:string){
  const existing=await getExecution(sb,run.id,provider);
  if(existing)return {row:existing,idempotent:true};
  const {data,error}=await sb.from("minds_mission_runtime_executions").insert({
    mission_run_id:run.id,
    user_id:run.user_id,
    provider,
    mode:"shadow",
    lifecycle:"created",
    snapshot_hash:snapshotHash,
    started_at:new Date().toISOString(),
    metadata:{
      contract:"72.5B",
      model,
      write_through:false,
      tools_enabled:false,
      multi_agent_enabled:false
    }
  }).select("*").single();
  if(error)throw new Error("shadow_execution_create_failed:"+error.message);
  await appendEvent(sb,data.id,"shadow.created",{provider,model,snapshot_hash:snapshotHash});
  return {row:data,idempotent:false};
}
async function appendEvent(sb:any,executionId:string,eventType:string,payload:any={},providerTurnId:string|null=null){
  const {error}=await sb.from("minds_mission_runtime_events").insert({
    execution_id:executionId,
    user_id:"00000000-0000-0000-0000-000000000000",
    event_type:eventType,
    provider_turn_id:providerTurnId,
    payload
  });
  if(error)throw new Error("shadow_event_write_failed:"+error.message);
}
async function updateExecution(sb:any,id:string,execution:Partial<{
  lifecycle:string;provider_session_id:string|null;provider_turn_id:string|null;
  result_status:string|null;result_payload:any;usage:any;metadata:any;last_error:string|null;completed_at:string|null;
}>){
  const {data,error}=await sb.from("minds_mission_runtime_executions").update(execution).eq("id",id).select("*").single();
  if(error)throw new Error("shadow_execution_update_failed:"+error.message);
  return data;
}
async function nativeShadow(apiKey:string,model:string,snapshot:any){
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,
      instructions:[
        "You are a shadow evaluation worker for MINDS. Advance exactly one bounded Mission checkpoint.",
        "You have no authority to change MINDS or any external system. Treat supplied context as evidence with provenance, not automatically true.",
        "A decision is only a proposal. Return only the structured output requested."
      ].join(" "),
      reasoning:{effort:"medium"},
      max_output_tokens:3200,
      text:{format:{type:"json_schema",name:"mission_shadow_result",strict:true,schema:MISSION_SHADOW_SCHEMA}},
      input:[{role:"user",content:[{type:"input_text",text:JSON.stringify(snapshot)}]}]
    })
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(String(payload?.error?.message||`native_shadow_http_${response.status}`).slice(0,2000));
  return {
    provider_turn_id:String(payload?.id||"")||null,
    result:normalizeMissionRuntimeResult(parseJSON(responseText(payload))),
    usage:payload?.usage&&typeof payload.usage==="object"?payload.usage:{}
  };
}
function rowToExecution(row:any):MissionRuntimeExecution{
  const resultPayload=row?.result_payload&&typeof row.result_payload==="object"&&Object.keys(row.result_payload).length
    ?normalizeMissionRuntimeResult(row.result_payload):null;
  return {
    provider:"openai_agents",
    mode:"shadow",
    lifecycle:row.lifecycle,
    provider_session_id:row.provider_session_id||null,
    provider_turn_id:row.provider_turn_id||null,
    result:resultPayload,
    usage:row.usage||{},
    metadata:row.metadata||{}
  };
}
async function persistAgentInspection(sb:any,row:any,execution:MissionRuntimeExecution){
  const terminal=["succeeded","failed","stopped"].includes(execution.lifecycle);
  const updated=await updateExecution(sb,row.id,{
    lifecycle:execution.lifecycle,
    provider_session_id:execution.provider_session_id,
    provider_turn_id:execution.provider_turn_id,
    result_status:execution.result?.status||null,
    result_payload:execution.result||{},
    usage:execution.usage||{},
    metadata:{...(row.metadata||{}),...(execution.metadata||{}),write_through:false},
    last_error:execution.lifecycle==="failed"?String(execution.metadata?.error||row.last_error||"agents_session_failed").slice(0,8000):null,
    completed_at:terminal?new Date().toISOString():null
  });
  await appendEvent(sb,row.id,`shadow.${execution.lifecycle}`,{
    result_status:execution.result?.status||null,
    session_status:execution.metadata?.session_status||null,
    turn_status:execution.metadata?.turn_status||null
  },execution.provider_turn_id);
  return updated;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:secret,error:secretErr}=await sb.from("isabella_runtime_secrets")
    .select("value").eq("key","agent_shadow_runner").maybeSingle();
  if(secretErr||!secret?.value||String(body?.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);

  const action=String(body?.action||"status");
  const runId=String(body?.run_id||"").trim();
  if(!runId)return json({error:"run_id_required"},400);

  const nativeModel=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  const agentsModel=Deno.env.get("OPENAI_AGENT_MODEL")||"gpt-6-astra";

  try{
    if(action==="status"){
      const {data,error}=await sb.from("minds_mission_runtime_executions")
        .select("id,provider,mode,lifecycle,provider_session_id,provider_turn_id,snapshot_hash,result_status,result_payload,usage,metadata,last_error,started_at,completed_at,created_at,updated_at")
        .eq("mission_run_id",runId).eq("mode","shadow").order("created_at",{ascending:true});
      if(error)throw error;
      return json({ok:true,run_id:runId,executions:data||[]});
    }

    if(action==="run_pair"){
      const {run,snapshot,snapshotHash}=await loadSnapshot(sb,runId);
      const native=await createExecution(sb,run,"native_minds",snapshotHash,nativeModel);
      const agents=await createExecution(sb,run,"openai_agents",snapshotHash,agentsModel);

      let nativeRow=native.row;
      if(!native.idempotent||!["succeeded","running"].includes(String(nativeRow.lifecycle))){
        try{
          nativeRow=await updateExecution(sb,nativeRow.id,{lifecycle:"running"});
          await appendEvent(sb,nativeRow.id,"shadow.running",{model:nativeModel});
          const result=await nativeShadow(apiKey,nativeModel,snapshot);
          nativeRow=await updateExecution(sb,nativeRow.id,{
            lifecycle:"succeeded",
            provider_turn_id:result.provider_turn_id,
            result_status:result.result.status,
            result_payload:result.result,
            usage:result.usage,
            metadata:{...(nativeRow.metadata||{}),api:"responses",model:nativeModel,write_through:false},
            last_error:null,
            completed_at:new Date().toISOString()
          });
          await appendEvent(sb,nativeRow.id,"shadow.succeeded",{result_status:result.result.status},result.provider_turn_id);
        }catch(error){
          const detail=error instanceof Error?error.message:String(error);
          nativeRow=await updateExecution(sb,nativeRow.id,{
            lifecycle:"failed",last_error:detail.slice(0,8000),completed_at:new Date().toISOString(),
            metadata:{...(nativeRow.metadata||{}),api:"responses",model:nativeModel,write_through:false}
          });
          await appendEvent(sb,nativeRow.id,"shadow.failed",{error:detail.slice(0,1000)});
        }
      }

      let agentsRow=agents.row;
      if(!agents.idempotent||!agentsRow.provider_session_id){
        const adapter=createOpenAIAgentsShadowAdapter({apiKey,model:agentsModel});
        const started=await adapter.start({mode:"shadow",run,snapshot});
        if(!started.ok){
          agentsRow=await updateExecution(sb,agentsRow.id,{
            lifecycle:"failed",last_error:started.error.slice(0,8000),completed_at:new Date().toISOString(),
            metadata:{...(agentsRow.metadata||{}),api:"agents",model:agentsModel,write_through:false}
          });
          await appendEvent(sb,agentsRow.id,"shadow.failed",{error:started.error.slice(0,1000)});
        }else{
          agentsRow=await persistAgentInspection(sb,agentsRow,started.value);
        }
      }

      return json({
        ok:true,run_id:runId,snapshot_hash:snapshotHash,
        native:{id:nativeRow.id,lifecycle:nativeRow.lifecycle,result_status:nativeRow.result_status},
        agents:{id:agentsRow.id,lifecycle:agentsRow.lifecycle,result_status:agentsRow.result_status,session_id:agentsRow.provider_session_id}
      });
    }

    if(action==="inspect_agents"){
      const row=await getExecution(sb,runId,"openai_agents");
      if(!row)return json({error:"agents_shadow_missing"},404);
      if(!row.provider_session_id)return json({error:"agents_session_missing",lifecycle:row.lifecycle},409);
      const adapter=createOpenAIAgentsShadowAdapter({apiKey,model:String(row.metadata?.model||agentsModel)});
      const inspected=await adapter.inspect(rowToExecution(row));
      if(!inspected.ok){
        const updated=await updateExecution(sb,row.id,{
          last_error:inspected.error.slice(0,8000),
          metadata:{...(row.metadata||{}),last_inspect_error:inspected.error.slice(0,1000),write_through:false}
        });
        await appendEvent(sb,row.id,"shadow.inspect_failed",{error:inspected.error.slice(0,1000)});
        return json({ok:false,run_id:runId,lifecycle:updated.lifecycle,error:inspected.error},502);
      }
      const updated=await persistAgentInspection(sb,row,inspected.value);
      return json({
        ok:true,run_id:runId,lifecycle:updated.lifecycle,result_status:updated.result_status,
        session_id:updated.provider_session_id,turn_id:updated.provider_turn_id
      });
    }

    return json({error:"unsupported_action"},400);
  }catch(error){
    return json({error:"shadow_runner_failed",detail:error instanceof Error?error.message:String(error)},500);
  }
});
