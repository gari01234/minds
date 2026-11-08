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
const DIRECT_READ_TOOLS=new Set(["search_calendar","search_routines","search_memory"]);
const DIRECT_CREATE_TOOLS=new Set(["create_task","create_event"]);
/** A project reference is context, never permission to invent a title. */
export function directTitleInOwnerTurn(source,title){
  const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("es").replace(/[^a-z0-9ñ]+/g," ").trim().replace(/\s+/g," ");
  const name=normalize(title),spoken=normalize(source);
  return name.length>=3&&name.length<=300&&spoken.includes(name);
}
/** Prior rounds are safe only when every tool was a known read-only call. */
export function directPriorRoundsSafe(round,priorTools=[]){
  return Number.isInteger(round)&&round>=0&&(round===0||
    (Array.isArray(priorTools)&&priorTools.every(t=>DIRECT_READ_TOOLS.has(t))));
}
/** Calendar, routines and memory reads do not themselves grant write authority.
 * Other tools (Work document contents, web, Sofia, attachments) block direct creation.
 */
export function directToolsClean(tools=[]){
  return Array.isArray(tools)&&tools.every(t=>DIRECT_READ_TOOLS.has(t)||DIRECT_CREATE_TOOLS.has(t));
}
export function authorizedDirectBatch(proposals,ids,usedTools){
  if(!Array.isArray(proposals)||!proposals.length||!Array.isArray(ids)||ids.length!==proposals.length)return null;
  const all=proposals.every(p=>(p?.kind==="task"||p?.kind==="event")&&p.action==="create"&&
    typeof p.request_id==="string"&&ids.includes(p.request_id));
  const tools=Array.isArray(usedTools)?usedTools:[];
  if(!all||!directToolsClean(tools)||
    new Set(ids).size!==ids.length)return null;
  return {version:1,mode:"direct_create_v1",request_ids:ids.slice()};
}
