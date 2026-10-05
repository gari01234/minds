export const PERSISTENT_WORK_VERSION="persistent-work-v0.1";
export const MAX_PERSISTENT_CHECKPOINTS=32;

export type PersistentWaitKind="time"|"capability"|"expectation";
export type PersistentWait={
  kind:PersistentWaitKind;
  ref:string|null;
  wake_at:string|null;
};

export type PersistentMaterialRequest={
  title:string;
  objective:string;
  desired_outputs:string[];
};

const OUTPUTS=new Set(["docx","pdf","xlsx","pptx","csv","zip","html","txt","json"]);

function text(v:unknown,max:number){return String(v??"").trim().slice(0,max)}
function iso(v:unknown){
  const raw=text(v,80);if(!raw)return null;
  const ms=Date.parse(raw);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function id(v:unknown){return text(v,120)}
function strings(v:unknown,max=8){
  const out:string[]=[];
  for(const raw of Array.isArray(v)?v:[]){
    const x=text(raw,24).toLowerCase();
    if(OUTPUTS.has(x)&&!out.includes(x))out.push(x);
    if(out.length>=max)break;
  }
  return out;
}

export function normalizePersistentWait(input:unknown,nowMs=Date.now()):PersistentWait|null{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const kind=String(x.kind||"") as PersistentWaitKind;
  if(!["time","capability","expectation"].includes(kind))return null;
  if(kind==="time"){
    const wake=iso(x.wake_at);if(!wake)return null;
    const ms=Date.parse(wake);
    if(ms<=nowMs+15_000||ms>nowMs+90*24*60*60*1000)return null;
    return {kind,ref:null,wake_at:wake};
  }
  const ref=id(x.ref);if(!ref)return null;
  return {kind,ref,wake_at:null};
}

export function normalizeMaterialRequest(input:unknown):PersistentMaterialRequest|null{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const title=text(x.title,300),objective=text(x.objective,8000);
  if(!title||!objective)return null;
  return {title,objective,desired_outputs:strings(x.desired_outputs)};
}

export function persistentWorkTrace(input:unknown){
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  return {
    commitment_id:id(x.commitment_id)||null,
    workspace_id:id(x.workspace_id)||null,
    mission_run_id:id(x.mission_run_id)||null,
    version:PERSISTENT_WORK_VERSION
  };
}

export function boundedPersistentCheckpoints(v:unknown, fallback=12){
  const n=Math.trunc(Number(v));
  return Math.max(1,Math.min(MAX_PERSISTENT_CHECKPOINTS,Number.isFinite(n)?n:fallback));
}
