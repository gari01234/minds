/* Optional fast-lane performance hint and proposal wording only.
 * These text patterns NEVER authorize, reject or alter an action. Calendar
 * meaning comes from the model's typed semantic tool arguments, verified
 * by calendar-semantic-boundary.mjs, not this hint's vocabulary.
 */
const clean=s=>String(s||"").trim().toLocaleLowerCase("es");
const action=/\b(agrega|agregar|añade|añadir|crea|crear|pon|poner|apunta|apuntar|anota|anotar|agenda|agendar|mueve|mover|cambia|cambiar|reprograma|reprogramar|borra|borrar|elimina|eliminar|completa|completar|archiva|archivar|add|create|move|change|delete|remove|complete|archive|erstelle|hinzufügen|verschiebe|ändern|lösche|erledige)\b/i;
const object=/\b(tarea|task|termin|cita|reunión|reunion|evento|event|recordatorio|reminder|aufgabe|besprechung|besprechungsnotiz)\b/i;
const dateRef=/\b(mañana|manana|pasado mañana|hoy|tomorrow|today|morgen|heute|übermorgen)\b/i;
export function isSimpleAgendaMutation(message){
 const t=clean(message);
 if(!t||t.length>320)return false;
 // A direct correction of a recent calendar date also needs an action path.
 if(dateRef.test(t)&&/\b(te has confundido|te confundiste|fecha incorrecta|fecha est[aá] mal|corrige la fecha|día equivocado|dia equivocado)\b/i.test(t))
   return true;
 if(!action.test(t))return false;
 // Natural speech: "agrega para mañana proyecto Bernried hacer un
 // Besprechungsnotiz" is a calendar task despite lacking "tarea".
 return object.test(t)||dateRef.test(calendarDateReferenceText(t))&&
   /\b(proyecto|projekt|para|hacer|terminar|revisar|preparar|calendario|agenda)\b/i.test(t);
}
// Classify Spanish morning dayparts separately from next-day references.
export function calendarDateReferenceText(message){
 return clean(message)
   .replace(/\b(?:de|por|en)\s+la\s+(?:mañana|manana)\b/giu," ")
   .replace(/\b(?:esta|esa|aquella)\s+(?:mañana|manana)\b/giu," ");
}
export function calendarProposalReply(proposal){
 if(!proposal||!["task","event"].includes(proposal.kind)||
    !["create","update"].includes(proposal.action))return null;
 const title=String(proposal.title||proposal.target_title||"").trim();
 if(!title)return null;
 const date=String(proposal.date||"");
 let shown="";
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&
    new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date){
  const d=new Date(date+"T12:00:00Z");
  shown=" para el "+new Intl.DateTimeFormat("es-ES",{
    timeZone:"UTC",weekday:"long",day:"numeric",month:"long",year:"numeric"
  }).format(d);
 }
 const noun=proposal.kind==="event"?"evento":"tarea";
 const intro=proposal.action==="update"?"He preparado la actualización de la ":"He preparado la ";
 return intro+noun+' "'+title+'"'+shown+
   (proposal.project?" (proyecto "+String(proposal.project)+")":"")+
   ". Queda pendiente de tu confirmación en la interfaz.";
}
