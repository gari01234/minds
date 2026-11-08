// Typed Work routing decides *where* to read; this conservative intent guard
// only defers the large, interpretive Project Model for read-only source audits.
// The user still has the full model via the existing governed search_work tool.
// Never reuse this tier for project-model questions, mutations, or work threads.
const sourceNouns=/(?:\b(?:document\w*|fuente\w*|archiv\w*|planos?|grundriss\w*|unterlagen|datei\w*|pdfs?|version\w*|variant\w*|p[aá]gina\w*|seiten?|superficie\w*|fl[aä]che\w*|source\w*|drawing\w*|document\w*)\b)/iu;
const evidenceVerbs=/(?:\b(?:compar\w*|investig\w*|examin\w*|revis\w*|analiz\w*|exhaustiv\w*|verific\w*|localiz\w*|identific\w*|vergleich\w*|pr[uü]f\w*|untersuch\w*|compare\w*|review\w*|find\w*|identify\w*|all|todos|todas|alle)\b)/iu;
const modelExplicit=/(?:\b(?:project\s*model|modelo\s+(?:de\s+)?proyecto|referent\w*|projectmodell\w*|projektmodell\w*|perimeter|movimientos\s+del\s+modelo|relaciones\s+del\s+modelo)\b)/iu;
export function sourceFirstWorkPrefetchEligible({route={},message="",background=false,fastAgenda=false,attachments=0,workThread=false,materialDeliverable=false}={}){
  const text=String(message||"").trim();
  return route?.work===true&&typeof route?.project==="string"&&route.project.trim().length>0&&
    !background&&!fastAgenda&&!workThread&&!materialDeliverable&&Number(attachments)===0&&
    text.length>0&&sourceNouns.test(text)&&evidenceVerbs.test(text)&&!modelExplicit.test(text);
}
export function deferredSourceFirstProjectModel(){
  return {status:"deferred",reason:"read_only_source_first",interpretive_project_model_not_preloaded:true,
    // Deliberate: a snapshot can be recovered through existing governed Work tools;
    // no evidence or source is silently described as verified.
    recover_with:"search_work",source_originals_verified:false};
}

// 08.11.2026: a «¡Gracias!» routed to Work (Bernried) loaded the whole project, 274k characters of
// context, and «mueve esta tarea» did it four rounds in a row. A light turn never preloads the project:
// Isabella reads it with search_work when the answer needs it. Standard and deep turns are unchanged.
export function lightWorkTurn({route={},background=false,fastAgenda=false,attachments=0,materialDeliverable=false}={}){
  return route?.work===true&&route?.complexity==="light"&&!background&&!fastAgenda&&
    Number(attachments)===0&&!materialDeliverable;
}
export function deferredLightWorkContext(project){
  return {status:"not_preloaded",reason:"light_turn",project:typeof project==="string"?project:null,recover_with:"search_work",
    note:"Turno ligero: el proyecto no se precargó. Si la respuesta necesita datos del proyecto, usa search_work."};
}
