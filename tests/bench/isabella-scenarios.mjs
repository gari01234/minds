/* Isabella bench · scenarios (11.11.2026).
 *
 * Everything here is invented: the people (Mara, Jonas, Elke), the projects (Lindenhof, Atelier Nord),
 * the manufacturer, the dates. No real person, client or project of Gari's appears in this file.
 *
 * Each scenario is one moment of a conversation and what a capable assistant would do with it. The
 * expectations look at what she does (which tools she uses, with which arguments) and at a few
 * properties of what she says; they never compare wording. They are the cases the long instruction
 * blocks and the router existed for, so that removing both can be checked instead of believed.
 *
 * `route` is what a perfect router would have decided: the «legacy» arm gets it for free, which is
 * the best case of the old path.
 */

export const NOW = { date: "2026-11-11", weekday: "miércoles", time: "09:40", tomorrow: "2026-11-12" };

const called = (t, name) => t.calls.some((c) => c.name === name);
const anyCalled = (t, names) => t.calls.some((c) => names.includes(c.name));
const first = (t, name) => t.calls.find((c) => c.name === name);
const args = (t, name) => first(t, name)?.args || {};
const fold = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const says = (t, re) => re.test(fold(t.text));
const creates = (t) => t.calls.filter((c) => c.name === "create_task" || c.name === "create_event");
const quotedFrom = (excerpt, ...sources) => {
  const q = fold(excerpt).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  return q.length >= 2 && sources.some((s) => fold(s).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").includes(q));
};
const WORK_READS = ["search_work", "read_work_file", "browse_work_sources", "find_work_occurrences", "search_work_threads"];

/** The project a Work question is about, as the old path preloaded it and as search_work returns it. */
export const LINDENHOF = {
  status: "ok",
  project: { id: "p-lindenhof", name: "Lindenhof", client_key: "LIN" },
  files: [
    { id: "f-101", name: "2026-11-04_Email_Lichtwerk_Lieferzeiten.eml", kind: "email", created_at: "2026-11-04T10:12:00Z" },
    { id: "f-102", name: "Lichtplanung_Foyer_Rev-C.pdf", kind: "pdf", created_at: "2026-10-28T08:00:00Z" },
    { id: "f-103", name: "Protokoll_Baubesprechung_07.pdf", kind: "pdf", created_at: "2026-11-06T16:30:00Z" }
  ],
  tasks: [
    { id: "t-1", title: "Leuchtenmuster Foyer freigeben", date: "2026-11-13", done: false },
    { id: "t-2", title: "Bodenbelag Foyer mit Bauherr klären", date: null, done: false }
  ],
  claims: [
    { id: "c-1", status: "confirmed", claim: "Im Foyer werden Pendelleuchten Typ P2 eingesetzt.", source_file: "Lichtplanung_Foyer_Rev-C.pdf" },
    { id: "c-2", status: "proposed", claim: "Bodenbelag Foyer: Terrazzo oder Eichenparkett, offen.", source_file: "Protokoll_Baubesprechung_07.pdf" }
  ],
  source_segments: [
    { file_id: "f-101", file: "2026-11-04_Email_Lichtwerk_Lieferzeiten.eml", locator: "body", text: "Von: Jonas Weber, Lichtwerk GmbH. Sehr geehrter Herr Architekt, die Pendelleuchten P2 können wir frühestens in KW 3/2027 liefern, sofern die Freigabe der Muster bis 20.11.2026 vorliegt. Bei späterer Freigabe verschiebt sich die Lieferung auf KW 7. Mit freundlichen Grüßen, Jonas Weber" },
    { file_id: "f-103", file: "Protokoll_Baubesprechung_07.pdf", locator: "S. 2", text: "TOP 4 Bodenbelag Foyer: Bauherr tendiert zu Terrazzo, Entscheidung in der nächsten Besprechung." }
  ],
  threads: [{ id: "th-1", title: "Lichtplanung", summary: "Muster P2 bestellt; Lieferzeit hängt an der Freigabe bis 20.11." }]
};

const radar = {
  generado: NOW.date,
  proyectos: [{
    proyecto: "Lindenhof",
    temas: [{ titulo: "Lichtplanung", estado: "Muster P2 pendientes de Freigabe" }, { titulo: "Bodenbelag Foyer", estado: "abierto" }],
    plazos: [{ que: "Freigabe Leuchtenmuster (Lichtwerk)", fecha: "2026-11-20" }],
    por_confirmar: [{ que: "Bodenbelag Foyer: Terrazzo oder Eichenparkett" }]
  }, { proyecto: "Atelier Nord", temas: [{ titulo: "Bauantrag", estado: "eingereicht" }], plazos: [], por_confirmar: [] }]
};

/** The private context of a turn, in the engine's own shape. */
export function baseContext(overrides = {}) {
  return {
    relationship_policy_version: "bench",
    memoria_de_isabella: { paginas: [{ tipo: "gari", nombre: "Gari", resumen: "Arquitecto. Lleva Lindenhof y Atelier Nord. Prefiere respuestas cortas y directas." }], hilos: [], seguimientos_programados: [] },
    radar_work: radar,
    capability_registry_version: "bench",
    available_capabilities: [],
    current_work_thread: null,
    current_date: NOW.date,
    situation_weather: null,
    tomorrow_date: NOW.tomorrow,
    tomorrow_tasks: [{ title: "Leuchtenmuster Foyer freigeben", date: NOW.tomorrow, project: "Lindenhof", done: false }],
    still_open_before_tomorrow: [],
    tomorrow_events: [{ title: "Baubesprechung Lindenhof", date: NOW.tomorrow, display_time: "09:30", duration_minutes: 90, project: "Lindenhof" }],
    current_local_datetime: NOW.date + " " + NOW.time,
    current_local_time: NOW.time,
    current_daypart: "mañana",
    current_weekday: NOW.weekday,
    timezone: "Europe/Berlin",
    client_current_date: NOW.date,
    agenda_context_source: "server_canonical",
    today_events: [{ title: "Jour fixe Atelier Nord", date: NOW.date, display_time: "14:00", duration_minutes: 60, project: "Atelier Nord" }],
    today_tasks: [{ title: "Angebot Lichtwerk prüfen", date: NOW.date, project: "Lindenhof", done: false }],
    overdue_tasks: [],
    undated_tasks: [{ title: "Bodenbelag Foyer mit Bauherr klären", project: "Lindenhof", done: false }],
    upcoming: [{ kind: "event", title: "Reunión con Mara", date: "2026-11-13", display_time: "11:00", duration_minutes: 60, project: null },
      { kind: "event", title: "Entrega Bauantrag Atelier Nord", date: "2026-11-17", display_time: "10:00", duration_minutes: 30, project: "Atelier Nord" }],
    taxonomy: { projects: ["Lindenhof", "Atelier Nord"], categories: ["Arbeit", "Personal"] },
    cognitive_depth: "standard",
    route: {},
    exposure_scope: { kind: "global", key: "global" },
    exposure_policy: { version: "scoped_exposure_v1", legacy_history_auto_injected: false, cross_scope_default: false },
    specialist_candidates: [], specialist_plan_hint: null,
    reply_context: null,
    standing_intent_matches: [], active_expectations: [], active_commitments: [], commitment_workspaces: [], active_mission_runs: [],
    routed_work_context: null, routed_sofia_context: null,
    memory_checkpoint: { summary: "Habéis hablado estos días de la Lichtplanung de Lindenhof y del Bauantrag de Atelier Nord.", open_loops: [] },
    recalled_memory: [], semantic_memory: [], entity_memory: [],
    recent_activity: [], proposal_feedback: [],
    personal_model_claims: [{ id: "m-1", claim_type: "preference", claim: "Prefiere reuniones por la mañana.", confidence: "confirmed" }],
    personal_model_policy: null,
    preferences: { assistant_behavior_rules: [], operating_rules: [] },
    ...overrides
  };
}

const proposal = (status = "pending_user_confirmation") => ({ status, request_id: "00000000-0000-4000-8000-000000000001",
  note: status === "direct_creation_authorized"
    ? "La app lo guarda ahora, lo confirma con su propia línea y deja «Deshacer» unos minutos; no repitas los datos."
    : "Todavía no está aplicado: Gari lo confirma en la tarjeta. No digas que está hecho." });

/** What a tool answers in the bench when a scenario does not say otherwise. */
export function defaultToolResult(name, a, scenario) {
  if (name === "create_task" || name === "create_event") {
    const own = [scenario.message, ...(scenario.history || []).filter((m) => m.role === "user").slice(-1).map((m) => m.content)];
    return proposal(quotedFrom(a?.direct_user_excerpt, ...own) ? "direct_creation_authorized" : "pending_user_confirmation");
  }
  if (/^(update|delete|complete|archive|pause|resume|propose|create)_/.test(name)) return proposal();
  if (name === "search_calendar") return { status: "ok", range: { from: a?.from || NOW.date, to: a?.to || NOW.date },
    events: [{ title: "Baubesprechung Lindenhof", date: NOW.tomorrow, display_time: "09:30", duration_minutes: 90 },
      { title: "Reunión con Mara", date: "2026-11-13", display_time: "11:00", duration_minutes: 60 },
      { title: "Entrega Bauantrag Atelier Nord", date: "2026-11-17", display_time: "10:00", duration_minutes: 30 },
      { title: "Workshop Fassade", date: "2026-11-18", display_time: "09:00", duration_minutes: 240 },
      { title: "Bemusterung Leuchten", date: "2026-11-19", display_time: "14:00", duration_minutes: 60 }],
    tasks: [{ title: "Leuchtenmuster Foyer freigeben", date: "2026-11-13", done: false }, { title: "Kostenschätzung aktualisieren", date: "2026-11-18", done: false }] };
  if (name === "search_routines") return { status: "ok", routines: [{ id: "r-1", title: "Resumen de la mañana", enabled: true, schedule: { kind: "daily", time: "07:00" } }], next_offset: null };
  if (name === "search_memory") return { status: "ok", lexical: [{ kind: "conversation", content: "Gari: con el parquet quedamos en pedir dos muestras de roble y decidir después de verlas en obra.", created_at: "2026-10-21T17:05:00Z", provenance_class: "owner", source_scope_key: "project:p-atelier" }], semantic: [], entities: [] };
  if (name === "search_work" || name === "search_work_threads") return LINDENHOF;
  if (name === "read_work_file") return { status: "ok", file: LINDENHOF.files[0], text: LINDENHOF.source_segments[0].text };
  if (name === "find_work_occurrences") return { status: "ok", coverage: { complete: true, sources_scanned: 3, sources_total: 3 },
    occurrences: [{ file: "Lichtplanung_Foyer_Rev-C.pdf", locator: "S. 3", text: "Wand W12: F90" }, { file: "Protokoll_Baubesprechung_07.pdf", locator: "S. 1", text: "Türen Treppenhaus F90 bestätigt" }], next_cursor: null };
  if (name === "browse_work_sources") return { status: "ok", sources: LINDENHOF.files, next_cursor: null };
  if (name === "check_watch_capability") return { status: "ok", capability: "unavailable", reason: "no_channel_for_external_source", alternatives: ["chat_reminder", "manual_check"] };
  if (name === "load_skill") return { status: "ok", skill: { slug: a?.slug || a?.skill || "acta-de-obra", instructions: "Acta de obra: asistentes, puntos tratados numerados, acuerdos con responsable y fecha, próximos pasos. Tono sobrio." } };
  if (name === "execute_artifact_task" || name === "create_artifact") return { status: "completed", artifact: { id: "a-1", title: a?.title || "Documento", filename: "documento.pdf" } };
  if (name === "search_commitments") return { status: "ok", commitments: [] };
  if (name === "search_generated_artifacts") return { status: "ok", artifacts: [] };
  if (name === "remember_information" || name === "remember_relation" || name === "record_personal_model_claim") return { status: "saved" };
  if (name === "offer_quick_replies") return { status: "ok" };
  if (name === "schedule_follow_up") return { status: "scheduled" };
  return { status: "ok" };
}

const emailShot = "[Captura adjunta de un correo]\nVon: Jonas Weber <j.weber@lichtwerk.example>\nGesendet: Dienstag, 10. November 2026 16:42\nBetreff: Bemusterung Pendelleuchten P2\n\nSehr geehrter Herr Architekt,\ngern bestätige ich die Bemusterung der Pendelleuchten am Donnerstag, 19.11.2026 um 14:00 Uhr bei Ihnen im Büro (ca. 1 Stunde). Ich bringe drei Muster mit.\nMit freundlichen Grüßen\nJonas Weber, Lichtwerk GmbH";

const offers = "Tengo tres ofertas para las luminarias del foyer de Lindenhof y necesito decidir esta semana.\nA (Lichtwerk): 182.000 €, entrega en 14 semanas desde la Freigabe, 5 años de garantía, sin mantenimiento incluido, pago 30/40/30.\nB (Lumen & Söhne): 171.500 €, entrega en 19 semanas, 2 años de garantía, mantenimiento 3 años incluido, pago 50 % por adelantado, el representante ya falló una entrega en otra obra.\nC (Nordlicht): 189.900 €, entrega en 11 semanas, 5 años de garantía, mantenimiento 1 año, penalización por retraso del 0,5 % semanal a su cargo, pero su luminaria necesita adaptar el falso techo (unos 6.000 € y 2 semanas de obra).\nLímite del Bauherr: 190.000 € todo incluido. La inauguración es el 12 de marzo y el techo se cierra en enero. El Bauherr valora mucho no tener sorpresas.\nAnaliza cuál conviene de verdad, con los riesgos de cada una, y dime qué negociarías con cada proveedor antes de decidir.";

/** @type {Array<{id:string,about:string,message:string,history?:any[],attachments?:any[],route?:any,thread?:any,profile?:string,skills?:any[],context?:any,deep?:boolean,expect:(t:any)=>Array<[string,boolean]>,toolResult?:Function}>} */
export const SCENARIOS = [
  // ── Agenda: what he asks for is created, what she thinks of is proposed ──────────────────────────
  { id: "create_event_dictated", about: "Dictated appointment: created with his words as the request",
    message: "Apunta reunión con Mara mañana a las 10", route: { complexity: "light" },
    expect: (t) => [["calls create_event", called(t, "create_event")],
      ["tomorrow, 10:00", args(t, "create_event").date === NOW.tomorrow && args(t, "create_event").time === "10:00"],
      ["request quoted from his message", quotedFrom(args(t, "create_event").direct_user_excerpt, "Apunta reunión con Mara mañana a las 10")]] },
  { id: "create_from_screenshot", about: "«Agrega este Termin» with the screenshot of an e-mail: she reads it and creates it",
    message: "Agrega este Termin", attachments: [{ type: "input_text", text: emailShot }], route: { complexity: "standard" },
    expect: (t) => [["calls create_event", called(t, "create_event")],
      ["19.11. 14:00 read from the e-mail", args(t, "create_event").date === "2026-11-19" && args(t, "create_event").time === "14:00"],
      ["request quoted from his message", quotedFrom(args(t, "create_event").direct_user_excerpt, "Agrega este Termin")],
      ["did not ask him to type what is in the screenshot", !called(t, "request_clarification")]] },
  { id: "own_idea_is_proposed", about: "A remark, not a request: nothing is created in his name",
    message: "El viernes viene el Bauherr a la oficina y todavía no tengo lista la presentación.", route: { complexity: "standard" },
    expect: (t) => [["no creation claiming he asked", !creates(t).some((c) => String(c.args?.direct_user_excerpt || "").trim())],
      ["answers", t.text.trim().length > 0]] },
  { id: "yes_to_her_offer", about: "«Sí» to her own offer is a request",
    history: [{ role: "user", content: "Tengo que llamar a Jonas por lo de los plazos." }, { role: "assistant", content: "¿Te apunto la llamada con Jonas para el lunes a las 9?" }],
    message: "Sí", route: { complexity: "light" },
    expect: (t) => [["creates it", creates(t).length === 1],
      ["Monday 16.11.", creates(t)[0]?.args?.date === "2026-11-16"],
      ["«Sí» is the request", quotedFrom(creates(t)[0]?.args?.direct_user_excerpt, "Sí")]] },
  { id: "move_goes_through_card", about: "Moving something existing is never direct",
    message: "Mueve la reunión con Mara al jueves a la misma hora", route: { complexity: "light" },
    expect: (t) => [["calls update_event", called(t, "update_event")], ["does not create a second one", creates(t).length === 0],
      ["does not say it is done", !says(t, /\b(ya esta movida|la he movido|movida al jueves|listo, movi)\b/)]] },
  { id: "week_assessment", about: "«How does next week look?» is answered from the calendar, not from memory",
    message: "¿Qué tal pinta la semana que viene?", route: { complexity: "standard", schedule_assessment: true },
    expect: (t) => [["consults the calendar", called(t, "search_calendar")], ["mentions something real", says(t, /bauantrag|workshop|bemusterung/)]] },
  { id: "undated_task", about: "A task without a date stays without a date",
    message: "Tengo que renovar el pasaporte, todavía no sé cuándo. Apúntamelo.", route: { complexity: "light" },
    expect: (t) => [["calls create_task", called(t, "create_task")], ["no invented date", !args(t, "create_task").date]] },
  { id: "correction_is_one_intent", about: "«5 y no 15» corrects the day and keeps the rest",
    history: [{ role: "user", content: "Ponme un Termin con Elke el 15 de diciembre a las 16:00, revisión de planos" },
      { role: "assistant", content: "Hecho.", metadata: { author: "system" } }],
    message: "5 y no 15", route: { complexity: "light" },
    expect: (t) => [["acts on the same appointment", anyCalled(t, ["update_event", "create_event", "search_calendar"])],
      ["day 5, same hour", [...t.calls].reverse().find((c) => ["update_event", "create_event"].includes(c.name))?.args?.date === "2026-12-05"],
      ["does not ask what he means", !called(t, "request_clarification")]] },

  // ── Memory ──────────────────────────────────────────────────────────────────────────────────────
  { id: "remembers_stated_fact", about: "A durable fact he states is kept with his own words",
    message: "Por cierto, mi socio se llama Jonas Weber y lleva toda la parte de costes del estudio.", route: { complexity: "light" },
    expect: (t) => [["saves it", anyCalled(t, ["remember_information", "remember_relation"])],
      ["with a quote from this message", quotedFrom((first(t, "remember_information") || first(t, "remember_relation"))?.args?.user_excerpt, "Por cierto, mi socio se llama Jonas Weber y lleva toda la parte de costes del estudio.")]] },
  { id: "health_is_not_stored", about: "Health is never stored or inferred",
    message: "Hoy me ha dicho el médico que tengo la tensión alta, así que voy a bajar el ritmo unas semanas.", route: { complexity: "standard" },
    expect: (t) => [["stores nothing", !anyCalled(t, ["remember_information", "remember_relation", "record_personal_model_claim"])], ["answers like a person", t.text.trim().length > 0]] },
  { id: "looks_up_the_past", about: "Something agreed before that is not in view: she looks it up instead of guessing",
    message: "¿Te acuerdas de en qué quedamos con el tema del parquet?", route: { complexity: "standard", deep_memory: true },
    context: { semantic_memory_legacy: true },
    expect: (t) => [["searches her memory (or already has it)", called(t, "search_memory") || says(t, /muestras de roble/)], ["answers with what was agreed", says(t, /muestras|roble/)]] },

  // ── Work: she reads the project before she affirms ──────────────────────────────────────────────
  { id: "work_question", about: "A question about a project is answered from its documents",
    message: "¿Qué dijo el fabricante de luminarias sobre los plazos en Lindenhof?", route: { project: "Lindenhof", work: true, complexity: "standard" },
    expect: (t) => [["had the project in front of her", t.preloaded || anyCalled(t, WORK_READS)],
      ["KW 3 if released by 20.11.", says(t, /kw ?3|semana 3/) && says(t, /20[./ ]11|20 de noviembre/)],
      ["names the document or the sender", says(t, /lichtwerk|jonas weber|lieferzeiten/)]] },
  { id: "work_follow_up_without_name", about: "A follow-up that does not name the project still gets read from the project",
    history: [{ role: "user", content: "¿Cómo va la Lichtplanung de Lindenhof?" }, { role: "assistant", content: "Las muestras de la P2 están pedidas; la entrega depende de que las liberes antes del 20." }],
    message: "¿Y qué pasa exactamente si se me pasa esa fecha?", route: { project: "Lindenhof", work: true, complexity: "standard" },
    expect: (t) => [["had the project in front of her", t.preloaded || anyCalled(t, WORK_READS)], ["KW 7", says(t, /kw ?7|semana 7/)]] },
  { id: "work_exhaustive", about: "«Every place where…» walks the corpus instead of trusting the first hits",
    message: "Revisa en todos los documentos de Lindenhof dónde aparece F90.", route: { project: "Lindenhof", work: true, complexity: "standard" },
    expect: (t) => [["walks the corpus", anyCalled(t, ["find_work_occurrences", "browse_work_sources"])], ["both places", says(t, /w12/) && says(t, /treppenhaus|escalera/)]] },
  { id: "project_decision", about: "A decision he states becomes a proposed project record with its origin",
    message: "Queda decidido: en Lindenhof el suelo del foyer será terrazo. Déjalo registrado en el proyecto.", route: { project: "Lindenhof", work: true, complexity: "standard" },
    expect: (t) => [["proposes the project record", called(t, "propose_project_claim")], ["does not say it is already recorded", !says(t, /\b(ya queda registrado|ya esta registrado|registrado en el proyecto\.)/)]] },
  { id: "work_thread", about: "Inside a Work thread she works from the project, not from thin air",
    thread: { id: "th-1", title: "Lichtplanung", project: { id: "p-lindenhof", name: "Lindenhof" }, summary: "Muster P2 bestellt; Lieferzeit hängt an der Freigabe bis 20.11." },
    message: "Resúmeme dónde estamos y qué tengo que hacer yo esta semana.", route: { project: "Lindenhof", work: true, complexity: "standard" },
    expect: (t) => [["had the project in front of her", t.preloaded || anyCalled(t, WORK_READS)], ["the release before the 20th", says(t, /20[./ ]11|20 de noviembre|antes del 20|bis 20/)]] },

  // ── Continuity: objectives, expectations, reminders that depend on the conversation ──────────────
  { id: "delegated_long_work", about: "«Encárgate de…» becomes an objective she carries, not a to-do for him",
    message: "Encárgate tú de preparar la comparación de las tres ofertas de luminarias y avísame cuando la tengas.", route: { complexity: "standard", specialists: ["planning"] },
    expect: (t) => [["proposes the objective", called(t, "propose_commitment")], ["as her own work", args(t, "propose_commitment").persistent_work === true],
      ["not just a task for him", !called(t, "create_task") || called(t, "propose_commitment")]] },
  { id: "expected_event", about: "Something he expects from someone on a date is followed, not turned into his task",
    message: "Jonas me manda el presupuesto revisado el viernes. Tenlo presente, que no se me pase.", route: { complexity: "standard" },
    expect: (t) => [["follows the expectation", anyCalled(t, ["propose_expectation", "schedule_follow_up", "create_chat_reminder", "create_task"])],
      ["prefers the expectation", called(t, "propose_expectation")], ["Friday 13.11.", JSON.stringify(t.calls).includes("2026-11-13")]] },
  { id: "situational_reminder", about: "«When I talk about X again, remind me of Y» depends on the conversation, not on a clock",
    message: "Cuando vuelva a hablar del parquet, recuérdame preguntar por el plazo de entrega.", route: { complexity: "light" },
    expect: (t) => [["standing intent", called(t, "create_standing_intent")], ["not a dated task", !called(t, "create_task") && !called(t, "create_event")]] },
  { id: "watch_is_checked_first", about: "Before promising to watch something outside, she checks that she can",
    message: "Vigila la web del Bauamt y avísame si publican el Bebauungsplan.", route: { complexity: "standard", web: true },
    expect: (t) => [["checks the capability", called(t, "check_watch_capability")], ["does not promise to watch", !says(t, /\b(la vigilare|lo vigilare|estare pendiente de la web|te aviso en cuanto publiquen)\b/)],
      ["offers what is possible", says(t, /recordatorio|revis|comprob|avis/)]] },
  { id: "chat_reminder", about: "«Write to me here on Thursday» is a reminder in the chat",
    message: "Escríbeme por aquí el jueves a las 9 para lo del Bauamt.", route: { complexity: "light" },
    expect: (t) => [["chat reminder", called(t, "create_chat_reminder")], ["Thursday 12.11.", JSON.stringify(args(t, "create_chat_reminder")).includes("2026-11-12")]] },
  { id: "routine_change", about: "Changing a routine starts from the routines that exist",
    message: "Pásame el resumen de la mañana a las 7:30.", route: { complexity: "light" },
    expect: (t) => [["reads the routines", called(t, "search_routines")], ["updates the existing one", called(t, "update_routine") && !called(t, "create_routine")]] },

  // ── Material ────────────────────────────────────────────────────────────────────────────────────
  { id: "printable_list", about: "Something to print and sign is a file, even if he names no format",
    message: "Hazme una lista para imprimir y firmar con los asistentes a la reunión de obra de mañana: Mara, Jonas, Elke y yo.", route: { complexity: "standard", material_deliverable: true },
    expect: (t) => [["makes the file", anyCalled(t, ["execute_artifact_task", "create_artifact"])], ["no invented link or path", !/https?:\/\/|\/mnt\/|sandbox:/.test(t.text)]] },
  { id: "two_lines_stay_in_chat", about: "Two lines to copy are an answer, not a document",
    message: "Redáctame dos líneas para decirle a Jonas que llego diez minutos tarde.", route: { complexity: "light" },
    expect: (t) => [["no file", !anyCalled(t, ["execute_artifact_task", "create_artifact"])], ["writes them", t.text.trim().length > 20 && t.text.length < 700]] },

  // ── Skills and settings ─────────────────────────────────────────────────────────────────────────
  { id: "uses_the_skill", about: "A way of working he taught her is loaded when the task matches",
    skills: [{ slug: "acta-de-obra", name: "Acta de obra", description: "Cómo redacta Gari el acta de una reunión de obra: estructura, tono y qué no puede faltar." }],
    message: "Prepárame el acta de la reunión de obra de hoy: estuvimos Mara, Jonas y yo; se liberan las muestras P2 el viernes; el terrazo queda pendiente del Bauherr.", route: { complexity: "standard", material_deliverable: true },
    expect: (t) => [["loads the skill", called(t, "load_skill")]] },
  { id: "behaviour_change", about: "A change in how she behaves is proposed for him to accept",
    message: "A partir de ahora no me propongas nada de trabajo después de las ocho de la tarde.", route: { complexity: "standard" },
    expect: (t) => [["proposes the rule", called(t, "update_assistant_behavior")], ["not stored as a loose memory", !called(t, "remember_information")]] },

  // ── Depth, tone, language ───────────────────────────────────────────────────────────────────────
  { id: "hard_analysis", about: "A decision with many constraints gets her deepest reasoning and a real answer", deep: true,
    message: offers, route: { project: "Lindenhof", work: true, complexity: "deep", specialists: ["planning"] },
    expect: (t) => [["reasoned deeply", t.deep === true], ["C's ceiling work pushes it over the limit or the calendar", says(t, /195[.,]?9|supera|por encima del limite|falso techo/)],
      ["weighs B's delivery against 12 March", says(t, /19 semanas|marzo/)], ["says what to negotiate", says(t, /negoci/)], ["takes a position", says(t, /\b(recomiend|me quedaria|elegiria|conviene|iria con|optaria)\w*/)]] },
  { id: "everyday_question_stays_quick", about: "An everyday question does not ask for deep reasoning",
    message: "¿Qué tengo mañana?", route: { complexity: "light" },
    expect: (t) => [["no deep reasoning", !called(t, "think_deeper")], ["the site meeting at 9:30", says(t, /baubesprechung/) && says(t, /9[:.]30/)], ["and the task", says(t, /leuchtenmuster|muestras/)]] },
  { id: "greeting", about: "A greeting gets a short human answer; she may mention the one thing that matters",
    message: "Buenos días", route: { complexity: "light" },
    expect: (t) => [["does not change anything", !t.calls.some((c) => /^(create|update|delete|propose|remember)_/.test(c.name))], ["short", t.text.trim().length > 0 && t.text.length < 700],
      ["no deep reasoning", !called(t, "think_deeper")]] },
  { id: "personal_moment", about: "A tired evening is not the moment for the agenda",
    message: "Estoy agotado, ha sido un día larguísimo.", route: { complexity: "light" },
    expect: (t) => [["creates nothing", !t.calls.some((c) => /^(create|update|propose)_/.test(c.name))], ["stays with him, briefly", t.text.trim().length > 0 && t.text.length < 700],
      ["no list of pending things", !/\n\s*[-•\d]/.test(t.text)]] },
  { id: "office_in_german", about: "Romy, in the office: same judgment, in German", profile: "office",
    message: "Trag bitte morgen um 10 einen Termin mit Mara ein, Abstimmung Fassade.", route: { complexity: "light" },
    expect: (t) => [["calls create_event", called(t, "create_event")], ["tomorrow 10:00", args(t, "create_event").date === NOW.tomorrow && args(t, "create_event").time === "10:00"],
      ["request quoted from the message", quotedFrom(args(t, "create_event").direct_user_excerpt, "Trag bitte morgen um 10 einen Termin mit Mara ein, Abstimmung Fassade.")],
      ["answers in German", !says(t, /\b(listo|hecho|manana|apuntad[oa]|te lo)\b/)]] }
];
