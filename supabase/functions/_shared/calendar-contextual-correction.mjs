/* One bounded, evidence-linked follow-up correction for the existing calendar.
 * Never write a task here: return at most one uniquely grounded update proposal.
 */
import {isSimpleAgendaMutation,resolveRelativeCalendarDate} from "./calendar-temporal-fastpath.mjs";

const clean=s=>String(s||"").normalize("NFC").toLocaleLowerCase("es").replace(/\s+/g," ").trim();
export function isContextualCorrection(message){
 const t=clean(message);
 return t.length<=100&&/^(?:(?:sí|si)[, ]+)?(?:(?:por favor)\s+)?(?:corrígelo|corrigelo|corrígela|corrigela|corrige eso|corrige esto|corrige la fecha|arréglalo|arreglalo|ajústalo|ajustalo|haz la corrección)(?:\s+por favor)?[.!?]*$/i.test(t);
}
export function localDateAt(timestamp,timezone="Europe/Berlin"){
 const at=new Date(timestamp);
 if(!Number.isFinite(at.getTime()))throw Error("invalid_turn_timestamp");
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(at);
 const get=x=>parts.find(p=>p.type===x)?.value||"";
 const date=get("year")+"-"+get("month")+"-"+get("day");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("invalid_local_calendar_date");
 return date;
}
function dateComplaint(text){
 const t=clean(text);
 return /\b(mañana|manana|fecha|d[ií]a|martes|lunes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/i.test(t)&&
  /\b(te has confundido|te confundiste|equivocad[oa]|incorrect[oa]|no es|est[aá] mal|corrige|corregir)\b/i.test(t);
}
export function findCalendarCorrection(messages,tasks,{timezone="Europe/Berlin",nowIso}={}){
 const now=new Date(nowIso||Date.now()).getTime();
 if(!Number.isFinite(now))throw Error("invalid_clock");
 const history=(Array.isArray(messages)?messages:[])
  .filter(m=>m&&["user","assistant"].includes(m.role)&&
    Number.isFinite(Date.parse(m.created_at))&&
    now-Date.parse(m.created_at)>=-300000&&now-Date.parse(m.created_at)<=12*3600000)
  .sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
 const priorUsers=history.filter(m=>m.role==="user"&&!isContextualCorrection(m.content));
 if(!priorUsers.length||!dateComplaint(priorUsers.at(-1).content))
   return {kind:"unresolved",reason:"no_recent_date_correction"};
 const created=(Array.isArray(tasks)?tasks:[]).filter(t=>t&&t.title&&t.created_at&&
   t.completed_at==null&&t.archived_at==null&&t.metadata?.source==="isabella");
 const matches=[];
 for(const m of priorUsers){
  if(!isSimpleAgendaMutation(m.content))continue;
  let intent;
  try{intent=resolveRelativeCalendarDate(m.content,localDateAt(m.created_at,timezone));}
  catch{continue}
  if(intent.kind!=="resolved")continue;
  for(const t of created){
   if(!clean(m.content).includes(clean(t.title)))continue;
   const distance=Date.parse(t.created_at)-Date.parse(m.created_at);
   if(!Number.isFinite(distance)||distance<0||distance>10*60000)continue;
   if(t.due_date===intent.date)continue;
   const later=priorUsers.filter(x=>Date.parse(x.created_at)>Date.parse(m.created_at));
   if(!later.length||!dateComplaint(later.at(-1).content))continue;
   matches.push({task:t,expected: intent.date,from:m.created_at});
  }
 }
 const unique=new Map(matches.map(m=>[String(m.task.id),m]));
 if(unique.size!==1)return {kind:"unresolved",reason:unique.size>1?"ambiguous_task":"no_matching_task"};
 const only=[...unique.values()][0];
 return {kind:"proposal",task_id:String(only.task.id),
   proposal:{kind:"task",action:"update",
     target_id:String(only.task.client_key||only.task.id),
     target_title:String(only.task.title),target_date:String(only.task.due_date||""),
     date:only.expected,clear_date:false},
   source_created_at:only.from};
}
