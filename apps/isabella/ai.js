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
      feed_custom_topics:Array.isArray(state.feedPreferences?.customTopics)?state.feedPreferences.customTopics:[],
      feed_following:Array.isArray(state.feedPreferences?.following)?state.feedPreferences.following:[],
      feed_follow_graph:Array.isArray(state.feedPreferences?.followGraph)?state.feedPreferences.followGraph.map(x=>({name:x.name,type:x.type||'other',focus:x.focus||''})):[],
      weather_location:String(state.feedPreferences?.weatherLocation||'').trim()
    }
  };
}
async function ask(message,state,options={}){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria de Isabella para activar la IA.');
  const personalVoice=options.surface?String(message):`VOZ DE ISABELLA:
Responde como una asistente personal que conoce el contexto de Gari y mantiene continuidad entre conversaciones. Conserva la profundidad y precisión factual, pero evita sonar como informe por defecto. En conversación casual, responde primero a la persona y luego al contenido: puedes usar una observación breve, una complicidad ligera o humor suave cuando surja de forma natural. Habla en primera persona cuando corresponda, usa lenguaje cotidiano y cálido, y deja que la respuesta tenga ritmo conversacional. No adules, no finjas sentimientos o experiencias, no fuerces bromas, no uses el nombre de Gari repetidamente y no sacrifiques rigor por cercanía. Si el tema exige precisión, seguridad o una explicación extensa, mantén toda la información necesaria pero con una voz humana y directa.

MENSAJE DE GARI:
${message}`;
  const {data,error}=await sb.functions.invoke('isabella-chat',{body:{message:personalVoice,context:compact(state),background:!!options.background}});
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
  const generationId=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(16).slice(2);
  const rows=items.slice(0,12).map(x=>({
    user_id:session.user.id,surface,agent,
    title:String(x.title||'').trim()||'Idea',
    body:String(x.body||'').trim(),
    action_prompt:String(x.action_prompt||x.prompt||'').trim()||null,
    icon:String(x.icon||'').trim()||null,
    metadata:{
      source:x.source||null,
      section:(()=>{const s=String(x.section||'').toLowerCase();return s==='today'?'today':s==='news'?'news':'for_me'})(),
      kind:String(x.kind||'').trim()||null,
      surface_version:surface==='feed'?6:1,
      generation_id:generationId,
      details:Array.isArray(x.details)?x.details.slice(0,8):[],
      entities:Array.isArray(x.entities)?x.entities.slice(0,4):[],
      detail:String(x.detail||'').trim()||null,
      image_url:/^https?:\/\//i.test(String(x.image_url||'').trim())?String(x.image_url).trim():null,
      image_alt:String(x.image_alt||'').trim()||null,
      weather_location:String(x.weather_location||'').trim()||null,
      source_title:String(x.source_title||'').trim()||null,
      source_url:/^https?:\/\//i.test(String(x.source_url||'').trim())?String(x.source_url).trim():null
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
  const {data,error}=await q.order('generated_at',{ascending:false}).limit(40);
  if(error)return [];
  const rows=data||[],generation=rows.find(x=>x?.metadata?.generation_id)?.metadata?.generation_id;
  return generation?rows.filter(x=>x?.metadata?.generation_id===generation):rows;
}
async function feed(state,{force=false,currentItems=[]}={}){
  const cached=await loadSurface('feed','isabella');
  if(!force&&cached.length&&cached.every(x=>Number(x?.metadata?.surface_version||0)>=6))return cached;
  const weakSignals=(state.feedSignals||[]).slice(-30).map(x=>({kind:x.kind,title:x.title,entities:x.entities||[],at:x.at}));
  const avoidTitles=(currentItems||[]).map(x=>String(x?.title||'').trim()).filter(Boolean).slice(0,12);
  const refreshDirective=force?`ACTUALIZACIÓN MANUAL DEL FEED: genera una edición realmente nueva. Evita repetir estos titulares o ángulos salvo que exista un desarrollo material nuevo: ${JSON.stringify(avoidTitles)}. Busca otras historias relevantes dentro de mis intereses y mi constelación. Momento de actualización: ${new Date().toISOString()}.`:'';
  const prompt=`Construye mi Feed personal de MINDS.
${refreshDirective} No es un resumen genérico ni una lista de consejos. Selecciona únicamente información que tenga valor para mí ahora y ordénala en tres capas posibles: "Hoy", "Noticias" y "Para mí".

Devuelve EXCLUSIVAMENTE JSON válido: un array de 7 a 12 objetos con esta forma exacta:
{"section":"today"|"news"|"for_me","kind":"weather"|"news"|"commitment"|"pending"|"followed_topic"|"architecture"|"art"|"design"|"culture"|"ai"|"science"|"technology"|"family"|"personal"|"project"|"other","title":"...","body":"...","detail":"...","action_prompt":"...","icon":"...","details":[],"source_title":"","source_url":"","image_url":"","image_alt":"","entities":[{"name":"...","type":"architecture_studio|artist|architect|institution|publication|gallery|person|topic|other","focus":"..."}]}

Para weather, title debe funcionar como vistazo inmediato y details debe contener hasta 7 objetos {"label":"Lun 28","value":"26° / 11° · nublado"} para desplegar la semana. Para los demás tipos details debe ser [].

HOY puede incluir clima, próximos compromisos, tareas urgentes, seguimientos que vencen o cambios temporales importantes. Si preferences.feed_topics contiene "Clima" y puedes establecer una localización fiable, incluye exactamente una tarjeta weather como vistazo básico del día aunque el tiempo sea normal. Si preferences.weather_location está definido, úsalo como lugar habitual. Si está vacío, usa clima solo cuando una localización fiable aparezca en memoria, contexto o conversación reciente. No inventes una ciudad. Para weather, consulta información actual.

NOTICIAS: si preferences.feed_topics contiene "Noticias", incluye normalmente entre 4 y 6 noticias actuales que realmente merezcan atención. Usa web_search y prioriza fuentes fiables, información reciente y diversidad geográfica/temática. Resume hechos, no opinión ni persuasión. No hagas rankings políticos ni presentes una interpretación partidista como hecho. Cada tarjeta de noticias debe usar section:"news", incluir source_title y source_url verificables, y explicar en body en una o dos frases qué ocurrió y por qué importa. Además escribe detail con aproximadamente 100–180 palabras de contexto adicional: antecedentes, actores, qué cambia y qué conviene observar. Para noticias de arquitectura, arte, diseño o cultura, detail puede incluir proyecto/exposición/obra, lugar, autores y contexto crítico cuando esté sustentado. image_url es opcional: úsalo SOLO si la búsqueda aporta una URL https directa y verificable de una imagen representativa procedente de la fuente, la institución o el autor oficial; si no puedes verificarla, devuelve "". image_alt debe describir la imagen sin especular. No inventes URLs ni fuentes.

TRATA EL FEED COMO UNA PORTADA PERSONAL CURADA, NO COMO UN FIREHOSE. preferences.feed_custom_topics son intereses libres elegidos explícitamente. preferences.feed_follow_graph es la fuente de verdad para la constelación personal: cada nodo dice qué entidad sigue el usuario, de qué tipo es y, cuando exista, qué clase de señales le interesan. Busca novedades pertinentes a ese focus: por ejemplo proyectos y concursos para un estudio; exposiciones y catálogos para un artista; programas para una institución; publicaciones para una revista. preferences.feed_following existe solo por compatibilidad. Cuando haya novedades reales, busca señales recientes como nuevos proyectos, exposiciones, publicaciones, entrevistas, concursos, conferencias, premios, adquisiciones o cambios relevantes. Si Arquitectura, Arte, Diseño o Cultura están entre los temas —o aparecen entidades relacionadas en feed_follow_graph— procura que una parte significativa de Noticias provenga de esos campos cuando existan novedades suficientes. No inventes actividad para rellenar huecos. Para cada noticia incluye entities con hasta 4 entidades realmente centrales; focus debe describir brevemente qué aspecto de esa entidad está relacionado con la noticia.

PARA MÍ puede incluir temas que yo haya pedido seguir, arquitectura, arte, diseño, cultura, inteligencia artificial, información relacionada con mis proyectos, recordatorios personales o familiares, Readings o algún contexto mío que merezca reaparecer. Usa preferences.feed_topics, preferences.feed_custom_topics, preferences.feed_following y preferences.feed_instructions como preferencias explícitas sin convertirlas en obligación de rellenar categorías. Usa search_memory o search_calendar si hace falta recuperar contexto.

Las siguientes señales de uso son evidencia débil, no preferencias confirmadas: ${JSON.stringify(weakSignals)}. Pueden ayudarte a ordenar, pero NO añadas ni elimines nodos de la constelación ni asumas que un clic equivale a un interés permanente.

No intentes cubrir todas las categorías. No inventes datos, preferencias, familiares, proyectos, fuentes ni seguimientos. No incluyas compras, pagos ni transacciones. action_prompt debe ser una frase natural para continuar el tema, pero las noticias se desarrollarán dentro del Feed y no en el chat personal de Isabella.`;
  let result=await ask(prompt,state,{background:true,surface:true});
  let items=parseSurface(result?.reply).map(x=>({...x,section:(()=>{const s=String(x?.section||'').toLowerCase();return s==='today'?'today':s==='news'?'news':'for_me'})()}));
  if(force&&items.length<3){
    const retryPrompt=prompt+'\n\nSEGUNDO INTENTO OBLIGATORIO: devuelve entre 7 y 12 tarjetas válidas. Prioriza nuevas noticias verificadas y señales de mi constelación; no repitas la edición anterior.';
    result=await ask(retryPrompt,state,{background:true,surface:true});
    items=parseSurface(result?.reply).map(x=>({...x,section:(()=>{const s=String(x?.section||'').toLowerCase();return s==='today'?'today':s==='news'?'news':'for_me'})()}));
  }
  if(items.length<3)return cached.length?cached:items;
  return saveSurface('feed','isabella',items);
}
async function feedStory(item,state,question='',history=[]){
  const sourceUrl=String(item?.source_url||item?.metadata?.source_url||'').trim();
  const sourceTitle=String(item?.source_title||item?.metadata?.source_title||'').trim();
  const entities=Array.isArray(item?.entities)?item.entities:(Array.isArray(item?.metadata?.entities)?item.metadata.entities:[]);
  const transcript=(history||[]).slice(-10).map(m=>(m.role==='user'?'Gari':'MINDS')+': '+String(m.text||'')).join('\n\n');
  const task=question?`Responde la pregunta del usuario sobre esta noticia: ${question}`:'Amplía esta noticia con contexto actualizado: qué ocurrió, antecedentes relevantes, actores, por qué importa y qué conviene observar después.';
  const prompt=`Estás dentro del detalle de una tarjeta del Feed de MINDS. Esta conversación está SEPARADA del chat personal de Isabella y no debe presentarse como una conversación privada con ella.

Título: ${String(item?.title||'')}
Resumen de la tarjeta: ${String(item?.body||'')}
Fuente inicial: ${sourceTitle}${sourceUrl?' — '+sourceUrl:''}
Entidades: ${JSON.stringify(entities)}
${transcript?'Conversación de esta tarjeta:\n'+transcript:''}

${task}

Investiga con web_search cuando haga falta información actual. Distingue hechos confirmados de interpretación. Incluye fuentes verificables. No conviertas esta conversación en una tarea, memoria personal o mensaje del chat de Isabella.`;
  return ask(prompt,state,{background:true,surface:true});
}
async function ideas(state,{force=false}={}){
  if(!force){const cached=await loadSurface('idea','isabella');if(cached.length)return cached}
  const prompt='Genera máximo 3 Ideas proactivas para Gari a partir de su contexto, proyectos, agenda, pendientes y memoria. No son tareas obligatorias: son propuestas útiles que él quizá no haya pensado pedir. Devuelve EXCLUSIVAMENTE JSON válido: un array de objetos {"title":"...","body":"...","action_prompt":"...","icon":"..."}. Evita consejos genéricos y evita transacciones. Cada idea debe explicar por qué aparece ahora.';
  const result=await ask(prompt,state,{background:true,surface:true});
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
window.ISABELLA_AI={ask,brief,nudge,transcribe,listSkills,feed,feedStory,ideas,sofiaSurface,loadSurface};
})();