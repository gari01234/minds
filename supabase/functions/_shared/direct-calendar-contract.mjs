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
// Reads can precede direct creation, but no retrieved content is an owner command.
export const DIRECT_READ_TOOLS=new Set(["search_calendar","search_routines","search_memory"]);
export const DIRECT_CREATE_TOOLS=new Set(["create_task","create_event"]);
export function safeDirectToolHistory(usedTools,roundStart=0){
  const tools=Array.isArray(usedTools)?usedTools:[];
  return tools.every(t=>DIRECT_READ_TOOLS.has(t)||DIRECT_CREATE_TOOLS.has(t))&&
    tools.slice(0,roundStart).every(t=>DIRECT_READ_TOOLS.has(t));
}
export function titleInCurrentOwnerMessage(title,message){
  const normalize=x=>String(x||"").normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"")
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
  const name=normalize(title),owner=normalize(message);
  return name.length>=3&&owner.length>=name.length&&(" "+owner+" ").includes(" "+name+" ");
}
export function authorizedDirectBatch(proposals,ids,usedTools){
  if(!Array.isArray(proposals)||!proposals.length||!Array.isArray(ids)||ids.length!==proposals.length)return null;
  const all=proposals.every(p=>(p?.kind==="task"||p?.kind==="event")&&p.action==="create"&&
    typeof p.request_id==="string"&&ids.includes(p.request_id));
  const tools=Array.isArray(usedTools)?usedTools:[];
  if(!all||tools.some(t=>!DIRECT_READ_TOOLS.has(t)&&!DIRECT_CREATE_TOOLS.has(t))||
    new Set(ids).size!==ids.length)return null;
  return {version:1,mode:"direct_create_v1",request_ids:ids.slice()};
}
