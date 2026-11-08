// A user's reversible direct-create preference is not inferred from model output.
// A canonical owner excerpt and a server-admitted decision must support it.
export function exactOwnerExcerpt(source, excerpt){
  const original=String(source||"");
  const quote=String(excerpt||"").trim();
  return quote.length>=8&&quote.length<=900&&original.toLocaleLowerCase().includes(quote.toLocaleLowerCase());
}
export function exactFieldExcerpt(source,excerpt){
  const quote=String(excerpt||"").trim();
  return quote.length>=3&&quote.length<=160&&
    String(source||"").toLocaleLowerCase().includes(quote.toLocaleLowerCase());
}
// The normalized title must already be present in the owner's literal message.
// Neither a Work prefetch nor a model-generated suggestion can supply new title words.
const plain=v=>String(v||"").normalize("NFKC").toLocaleLowerCase("es")
  .replace(/[\p{P}\p{S}]+/gu," ").replace(/\s+/g," ").trim();
export function exactOwnerTitle(source,title){
  const normalized=plain(title);
  return normalized.length>=3&&plain(source).includes(normalized);
}
export const DIRECT_READ_TOOLS=new Set(["search_calendar","search_routines","search_memory"]);
const isCreate=t=>t==="create_task"||t==="create_event";
// Previous *rounds* must be purely read-only, and this round may mix those
// reads with create only. All other tools always disqualify direct authority.
export function directToolHistorySafe(usedTools,roundStartedAt=0){
  const tools=Array.isArray(usedTools)?usedTools:[];
  if(!Number.isSafeInteger(roundStartedAt)||roundStartedAt<0||roundStartedAt>tools.length)return false;
  return tools.slice(0,roundStartedAt).every(t=>DIRECT_READ_TOOLS.has(t))&&
    tools.slice(roundStartedAt).every(t=>DIRECT_READ_TOOLS.has(t)||isCreate(t));
}
// Missing duration is *visibly defaulted*, never assumed to be quoted by
// the owner. An explicit non-60 model duration without a quote is NOT direct.
export function withDefaultEventDuration(proposal){
  if(proposal?.kind!=="event"||proposal?.action!=="create"||
     typeof proposal?.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(proposal.time)||
     (proposal.duration_minutes!=null&&proposal.duration_minutes!==""))return proposal;
  return {...proposal,duration_minutes:60,duration_defaulted:true};
}

export function authorizedDirectBatch(proposals,ids,usedTools){
  if(!Array.isArray(proposals)||!proposals.length||!Array.isArray(ids)||ids.length!==proposals.length)return null;
  const all=proposals.every(p=>(p?.kind==="task"||p?.kind==="event")&&p.action==="create"&&
    typeof p.request_id==="string"&&ids.includes(p.request_id));
  const tools=Array.isArray(usedTools)?usedTools:[];
  if(!all||tools.some(t=>!isCreate(t)&&!DIRECT_READ_TOOLS.has(t))||
    new Set(ids).size!==ids.length)return null;
  return {version:1,mode:"direct_create_v1",request_ids:ids.slice()};
}
