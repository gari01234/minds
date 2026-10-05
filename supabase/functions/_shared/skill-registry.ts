export const SKILL_RUNTIME_VERSION="minds-skills-v0.1";
export const MAX_COMPOSED_SKILLS=4;

export type SkillSource="system"|"personal";
export type SkillToolPolicy="allow"|"confirm"|"deny";

export type SkillToolHint={
  id:string;
  policy:SkillToolPolicy;
};

export type SkillManifestV1={
  slug:string;
  name:string;
  description:string;
  instructions:string;
  version:number;
  source:SkillSource;
  requested_tools:string[];
  tool_hints:SkillToolHint[];
  unavailable_tools:string[];
  authority:"inherits_runtime_policy";
  grants:[];
};

export type SkillTraceV1={
  slug:string;
  name:string;
  version:number;
  source:SkillSource;
};

function text(v:unknown,max:number){
  return String(v??"").trim().slice(0,max);
}
function slug(v:unknown){
  return text(v,80).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"");
}
function version(v:unknown){
  const n=Math.trunc(Number(v));
  return Number.isFinite(n)&&n>=1?n:1;
}
function stringList(v:unknown,max=16){
  const out:string[]=[];
  for(const raw of Array.isArray(v)?v:[]){
    const x=text(raw,120);
    if(x&&!out.includes(x))out.push(x);
    if(out.length>=max)break;
  }
  return out;
}

export function normalizeSkillRecord(
  input:unknown,
  source:SkillSource,
  resolvePolicy:(tool:string)=>SkillToolPolicy
):SkillManifestV1{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const cleanSlug=slug(x.slug),name=text(x.name,180),description=text(x.description,1600),instructions=text(x.instructions,16000);
  if(!cleanSlug||!name||!description||!instructions)throw new Error("skill_manifest_invalid");
  const requested=stringList(x.preferred_tools);
  const toolHints=requested.map(id=>({id,policy:resolvePolicy(id)}));
  return {
    slug:cleanSlug,
    name,
    description,
    instructions,
    version:version(x.version),
    source,
    requested_tools:requested,
    tool_hints:toolHints.filter(x=>x.policy!=="deny"),
    unavailable_tools:toolHints.filter(x=>x.policy==="deny").map(x=>x.id),
    authority:"inherits_runtime_policy",
    grants:[]
  };
}

export function skillPromptSummary(skill:SkillManifestV1){
  return {
    slug:skill.slug,
    name:skill.name,
    description:skill.description,
    version:skill.version,
    source:skill.source
  };
}

export function skillTrace(skill:SkillManifestV1):SkillTraceV1{
  return {slug:skill.slug,name:skill.name,version:skill.version,source:skill.source};
}

export function normalizeSkillTrace(input:unknown):SkillTraceV1[]{
  const out:SkillTraceV1[]=[];
  for(const raw of Array.isArray(input)?input:[]){
    const x=(raw&&typeof raw==="object"?raw:{}) as Record<string,unknown>;
    const s=slug(x.slug),n=text(x.name,180),src=String(x.source||"")==="personal"?"personal":"system";
    if(!s||!n)continue;
    const row={slug:s,name:n,version:version(x.version),source:src as SkillSource};
    if(!out.some(v=>v.slug===row.slug&&v.source===row.source&&v.version===row.version))out.push(row);
    if(out.length>=MAX_COMPOSED_SKILLS)break;
  }
  return out;
}

export function composeSkillTrace(current:unknown,next:SkillManifestV1):SkillTraceV1[]{
  const trace=normalizeSkillTrace(current);
  const item=skillTrace(next);
  if(trace.some(x=>x.slug===item.slug&&x.source===item.source&&x.version===item.version))return trace;
  if(trace.length>=MAX_COMPOSED_SKILLS)throw new Error("skill_composition_limit");
  return [...trace,item];
}

export function skillLoadEnvelope(skill:SkillManifestV1,composition:unknown){
  return {
    status:"loaded",
    skill:skillTrace(skill),
    instructions:skill.instructions,
    preferred_tools:skill.tool_hints,
    unavailable_tools:skill.unavailable_tools,
    authority:skill.authority,
    grants:skill.grants,
    composition:normalizeSkillTrace(composition)
  };
}
