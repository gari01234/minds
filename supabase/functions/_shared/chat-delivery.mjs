import {failureLine} from "./assistant-voice.mjs";
/* Phase 1, step 3a: no message from Gari without an answer in the conversation.
 *
 * turn_diagnostics (27.10–07.11) explained the silences:
 *  - 03.11, late evening: the turn succeeded in 5 s, but the reply lived only in the phone, which was
 *    closed before it arrived; the delivery receipt was only read back within 30 minutes.
 *  - 30.10, afternoon: the model finished without any text (empty_response) after 23 s.
 *  - 31.10, night: the OpenAI account had run out of credit; the error was never kept.
 * So the server now writes the answer (or an honest notice) into the conversation itself, under a key
 * the app derives from the same request id: the app's own copy updates that row instead of adding one.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The conversation key of Isabella's answer to the browser turn `requestId` (a UUID, like the app's ids).
 * @param {string} requestId */
export function assistantKeyFor(requestId){
  const id=String(requestId||"").toLowerCase();
  if(!UUID.test(id))return null;
  return id.slice(0,14)+(id[14]==="5"?"3":"5")+id.slice(15);
}

/** What Gari reads when a turn fails, in the app's voice (it is not Isabella speaking). */
export function failureNotice(kind,profile="window"){
  return failureLine(kind,profile);
}

export function isOutOfCredit(status,payload){
  const text=String(payload?.error?.message||"")+" "+String(payload?.error?.code||"")+" "+String(payload?.error?.type||"");
  return (status===429||status===402||status===400)&&/credit|quota|billing|insufficient_quota/i.test(text);
}

/** The canonical row for Isabella's answer (or a notice) to one browser turn.
 * @param {{userId:string,conversationId:string,requestId:string,content:string,scope:any,author?:string,sources?:any[],model?:string|null,outcome?:string}} arg */
export function canonicalAssistantRow({userId,conversationId,requestId,content,scope,author="isabella",sources=[],model=null,outcome="answered"}){
  const key=assistantKeyFor(requestId);
  if(!userId||!conversationId||!key||!String(content||"").trim())return null;
  const s=scope&&typeof scope==="object"?scope:null;
  if(!s||s.version!==1||!s.kind)return null;
  return {
    user_id:userId,conversation_id:conversationId,role:"assistant",content:String(content).slice(0,100000),
    model,provisional:false,citations:Array.isArray(sources)?sources.slice(0,8):[],client_key:key,
    exposure_scope_version:1,exposure_scope_kind:s.kind,exposure_scope_ref:s.ref?String(s.ref):null,
    metadata:{app:"isabella",source:"isabella_chat_server",author,durable_request_id:String(requestId),
      durable_status:author==="system"?"failed":"completed",turn_outcome:outcome,exposure_scope:s,sources:Array.isArray(sources)?sources.slice(0,8):[]}
  };
}
