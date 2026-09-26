(()=>{'use strict';
const sb=window.MINDS_SUPABASE;
function dateISO(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function compact(state){
  const td=dateISO();
  const todayEvents=(state.events||[]).filter(x=>x.date===td).map(x=>({id:x.id,title:x.title,date:x.date,start:x.start,duration_minutes:x.duration||60,category:x.categoryId,project:x.projectId}));
  const todayTasks=(state.tasks||[]).filter(x=>x.date===td&&!x.done&&!x.archivedAt).sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))).map(x=>({id:x.id,title:x.title,date:x.date,category:x.categoryId,project:x.projectId,reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}));
  const upcoming=[
    ...(state.events||[]).filter(x=>x.date>=td).slice(0,20).map(x=>({kind:'event',id:x.id,date:x.date,time:x.start,title:x.title,duration_minutes:x.duration||60,category:x.categoryId,project:x.projectId})),
    ...(state.tasks||[]).filter(x=>x.date>=td&&!x.done&&!x.archivedAt).sort((a,b)=>(a.date+String(Number(a.sortOrder||0)).padStart(6,'0')).localeCompare(b.date+String(Number(b.sortOrder||0)).padStart(6,'0'))).slice(0,20).map(x=>({kind:'task',id:x.id,date:x.date,title:x.title,category:x.categoryId,project:x.projectId,reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}))
  ].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,20);
  return {
    current_date:td,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin',
    today_events:todayEvents,
    today_tasks:todayTasks,
    upcoming,
    memories:(state.memory||[]).slice(-30).map(m=>typeof m==='object'?{kind:m.kind,content:m.content,confidence:m.confidence}:m),
    preferences:[]
  };
}
async function ask(message,state){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria de Isabella para activar la IA.');
  const {data,error}=await sb.functions.invoke('isabella-chat',{body:{message,context:compact(state)}});
  if(error)throw error;
  if(data?.error)throw new Error(data.message||data.detail||data.error);
  return data||{reply:'Te escucho.',proposal:null,question:null,memory_candidates:[]};
}
async function brief(state){
  return ask("Prepara mi resumen de hoy. Sé breve y práctico: dime mis eventos y tareas pendientes de hoy y, solo si aporta valor, señala el siguiente compromiso o una prioridad clara. No propongas cambios ni crees tareas en este resumen.",state);
}
window.ISABELLA_AI={ask,brief};
})();