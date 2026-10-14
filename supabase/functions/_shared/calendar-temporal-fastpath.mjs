/* Pure calendar intent and temporal contract for Isabella's existing runtime.
   Source of truth: server local calendar date, never model weekday memory.
   All proposed writes remain subject to the existing approval pipeline. */
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
const isoDay=s=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T12:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
function shiftDay(day,offset){
 if(!isoDay(day))throw Error("invalid_server_calendar_date");
 return new Date(Date.parse(day+"T12:00:00Z")+offset*86400000).toISOString().slice(0,10);
}
function relativeInMessage(message){
 const t=calendarDateReferenceText(message);
 if(/\b(pasado\s+mañana|pasado\s+manana|übermorgen|day after tomorrow)\b/i.test(t))
   return {offset:2,token:"day_after_tomorrow"};
 if(/\b(mañana|manana|tomorrow|morgen)\b/i.test(t))
   return {offset:1,token:"tomorrow"};
 if(/\b(hoy|today|heute)\b/i.test(t))
   return {offset:0,token:"today"};
 return null;
}
export function resolveRelativeCalendarDate(message,localDate){
 const relative=relativeInMessage(message);
 if(!relative)return {kind:"absent"};
 const resolved=shiftDay(localDate,relative.offset);
 const explicit=String(message||"").match(/\b\d{4}-\d{2}-\d{2}\b/g)||[];
 if(explicit.length&&explicit.some(d=>d!==resolved))
   return {kind:"conflict",reason:"explicit_date_conflicts_with_relative_date",expected:resolved};
 // A conflicting named weekday must not be silently corrected.
 const weekdays=[["lunes",1],["martes",2],["miércoles",3],["miercoles",3],
   ["jueves",4],["viernes",5],["sábado",6],["sabado",6],["domingo",0]];
 const words=clean(message).split(/[^a-záéíóúüñ]+/u);
 const named=weekdays.filter(([w])=>words.includes(w)).map(([,n])=>n);
 const actual=new Date(resolved+"T12:00:00Z").getUTCDay();
 if(named.length&&named.some(d=>d!==actual))
   return {kind:"conflict",reason:"weekday_conflicts_with_relative_date",expected:resolved};
 return {kind:"resolved",date:resolved,token:relative.token};
}
export function guardCalendarProposal(proposal,message,serverLocalDate){
 if(!proposal||!["task","event"].includes(proposal.kind)||
    !["create","update"].includes(proposal.action)||proposal.clear_date)
   return {kind:"unchanged",proposal};
 const temporal=resolveRelativeCalendarDate(message,serverLocalDate);
 if(temporal.kind==="conflict")return {kind:"conflict",reason:temporal.reason,expected:temporal.expected};
 if(temporal.kind!=="resolved")return {kind:"unchanged",proposal};
 return {kind:"normalized",proposal:{...proposal,date:temporal.date},date:temporal.date};
}
export function calendarProposalReply(proposal){
 if(!proposal||!["task","event"].includes(proposal.kind)||
    !["create","update"].includes(proposal.action))return null;
 const title=String(proposal.title||proposal.target_title||"").trim();
 if(!title)return null;
 const date=String(proposal.date||"");
 let shown="";
 if(isoDay(date)){
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
