export type MissionRuntimeProvider="native_minds"|"openai_agents";
export type MissionRuntimeMode="primary"|"shadow";
export type MissionRuntimeLifecycle="created"|"running"|"succeeded"|"action_required"|"failed"|"stopped";
export type MissionRuntimeOutcome="continue"|"waiting_for_user"|"completed";

export type MissionRuntimeCapabilities={
  persistent_session:boolean;
  inspect:boolean;
  steer:boolean;
  interrupt:boolean;
  multi_agent:boolean;
  computer_use:boolean;
  mcp:boolean;
};

export type MissionRuntimeItem={
  kind:"plan"|"finding"|"source"|"question"|"decision"|"note";
  content:string;
  source_kind:"user"|"conversation"|"work"|"document"|"web"|"specialist"|"system";
  provenance_class:"user"|"project_source"|"external"|"inferred"|"agent";
  source_ref:string|null;
};

export type MissionRuntimeSnapshotV1={
  version:"mission_snapshot_v1";
  mission_run_id:string;
  workspace_id:string;
  instruction:string;
  objective:string;
  completion_criterion:string|null;
  summary:string;
  iteration:number;
  max_iterations:number;
  latest_user_input:string|null;
  recent_items:MissionRuntimeItem[];
  project_context:unknown|null;
};

export type MissionRuntimeResult={
  status:MissionRuntimeOutcome;
  summary:string;
  blocker_question:string|null;
  items:MissionRuntimeItem[];
  sources:Array<{title:string;url:string}>;
};

export type MissionRuntimeExecution={
  provider:MissionRuntimeProvider;
  mode:MissionRuntimeMode;
  lifecycle:MissionRuntimeLifecycle;
  provider_session_id:string|null;
  provider_turn_id:string|null;
  result:MissionRuntimeResult|null;
  usage:Record<string,unknown>;
  metadata:Record<string,unknown>;
};

export type RuntimeCall<T>={ok:true;value:T}|{ok:false;error:string;retryable:boolean};

export type MissionRuntimeAdapter={
  provider:MissionRuntimeProvider;
  capabilities:Readonly<MissionRuntimeCapabilities>;
  start(input:{mode:MissionRuntimeMode;run:unknown;snapshot:unknown}):Promise<RuntimeCall<MissionRuntimeExecution>>;
  inspect(execution:MissionRuntimeExecution):Promise<RuntimeCall<MissionRuntimeExecution>>;
  steer(execution:MissionRuntimeExecution,input:string):Promise<RuntimeCall<MissionRuntimeExecution>>;
  pause_or_stop(execution:MissionRuntimeExecution,action:"pause"|"stop"):Promise<RuntimeCall<MissionRuntimeExecution>>;
  collect(execution:MissionRuntimeExecution):Promise<RuntimeCall<MissionRuntimeResult>>;
};

const ITEM_KINDS=new Set(["plan","finding","source","question","decision","note"]);
const SOURCE_KINDS=new Set(["user","conversation","work","document","web","specialist","system"]);
const PROVENANCE=new Set(["user","project_source","external","inferred","agent"]);
const CREDENTIAL_KEYS=/^(authorization|cookie|password|secret|access_?token|refresh_?token|api_?key|apikey|service_?role(?:_?key)?)$/i;

function text(value:unknown,max:number){
  return String(value??"").trim().slice(0,max);
}
function nullableText(value:unknown,max:number){
  const x=text(value,max);return x||null;
}
function boundedInt(value:unknown,min:number,max:number,fallback:number){
  const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback;
}
function jsonCloneBounded(value:unknown,maxBytes=120000){
  if(value==null)return null;
  const raw=JSON.stringify(value);
  if(raw.length>maxBytes)throw new Error("mission_runtime_snapshot_too_large");
  return JSON.parse(raw);
}
function assertNoCredentialKeys(value:unknown,path="$",depth=0,seen={count:0}){
  if(value==null||typeof value!=="object")return;
  if(depth>12)throw new Error("mission_runtime_snapshot_too_deep");
  seen.count++;if(seen.count>12000)throw new Error("mission_runtime_snapshot_too_complex");
  if(Array.isArray(value)){
    for(let i=0;i<value.length;i++)assertNoCredentialKeys(value[i],path+"["+i+"]",depth+1,seen);
    return;
  }
  for(const [key,child] of Object.entries(value as Record<string,unknown>)){
    if(CREDENTIAL_KEYS.test(key))throw new Error("mission_runtime_credentials_forbidden:"+path+"."+key);
    assertNoCredentialKeys(child,path+"."+key,depth+1,seen);
  }
}

export function normalizeMissionRuntimeItem(value:unknown):MissionRuntimeItem|null{
  const x=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
  const content=text(x.content,16000);if(!content)return null;
  const kind=ITEM_KINDS.has(String(x.kind||""))?String(x.kind):"note";
  const source=SOURCE_KINDS.has(String(x.source_kind||""))?String(x.source_kind):"system";
  let provenance=PROVENANCE.has(String(x.provenance_class||""))?String(x.provenance_class):"agent";
  if(source==="user")provenance="user";
  else if(source==="work"||source==="document")provenance="project_source";
  else if(source==="web")provenance="external";
  return {
    kind:kind as MissionRuntimeItem["kind"],
    content,
    source_kind:source as MissionRuntimeItem["source_kind"],
    provenance_class:provenance as MissionRuntimeItem["provenance_class"],
    source_ref:nullableText(x.source_ref,2000)
  };
}

export function normalizeMissionRuntimeSnapshot(input:unknown):MissionRuntimeSnapshotV1{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const missionRunId=text(x.mission_run_id,80),workspaceId=text(x.workspace_id,80);
  if(!missionRunId||!workspaceId)throw new Error("mission_runtime_snapshot_identity_required");
  const projectContext=jsonCloneBounded(x.project_context);
  assertNoCredentialKeys(projectContext);
  const items=(Array.isArray(x.recent_items)?x.recent_items:[])
    .slice(-60).map(normalizeMissionRuntimeItem).filter(Boolean) as MissionRuntimeItem[];
  return {
    version:"mission_snapshot_v1",
    mission_run_id:missionRunId,
    workspace_id:workspaceId,
    instruction:text(x.instruction,6000),
    objective:text(x.objective,12000),
    completion_criterion:nullableText(x.completion_criterion,12000),
    summary:text(x.summary,12000),
    iteration:boundedInt(x.iteration,0,12,0),
    max_iterations:boundedInt(x.max_iterations,1,12,4),
    latest_user_input:nullableText(x.latest_user_input,6000),
    recent_items:items,
    project_context:projectContext
  };
}

export function normalizeMissionRuntimeResult(input:unknown):MissionRuntimeResult{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const status=["continue","waiting_for_user","completed"].includes(String(x.status))
    ?String(x.status) as MissionRuntimeOutcome:"continue";
  const items=(Array.isArray(x.items)?x.items:[]).slice(0,12)
    .map(normalizeMissionRuntimeItem).filter(Boolean) as MissionRuntimeItem[];
  const sources=(Array.isArray(x.sources)?x.sources:[]).slice(0,12).map(value=>{
    const s=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
    const url=text(s.url,2000);
    return {title:text(s.title,500)||"Fuente",url};
  }).filter(x=>/^https?:\/\//i.test(x.url));
  return {
    status,
    summary:text(x.summary,12000),
    blocker_question:status==="waiting_for_user"?nullableText(x.blocker_question,4000):null,
    items,
    sources
  };
}

function unsupported(provider:MissionRuntimeProvider,operation:string):RuntimeCall<never>{
  return {ok:false,error:provider+":"+operation+"_unsupported",retryable:false};
}

export function createNativeMindsRuntimeAdapter(deps:{
  execute_checkpoint(input:{run:unknown;snapshot:MissionRuntimeSnapshotV1}):Promise<unknown>
}):MissionRuntimeAdapter{
  return {
    provider:"native_minds",
    capabilities:Object.freeze({
      persistent_session:false,inspect:false,steer:false,interrupt:false,
      multi_agent:false,computer_use:false,mcp:false
    }),
    async start(input){
      try{
        const snapshot=normalizeMissionRuntimeSnapshot(input.snapshot);
        const raw=await deps.execute_checkpoint({run:input.run,snapshot});
        return {ok:true,value:{
          provider:"native_minds",mode:input.mode,lifecycle:"succeeded",
          provider_session_id:null,provider_turn_id:null,
          result:normalizeMissionRuntimeResult(raw),usage:{},
          metadata:{checkpoint_runtime:"native_minds"}
        }};
      }catch(error){
        return {ok:false,error:error instanceof Error?error.message:String(error),retryable:true};
      }
    },
    async inspect(){return unsupported("native_minds","inspect")},
    async steer(){return unsupported("native_minds","steer")},
    async pause_or_stop(){return unsupported("native_minds","pause_or_stop")},
    async collect(execution){
      if(execution.provider!=="native_minds")return {ok:false,error:"native_minds:execution_provider_mismatch",retryable:false};
      if(!execution.result)return {ok:false,error:"native_minds:result_unavailable",retryable:false};
      return {ok:true,value:normalizeMissionRuntimeResult(execution.result)};
    }
  };
}

export function createMissionRuntimeRegistry(adapters:MissionRuntimeAdapter[]){
  const map=new Map<MissionRuntimeProvider,MissionRuntimeAdapter>();
  for(const adapter of adapters){
    if(map.has(adapter.provider))throw new Error("duplicate_mission_runtime_provider:"+adapter.provider);
    map.set(adapter.provider,adapter);
  }
  if(!map.has("native_minds"))throw new Error("native_minds_runtime_required");
  return Object.freeze({
    get(provider:MissionRuntimeProvider){
      const adapter=map.get(provider);
      if(!adapter)throw new Error("mission_runtime_provider_unavailable:"+provider);
      return adapter;
    },
    providers(){return [...map.keys()]}
  });
}
