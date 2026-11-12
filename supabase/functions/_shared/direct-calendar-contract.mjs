/* «Deshacer en lugar de confirmar» (11.11.2026, Gari's step 4).
 *
 * Creating an own task or a timed event is reversible and low-risk. When the owner asks for it in a
 * turn, it is created at once and can be undone for a few minutes; a review card stays for what is
 * not reversible that way (changing, moving, deleting) and for what she proposes on her own.
 *
 * What must be the owner's is the request itself, in this turn. The title, the day and the hour can
 * come from an attachment, an earlier message or her own reading of it: she interprets, like a person
 * would. Before 11.11 every one of those had to be a literal quote of the owner's message, so «agrega
 * este Termin» with a screenshot, or «sí, apúntalo» after her own suggestion, still needed a card.
 *
 * The database repeats the checks that matter (minds_commit_direct_calendar_create_v01, v03).
 */

// Same normalisation as the SQL: lower case, and anything that is not a letter, a digit or a space
// becomes a space. A copied quote survives a change of case or punctuation.
const plain=v=>String(v||"").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu," ").replace(/\s+/g," ").trim();

/** Did the owner say this? `excerpt` is what she points at as the request («sí», «apúntame eso»,
 * «agrega este Termin»); it has to be part of one of the owner's own messages of this turn. */
export function ownerAsked(source,excerpt){
  const quote=plain(excerpt);
  return quote.length>=2&&quote.length<=900&&plain(source).includes(quote);
}
// The owner's words for a direct creation: this turn and, after a server-verified clarification,
// the turn it answers. Retrieved text never enters here.
export function directOwnerTexts(continuation,currentMessage){
  const own=[String(currentMessage||"")];
  const source=continuation&&typeof continuation.source_message==="string"?continuation.source_message:"";
  return source.trim()?[source,...own]:own;
}
// Text from outside the owner's own material: when it entered the turn, a creation waits for a card.
// (The provider's web search is tracked separately by the engine.) Reading the calendar, the memory,
// Work or a skill does not disqualify: those are the owner's own things.
export const DIRECT_BLOCKING_TOOLS=new Set(["web_search","consult_sofia","delegate_specialist","orchestrate_specialists"]);
export function directToolHistorySafe(usedTools){
  const tools=Array.isArray(usedTools)?usedTools:[];
  return !tools.some(t=>DIRECT_BLOCKING_TOOLS.has(String(t)));
}
const empty=v=>v==null||v===""||(typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===0);
/** What can be created without a card: a new task, or a new timed event of 1–720 minutes. Nothing
 * recurring, nothing all-day (the direct executor does not write those), nothing that targets an
 * existing item. */
export function directCreatable(proposal){
  if(!proposal||proposal.action!=="create"||!["task","event"].includes(proposal.kind))return false;
  if(!String(proposal.title||"").trim())return false;
  if(!empty(proposal.target_id)||!empty(proposal.target_title)||!empty(proposal.recurrence))return false;
  if(proposal.kind==="task")return true;
  const minutes=Number(proposal.duration_minutes);
  return proposal.all_day!==true&&/^\d{4}-\d{2}-\d{2}$/.test(String(proposal.date||""))&&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(String(proposal.time||""))&&Number.isInteger(minutes)&&minutes>=1&&minutes<=720;
}
// Missing duration is *visibly defaulted*: 60 minutes, marked so the app can show it as editable.
export function withDefaultEventDuration(proposal){
  if(proposal?.kind!=="event"||proposal?.action!=="create"||
     typeof proposal?.time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(proposal.time)) return proposal;
  if(proposal.duration_minutes!=null&&proposal.duration_minutes!=="")return {...proposal,duration_defaulted:false};
  return {...proposal,duration_minutes:60,duration_defaulted:true};
}
const isCreate=p=>(p?.kind==="task"||p?.kind==="event")&&p.action==="create";
/** The turn's creations go through without cards only when every prepared change of the turn is an
 * authorized creation (the app applies them as one batch with one Undo) and nothing from outside
 * the owner's material was read. A turn that also changes or deletes something shows cards for all. */
export function authorizedDirectBatch(proposals,ids,usedTools){
  if(!Array.isArray(proposals)||!proposals.length||!Array.isArray(ids)||ids.length!==proposals.length)return null;
  const all=proposals.every(p=>isCreate(p)&&typeof p.request_id==="string"&&ids.includes(p.request_id));
  if(!all||!directToolHistorySafe(usedTools)||new Set(ids).size!==ids.length)return null;
  return {version:1,mode:"direct_create_v1",request_ids:ids.slice()};
}
