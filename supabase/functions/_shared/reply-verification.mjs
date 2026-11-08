/* Phase 1, step 7: verification instead of substitution.
 *
 * On a turn with a change awaiting Gari's confirmation, the app always shows its own system line
 * (what is pending) with the review card; that line is the authority. Isabella's prose is shown as
 * well, above it, only when it does not claim that the change is already done. This is a display
 * decision with a safe fallback (system line only), never a permission: receipts stay structural.
 * Deliberately conservative: a false alarm only hides her comment for that turn.
 */
import {isSystemNotice} from "./system-notice.mjs";

const fold=(s)=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
// Completion claims in the languages Gari uses (es/de/en). "listo para…" is a state, not a claim.
const CLAIMS=[
  /(^|[^a-z])(list[oa]s?|hecho|hechos|ok,? hecho)([^a-z]|$)(?!\s*para)/,
  /\bya (esta|estan|quedo|quedaron|lo tienes|la tienes|los tienes|las tienes|lo hice|esta hecho)\b/,
  /\bqued(a|an|o|aron) (guardad|anotad|apuntad|agregad|anadid|cread|movid|cambiad|actualizad|borrad|eliminad|programad|marcad|archivad|completad)/,
  /\bhe (anadido|agregado|creado|movido|cambiado|borrado|eliminado|guardado|actualizado|puesto|apuntado|anotado|completado|archivado|programado|marcado|reprogramado)\b/,
  /\b(anadi|agregue|movi|cambie|borre|elimine|guarde|actualice|apunte|anote|archive|programe|marque|reprograme)\b/,
  /\b(erledigt|eingetragen|angelegt|verschoben|geloscht|gespeichert|hinzugefugt)\b/,
  /\b(done|i'?ve (added|created|moved|deleted|saved|scheduled)|i (added|created|moved|deleted|saved|scheduled))\b/
];
export function claimsCompletion(text){
  const t=fold(text);
  return CLAIMS.some(r=>r.test(t));
}
/** Isabella's own words on a turn with pending changes, or null when they cannot be shown as hers. */
export function verifiedPendingProse(text,{maxChars=1500}={}){
  const t=String(text||"").trim();
  if(!t||t.length>maxChars)return null;
  if(isSystemNotice(t))return null;
  if(claimsCompletion(t))return null;
  return t;
}
