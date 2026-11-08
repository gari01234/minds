// Fixed texts written by the app (receipts, confirmations, review prompts, status lines), not by
// Isabella's model. Phase 1, step 3: they are shown as system lines and handed to the model as
// "sistema", so she never reads them as her own words. The browser mirror lives in
// apps/isabella/turn-integrity.js (SYSTEM_NOTICE_PATTERNS); a test keeps both lists identical.
export const SYSTEM_NOTICE_PATTERNS=[
  // Legacy wording (before step 3) — still in the history, still recognised.
  /^listo[.,]/i,/^empieza a las/i,/^próximo:/i,/^hola\. soy isabella\.?$/i,/^¿(añado|pongo) «/i,/^te preparé \d+ cambios/i,
  /^tengo listo el cambio/i,/^no pude (comprobar|guardar|verificar|identificar|registrar)/i,/^isabella sigue trabajando/i,
  /^de acuerdo, no hice ningún cambio/i,/^creación autorizada/i,/^no hubo una respuesta de texto/i,/^he preparado la /i,
  /^isabella no pudo terminar esta respuesta/i,/^la respuesta quedó interrumpida/i,
  // System wording (step 3 onward).
  /^propuesta: /i,/^\d+ cambios preparados/i,/^guardados?( \d+ cambios)?\.?$/i,/^sin cambios\.?$/i,
  /^(agregado|actualizado|eliminado|archivada|marcada como completada)\.$/i,/^no se pudo (comprobar|verificar|responder)/i,
  /^falta la hora del evento/i,/^no quedó claro qué elemento/i,/^«[^»]{1,200}» (está en tus tareas|está en tu calendario|queda para)/i,
  /^\d+ (tareas|eventos|elementos) añadid[oa]s/i,/^actualizad[oa]: «/i,
  // Office system lines; do not present them as Romy's own prose.
  /^hinweis der app:/i,/^bestätigt: /i,/^verworfen: /i,
  /^keine antwort möglich:/i,/^vorschlag: /i,/^\d+ änderungen vorbereitet/i,/^gespeichert\.?$/i,/^\d+ änderungen gespeichert/i,
  /^die speicherung konnte nicht bestätigt werden/i
];
export function isSystemNotice(text){
  const t=String(text||'').trim();
  return t.length>0&&t.length<400&&SYSTEM_NOTICE_PATTERNS.some(r=>r.test(t));
}
// The author of a stored assistant message: the app (explicit marker or a known fixed text) or Isabella.
export function isSystemAuthored(message){
  if(!message||message.role!=='assistant')return false;
  return message?.metadata?.author==='system'||isSystemNotice(message.content??message.text);
}
