(()=>{'use strict';
const sb=window.MINDS_SUPABASE;
function dateISO(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function compact(state){
  const td=dateISO();
  const catName=id=>(state.categories||[]).find(x=>x.id===id)?.name||id||null;
  const projectName=id=>(state.projects||[]).find(x=>x.id===id)?.name||id||null;
  const todayEvents=(state.events||[]).filter(x=>x.date===td).map(x=>({id:x.id,title:x.title,date:x.date,start:x.start,duration_minutes:x.duration||60,category:catName(x.categoryId),project:projectName(x.projectId)}));
  const todayTasks=(state.tasks||[]).filter(x=>x.date===td&&!x.done&&!x.archivedAt).sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))).map(x=>({id:x.id,title:x.title,date:x.date,category:catName(x.categoryId),project:projectName(x.projectId),reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}));
  const upcoming=[
    ...(state.events||[]).filter(x=>x.date>=td).slice(0,30).map(x=>({kind:'event',id:x.id,date:x.date,time:x.start,title:x.title,duration_minutes:x.duration||60,category:catName(x.categoryId),project:projectName(x.projectId)})),
    ...(state.tasks||[]).filter(x=>x.date>=td&&!x.done&&!x.archivedAt).sort((a,b)=>(a.date+String(Number(a.sortOrder||0)).padStart(6,'0')).localeCompare(b.date+String(Number(b.sortOrder||0)).padStart(6,'0'))).slice(0,30).map(x=>({kind:'task',id:x.id,date:x.date,title:x.title,category:catName(x.categoryId),project:projectName(x.projectId),reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}))
  ].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,30);
  const recentLocal=(state.messages||[]).slice(-20).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.text||'').trim(),created_at:m.at||null})).filter(m=>m.content);
  return {
    current_date:td,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin',
    today_events:todayEvents,
    today_tasks:todayTasks,
    upcoming,
    recent_local_conversation:recentLocal,
    pending_intent:state.pendingIntent||null,
    memories:(state.memory||[]).filter(m=>typeof m!=='object'||m.status!=='deleted').slice(-40).map(m=>typeof m==='object'?{kind:m.kind,content:m.content,confidence:m.confidence}:m),
    taxonomy:{
      categories:(state.categories||[]).map(x=>({name:x.name})),
      projects:(state.projects||[]).map(x=>({name:x.name,category:catName(x.categoryId)}))
    },
    locale:navigator.language||'es-ES',
    preferences:[]
  };
}
async function ask(message,state,options={}){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria de Isabella para activar la IA.');
  const {data,error}=await sb.functions.invoke('isabella-chat',{body:{message,context:compact(state),background:!!options.background}});
  if(error)throw error;
  if(data?.error)throw new Error(data.message||data.detail||data.error);
  return data||{reply:'Te escucho.',proposal:null,question:null,memory_candidates:[]};
}
async function brief(state){
  return ask("Prepara mi resumen de hoy. Sé breve y práctico: dime mis eventos y tareas pendientes de hoy y, solo si aporta valor, señala el siguiente compromiso o una prioridad clara. No propongas cambios ni crees tareas en este resumen.",state,{background:true});
}
async function nudge(state){
  return ask("Evalúa si existe exactamente un seguimiento personal u operativo que valga la pena traerme ahora: algo pendiente, una respuesta esperada, una tarea que estoy dejando atrás, una cita cercana o algo significativo que te conté y que razonablemente merezca seguimiento. Si no hay nada suficientemente útil, responde exactamente NO_NUDGE. Si sí lo hay, escribe solo un mensaje breve y natural, sin crear ni modificar nada.",state,{background:true});
}
async function transcribe(blob){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria de Isabella para usar voz multilingüe.');
  const cfg=window.MINDS_SUPABASE_CONFIG;
  if(!cfg?.url||!cfg?.publishableKey)throw new Error('Falta la configuración de Supabase.');
  const form=new FormData();
  const type=blob?.type||'audio/webm';
  const ext=type.includes('mp4')||type.includes('m4a')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':'webm';
  form.append('file',blob,'isabella-voice.'+ext);
  const response=await fetch(cfg.url+'/functions/v1/isabella-transcribe',{
    method:'POST',
    headers:{
      apikey:cfg.publishableKey,
      Authorization:'Bearer '+session.access_token
    },
    body:form
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.detail||data?.error||'No pude transcribir el audio.');
  return String(data?.text||'').trim();
}
window.ISABELLA_AI={ask,brief,nudge,transcribe};
})();