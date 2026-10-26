// MINDS · isolated navigation study. No network, credentials, persistence or production mutations.
// Two independent state machines share the same synthetic scenarios and acceptance journeys.
"use strict";

const SCENARIOS = Object.freeze({
  day: {
    instruction: "Encuentra una tarea, revisa un cambio de fecha y comprueba el recibo simulado.",
    context: "Necesito organizar la próxima semana sin modificar tareas reales."
  },
  document: {
    instruction: "Abre Work, encuentra un PDF, pregunta sobre su fuente y regresa al documento.",
    context: "Quiero localizar el informe de un proyecto y preguntarle a Isabella sobre su alcance."
  },
  reading: {
    instruction: "Encuentra Lecturas, abre un texto, subraya un pasaje y pregunta a Sofía.",
    context: "Quiero recuperar una lectura, anotar un fragmento y volver al texto."
  }
});
const TABS = Object.freeze({
  B1: [
    ["chat", "Isabella", "◇"],
    ["now", "Ahora", "◎"],
    ["time", "Tiempo", "▦"],
    ["work", "Work", "▤"],
    ["readings", "Lecturas", "▯"]
  ],
  B2: [
    ["chat", "Isabella", "◇"],
    ["now", "Ahora", "◎"],
    ["time", "Tiempo", "▦"],
    ["work", "Work", "▤"],
    ["library", "Biblioteca", "▯"]
  ]
});
const ALLOWED_ROUTES = new Set([
  "chat", "now", "time", "work", "readings", "library", "thoughts",
  "task", "review", "receipt", "document", "askDocument", "reader", "sofia"
]);
const APP_NAME = "MINDS";
let scenario = "day";
let visible = "B1";
let sessions = {B1: makeSession("B1"), B2: makeSession("B2")};

function makeSession(variant) {
  return {
    variant, page: "chat", tab: "chat", history: [], steps: 0, log: [],
    dateChoice: "day", taskStatus: "original", highlighted: false,
    scrolledReader: false
  };
}
function button(label, action, classes, extra) {
  return '<button type="button" class="' + (classes || "btn") + '" data-action="' + action + '" ' +
    (extra || "") + ">" + label + "</button>";
}
function sectionHeader(kicker, title, subtitle) {
  return '<div class="screen-eyebrow">' + kicker + '</div><h2 class="page-heading">' +
    title + '</h2><p class="page-subtitle">' + (subtitle || "") + "</p>";
}
function detailHeader(s, name, overline) {
  const detail = !TABS[s.variant].some(t => t[0] === s.page);
  return '<div class="app-header"><div>' +
    (detail ? button("‹ Volver", "back", "back-btn") : '<span class="app-overline">' + (overline || "MINDS") + "</span>") +
    '<div class="app-title">' + name + "</div></div>" +
    '<div class="app-top-actions">' +
    (s.variant === "B1" && s.page !== "thoughts" ? button("Thoughts ↗", "thoughts", "tiny-link", 'aria-label="Abrir Thoughts"') : "") +
    "</div></div>";
}
function activeTab(s) {
  const map = {
    task: "time", review: "time", receipt: "time", document: "work", askDocument: "work",
    reader: s.variant === "B1" ? "readings" : "library",
    sofia: s.variant === "B1" ? "readings" : "library",
    thoughts: s.variant === "B1" ? null : "library"
  };
  return map[s.page] === undefined ? s.tab : map[s.page];
}
function bar(s) {
  const active = activeTab(s);
  return '<nav class="tabbar" aria-label="Navegación principal">' + TABS[s.variant].map(t =>
    '<button type="button" data-action="' + t[0] + '" ' +
    (active === t[0] ? 'aria-current="page"' : "") + ' aria-label="' + t[1] +
    '"><span class="symbol" aria-hidden="true">' + t[2] +
    "</span><span>" + t[1] + "</span></button>"
  ).join("") + "</nav>";
}
function chat(s) {
  return '<div class="view-pad">' +
    '<div class="orb" aria-hidden="true"></div><div class="chat-start">Isabella</div>' +
    '<p class="page-subtitle" style="text-align:center">Conversación, contexto y continuidad.</p>' +
    '<div class="conversation"><div class="bubble owner">' + SCENARIOS[scenario].context +
    '</div><div class="bubble assistant">Puedes consultar directamente tus espacios de trabajo. ' +
    'Las acciones disponibles no dependen de que sepas formular un prompt.</div></div>' +
    '<hr class="quiet-separator">' +
    '<div class="section-label">Tus espacios</div>' +
    '<div class="quick-actions">' + button("Tiempo", "time", "btn") +
      button("Work", "work", "btn") +
      button(s.variant === "B1" ? "Lecturas" : "Biblioteca", s.variant === "B1" ? "readings" : "library", "btn") +
    '</div><div class="notes">Este diálogo es ficticio. No se conecta a Isabella ni se crean conversaciones.</div>' +
    '<div class="chat-compose"><span>Escribe a Isabella… (solo demostración)</span><button type="button" disabled aria-label="Enviar no disponible">↑</button></div></div>';
}
function now() {
  return '<div class="view-pad">' + sectionHeader("SITUACIÓN", "Ahora", "Lo que merece atención, con origen y alcance visibles.") +
    '<div class="card soft"><span class="inline-status">Fuentes de demostración</span><div class="card-title" style="margin-top:10px">Lo próximo</div>' +
    '<p class="page-subtitle" style="margin:7px 0">Revisar una tarea y consultar el documento del proyecto Faro.</p></div>' +
    button("Ver tarea en Tiempo", "time", "list-row") +
    button("Ir a Work · Proyecto Faro", "work", "list-row") +
    '<div class="notes">No se consultan tareas, clima ni fuentes reales.</div></div>';
}
function time(s) {
  let modes = ["day", "week", "month"];
  const labels = {day:"Día",week:"Semana",month:"Mes"};
  let controls = '<div class="quick-actions" role="group" aria-label="Cambiar período">' +
    modes.map(m => button(labels[m], "mode-" + m, "btn" + (s.dateChoice === m ? " primary" : ""), 'aria-pressed="' + (s.dateChoice === m) + '"')).join("") +
    "</div>";
  let body = "";
  if (s.dateChoice === "day") {
    body = '<div class="section-label">Pendiente para hoy</div>' +
      '<button class="list-row" type="button" data-action="task"><div class="row-between"><div class="card-title">Preparar dossier de coordinación</div>' +
      '<span class="inline-status amber">Revisar</span></div><div class="meta">Proyecto Faro · 29 oct · Sin hora</div></button>' +
      '<div class="notes">Una tarea con fecha no ocupa automáticamente un bloque horario. La distinción respecto a sesiones y eventos se conserva.</div>';
  } else if (s.dateChoice === "week") {
    body = '<div class="section-label">Semana 44 · 26 oct–1 nov</div>' +
      '<div class="card soft"><div class="screen-eyebrow">Jueves 29</div><div class="card-title">Preparar dossier de coordinación</div>' +
      '<div class="meta">Tarea sin sesión reservada</div></div>' + button("Abrir tarea", "task", "btn full");
  } else {
    body = '<div class="section-label">Octubre 2026</div><div class="card soft">' +
      '<div class="card-title">29 · Preparar dossier de coordinación</div>' +
      '<div class="meta">Un indicador del mes abre la misma tarea canónica.</div></div>' +
      button("Abrir tarea", "task", "btn full");
  }
  return '<div class="view-pad">' + sectionHeader("TIEMPO", "Calendario", "Una tarea, tres escalas de tiempo.") +
    controls + body + '</div>';
}
function task(s) {
  const changed = s.taskStatus === "confirmed";
  const cancelled = s.taskStatus === "cancelled";
  return '<div class="view-pad">' + sectionHeader("PROYECTO FARO · TAREA", "Preparar dossier", "La tarea conserva su identidad en todas las vistas.") +
    '<div class="card"><div class="screen-eyebrow">Fecha actual (simulada)</div>' +
    '<div class="card-title" style="margin-top:8px">' + (changed ? "30" : "29") + " de octubre de 2026</div>" +
    '<div class="meta">Sin hora · No es una sesión de calendario</div></div>' +
    (cancelled ? '<div class="notice card"><span class="inline-status amber">Cancelado</span><p class="meta">La propuesta se canceló. Ningún dato cambió.</p></div>' : "") +
    (changed ? '<div class="notice card"><span class="inline-status green">Recibo simulado</span><p class="meta">Solo cambió el estado local de la maqueta.</p></div>' : "") +
    button(changed ? "Ver recibo" : "Proponer cambio al 30 de octubre", changed ? "receipt" : "review", "btn primary full") +
    '<div class="notes">No existe una tarea real asociada. La confirmación no se transmite a Supabase.</div></div>';
}
function review() {
  return '<div class="review-sheet"><div class="sheet-handle" aria-hidden="true"></div>' +
    '<span class="inline-status amber">Revisión de demostración</span><h2>Confirmar cambio de fecha</h2>' +
    '<p class="page-subtitle">Preparar dossier de coordinación · Proyecto Faro</p>' +
    '<div class="compare-change"><div class="change-col"><div class="change-label">Antes</div><div class="change-value">29 oct</div></div>' +
    '<div class="change-col"><div class="change-label">Propuesto</div><div class="change-value">30 oct</div></div></div>' +
    '<div class="context-preview"><strong>Qué cambia:</strong> solo la fecha. La tarea mantiene su identidad; no se añade una sesión ni se modifica el proyecto.</div>' +
    '<p class="meta">En MINDS real sería necesaria una autorización y lectura de recibo en servidor. Aquí solo demostramos su ubicación.</p>' +
    '<div class="btn-row">' + button("Cancelar propuesta", "cancelReview", "btn warn") + button("Confirmar simulación", "confirmReview", "btn primary") + '</div></div>';
}
function receipt() {
  return '<div class="view-pad">' + sectionHeader("RESULTADO LOCAL", "Revisión simulada", "El prototipo muestra la distinción entre propuesta y resultado.") +
    '<div class="receipt"><div class="receipt-title">✓ Cambio mostrado en la maqueta</div>' +
    '<p class="meta">29 oct → 30 oct · Preparar dossier de coordinación</p>' +
    '<code>DEMO-ONLY · NO SERVER RECEIPT</code></div>' +
    '<p class="page-subtitle" style="margin-top:17px">No hay recibo canónico porque no se realizó ninguna operación real. En producción se exigiría readback de Supabase.</p>' +
    button("Volver a la tarea", "returnTask", "btn full") + '</div>';
}
function work() {
  return '<div class="view-pad">' + sectionHeader("WORK · PROYECTOS", "Proyecto Faro", "Contexto sintético para evaluar navegación documental.") +
    '<div class="quick-actions"><span class="inline-status">Panorama</span><span class="inline-status">Desktop</span><span class="inline-status">Planner</span><span class="inline-status">Conocimiento</span><span class="inline-status">Threads</span></div>' +
    '<div class="section-label">Desktop / Coordinación</div>' +
    '<button type="button" class="list-row" data-action="document"><div class="file-row"><div class="doc-icon">PDF</div>' +
    '<div><div class="file-title">Informe de coordinación · Octubre.pdf</div><div class="meta">PDF · Texto parcialmente recuperable</div></div></div></button>' +
    '<div class="card soft"><div class="card-title">Conocimiento</div><div class="meta">Fuente original, extracción e interpretación son estados diferentes.</div></div>' +
    '<div class="notes">En el sistema real, Desktop, Planner, Conocimiento y Threads conservan todas sus operaciones. Esta maqueta solo prueba el recorrido del documento.</div></div>';
}
function documentPage() {
  return '<div class="view-pad">' +
    '<div class="crumb">Work › Proyecto Faro › Coordinación</div><h2 class="page-heading">Informe de coordinación</h2>' +
    '<div class="row-between"><span class="inline-status amber">Texto parcial</span><span class="meta">PDF · versión de ejemplo</span></div>' +
    '<div class="card soft" style="margin-top:20px"><div class="screen-eyebrow">Fuente original</div><div class="card-title" style="margin-top:9px">Informe de coordinación · Octubre.pdf</div>' +
    '<p class="page-subtitle" style="margin:10px 0 0">Documento ficticio. Extracción parcial; contenido pendiente de confirmar.</p></div>' +
    '<div class="section-label">Fragmento disponible</div><div class="context-preview">El equipo revisará la coordinación del acceso principal. La secuencia de entregas está pendiente de aprobación.</div>' +
    '<p class="meta">El fragmento no prueba que todo el PDF haya sido comprendido o validado.</p>' +
    button("Preguntar a Isabella sobre este PDF", "askDocument", "btn primary full") +
    '<div class="notes">No se ha cargado ningún archivo real ni se ha generado conocimiento aceptado.</div></div>';
}
function askDocument() {
  return '<div class="view-pad">' + sectionHeader("ISABELLA · CONTEXTO VINCULADO", "Preguntar sobre un documento", "Conservar origen y alcance antes de enviar.") +
    '<div class="context-preview"><strong>Origen:</strong> Proyecto Faro / Informe de coordinación.pdf<br><strong>Alcance:</strong> fragmento parcial de demostración, no documento completo.</div>' +
    '<div class="conversation"><div class="bubble owner">¿Qué dice el fragmento sobre el acceso principal?</div>' +
    '<div class="bubble assistant"><span class="inline-status">Respuesta simulada</span><p>El fragmento menciona una revisión de coordinación del acceso principal. No permite confirmar su resultado ni la fecha definitiva de entrega.</p></div></div>' +
    '<div class="btn-row">' + button("Volver al PDF", "returnDocument", "btn primary") + button("Ir a Work", "work", "btn") + '</div></div>';
}
function library() {
  return '<div class="view-pad">' + sectionHeader("BIBLIOTECA", "Biblioteca", "Dos actividades con identidades propias, un acceso de navegación compartido.") +
    '<button type="button" class="list-row" data-action="readings"><div class="row-between"><div><div class="card-title book-serif">Lecturas</div>' +
    '<div class="meta">Investigación · Sofía · subrayados · relectura</div></div><span>›</span></div></button>' +
    '<button type="button" class="list-row" data-action="thoughts"><div class="row-between"><div><div class="card-title">Thoughts</div>' +
    '<div class="meta">Obra visual autónoma</div></div><span>›</span></div></button>' +
    '<div class="notes">El agrupamiento es únicamente de navegación. No fusiona modelos de datos ni la estética de ambas actividades.</div></div>';
}
function readings() {
  return '<div class="view-pad">' + sectionHeader("INVESTIGACIÓN · SOFÍA", "Lecturas", "Textos completos, anotaciones y conversaciones trazables.") +
    '<div class="section-label">Corpus de demostración</div>' +
    '<button type="button" class="list-row" data-action="reader"><div class="screen-eyebrow">MATERIAL FICTICIO · NO ATRIBUIDO A UN AUTOR</div>' +
    '<div class="book-title">Espacio y reducción</div><div class="meta">Texto de ejemplo · Disponible para anotar</div></button>' +
    '<div class="notes">Los textos y lecturas reales permanecen en MINDS. Ningún contenido se reemplaza por este ejemplo.</div></div>';
}
function reader(s) {
  return '<div class="view-pad">' +
    '<div class="screen-eyebrow">LECTURA DE DEMOSTRACIÓN</div><h2 class="book-title">Espacio y reducción</h2>' +
    '<p class="page-subtitle">El texto siguiente es ficticio y no constituye una cita de ningún autor.</p>' +
    '<div class="book-body"><p>Una habitación deja de sentirse igual cuando desaparecen las cosas que competían por nuestra atención.</p>' +
    '<div class="quote-selection">Reducir elementos no significa reducir experiencia; puede cambiar qué percibimos con mayor intensidad.</div>' +
    '<p>El resultado depende de cómo se organizan las relaciones entre lo que permanece, la luz, la materia y el tiempo de quien habita el espacio.</p></div>' +
    (s.highlighted ? '<div class="receipt"><div class="receipt-title">✓ Subrayado local de ejemplo</div><p class="meta">La anotación permanece en esta maqueta mientras comparas el recorrido.</p></div>' : "") +
    '<div class="book-tools">' + button(s.highlighted ? "Subrayado añadido" : "Subrayar fragmento", "highlight", "btn" + (s.highlighted ? " primary" : "")) +
    button("Preguntar a Sofía", "sofia", "btn primary") + '</div>' +
    '<div class="notes">En producción, una selección conserva su ancla en el texto original y su conversación vinculada.</div></div>';
}
function sofia(s) {
  return '<div class="view-pad">' + sectionHeader("SOFÍA · PASAJE ORIGINAL", "Una pregunta al texto", "La interpretación no reemplaza el fragmento original.") +
    '<div class="context-preview">“Reducir elementos no significa reducir experiencia; puede cambiar qué percibimos con mayor intensidad.”</div>' +
    '<div class="conversation"><div class="bubble owner">¿Cuál es la distinción conceptual aquí?</div>' +
    '<div class="bubble assistant"><span class="inline-status purple">Interpretación simulada</span><p>La reducción aparece como una operación, no como una finalidad autónoma. El ejemplo sugiere que su valor depende de la intensidad perceptiva que permite.</p><p class="meta">Lectura hipotética del fragmento ficticio; no es una tesis aceptada.</p></div></div>' +
    button("Volver al mismo pasaje", "returnReader", "btn primary full") +
    (s.highlighted ? '<div class="notes">El fragmento continúa subrayado en esta sesión de demostración.</div>' : '') + '</div>';
}
function thoughts() {
  return '<div class="view-pad">' +
    '<div class="screen-eyebrow">THOUGHTS · ACCESO INDEPENDIENTE</div><h2 class="page-heading">Thoughts</h2>' +
    '<p class="page-subtitle">Una obra, no una vista operativa de MINDS.</p>' +
    '<div class="thoughts-stage" aria-label="Esquema gráfico ilustrativo de Thoughts, no reproducción de la obra">' +
    '<div class="thoughts-frame"></div><div class="thoughts-bar thoughts-one"></div><div class="thoughts-bar thoughts-two"></div><div class="thoughts-bar thoughts-three"></div>' +
    '<div class="thoughts-disclaimer">Representación esquemática. La obra real conserva su código, interacción y composición propios.</div></div></div>';
}
function contentFor(s) {
  switch (s.page) {
    case "chat": return chat(s);
    case "now": return now(s);
    case "time": return time(s);
    case "task": return task(s);
    case "review": return review();
    case "receipt": return receipt();
    case "work": return work();
    case "document": return documentPage();
    case "askDocument": return askDocument();
    case "library": return library();
    case "readings": return readings();
    case "reader": return reader(s);
    case "sofia": return sofia(s);
    case "thoughts": return thoughts();
    default: return '<div class="view-pad">Vista no disponible en prototipo.</div>';
  }
}
function titleFor(s) {
  const labels = {
    chat: "Isabella", now: "Ahora", time: "Tiempo", work: "Work",
    library: "Biblioteca", readings: "Lecturas", task: "Tarea",
    review: "Revisión", receipt: "Resultado", document: "Documento",
    askDocument: "Isabella", reader: "Lectura", sofia: "Sofía", thoughts: "Thoughts"
  };
  return labels[s.page];
}
function render(variant) {
  const s = sessions[variant];
  const phone = document.getElementById("phone-" + variant);
  if (!phone) return;
  const header = '<div class="phone-top"><span class="phone-status">9:41</span>' +
    '<span class="island" aria-hidden="true"></span><span class="phone-status">● ▰</span></div>' +
    '<div class="prototype-banner">PROTOTIPO ' + variant + ' · DATOS FICTICIOS · SIN CONEXIÓN</div>';
  phone.innerHTML = header + detailHeader(s, titleFor(s)) +
    '<div class="main-viewport" id="viewport-' + variant + '" tabindex="-1">' + contentFor(s) + '</div>' + bar(s);
  const metric = document.getElementById("metrics-" + variant);
  metric.innerHTML = '<span class="metrics-strong">' + s.steps + ' interacciones</span> · Destino actual: ' +
    titleFor(s) + ' · ' + (s.taskStatus === "confirmed" ? "Resultado simulado" : s.highlighted ? "Subrayado local" : "Sin operaciones reales") +
    ' · ' + button("Reiniciar " + variant, "reset", "tiny-link");
}
function renderAll() {render("B1"); render("B2");}
function go(s, page, tabClick) {
  if (!ALLOWED_ROUTES.has(page)) return;
  if (tabClick) {
    s.history.length = 0;
    s.tab = page;
  } else if (s.page !== page) {
    s.history.push(s.page);
  }
  s.page = page;
  s.steps += 1;
  s.log.push(page);
  render(s.variant);
}
function back(s) {
  if (s.history.length) {
    s.page = s.history.pop();
    s.steps += 1;
    render(s.variant);
  } else {
    const current = activeTab(s) || "chat";
    s.page = current;
    s.steps += 1;
    render(s.variant);
  }
}
function returnTo(s, page) {
  if (!ALLOWED_ROUTES.has(page)) return;
  const index = s.history.lastIndexOf(page);
  if (index >= 0) {
    s.history = s.history.slice(0, index);
  } else {
    s.history.length = 0;
  }
  s.page = page;
  s.steps += 1;
  s.log.push("return:" + page);
  render(s.variant);
}
function dispatch(s, action) {
  if (action === "reset") {
    sessions[s.variant] = makeSession(s.variant);
    render(s.variant); return;
  }
  if (action === "back") {back(s); return;}
  if (action.indexOf("mode-") === 0) {
    const mode = action.slice(5);
    if (["day","week","month"].includes(mode)) {s.dateChoice=mode;s.steps++;render(s.variant);}
    return;
  }
  if (action === "confirmReview") {
    if (s.page !== "review") return;
    s.taskStatus = "confirmed";go(s,"receipt",false);return;
  }
  if (action === "cancelReview") {
    if (s.page !== "review") return;
    s.taskStatus = "cancelled";returnTo(s,"task");return;
  }
  if (action === "highlight") {
    if (s.page !== "reader") return;
    s.highlighted = true;s.steps++;render(s.variant);return;
  }
  if (action === "returnDocument") { returnTo(s, "document"); return; }
  if (action === "returnReader") { returnTo(s, "reader"); return; }
  if (action === "returnTask") { returnTo(s, "task"); return; }
  if (ALLOWED_ROUTES.has(action)) {
    const isTab = TABS[s.variant].some(t=>t[0] === action);
    go(s,action,isTab);
  }
}
document.addEventListener("click", event => {
  const scenarioButton = event.target.closest("button[data-scenario]");
  if (scenarioButton) {
    const requested = scenarioButton.dataset.scenario;
    if (!Object.hasOwn(SCENARIOS,requested)) return;
    scenario = requested;
    sessions = {B1:makeSession("B1"),B2:makeSession("B2")};
    document.querySelectorAll("[data-scenario]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.scenario===requested)));
    document.getElementById("taskInstruction").textContent=SCENARIOS[requested].instruction;
    renderAll(); return;
  }
  const toggle = event.target.closest("button[data-visible]");
  if (toggle) {
    const requested=toggle.dataset.visible;
    if (requested !== "B1" && requested !== "B2") return;
    visible=requested;
    document.documentElement.dataset.visible=visible;
    document.querySelectorAll("[data-visible]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.visible===visible)));
    return;
  }
  const actionButton=event.target.closest("button[data-action]");
  if (!actionButton) return;
  const phone=actionButton.closest(".phone");
  const metric=actionButton.closest(".journey-metrics");
  const host=phone||metric;
  if (!host) return;
  const variant=host.id.endsWith("B1")?"B1":host.id.endsWith("B2")?"B2":null;
  if (!variant) return;
  dispatch(sessions[variant],actionButton.dataset.action);
});
document.documentElement.dataset.visible=visible;
renderAll();
