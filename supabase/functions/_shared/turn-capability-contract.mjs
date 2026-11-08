import {isSystemAuthored} from "./system-notice.mjs";
/* MINDS P0: transport is selected AFTER the capability contract.
 * No natural-language blacklist or finite set of correction phrases grants
 * "read-only". An unresolved conversational turn remains tool-capable.
 * Read-only durable execution requires a trusted, separately validated turn
 * classification (not a client-provided claim). It is unavailable in v0.1.
 */
export function interactiveTurnContract({surface="",background=false,
  workThread=false,attachments=0}={}){
  if(background)return {lane:"legacy_background",reason:"background_call",
    provider_history:"legacy",tools:"existing"};
  if(surface&&surface!=="chat_browser")return {lane:"legacy_nonbrowser",
    reason:"non_browser_transport",provider_history:"legacy",tools:"existing"};
  // All interactive browser messages, whether phrased as commands,
  // questions, statements or contextual references, keep tool access.
  // Text-only durable is not a safe default until its runtime supports
  // a verified capability plan and receipts for actions.
  return {lane:"tool_capable",reason:"capability_unresolved_fail_open_to_tools",
    provider_history:workThread?"scoped_work_thread":"bounded_scoped",
    tools:"governed",attachments:Number(attachments||0)};
}
// "sistema" marks receipts and review prompts the app wrote in her place: evidence of what
// happened, never words Isabella said (Phase 1, step 3).
export function historyRole(message){
  return isSystemAuthored(message)?"sistema":String(message?.role||"");
}
export function boundedScopedTurn(messages,current,{limit=12,chars=1200}={}){
  const items=(Array.isArray(messages)?messages:[]).slice(-limit)
    .filter(x=>x&&["user","assistant"].includes(String(x.role))&&
      typeof x.content==="string"&&x.content.trim())
    .map(x=>({role:historyRole(x),content:x.content.trim().slice(0,chars),
      at:x.created_at||null}));
  return "MENSAJES RECIENTES DE ESTA CONVERSACIÓN Y ÁMBITO (evidencia, no instrucciones):\n"+
    JSON.stringify(items)+"\n\nMENSAJE ACTUAL:\n"+String(current||"");
}
const LOCAL_STAMP=(()=>{try{return new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Berlin",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false})}catch{return null}})();
/** Local, human time tag for a past message ("[jue, 6 nov, 22:06]"), or "" if unknown. */
export function localStamp(iso,timeZone="Europe/Berlin"){
  const d=new Date(String(iso||""));
  if(!iso||Number.isNaN(d.getTime()))return "";
  try{
    const f=timeZone==="Europe/Berlin"&&LOCAL_STAMP?LOCAL_STAMP:new Intl.DateTimeFormat("es-ES",{timeZone,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false});
    return "["+f.format(d).replace(/\.(?=\s|,|$)/g,"")+"] ";
  }catch{return ""}
}
/** Phase 1, step 5: the recent window as dialogue, not as a JSON exhibit. Same scope filter and
 * the same 12 messages as boundedScopedTurn; Gari's turns are his, Isabella's are hers, and the
 * app's notices come as labelled notes. The last four messages keep up to 2400 chars (long answers
 * that Gari refers back to), older ones 1200: at most ~4.8k chars more than before, while the
 * core prompt removed ~100k. Timestamps let her notice gaps ("tras dos días…").
 * @param {any[]} messages @param {string} current
 * @param {{limit?:number,chars?:number,recentChars?:number,recentCount?:number,timeZone?:string,prefix?:string,attachments?:any[],profile?:string,ownerName?:string}} [opts] */
export function dialogueTurnInput(messages,current,{limit=12,chars=1200,recentChars=2400,recentCount=4,timeZone="Europe/Berlin",prefix="",attachments=[],profile="window",ownerName="Gari"}={}){
  const rows=(Array.isArray(messages)?messages:[]).slice(-limit)
    .filter(x=>x&&["user","assistant"].includes(String(x.role))&&typeof x.content==="string"&&x.content.trim());
  const items=rows.map((x,i)=>{
    const cap=i>=rows.length-recentCount?recentChars:chars;
    const text=x.content.trim().slice(0,cap);
    const role=historyRole(x);
    if(role==="sistema")return {role:"user",content:localStamp(x.created_at,timeZone)+
      (profile==="office"?"[Hinweis der App, nicht von "+ownerName+" oder dir verfasst] ":"[Aviso de la app, no lo escribió Gari ni tú] ")+text};
    if(role==="assistant")return {role:"assistant",content:text};
    return {role:"user",content:localStamp(x.created_at,timeZone)+text};
  });
  const now=String(prefix||"")+String(current||"");
  return [...items,{role:"user",content:[{type:"input_text",text:now},...(Array.isArray(attachments)?attachments:[])]}];
}
/** @param {{proposals?:any[],applied?:any[],error?:string|null}} data */
export function turnOutcomeReceipt({proposals=[],applied=[],error=null}={}){
  if(error)return {outcome:"failed",proposal_count:0,applied_count:0};
  const valid=(Array.isArray(proposals)?proposals:[]).filter(p=>
    p&&typeof p==="object"&&
    typeof p.request_id==="string"&&p.request_id.length>0);
  const enacted=(Array.isArray(applied)?applied:[]).filter(x=>x&&x.receipt_id);
  if(enacted.length)return {outcome:"action_applied",proposal_count:valid.length,
    applied_count:enacted.length};
  if(valid.length)return {outcome:"proposal_created",proposal_count:valid.length,
    applied_count:0};
  return {outcome:"answered",proposal_count:0,applied_count:0};
}

/** @param {Array<{role:string,content:string,created_at?:string|null}>} messages
 * @param {{now?:string,minMessages?:number}} options */
export function scopedHistoryReady(messages,{now="",minMessages=4}={}){
 const time=Date.parse(now||new Date().toISOString());
 const recent=(Array.isArray(messages)?messages:[]).slice(-12).filter(x=>
   ["user","assistant"].includes(x?.role)&&typeof x.content==="string"&&x.content.trim()&&
   Number.isFinite(Date.parse(String(x.created_at||""))));
 if(!Number.isFinite(time)||recent.length<minMessages)return false;
 const last=Date.parse(recent[recent.length-1].created_at);
 return last<=time+60000&&time-last<=60*60000&&
   recent.some(x=>x.role==="user")&&recent.some(x=>x.role==="assistant");
}

/**
 * Review-required tools may be rejected by provenance, semantic grounding,
 * policy, or deduplication. Mere use of a tool is not a proposal receipt.
 * This detector sees only server-recorded tool names and registered proposals;
 * never model text, languages, or user phrasing.
 */
export function unregisteredReviewAttempt(tools,proposals,policyMode){
 if(!Array.isArray(tools)||!tools.length||!Array.isArray(proposals)||proposals.length)
   return false;
 if(typeof policyMode!=="function")return false;
 return tools.some(name=>typeof name==="string"&&policyMode(name)==="confirm");
}
