/* Calendar Semantic Boundary v0.1
 * The model interprets natural language into a typed temporal claim.
 * Deterministic code validates the claim's provenance and mathematical
 * consistency. It must not reinterpret the user's utterance with lexical
 * date/intent rules or silently invent/replace the semantic meaning.
 */
/** @typedef {{kind:"verified"|"unchanged",proposal:any,basis?:string,evidence?:any,ownerEvidence?:boolean} | {kind:"needs_clarification",reason:string,detail?:string|null}} CalendarSemanticResult */
/** @typedef {{kind:"valid"|"unchanged"} | {kind:"needs_clarification",reason:string,detail?:string|null}} CalendarClockResult */
const isoDay=s=>{
  if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+"T12:00:00Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
const evidenceSpan=(sources,quote)=>{
  const q=String(quote||"").toLocaleLowerCase("es").trim();
  if(q.length<2||q.length>240)return false;
  // An explicit server-verified continuation has TWO owner turns. Evidence
  // must occur wholly in one turn, never across a concatenation boundary.
  const items=Array.isArray(sources)?sources:[sources];
  return items.some(x=>String(x||"").toLocaleLowerCase("es").includes(q));
};
/** @returns {{kind:"needs_clarification",reason:string,detail:string|null}} */
const failure=(reason,detail)=>({kind:"needs_clarification",reason,detail:detail||null});
const weekday=day=>new Date(day+"T12:00:00Z").getUTCDay();
/** @returns {CalendarSemanticResult} */
// 11.11.2026 (decision of Gari): the model interprets; hard checks stay only where something runs
// without the owner seeing it. A proposal always goes to the owner's review card, so the date no
// longer needs a literal quote from the owner's words: it may come from an attached photo, an earlier
// turn or plain inference. What the server can check, it still checks (valid day, weekday, relative
// arithmetic). `ownerEvidence` says whether the quote really sits in the owner's turn; only then may
// the caller grant direct creation without review.
export function verifyCalendarSemanticProposal(proposal,grounding,sourceMessage,localDate){
  if(!proposal||!["task","event"].includes(proposal.kind)||
     !["create","update"].includes(proposal.action))
    return {kind:"unchanged",proposal};
  if(proposal.clear_date||proposal.date==null||proposal.date===""){
    if(proposal.kind==="event"&&proposal.action==="create")
      return failure("event_date_required");
    return {kind:"verified",proposal,basis:"undated_or_unchanged",ownerEvidence:false};
  }
  if(!isoDay(localDate))return failure("server_local_date_unavailable");
  if(!isoDay(proposal.date))return failure("invalid_proposed_date");
  const g=grounding&&typeof grounding==="object"&&["absolute","relative"].includes(grounding.mode)?grounding:null;
  if(!g)return {kind:"verified",proposal,basis:"interpreted",ownerEvidence:false,evidence:null};
  const ownerEvidence=evidenceSpan(sourceMessage,g.source_excerpt);
  let date=proposal.date;
  if(g.mode==="relative"){
    const delta=g.offset_days;
    if(!Number.isInteger(delta)||delta< -366||delta>366)
      return failure("invalid_relative_offset");
    const dateTime=Date.parse(localDate+"T12:00:00Z")+delta*86400000;
    const derived=new Date(dateTime).toISOString().slice(0,10);
    if(!isoDay(derived))return failure("invalid_derived_date");
    // A relative expression is *interpreted* by the model; day arithmetic
    // belongs to the server, not the model. Never trust its supplied ISO date.
    date=derived;
  }
  if(g.mode==="absolute"&&g.offset_days!=null)
    return failure("absolute_and_relative_basis_conflict");
  if(g.weekday!=null){
    if(!Number.isInteger(g.weekday)||g.weekday<0||g.weekday>6)
      return failure("invalid_weekday");
    if(weekday(date)!==g.weekday)
      return failure("claimed_weekday_disagrees_with_calendar");
  }
  return {kind:"verified",proposal:{...proposal,date},basis:ownerEvidence?g.mode:g.mode+"_interpreted",ownerEvidence,
    evidence:{source_excerpt:String(g.source_excerpt||"").trim().slice(0,240),
      weekday:g.weekday??null,
      ...(g.mode==="relative"?{offset_days:g.offset_days}:{})}};
}
/** @returns {CalendarClockResult} */
export function validatedCalendarClock(proposal){
  if(!proposal||proposal.kind!=="event"||!["create","update"].includes(proposal.action))
    return {kind:"unchanged"};
  if(proposal.all_day)return {kind:"valid"};
  if(proposal.time!=null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(proposal.time)))
    return failure("invalid_calendar_clock");
  if(proposal.duration_minutes!=null&&(!Number.isInteger(proposal.duration_minutes)||
     proposal.duration_minutes<1||proposal.duration_minutes>720))
    return failure("invalid_calendar_duration");
  if(proposal.action==="create"&&(!proposal.time||!proposal.duration_minutes))
    return failure("event_time_and_duration_required");
  return {kind:"valid"};
}
