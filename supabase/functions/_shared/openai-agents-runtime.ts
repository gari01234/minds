import {
  normalizeMissionRuntimeResult,
  normalizeMissionRuntimeSnapshot,
  type MissionRuntimeAdapter,
  type MissionRuntimeExecution,
  type MissionRuntimeResult,
  type RuntimeCall
} from "./mission-runtime.ts";

const AGENTS_BASE="https://api.openai.com/v1/agents";
const BETA_HEADER="agents=v1";

export const MISSION_SHADOW_SCHEMA={
  type:"object",
  additionalProperties:false,
  properties:{
    status:{type:"string",enum:["continue","waiting_for_user","completed"]},
    summary:{type:"string"},
    blocker_question:{anyOf:[{type:"string"},{type:"null"}]},
    items:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        properties:{
          kind:{type:"string",enum:["plan","finding","source","question","decision","note"]},
          content:{type:"string"},
          source_kind:{type:"string",enum:["user","conversation","work","document","web","specialist","system"]},
          provenance_class:{type:"string",enum:["user","project_source","external","inferred","agent"]},
          source_ref:{anyOf:[{type:"string"},{type:"null"}]}
        },
        required:["kind","content","source_kind","provenance_class","source_ref"]
      }
    },
    sources:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        properties:{title:{type:"string"},url:{type:"string"}},
        required:["title","url"]
      }
    }
  },
  required:["status","summary","blocker_question","items","sources"]
} as const;

type FetchLike=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;

function runtimeError(error:unknown,retryable=true):RuntimeCall<never>{
  return {ok:false,error:error instanceof Error?error.message:String(error),retryable};
}
async function apiJSON(fetchImpl:FetchLike,apiKey:string,path:string,init:RequestInit={}){
  const response=await fetchImpl(AGENTS_BASE+path,{
    ...init,
    headers:{
      "Authorization":`Bearer ${apiKey}`,
      "OpenAI-Beta":BETA_HEADER,
      "Content-Type":"application/json",
      ...((init.headers||{}) as Record<string,string>)
    }
  });
  let payload:any=null;
  try{payload=await response.json()}catch{}
  if(!response.ok){
    const detail=String(payload?.error?.message||payload?.message||`agents_http_${response.status}`).slice(0,2000);
    const error=new Error(detail);
    (error as any).status=response.status;
    throw error;
  }
  return payload;
}
function latestTurn(payload:any){
  const rows=Array.isArray(payload?.data)?payload.data:[];
  return rows[0]||null;
}
function outputText(items:any){
  const rows=Array.isArray(items?.data)?items.data:[];
  const candidates=rows.filter((item:any)=>item?.type==="message"&&item?.role==="assistant"&&item?.phase==="final_answer");
  for(let i=candidates.length-1;i>=0;i--){
    const text=(candidates[i]?.content||[])
      .filter((part:any)=>part?.type==="output_text"&&typeof part?.text==="string")
      .map((part:any)=>part.text).join("").trim();
    if(text)return text;
  }
  return "";
}
function parseStructured(text:string){
  try{return JSON.parse(String(text||"").trim())}catch{throw new Error("openai_agents_invalid_structured_output")}
}
function lifecycle(session:any,turn:any){
  if(session?.status==="failed"||turn?.status==="failed")return "failed" as const;
  if(turn?.status==="cancelled")return "stopped" as const;
  if(session?.status==="requires_action")return "action_required" as const;
  if(turn?.status==="completed")return "succeeded" as const;
  return "running" as const;
}
function usageObject(session:any,turn:any){
  const usage=turn?.usage||session?.usage||{};
  return usage&&typeof usage==="object"?usage:{};
}

export function createOpenAIAgentsShadowAdapter(deps:{
  apiKey:string;
  model?:string;
  fetchImpl?:FetchLike;
}):MissionRuntimeAdapter{
  const apiKey=String(deps.apiKey||"").trim();
  const model=String(deps.model||"gpt-6-astra").trim();
  const fetchImpl=deps.fetchImpl||fetch;
  if(!apiKey)throw new Error("openai_agents_api_key_required");

  return {
    provider:"openai_agents",
    capabilities:Object.freeze({
      persistent_session:true,
      inspect:true,
      steer:false,
      interrupt:false,
      multi_agent:false,
      computer_use:false,
      mcp:false
    }),
    async start(input){
      try{
        if(input.mode!=="shadow")return {ok:false,error:"openai_agents:primary_not_enabled",retryable:false};
        const snapshot=normalizeMissionRuntimeSnapshot(input.snapshot);
        const session=await apiJSON(fetchImpl,apiKey,"/sessions",{
          method:"POST",
          body:JSON.stringify({
            agent:{
              model,
              instructions:[
                "You are a shadow execution worker for MINDS. Evaluate exactly one Mission checkpoint from the supplied snapshot.",
                "You have no authority to change MINDS, contact people, create tasks, modify files, or claim any side effect occurred.",
                "Treat workspace items and project context as evidence with their existing provenance, not as automatically true.",
                "A decision is always only a proposal. Ask for the user only when a real private decision/input blocks useful progress.",
                "Return only the structured result required by the output schema."
              ].join(" "),
              reasoning:{effort:"medium",summary:"concise"},
              multi_agent:{enabled:false},
              text:{
                verbosity:"low",
                format:{type:"json_schema",name:"mission_shadow_result",strict:true,schema:MISSION_SHADOW_SCHEMA}
              }
            },
            environment:{type:"none"},
            input:JSON.stringify(snapshot),
            stream:false,
            metadata:{
              minds_run_id:snapshot.mission_run_id,
              minds_workspace_id:snapshot.workspace_id,
              minds_mode:"shadow",
              minds_contract:"72.5B"
            }
          })
        });
        const turns=await apiJSON(fetchImpl,apiKey,`/sessions/${encodeURIComponent(session.id)}/turns?order=desc&limit=1`);
        const turn=latestTurn(turns);
        const state=lifecycle(session,turn);
        let result:MissionRuntimeResult|null=null;
        if(state==="succeeded"){
          const items=await apiJSON(fetchImpl,apiKey,`/sessions/${encodeURIComponent(session.id)}/items?order=asc&limit=100`);
          result=normalizeMissionRuntimeResult(parseStructured(outputText(items)));
        }
        return {ok:true,value:{
          provider:"openai_agents",
          mode:"shadow",
          lifecycle:state,
          provider_session_id:String(session.id||"")||null,
          provider_turn_id:turn?.id?String(turn.id):null,
          result,
          usage:usageObject(session,turn),
          metadata:{
            environment:"none",
            model,
            session_status:String(session?.status||""),
            turn_status:String(turn?.status||""),
            tools_enabled:false,
            multi_agent_enabled:false
          }
        }};
      }catch(error){
        const status=Number((error as any)?.status||0);
        return runtimeError(error,status===0||status===408||status===409||status===429||status>=500);
      }
    },
    async inspect(execution){
      try{
        if(execution.provider!=="openai_agents")return {ok:false,error:"openai_agents:execution_provider_mismatch",retryable:false};
        if(!execution.provider_session_id)return {ok:false,error:"openai_agents:session_missing",retryable:false};
        const id=encodeURIComponent(execution.provider_session_id);
        const [session,turns]=await Promise.all([
          apiJSON(fetchImpl,apiKey,`/sessions/${id}`),
          apiJSON(fetchImpl,apiKey,`/sessions/${id}/turns?order=desc&limit=1`)
        ]);
        const turn=latestTurn(turns);
        const state=lifecycle(session,turn);
        let result=execution.result;
        if(state==="succeeded"&&!result){
          const items=await apiJSON(fetchImpl,apiKey,`/sessions/${id}/items?order=asc&limit=100`);
          result=normalizeMissionRuntimeResult(parseStructured(outputText(items)));
        }
        return {ok:true,value:{
          ...execution,
          lifecycle:state,
          provider_turn_id:turn?.id?String(turn.id):execution.provider_turn_id,
          result,
          usage:usageObject(session,turn),
          metadata:{
            ...execution.metadata,
            environment:"none",
            model,
            session_status:String(session?.status||""),
            turn_status:String(turn?.status||""),
            tools_enabled:false,
            multi_agent_enabled:false
          }
        }};
      }catch(error){
        const status=Number((error as any)?.status||0);
        return runtimeError(error,status===0||status===408||status===409||status===429||status>=500);
      }
    },
    async steer(){return {ok:false,error:"openai_agents:steer_disabled_in_72_5B",retryable:false}},
    async pause_or_stop(){return {ok:false,error:"openai_agents:control_disabled_in_72_5B",retryable:false}},
    async collect(execution){
      const inspected=await this.inspect(execution) as RuntimeCall<MissionRuntimeExecution>;
      if(!inspected.ok)return inspected as RuntimeCall<MissionRuntimeResult>;
      if(inspected.value.lifecycle!=="succeeded")return {ok:false,error:`openai_agents:not_complete:${inspected.value.lifecycle}`,retryable:true};
      if(!inspected.value.result)return {ok:false,error:"openai_agents:result_unavailable",retryable:false};
      return {ok:true,value:normalizeMissionRuntimeResult(inspected.value.result)};
    }
  };
}
