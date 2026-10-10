/* Build 91 · Situational Review v0.1
 * Pure evidence/decision boundary. No tasks, events, memory or permissions are changed here.
 */
export const SITUATIONAL_REVIEW_VERSION="situational-review-v0.2";

export function localClock(timezone,date=new Date()){
  const pieces=new Intl.DateTimeFormat("en-GB",{
    timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  const get=k=>pieces.find(x=>x.type===k)?.value||"";
  return {date:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour")),time:get("hour")+":"+get("minute")};
}
export function dayOffset(iso,days){
  const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
export function eligibleTasks(tasks,today){
  const end=dayOffset(today,2);
  return (tasks||[]).filter(t=>t&&typeof t.id==="string"&&t.due_date>=today&&t.due_date<=end)
    .slice(0,30);
}
export function eligibleToReview(clock,tasks){
  return clock.hour>=8&&clock.hour<21&&eligibleTasks(tasks,clock.date).length>0;
}
export function weatherProof(weather){
  if(!weather||typeof weather.location!=="string"||!weather.observed_at)return null;
  const precipitation=Number(weather.precipitation_mm);
  return {
    location:weather.location,
    observed_at:weather.observed_at,
    condition:String(weather.condition||"").slice(0,90),
    precipitation_mm:Number.isFinite(precipitation)?precipitation:null,
    today_forecast:String(weather.today_forecast||"").slice(0,180)
  };
}
export function validateReview(raw,context){
  if(!raw||typeof raw!=="object"||raw.propose!==true)return null;
  const id=String(raw.task_id||"");
  const task=(context.tasks||[]).find(t=>String(t.id)===id);
  if(!task)return null;
  const allowed=new Set(["task","weather","calendar","time"]);
  const anchors=[...new Set(Array.isArray(raw.evidence)?raw.evidence.filter(x=>typeof x==="string"&&allowed.has(x)):[])];
  if(!anchors.includes("task")||!anchors.some(x=>x!=="task"))return null;
  if(anchors.includes("weather")&&!weatherProof(context.weather))return null;
  if(anchors.includes("calendar")&&!(context.events||[]).length)return null;
  if(anchors.includes("time")&&task.due_date!==context.clock.date)return null;
  const reason=String(raw.reason||"").trim(),suggestion=String(raw.suggestion||"").trim();
  if(reason.length<16||reason.length>380||suggestion.length<12||suggestion.length>280)return null;
  if(/https?:\/\/|<[^>]*>/.test(reason+" "+suggestion))return null;
  const timeSensitive=raw.time_sensitive===true&&task.due_date===context.clock.date&&(
    (anchors.includes("time")&&context.clock.hour>=16)||
    (anchors.includes("weather")&&Number(context.weather?.precipitation_mm)>0)||
    (anchors.includes("calendar")&&(context.events||[]).some(e=>e.starts_at))
  );
  return {task,anchors,reason,suggestion,timeSensitive};
}
export function reviewFingerprint(review,clock,weather){
  const external=review.anchors.filter(x=>x!=="task").sort().join("-");
  const weatherState=review.anchors.includes("weather")?
    (Number(weather?.precipitation_mm)>0?"wet":"dry"):"no-weather";
  return ["situational_review",review.task.id,review.task.due_date,clock.date,external,weatherState].join(":");
}
export function reviewMessage(review,weather){
  const groundedLocation=review.anchors.includes("weather")&&weather?.location?
    " (clima de "+weather.location+")":"";
  return review.reason+groundedLocation+" "+review.suggestion;
}

/* Build 91.1: a compact explanation for an actual accept/abstain/reject
 * decision; never persist model hidden reasoning or full unrelated context.
 */
export function evaluateReviewDecision(raw,context){
  if(raw?.propose===false)return {status:"abstained",reason_code:"model_abstained",review:null};
  if(raw?.propose!==true)return {status:"rejected",reason_code:"not_a_proposal",review:null};
  const task=(context.tasks||[]).find(t=>String(t.id)===String(raw.task_id||""));
  if(!task)return {status:"rejected",reason_code:"unverified_task",review:null};
  if(!Array.isArray(raw.evidence)||!raw.evidence.includes("task")||raw.evidence.length<2)
    return {status:"rejected",reason_code:"insufficient_evidence",review:null};
  const review=validateReview(raw,context);
  if(!review)return {status:"rejected",reason_code:"unverified_evidence_or_text",review:null};
  return {status:"accepted",reason_code:"material_proposal",review};
}
/* Build 91.2: the available days are *only* the recorded calendar's coverage,
 * not an assertion that the person is entirely free.
 * No explicit duration -> no inferred time slot.
 */
export function calendarDays(clock,events,timezone,horizon=14){
  const days=[];
  for(let offset=1;offset<=Math.max(1,Math.min(horizon,21));offset++){
    const date=dayOffset(clock.date,offset);
    const count=(events||[]).filter(event=>{
      if(!event?.starts_at)return false;
      try {
        return localClock(timezone,new Date(event.starts_at)).date===date;
      }catch{return false}
    }).length;
    days.push({date,registered_event_starts:count,scope:"registered_events_only"});
  }
  return days;
}
export function verifyAlternative(raw,review,candidates){
  const date=String(raw?.alternative_date||"");
  if(!review||!(/^\d{4}-\d{2}-\d{2}$/.test(date)))return null;
  const checked=(candidates||[]).find(x=>x.date===date);
  if(!checked||checked.registered_event_starts>0)return null;
  return {date,scope:"registered_events_only",registered_event_starts:0};
}
export function planProposalText(review,weather,alternative){
  if(!alternative)return reviewMessage(review,weather);
  const observed=reviewMessage({...review,suggestion:""},weather).trim();
  const date=alternative.date;
  return observed+" He comprobado los eventos registrados para el "+date+
    " y no aparece ningún evento que comience ese día. Esto no garantiza disponibilidad total. "+
    "¿Quieres que cambie la fecha de esta tarea al "+date+"?";
}
