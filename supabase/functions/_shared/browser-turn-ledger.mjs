/* A user turn is canonical only with an owner-authorized conversation and
 * a scope resolved by MINDS. The browser may supply an idempotency UUID,
 * never scope or database ownership.
 */
export function browserTurnId(value){
  const id=String(value||"").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:null;
}
export function canonicalBrowserOwnerRow({userId,conversationId,requestId,message,scope}){
  if(!userId||!conversationId||!browserTurnId(requestId)||!String(message||"").trim())
    throw new Error("invalid_browser_owner_turn");
  if(scope?.version!==1||!["global","project","work_thread"].includes(scope.kind))
    throw new Error("invalid_browser_turn_scope");
  const ref=scope.kind==="global"?null:String(scope.ref||"");
  const key=scope.kind==="global"?"global":scope.kind+":"+ref;
  if((scope.kind!=="global"&&!ref)||String(scope.key||"")!==key)
    throw new Error("invalid_browser_turn_scope");
  return {
    user_id:userId,conversation_id:conversationId,client_key:requestId,
    role:"user",content:String(message).trim(),provisional:false,citations:[],
    exposure_scope_version:1,exposure_scope_kind:scope.kind,
    exposure_scope_ref:ref,exposure_scope_key:key,provenance_class:"owner",
    metadata:{app:"isabella",source:"chat_browser",request_id:requestId,
      turn_delivery:"received",exposure_scope:{version:1,kind:scope.kind,ref,key}}
  };
}
export function sameBrowserOwnerTurn(row,canonical){
  return !!row&&row.role==="user"&&row.content===canonical.content&&
    row.exposure_scope_version===1&&
    row.exposure_scope_kind===canonical.exposure_scope_kind&&
    (row.exposure_scope_ref||null)===canonical.exposure_scope_ref&&
    row.exposure_scope_key===canonical.exposure_scope_key;
}
