(()=>{'use strict';
const sb=window.MINDS_SUPABASE;
function dateISO(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function localTemporal(){
  const d=new Date(),p=n=>String(n).padStart(2,'0'),h=d.getHours();
  return {
    current_local_datetime:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(h)}:${p(d.getMinutes())}`,
    current_local_time:`${p(h)}:${p(d.getMinutes())}`,
    current_daypart:h<5?'night':h<12?'morning':h<18?'afternoon':h<22?'evening':'night'
  };
}
function compact(state){
  const td=dateISO(),temporal=localTemporal();
  const catName=id=>(state.categories||[]).find(x=>x.id===id)?.name||id||null;
  const projectName=id=>(state.projects||[]).find(x=>x.id===id)?.name||id||null;
  const todayEvents=(state.events||[]).filter(x=>x.date===td).map(x=>({id:x.id,title:x.title,date:x.date,start:x.start,duration_minutes:x.duration||60,category:catName(x.categoryId),project:projectName(x.projectId)}));
  const todayTasks=(state.tasks||[]).filter(x=>x.date===td&&!x.done&&!x.archivedAt).sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))).map(x=>({id:x.id,title:x.title,date:x.date,category:catName(x.categoryId),project:projectName(x.projectId),reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}));
  const undatedTasks=(state.tasks||[]).filter(x=>!x.date&&!x.done&&!x.archivedAt).sort((a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))).slice(0,30).map(x=>({id:x.id,title:x.title,category:catName(x.categoryId),project:projectName(x.projectId),sort_order:Number(x.sortOrder||0)}));
  const upcoming=[
    ...(state.events||[]).filter(x=>x.date>=td).slice(0,30).map(x=>({kind:'event',id:x.id,date:x.date,time:x.start,title:x.title,duration_minutes:x.duration||60,category:catName(x.categoryId),project:projectName(x.projectId)})),
    ...(state.tasks||[]).filter(x=>x.date&&x.date>=td&&!x.done&&!x.archivedAt).sort((a,b)=>(a.date+String(Number(a.sortOrder||0)).padStart(6,'0')).localeCompare(b.date+String(Number(b.sortOrder||0)).padStart(6,'0'))).slice(0,30).map(x=>({kind:'task',id:x.id,date:x.date,title:x.title,category:catName(x.categoryId),project:projectName(x.projectId),reminder_time:x.reminderTime||null,sort_order:Number(x.sortOrder||0)}))
  ].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,30);
  const recentLocal=(state.messages||[]).slice(-20).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.text||'').trim(),created_at:m.at||null,reply_to:m.replyTo?.id?{id:String(m.replyTo.id),role:m.replyTo.role==='assistant'?'assistant':'user',content:String(m.replyTo.text||'').trim()}:null})).filter(m=>m.content);
  return {
    work_context:window.MINDS_WORK?.context?.()||null,
    current_date:td,
    ...temporal,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin',
    today_events:todayEvents,
    today_tasks:todayTasks,
    undated_tasks:undatedTasks,
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
      weather_location:String(state.feedPreferences?.weatherLocation||'').trim(),
      assistant_behavior_rules:Array.isArray(state.assistantPreferences?.behaviorRules)?state.assistantPreferences.behaviorRules:[],
      curiosity_enabled:state.assistantPreferences?.curiosityEnabled!==false
    }
  };
}
function fastCreateCandidate(message){
  const t=String(message||'').trim().replace(/\s+/g,' ').toLowerCase();
  if(!t||t.length>320||/[?¿]/.test(t))return false;
  if(/\b(si|unless|excepto|salvo|depende|cuando tenga sentido|como antes|como hablamos|como dijimos|lo anterior|eso|esto|aquello|lo de)\b/i.test(t))return false;
  if(/\b(y|además|también|also|und)\s+(agrega|añade|crea|pon|apunta|add|create|erstelle|füge)\b/i.test(t))return false;
  return /\b(agrega|agregar|añade|añadir|crea|crear|pon|poner|apunta|apuntar|add|create|erstelle|hinzufügen|füge)\b/i.test(t);
}
function parseFastSse(buffer,onEvent){
  let rest=buffer;
  while(true){
    const i=rest.indexOf('\n\n');if(i<0)break;
    const block=rest.slice(0,i);rest=rest.slice(i+2);
    const data=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');
    if(!data||data==='[DONE]')continue;
    try{onEvent(JSON.parse(data))}catch{}
  }
  return rest;
}
async function askFastStream(message,state,options={}){
  const {data:{session}}=await sb.auth.getSession();if(!session)return null;
  const cfg=window.MINDS_SUPABASE_CONFIG;if(!cfg?.url||!cfg?.publishableKey)return null;
  const response=await fetch(cfg.url+'/functions/v1/isabella-fast-stream',{
    method:'POST',
    headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Accept:'text/event-stream'},
    body:JSON.stringify({message:String(message),context:compact(state)})
  });
  if(response.status===409)return null;
  if(!response.ok||!response.body)return null;
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',result=null,fallback=false,streamError=null,streamedText='';
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    buffer=parseFastSse(buffer,event=>{
      if(event?.type==='status')options.onProgress?.(event);
      else if(event?.type==='text_delta'){streamedText+=String(event.delta||'');options.onTextDelta?.(String(event.delta||''),streamedText)}
      else if(event?.type==='result')result={...event,streamed_text:streamedText};
      else if(event?.type==='fallback')fallback=true;
      else if(event?.type==='error')streamError=event.message||'fast_stream_error';
    });
  }
  if(streamError){options.onTextReset?.();throw new Error(streamError)}
  if(fallback){options.onTextReset?.();return null}
  return result;
}
async function askDirectStream(message,state,options={},replyContext=''){
  const {data:{session}}=await sb.auth.getSession();if(!session)return null;
  const cfg=window.MINDS_SUPABASE_CONFIG;if(!cfg?.url||!cfg?.publishableKey)return null;
  const response=await fetch(cfg.url+'/functions/v1/isabella-chat',{
    method:'POST',
    headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Accept:'text/event-stream'},
    body:JSON.stringify({
      message:String(message),
      context:{...compact(state),reply_context:replyContext},
      background:false,attachments:[],stream:true
    })
  });
  if(response.status===409){options.onTextReset?.();return null}
  if(!response.ok||!response.body)throw new Error('No pude iniciar la respuesta en streaming.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',result=null,streamError=null,streamedText='';
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    buffer=parseFastSse(buffer,event=>{
      if(event?.type==='status')options.onProgress?.(event);
      else if(event?.type==='text_delta'){streamedText+=String(event.delta||'');options.onTextDelta?.(String(event.delta||''),streamedText)}
      else if(event?.type==='result')result={...event,streamed_text:streamedText};
      else if(event?.type==='error')streamError=event.message||'stream_error';
    });
  }
  if(streamError){options.onTextReset?.();throw new Error(streamError)}
  return result;
}
async function ask(message,state,options={}){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria de Isabella para activar la IA.');
  const replyContext=options.replyTo?.text?`\nGari está respondiendo específicamente a este mensaje previo de ${options.replyTo.role==='assistant'?'Isabella':'Gari'}:\n“${String(options.replyTo.text).slice(0,1200)}”\nInterpreta su nuevo mensaje como respuesta a ese fragmento, no como un turno aislado.\n`:'';
  const attachments=Array.isArray(options.attachments)?options.attachments.slice(0,3):[];
  if(!options.background&&!attachments.length&&!options.replyTo&&fastCreateCandidate(message)){
    try{
      const fast=await askFastStream(message,state,options);
      if(fast)return fast;
      options.onProgress?.({type:'status',phase:'fallback',label:'Revisando contexto…'});
    }catch{/* The full Isabella path remains the safety fallback. */}
  }
  if(!options.background&&!attachments.length){
    const streamed=await askDirectStream(message,state,options,replyContext);
    if(streamed)return streamed;
  }
  const {data,error}=await sb.functions.invoke('isabella-chat',{body:{message:String(message),context:{...compact(state),reply_context:replyContext},background:!!options.background,attachments:Array.isArray(options.attachments)?options.attachments.slice(0,3):[]}});
  if(error)throw error;
  if(data?.error)throw new Error(data.message||data.detail||data.error);
  return data||{reply:'Te escucho.',proposal:null,question:null,memory_candidates:[]};
}

async function brief(state){
  return ask("Prepara mi briefing de la mañana. Incluye: 1) eventos y tareas pendientes de hoy, 2) pronóstico breve del clima usando la ubicación configurada si existe y sin inventar ubicación, y 3) como máximo tres observaciones situacionales derivadas de mi agenda, pendientes, proyectos y contexto que realmente merezcan atención. No incluyas noticias generales ni contenido por intereses. No propongas cambios ni crees tareas en este resumen.",state,{background:true});
}
async function nudge(state){
  return ask("Evalúa si existe exactamente un seguimiento personal u operativo que valga la pena traerme ahora: algo pendiente, una respuesta esperada, una tarea que estoy dejando atrás, una cita cercana o algo significativo que te conté y que razonablemente merezca seguimiento. Revisa también los mensajes recientes: si Isabella ya recordó ese mismo evento, tarea o asunto recientemente, NO lo repitas aunque puedas reformularlo; un recordatorio por tema es suficiente salvo que exista un cambio material. Si no hay nada suficientemente útil, responde exactamente NO_NUDGE. Si sí lo hay, escribe solo un mensaje breve y natural, sin crear ni modificar nada.",state,{background:true});
}
async function curiosity(state){
  return ask("Evalúa si falta UNA preferencia operativa concreta que de verdad mejoraría cómo Isabella ayuda al usuario. Antes de preguntar, revisa la conversación reciente, las reglas de comportamiento confirmadas y la memoria disponible; usa search_memory si existe una posibilidad razonable de que esa preferencia ya se haya hablado. No vuelvas a preguntar una preferencia ya respondida aunque no esté formulada como regla. No preguntes por categorías de contenido del Feed, noticias, arquitectura, arte, tecnología u ocio: el Feed ya está definido como situacional, personal y productivo, no como un feed de intereses. Tampoco reabras cómo proteger bloques de concentración si ya existe una preferencia sobre cuándo Isabella puede escribir. No preguntes por salud, religión, política, sexualidad, finanzas, contraseñas, ubicación exacta ni otros datos sensibles. Si no hay una pregunta nueva, claramente útil y todavía no resuelta, responde exactamente NO_QUESTION. Si sí la hay, escribe únicamente una pregunta breve y conversacional.",state,{background:true});
}
async function listSkills(){
  if(!sb)return [];
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return [];
  const [isabellaQ,isabellaUserQ,sofiaQ,sofiaUserQ]=await Promise.all([
    sb.from('isabella_skills').select('slug,name,description,preferred_tools,version').eq('enabled',true).order('name',{ascending:true}),
    sb.from('minds_user_skills').select('id,slug,name,description,instructions,preferred_tools,version,enabled').eq('agent','isabella').order('name',{ascending:true}),
    sb.from('sofia_skills').select('slug,name,description,preferred_tools,version').eq('enabled',true).order('name',{ascending:true}),
    sb.from('minds_user_skills').select('id,slug,name,description,instructions,preferred_tools,version,enabled').eq('agent','sofia').order('name',{ascending:true})
  ]);
  for(const q of [isabellaQ,isabellaUserQ,sofiaQ,sofiaUserQ])if(q.error)throw q.error;
  const map=new Map();
  for(const x of isabellaQ.data||[])map.set('isabella:'+x.slug,{...x,agent:'isabella',source:'system'});
  for(const x of isabellaUserQ.data||[])map.set('isabella:'+x.slug,{...x,agent:'isabella',source:'personal'});
  for(const x of sofiaQ.data||[])map.set('sofia:'+x.slug,{...x,agent:'sofia',source:'system'});
  for(const x of sofiaUserQ.data||[])map.set('sofia:'+x.slug,{...x,agent:'sofia',source:'personal'});
  return [...map.values()].sort((a,b)=>String(a.agent).localeCompare(String(b.agent))||String(a.name).localeCompare(String(b.name)));
}
function parseSurface(raw){
  const text=String(raw||'').trim().replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/i,'').trim();
  try{const v=JSON.parse(text);return Array.isArray(v)?v:(Array.isArray(v?.items)?v.items:[])}catch{}
  const a=text.indexOf('['),b=text.lastIndexOf(']');
  if(a>=0&&b>a){try{const v=JSON.parse(text.slice(a,b+1));return Array.isArray(v)?v:[]}catch{}}
  return [];
}
function feedPreferenceSignature(state){
  const p=state.feedPreferences||{},stable=x=>[...(x||[])].sort((a,b)=>String(a?.id||a?.client_key||a?.name||'').localeCompare(String(b?.id||b?.client_key||b?.name||'')));
  const raw=JSON.stringify({
    date:new Date().toISOString().slice(0,10),
    instructions:String(p.instructions||''),weatherLocation:String(p.weatherLocation||''),
    events:stable(state.events).map(x=>({id:x.id||x.client_key,title:x.title,date:x.date,start:x.start,end:x.end,allDay:!!x.allDay,projectId:x.projectId||null})),
    tasks:stable(state.tasks).filter(x=>!x.archivedAt).map(x=>({id:x.id||x.client_key,title:x.title,date:x.date||null,done:!!x.done,reminder:x.reminderTime||x.reminder_time||null,projectId:x.projectId||null})),
    projects:stable(state.projects).map(x=>({id:x.id,name:x.name,categoryId:x.categoryId||null}))
  });
  let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}
  return 'feed11-'+(h>>>0).toString(16);
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
      section:String(x.section||(surface==='feed'?'now':'for_me')).toLowerCase(),
      kind:String(x.kind||'').trim()||null,
      surface_version:surface==='feed'?11:surface==='idea'?4:1,
      preference_signature:String(x.preference_signature||x.metadata?.preference_signature||'').trim()||null,
      generation_id:generationId,
      details:Array.isArray(x.details)?x.details.slice(0,8):[],
      entities:Array.isArray(x.entities)?x.entities.slice(0,4):[],
      detail:String(x.detail||'').trim()||null,
      image_url:/^https?:\/\//i.test(String(x.image_url||'').trim())?String(x.image_url).trim():null,
      image_alt:String(x.image_alt||'').trim()||null,
      weather_location:String(x.weather_location||'').trim()||null,
      source_title:String(x.source_title||'').trim()||null,
      source_url:/^https?:\/\//i.test(String(x.source_url||'').trim())?String(x.source_url).trim():null,
      why:String(x.why||'').trim()||null,
      deliverable:String(x.deliverable||x.metadata?.deliverable||'').trim()||null,
      work_type:String(x.work_type||x.metadata?.work_type||'').trim()||null
    },
    lifecycle_state:'new',
    expires_at:new Date(Date.now()+12*60*60*1000).toISOString()
  }));
  const {data,error}=await sb.from('minds_surface_items').insert(rows).select('*');
  return error?items:(data||items);
}
async function loadSurface(surface,agent=null,options={}){
  if(!sb)return [];
  const {data:{session}}=await sb.auth.getSession();if(!session)return [];
  let q=sb.from('minds_surface_items').select('*').eq('surface',surface).eq('status','active');
  if(surface!=='feed'&&!options.allowStale)q=q.gt('expires_at',new Date().toISOString());
  if(agent)q=q.eq('agent',agent);
  const {data,error}=await q.order('generated_at',{ascending:false}).limit(40);if(error)return [];
  const rows=data||[],generation=rows.find(x=>x?.metadata?.generation_id)?.metadata?.generation_id;
  if(surface==='feed'){
    const cutoff=Date.now()-24*60*60*1000;
    return rows.filter(x=>{
      if(generation&&x?.metadata?.generation_id===generation)return true;
      const engaged=String(x?.lifecycle_state||'')==='seen'||String(x?.user_feedback||'')==='liked';
      const generated=x?.generated_at?Date.parse(x.generated_at):0;
      return engaged&&generated>=cutoff;
    }).slice(0,16);
  }
  return generation?rows.filter(x=>x?.metadata?.generation_id===generation):rows;
}
async function startFeedRefresh(state,{force=false,currentItems=[]}={}){
  if(!sb)return {accepted:false,skipped:true,generation_id:null};
  const signature=feedPreferenceSignature(state);
  const cached=await loadSurface('feed','isabella',{allowStale:true});
  const newest=cached[0]?.generated_at?Date.parse(cached[0].generated_at):0;
  const cacheMatches=cached.length&&cached.every(x=>Number(x?.metadata?.surface_version||0)>=11&&String(x?.metadata?.preference_signature||'')===signature);
  if(!force&&cacheMatches&&newest&&Date.now()-newest<2*60*60*1000){
    return {accepted:false,skipped:true,generation_id:cached[0]?.metadata?.generation_id||null,signature,items:cached};
  }
  const currentTitles=(currentItems||[]).map(x=>String(x?.title||'').trim()).filter(Boolean).slice(0,12);
  const {data,error}=await sb.functions.invoke('isabella-feed',{body:{
    context:compact(state),
    current_titles:currentTitles,
    force:!!force,
    preference_signature:signature
  }});
  if(error||data?.error)throw new Error(data?.detail||data?.error||error?.message||'No pude iniciar la actualización del Feed.');
  return {accepted:!!data?.accepted,skipped:false,generation_id:data?.generation_id||null,status:data?.status||'queued',signature,reused:!!data?.reused};
}
async function feedJobStatus(generationId){
  if(!sb||!generationId)return null;
  const {data,error}=await sb.from('minds_feed_jobs')
    .select('generation_id,status,error,created_at,started_at,completed_at')
    .eq('generation_id',generationId)
    .maybeSingle();
  if(error)return null;
  return data||null;
}
async function waitForFeedRefresh(generationId,{timeoutMs=90000,intervalMs=1600}={}){
  if(!generationId)return null;
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const job=await feedJobStatus(generationId);
    if(job?.status==='succeeded'){
      const rows=await loadSurface('feed','isabella',{allowStale:true});
      return {status:'succeeded',items:rows,job};
    }
    if(job?.status==='failed')throw new Error(job.error||'No pude actualizar el Feed.');
    await new Promise(r=>setTimeout(r,intervalMs));
  }
  return {status:'pending',items:await loadSurface('feed','isabella',{allowStale:true}),job:await feedJobStatus(generationId)};
}
async function feed(state,{force=false,currentItems=[]}={}){
  const cached=await loadSurface('feed','isabella',{allowStale:true});
  try{await startFeedRefresh(state,{force,currentItems})}catch{}
  return cached;
}
async function startResearch(){
  if(!sb)return {accepted:false,skipped:true};
  const {data:{session}}=await sb.auth.getSession();if(!session)return {accepted:false,skipped:true};
  const {data,error}=await sb.functions.invoke('isabella-research',{body:{}});
  if(error)return {accepted:false,error:error.message||String(error)};
  return data||{accepted:false};
}
async function loadResearchReady(){
  if(!sb)return [];
  const {data:{session}}=await sb.auth.getSession();if(!session)return [];
  const {data,error}=await sb.from('isabella_research_queue')
    .select('id,title,question,rationale,result,priority,completed_at')
    .eq('status','ready')
    .order('priority',{ascending:false})
    .order('completed_at',{ascending:false})
    .limit(4);
  if(error)return [];
  return (data||[]).map(r=>{
    const summary=String(r?.result?.summary||'').trim();
    const sources=Array.isArray(r?.result?.sources)?r.result.sources:[];
    const first=sources[0]||{};
    return {
      id:'research:'+r.id,
      research_id:r.id,
      agent:'isabella',
      section:'work',
      kind:'research',
      title:r.title,
      body:summary.length>360?summary.slice(0,357)+'…':summary,
      detail:summary,
      why:String(r.rationale||'').trim(),
      source_title:String(first.title||'').trim(),
      source_url:String(first.url||'').trim(),
      entities:[],
      metadata:{section:'work',kind:'research',why:String(r.rationale||'').trim(),source_table:'isabella_research_queue',sources}
    };
  });
}
async function feedStory(item,state,question='',history=[]){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Conecta la memoria para ampliar el Feed.');
  const request=sb.functions.invoke('isabella-feed-story',{body:{item,context:compact(state),question:String(question||''),history:(history||[]).slice(-12)}});
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('La ampliación está tardando demasiado. Inténtalo de nuevo.')),45000));
  const {data,error}=await Promise.race([request,timeout]);
  if(error)throw error;
  if(data?.error)throw new Error(data.detail||data.error);
  return data||{reply:'',sources:[]};
}
async function createArtifact({kind,title,content='',instruction='',size='',quality='',workspaceId=null}={}){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data,error}=await sb.functions.invoke('isabella-artifact',{body:{kind,title,content,instruction,size,quality,workspace_id:workspaceId}});
  if(error||data?.error)throw new Error(data?.detail||data?.error||error?.message||'No pude crear el artefacto.');
  return data?.artifact||null;
}
async function ideaWork(workspace,message,history=[],state=null){
  if(!sb)throw new Error('Supabase no está disponible.');
  const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Conecta la memoria para trabajar en esta idea.');
  const {data,error}=await sb.functions.invoke('minds-idea-worker',{body:{
    workspace:{id:workspace?.id,title:workspace?.title,brief:workspace?.brief,why:workspace?.why,artifact_title:workspace?.artifact_title,artifact_content:workspace?.artifact_content},
    context:state?compact(state):{},
    message:String(message||''),history:(history||[]).slice(-16)
  }});
  if(error)throw error;
  if(data?.error)throw new Error(data.detail||data.error);
  const result=data||{reply:'',artifact:null,sources:[]};
  if(result?.file_request){
    const req=result.file_request,kind=String(req.kind||''),content=(kind==='docx'||kind==='pdf')?String(result?.artifact?.content||workspace?.artifact_content||''):'';
    result.generated_artifact=await createArtifact({kind,title:req.title||workspace?.title||'Artefacto',content,instruction:req.instruction||'',workspaceId:workspace?.id||null});
  }
  return result;
}
async function ideas(state,{force=false}={}){
  if(!sb)return [];
  if(!force){const cached=await loadSurface('idea','isabella');if(cached.length&&cached.every(x=>Number(x?.metadata?.surface_version||0)>=4))return cached}
  const {data,error}=await sb.functions.invoke('isabella-ideas',{body:{context:compact(state),force:!!force}});
  if(error||data?.error)throw new Error(data?.detail||data?.error||error?.message||'No pude generar Ideas.');
  return saveSurface('idea','isabella',Array.isArray(data?.items)?data.items:[]);
}
async function sofiaSurface(kind,{force=false}={}){
  if(!sb)return [];
  if(!force){
    const cached=await loadSurface(kind,'sofia');
    if(cached.length)return cached;
  }
  const {data:{session}}=await sb.auth.getSession();if(!session)return [];
  const request=kind==='idea'
    ?'Analiza mis Readings, subrayados, notas e hilos activos y genera máximo 2 propuestas que puedan convertirse en trabajo real dentro de MINDS. No devuelvas meras conexiones interesantes: cada propuesta debe poder producir un artefacto concreto. Devuelve EXCLUSIVAMENTE JSON válido como array de {"kind":"idea","title":"...","body":"qué se propone desarrollar","deliverable":"artefacto concreto","work_type":"research|analysis|document|other","why":"por qué surge ahora","action_prompt":"","icon":""}. Si no hay una propuesta suficientemente fuerte, devuelve [].'
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
window.ISABELLA_AI={ask,brief,nudge,curiosity,transcribe,listSkills,feed,startFeedRefresh,waitForFeedRefresh,feedJobStatus,startResearch,loadResearchReady,feedStory,createArtifact,ideaWork,ideas,sofiaSurface,loadSurface};
})();
