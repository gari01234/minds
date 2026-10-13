/* P0 #138 — A clarification grants a narrowly scoped continuation of exactly
 * the source owner turn, not permission to replay an unrelated conversation.
 * All fields are server-produced and subsequently read from canonical storage.
 */
export const CLARIFICATION_WINDOW_MS=45*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validContinuationToken(token){
  return !!token&&typeof token==="object"&&UUID.test(String(token.source_turn_id||""))&&
    UUID.test(String(token.receipt_id||""));
}
export function makeClarification({sourceTurnId,receiptId,question,capability,issuedAt}){
  if(!UUID.test(String(sourceTurnId||""))||!UUID.test(String(receiptId||""))||
    !String(question||"").trim())throw Error("invalid_clarification_receipt");
  if(!["calendar","general","work"].includes(String(capability||"")))throw Error("invalid_clarification_capability");
  return {version:1,source_turn_id:sourceTurnId,receipt_id:receiptId,
    question:String(question).trim().slice(0,600),capability,
    issued_at:issuedAt||new Date().toISOString()};
}
export function validStoredClarification({stored,provided,ownerTurn,now=Date.now(),latestOwnerTurnId=null}){
  if(!validContinuationToken(provided)||!stored||stored.version!==1||
    stored.source_turn_id!==provided.source_turn_id||
    stored.receipt_id!==provided.receipt_id||!String(stored.question||"").trim())return false;
  if(!ownerTurn||ownerTurn.role!=="user"||ownerTurn.client_key!==stored.source_turn_id||
    ownerTurn.exposure_scope_version!==1||ownerTurn.provenance_class!=="owner")return false;
  if(stored.consumed_by&&stored.consumed_by!==provided.current_turn_id)return false;
  if(latestOwnerTurnId&&latestOwnerTurnId!==stored.source_turn_id&&
    latestOwnerTurnId!==provided.current_turn_id)return false;
  const created=Date.parse(String(stored.issued_at||""));
  return Number.isFinite(created)&&created<=now+60000&&now-created<=CLARIFICATION_WINDOW_MS;
}
export function boundedContinuationEvidence({sourceMessage,question,currentMessage}){
  return "CONTINUACIÓN DE ACLARACIÓN VERIFICADA (únicamente este turno propietario, no memoria transversal):\n"+
    "SOLICITUD ORIGINAL:\n"+String(sourceMessage||"").slice(0,1600)+"\n"+
    "PREGUNTA DE ISABELLA:\n"+String(question||"").slice(0,600)+"\n"+
    "RESPUESTA ACTUAL DEL USUARIO:\n"+String(currentMessage||"");
}
