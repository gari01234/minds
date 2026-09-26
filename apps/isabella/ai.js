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
    preferences:{
      feed_instructions:String(state.feedPreferences?.instructions||'').trim(),
      feed_topics:Array.isArray(state.feedPreferences?.topics)?state.feedPreferences.topics:[],
      weather_location:String(state.feedPreferences?.weatherLocation||'').trim()
    }
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
async function listSkills(){
  if(!sb)return [];
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return [];
  const {data,error}=await sb.from('isabella_skills')
    .select('slug,name,description,preferred_tools,version')
    .eq('enabled',true)
    .order('name',{ascending:true});
  if(error)return [];
  return data||[];
}
function parseSurface(raw){
  const text=String(raw||'').trim().replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/i,'').trim();
  try{const v=JSON.parse(text);return Array.isArray(v)?v:(Array.isArray(v?.items)?v.items:[])}catch{}
  const a=text.indexOf('['),b=text.lastIndexOf(']');
  if(a>=0&&b>a){try{const v=JSON.parse(text.slice(a,b+1));return Array.isArray(v)?v:[]}catch{}}
  return [];
}
async function saveSurface(surface,agent,items){
  if(!sb||!Array.isArray(items)||!items.length)return items||[];
  const {data:{session}}=await sb.auth.getSession();if(!session)return items;
  await sb.from('minds_surface_items').update({status:'dismissed'}).eq('surface',surface).eq('agent',agent).eq('status','active');
  const rows=items.slice(0,6).map(x=>({
    user_id:session.user.id,surface,agent,
    title:String(x.title||'').trim()||'Idea',
    body:String(x.body||'').trim(),
    action_prompt:String(x.action_prompt||x.prompt||'').trim()||null,
    icon:String(x.icon||'').trim()||null,
    metadata:{
      source:x.source||null,
      section:String(x.section||'').toLowerCase()==='today'?'today':'for_me',
      kind:String(x.kind||'').trim()||null,
      surface_version:surface==='feed'?3:1,
      details:Array.isArray(x.details)?x.details.slice(0,8):[],
      weather_location:String(x.weather_location||'').trim()||null
    },
    expires_at:new Date(Date.now()+12*60*60*1000).toISOString()
  }));
  const {data,error}=await sb.from('minds_surface_items').insert(rows).select('*');
  return error?items:(data||items);
}
async function loadSurface(surface,agent=null){
  if(!sb)return [];
  const {data:{session}}=await sb.auth.getSession();if(!session)return [];
  let q=sb.from('minds_surface_items').select('*')
    .eq('surface',surface).eq('status','active').gt('expires_at',new Date().toISOString());
  if(agent)q=q.eq('agent',agent);
  const {data,error}=await q.order('generated_at',{ascending:false}).limit(12);
  return error?[]:(data||[]);
}
async function feed(state,{force=false}={}){
  if(!force){
    const cached=await loadSurface('feed','isabella');
    if(cached.length&&cached.every(x=>Number(x?.metadata?.surface_version||0)>=3))return cached;
  }
  const prompt=`Construye mi Feed personal de MINDS. No es un resumen genérico ni una lista de consejos. Debe seleccionar únicamente información que tenga valor para mí ahora y dividirla conceptualmente entre "Hoy" y "Para mí".

Devuelve EXCLUSIVAMENTE JSON válido: un array de 2 a 5 objetos con esta forma exacta:
{"section":"today"|"for_me","kind":"weather"|"commitment"|"pending"|"followed_topic"|"architecture"|"ai"|"family"|"personal"|"project"|"other","title":"...","body":"...","action_prompt":"...","icon":"...","details":[]}

Para weather, title debe funcionar como vistazo inmediato (por ejemplo localidad + temperatura/condición si está verificado) y details debe contener hasta 7 objetos {"label":"Lun 28","value":"26° / 11° · nublado"} para poder desplegar la semana. Para los demás tipos details debe ser [].

HOY puede incluir, solo si es relevante: clima que afecte el día o próximos días, próximos compromisos, tareas/pendientes urgentes, seguimientos que vencen o cambios temporales importantes. Si preferences.weather_location está definido, úsalo como lugar habitual del clima. Si está vacío, usa clima solo cuando una localización suficientemente fiable aparezca en mi memoria/contexto o conversación reciente; no inventes una ciudad. Cuando incluyas clima, consulta información actual y proporciona también details para la semana. Si hace falta actualidad, usa web_search.

PARA MÍ puede incluir, solo cuando haya una razón concreta para mostrarlo: noticias o temas que yo haya pedido seguir, arquitectura, inteligencia artificial, información relacionada con mis proyectos, recordatorios personales o familiares, cosas relacionadas con mis hijos, o algún contexto mío que razonablemente merezca reaparecer. Usa preferences.feed_topics y preferences.feed_instructions como preferencias explícitas, sin convertirlas en obligación de rellenar categorías. Usa search_memory o search_calendar si necesitas recuperar algo que no esté en el resumen inmediato.

No intentes cubrir todas las categorías. Si algo no tiene valor ahora, omítelo. No inventes datos, preferencias, familiares, proyectos ni seguimientos. No incluyas compras, pagos ni transacciones. Cada body debe explicar en una o dos frases por qué esto aparece ahora. action_prompt debe ser una frase natural que yo pueda enviar a Isabella para continuar el tema.`;
  const result=await ask(prompt,state,{background:true});
  const items=parseSurface(result?.reply).map(x=>({
    ...x,
    section:String(x?.section||'').toLowerCase()==='today'?'today':'for_me'
  }));
  return saveSurface('feed','isabella',items);
}
async function ideas(state,{force=false}={}){
  if(!force){const cached=await loadSurface('idea','isabella');if(cached.length)return cached}
  const prompt='Genera máximo 3 Ideas proactivas para Gari a partir de su contexto, proyectos, agenda, pendientes y memoria. No son tareas obligatorias: son propuestas útiles que él quizá no haya pensado pedir. Devuelve EXCLUSIVAMENTE JSON válido: un array de objetos {"title":"...","body":"...","action_prompt":"...","icon":"..."}. Evita consejos genéricos y evita transacciones. Cada idea debe explicar por qué aparece ahora.';
  const result=await ask(prompt,state,{background:true});
  const items=parseSurface(result?.reply);
  return saveSurface('idea','isabella',items);
}
async function sofiaSurface(kind,{force=false}={}){
  if(!sb)return [];
  if(!force){
    const cached=await loadSurface(kind,'sofia');
    if(cached.length)return cached;
  }
  const {data:{session}}=await sb.auth.getSession();if(!session)return [];
  const request=kind==='idea'
    ?'Analiza mis Readings, subrayados, notas e hilos activos y genera máximo 3 descubrimientos o ideas que merezcan conversación ahora. Deben ser específicos, provisionales y trazables a mi memoria intelectual. Devuelve EXCLUSIVAMENTE JSON válido como array de {"title":"...","body":"...","action_prompt":"...","icon":"..."}. action_prompt debe formular cómo continuar la conversación contigo, Sofía.'
    :'Genera como máximo 1 señal para mi Feed desde Readings, y solo si realmente merece reaparecer ahora: algo que haya quedado vivo, una pregunta abierta o una lectura/hilo que convenga retomar. Devuelve EXCLUSIVAMENTE JSON válido como array de {"section":"for_me","kind":"reading","title":"...","body":"...","action_prompt":"...","icon":"..."}. Si no hay una señal suficientemente fuerte, devuelve [].';
  const {data,error}=await sb.functions.invoke('sofia-chat',{body:{message:request,background:true,structured:true}});
  if(error)return [];
  const items=Array.isArray(data?.structured)?data.structured:parseSurface(data?.reply);
  return saveSurface(kind,'sofia',items);
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
window.ISABELLA_AI={ask,brief,nudge,transcribe,listSkills,feed,ideas,sofiaSurface,loadSurface};
})();