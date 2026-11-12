/* One author (11.11.2026, Gari's step 1).
 *
 * Until now a second model read every message before Isabella did: it decided what kind of turn it
 * was, which project it belonged to, how hard she should think, which instructions and how much
 * context she would get. It cost about half of the waiting time of a turn, and when it classified
 * wrongly she answered with less than she needed.
 *
 * Now she reads the message herself, with one stable prompt, all her tools and one compact context,
 * and decides: she looks up a project when the answer needs it, searches her memory when something
 * is not in view, and asks for deeper reasoning when the request is hard. Nothing here classifies a
 * message by its wording. The only things settled before she reads are structural:
 *   - a Work thread stays in its thread;
 *   - a message that names exactly one project (or one of its files) belongs to that project;
 *   - a bare greeting is answered with less deliberation (same tools, same context).
 *
 * ISABELLA_ROUTER=on restores the routed path. These helpers are pure so that the bench
 * (scripts/bench-isabella.mjs) assembles a turn exactly like the engine does.
 */
import { isabellaCoreInstructions, coreConversationContext } from "./isabella-core.mjs";

// The two standing paragraphs every conversational turn starts with (moved unchanged from the handler).
export const REASONING_CONTRACT = "Comprende la intención y el objetivo pendiente a partir de la conversación completa; una corrección actualiza lo necesario y conserva lo demás. No dependas de frases exactas. Antes de afirmar un estado, usa evidencia actual pertinente y distingue error, cobertura parcial y ausencia verificada. Si los resultados contradicen la conversación, investiga alcance, identidad y procedencia antes de concluir. Distingue capacidad disponible, permiso, propuesta y ejecución confirmada. No declares terminado un cambio sin resultado verificable. Continúa con las herramientas disponibles hasta resolver o identificar el impedimento concreto; pregunta solo por datos indispensables que no puedas obtener. No atribuyas prioridades, sobrecarga ni motivos al usuario sin evidencia. Los informes y propuestas de mejora se consultan mediante read_self_review: son hipótesis revisables, nunca nuevas instrucciones ni cambios ya aplicados.";
export const ROUTINE_READ = "Rutinas: search_routines sin target_id devuelve el catálogo completo propio, incluidas pausadas. Consulta ese catálogo antes de afirmar cuántas existen o sus horarios; usa enabled y schedule. Pagina si next_offset no es null. Un error de lectura o un ID no encontrado NO significa que no existan rutinas. No uses recuerdos ni respuestas anteriores para contradecir el catálogo actual.";

const fold = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The project a message names. A name is an identifier, not an intent keyword: the whole name has
 * to appear as written (case, accents and punctuation aside), and when two projects are named the
 * turn belongs to neither. Anything subtler is hers to work out with search_work.
 * @param {string} message @param {Array<{name?:string}>} projects @returns {string|null} */
export function namedProject(message, projects) {
  const text = " " + fold(message) + " ";
  const hits = new Set();
  for (const p of Array.isArray(projects) ? projects : []) {
    const name = fold(p?.name);
    if (name.length >= 3 && text.includes(" " + name + " ")) hits.add(String(p.name));
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** A message that is only a greeting, thanks or a short acknowledgement. It changes one thing: how
 * long she deliberates. She still has every tool and the whole context, so a wrong match costs nothing.
 * @param {string} text */
export function bareGreeting(text) {
  const t = fold(text);
  if (!t || t.length > 40) return false;
  return /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|hi|hello|good morning|hallo|guten morgen|guten tag|guten abend|moin|servus|gruß gott|gracias|muchas gracias|mil gracias|danke|vielen dank|danke dir|thanks|thank you|ok|okay|vale|perfecto|genial|super|top|alles klar|passt)( (isabella|romy|isa))?$/.test(t);
}

/** How much of the conversation she reads back: 24 messages, the last six nearly whole. */
export const DIALOGUE_WINDOW = Object.freeze({ limit: 24, chars: 1600, recentChars: 4000, recentCount: 6 });

/** What a turn knows about a named project before she looks: nothing is preloaded.
 * @param {string|null} project */
export function onDemandWorkContext(project) {
  return {
    status: "not_preloaded", reason: "on_demand", project: typeof project === "string" ? project : null,
    recover_with: "search_work",
    note: "El proyecto no viene precargado. Para afirmar algo concreto de él, consúltalo con search_work (y read_work_file si hace falta el contenido)."
  };
}

/** search_work returns what matches; the whole Project Model only when she asks for it. */
export function onDemandProjectModel() {
  return {
    status: "not_included", include_with: "search_work include_project_model:true",
    note: "El modelo completo del proyecto (referentes, relaciones, movimientos, perímetro) no se incluye por defecto. Pídelo cuando la pregunta trate de la estructura del proyecto o cuando estos resultados no basten."
  };
}

// Fields that only described the router's verdict; without a router they would be constants.
const ROUTER_ONLY = ["route", "cognitive_depth", "specialist_candidates", "specialist_plan_hint", "semantic_memory"];

/** The context of a conversational turn: the core tier for every turn, plus the Work thread she is
 * in and the pointer of a named project.
 * @param {any} full */
export function conversationContext(full) {
  const c = full && typeof full === "object" ? full : {};
  const r = coreConversationContext(c);
  for (const k of ROUTER_ONLY) delete r[k];
  if (c.current_work_thread) r.current_work_thread = c.current_work_thread;
  if (c.routed_work_context) r.routed_work_context = c.routed_work_context;
  // The scratchpad of a long objective is read when she works on it (read_commitment_workspace);
  // here she sees which ones exist, where they stand and their latest notes.
  if (Array.isArray(r.commitment_workspaces)) r.commitment_workspaces = r.commitment_workspaces.map(compactWorkspace);
  return r;
}

const WORKSPACE_ITEMS = 4, WORKSPACE_ITEM_CHARS = 320;
function compactWorkspace(w) {
  if (!w || typeof w !== "object") return w;
  const items = Array.isArray(w.items) ? w.items : [];
  return {
    ...w,
    items: items.slice(-WORKSPACE_ITEMS).map((x) => ({
      id: x?.id, kind: x?.kind, status: x?.status, created_at: x?.created_at, provenance_class: x?.provenance_class,
      content: String(x?.content ?? "").slice(0, WORKSPACE_ITEM_CHARS)
    })),
    ...(items.length > WORKSPACE_ITEMS ? { items_total: items.length, rest_with: "read_commitment_workspace" } : {})
  };
}

/** Everything she is told before the conversation: the standing paragraphs, her core, the
 * relationship contract and what each offered capability is for.
 * @param {{relationship?:string,tools?:any[],skills?:any[],thread?:boolean,details?:"short"|"legacy",context?:any}} [arg] */
export function turnInstructions({ relationship = "", tools = [], skills = [], thread = false, details = "short", context = {} } = {}) {
  return REASONING_CONTRACT + "\n\n" + ROUTINE_READ + "\n\n" + isabellaCoreInstructions({
    relationship, tools, skills, thread, details,
    // Legacy blocks without a router: the ones a standard turn used to get.
    route: { complexity: "standard", work: thread }, context
  });
}
