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
export function authorizedDirectBatch(proposals,ids,usedTools){
  if(!Array.isArray(proposals)||!proposals.length||!Array.isArray(ids)||ids.length!==proposals.length)return null;
  const all=proposals.every(p=>(p?.kind==="task"||p?.kind==="event")&&p.action==="create"&&
    typeof p.request_id==="string"&&ids.includes(p.request_id));
  const tools=Array.isArray(usedTools)?usedTools:[];
  if(!all||tools.some(t=>t!=="create_task"&&t!=="create_event")||
    new Set(ids).size!==ids.length)return null;
  return {version:1,mode:"direct_create_v1",request_ids:ids.slice()};
}
