/* P0 Issue #138: one capability admission contract, independent of phrasing.
 * An uncertain or unavailable classifier must never authorize text-only
 * execution. A model decision is routing evidence, NOT action permission.
 */
export const TURN_CONTRACT_VERSION="turn_capability_v0.1";
const MODES=new Set(["read_only","calendar_mutation","other_capability","uncertain"]);
export function normalizeTurnCapability(value){
  const mode=String(value?.mode||"");
  const confidence=String(value?.confidence||"");
  // Only an explicit high-confidence read-only judgment may enter text-only.
  if(!MODES.has(mode)||!["high","medium","low"].includes(confidence))
    return {mode:"uncertain",confidence:"low",text_only:false,focused_calendar:false};
  return {
    mode,confidence,
    text_only:mode==="read_only"&&confidence==="high",
    focused_calendar:mode==="calendar_mutation"&&confidence!=="low"
  };
}
export function turnCapabilityResponse(value){
  const result=normalizeTurnCapability(value);
  return {
    fallback:true,reason:"capability_route_required",
    turn_contract:TURN_CONTRACT_VERSION,
    capability_mode:result.focused_calendar?"calendar_mutation":"action_capable"
  };
}
export function validatedTurnCapabilityHint(value){
  // Advisory scope only; never confers permissions or claims that an
  // externally supplied proposal has been accepted or executed.
  return value==="calendar_mutation"?"calendar_mutation":null;
}
