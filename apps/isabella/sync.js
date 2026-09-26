(()=>{'use strict';
const sb=window.MINDS_SUPABASE;
const APP_SCOPE='isabella';
const app=window.ISABELLA_APP;
const $=s=>document.querySelector(s);
const authButton=$('#authButton'),status=$('#syncStatus');
let user=null,syncing=false,timer=null,hydrating=false;
const setStatus=t=>{if(status)status.textContent=t};
const localDateTime=(date,time)=>new Date(date+'T'+(time||'09:00')+':00');
const pad=n=>String(n).padStart(2,'0');
const isoDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const timeOf=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
function apiError(e){return e?.message||String(e||'Error desconocido')}
async function init(){
  if(!sb||!app){setStatus('Memoria local · Supabase no disponible');if(authButton)authButton.textContent='Memoria local';return}
  const {data,error}=await sb.auth.getSession();
  if(error){setStatus('No se pudo leer la sesión');return}
  user=data.session?.user||null;
  paintAuth();
  if(user) await syncNow({initial:true});
  sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;paintAuth();if(user)setTimeout(()=>syncNow({initial:true}),0)});
  window.addEventListener('isabella:state',()=>{if(hydrating||!user)return;clearTimeout(timer);timer=setTimeout(()=>syncNow({pushOnly:true}),900)});
  window.addEventListener('isabella:mutation',e=>{if(!user||!e.detail)return;recordActivity(e.detail)});
  window.addEventListener('isabella:proposal-feedback',e=>{if(!user||!e.detail)return;recordProposalFeedback(e.detail)});
}
function paintAuth(){
  if(!authButton)return;
  if(user){
    authButton.textContent='Memoria conectada';
    authButton.onclick=()=>syncNow({});
    setStatus('Supabase conectado · sincronización automática');
  }else{
    authButton.textContent='Conectar memoria';
    authButton.onclick=openLogin;
    setStatus('Memoria local · conecta Supabase para sincronizar');
  }
}
function openLogin(){
  app.openModal('Conectar memoria',`<div class="form">
    <input id="isabellaEmail" type="email" autocomplete="email" inputmode="email" required placeholder="tu@email.com">
    <button id="isabellaSendCode" class="primary">Enviar código</button>
    <div id="isabellaCodeStep" class="hidden form">
      <input id="isabellaCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Código de acceso">
      <button id="isabellaVerifyCode" class="primary">Entrar</button>
    </div>
    <div id="isabellaAuthMsg" class="small">Usa el mismo correo de MINDS. Te enviaremos un código para entrar sin salir de Isabella.</div>
  </div>`);
  $('#isabellaSendCode').onclick=async()=>{
    const email=$('#isabellaEmail').value.trim(),msg=$('#isabellaAuthMsg');
    if(!email){msg.textContent='Escribe primero tu correo.';return}
    $('#isabellaSendCode').disabled=true;
    msg.textContent='Enviando código…';
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
    if(error){
      $('#isabellaSendCode').disabled=false;
      msg.textContent=apiError(error);
      return;
    }
    $('#isabellaCodeStep').classList.remove('hidden');
    $('#isabellaEmail').disabled=true;
    msg.textContent='Revisa tu correo e introduce aquí el código de acceso.';
    setTimeout(()=>$('#isabellaCode')?.focus(),50);
  };
  $('#isabellaVerifyCode').onclick=async()=>{
    const email=$('#isabellaEmail').value.trim(),token=$('#isabellaCode').value.trim(),msg=$('#isabellaAuthMsg');
    if(!/^\d{6,10}$/.test(token)){msg.textContent='Introduce el código numérico completo que recibiste por correo.';return}
    $('#isabellaVerifyCode').disabled=true;
    msg.textContent='Verificando…';
    const {data,error}=await sb.auth.verifyOtp({email,token,type:'email'});
    if(error){
      $('#isabellaVerifyCode').disabled=false;
      msg.textContent=apiError(error);
      return;
    }
    user=data.user||data.session?.user||null;
    paintAuth();
    app.closeModal();
    if(user) await syncNow({initial:true});
  };
}
async function ensureTaxonomy(state){
  const categories=(state.categories||[]).map((c,i)=>({user_id:user.id,client_key:c.id,name:c.name,color:c.color||null,sort_order:i}));
  if(categories.length){
    const {error}=await sb.from('isabella_categories').upsert(categories,{onConflict:'user_id,client_key'});
    if(error)throw error;
  }
  const {data:cats,error:ce}=await sb.from('isabella_categories').select('id,client_key,name,color').eq('user_id',user.id);
  if(ce)throw ce;
  const catByKey=new Map((cats||[]).map(c=>[c.client_key,c]));
  const projects=(state.projects||[]).map(p=>({user_id:user.id,client_key:p.id,name:p.name,color:p.color||null,category_id:catByKey.get(p.categoryId)?.id||null})).filter(p=>p.category_id);
  if(projects.length){
    const {error}=await sb.from('isabella_projects').upsert(projects,{onConflict:'user_id,client_key'});
    if(error)throw error;
  }
  const {data:projs,error:pe}=await sb.from('isabella_projects').select('id,client_key,name,color,category_id').eq('user_id',user.id);
  if(pe)throw pe;
  return {cats:cats||[],projs:projs||[],catByKey,projByKey:new Map((projs||[]).map(p=>[p.client_key,p]))};
}
async function pushState(state,maps){
  const tombstones=[
    ...(state.deletedTaskIds||[]).map(client_key=>({user_id:user.id,entity_type:'task',client_key,deleted_at:new Date().toISOString()})),
    ...(state.deletedEventIds||[]).map(client_key=>({user_id:user.id,entity_type:'event',client_key,deleted_at:new Date().toISOString()}))
  ];
  if(tombstones.length){
    const {error}=await sb.from('isabella_deleted_items').upsert(tombstones,{onConflict:'user_id,entity_type,client_key'});
    if(error)throw error;
  }
  const tasks=(state.tasks||[]).map(t=>{
    if(t.done&&!t.completedAt)t.completedAt=new Date().toISOString();
    if(!t.done)t.completedAt=null;
    return {user_id:user.id,client_key:t.id,title:t.title,due_date:t.date,completed_at:t.completedAt||null,archived_at:t.archivedAt||null,sort_order:Number(t.sortOrder||0),reminder_time:t.reminderTime||null,category_id:maps.catByKey.get(t.categoryId)?.id||null,project_id:maps.projByKey.get(t.projectId)?.id||null,recurrence:t.recurrence||{},notes:t.notes||'',metadata:t.metadata||{}};
  });
  if(tasks.length){
    const {error}=await sb.from('isabella_tasks').upsert(tasks,{onConflict:'user_id,client_key'});
    if(error)throw error;
  }
  if((state.deletedTaskIds||[]).length){
    const {error}=await sb.from('isabella_tasks').delete().eq('user_id',user.id).in('client_key',state.deletedTaskIds);
    if(error)throw error;
  }
  const events=(state.events||[]).map(e=>{
    const start=localDateTime(e.date,e.start),end=new Date(start.getTime()+((e.duration||60)*60000));
    return {user_id:user.id,client_key:e.id,title:e.title,starts_at:start.toISOString(),ends_at:end.toISOString(),all_day:!!e.allDay,category_id:maps.catByKey.get(e.categoryId)?.id||null,project_id:maps.projByKey.get(e.projectId)?.id||null,recurrence:e.recurrence||{},notes:e.notes||'',metadata:e.metadata||{}};
  });
  if(events.length){
    const {error}=await sb.from('isabella_events').upsert(events,{onConflict:'user_id,client_key'});
    if(error)throw error;
  }
  if((state.deletedEventIds||[]).length){
    const {error}=await sb.from('isabella_events').delete().eq('user_id',user.id).in('client_key',state.deletedEventIds);
    if(error)throw error;
  }
  const memories=(state.memory||[]).map((m,i)=>({user_id:user.id,client_key:typeof m==='object'?(m.id||'memory-'+i):'memory-'+i,kind:typeof m==='object'?(m.kind||'context'):'context',subject:typeof m==='object'?(m.subject||null):null,content:typeof m==='object'?(m.content||''):String(m),status:typeof m==='object'?(m.status||'active'):'active',confidence:typeof m==='object'?(m.confidence??1):1,source:typeof m==='object'?(m.source||'conversation'):'conversation',metadata:typeof m==='object'?(m.metadata||{}):{}})).filter(x=>x.content);
  if(memories.length){
    const {error}=await sb.from('isabella_memories').upsert(memories,{onConflict:'user_id,client_key'});
    if(error)throw error;
  }
  await pushConversation(state.messages||[]);
}
async function conversationId(){
  const {data,error}=await sb.from('conversations').select('id,metadata').eq('user_id',user.id).eq('app_scope',APP_SCOPE).order('updated_at',{ascending:false}).limit(1);
  if(error)throw error;
  if(data?.[0]?.id)return data[0].id;
  const {data:created,error:ie}=await sb.from('conversations').insert({user_id:user.id,app_scope:APP_SCOPE,origin_kind:'global',origin_anchor:{type:'assistant',id:'isabella',label:'Isabella'},title:'Isabella',mode:'memory',metadata:{app:APP_SCOPE}}).select('id').single();
  if(ie)throw ie;return created.id;
}
async function pushConversation(messages){
  if(!messages.length)return;
  const cid=await conversationId(),now=new Date().toISOString();
  const rows=messages.map((m,i)=>({user_id:user.id,conversation_id:cid,client_key:m.id||String(i).padStart(6,'0'),role:['assistant','system'].includes(m.role)?m.role:'user',content:m.text||'',provisional:false,citations:[],metadata:{app:APP_SCOPE},created_at:m.at||now}));
  const {error}=await sb.from('conversation_messages').upsert(rows,{onConflict:'user_id,conversation_id,client_key',ignoreDuplicates:true});
  if(error)throw error;
  await sb.from('conversations').update({updated_at:now}).eq('id',cid).eq('user_id',user.id).eq('app_scope',APP_SCOPE);
}
async function pullState(local,maps){
  const [{data:tasks,error:te},{data:events,error:ee},{data:mem,error:me}] = await Promise.all([
    sb.from('isabella_tasks').select('*').eq('user_id',user.id).order('due_date',{ascending:true}),
    sb.from('isabella_events').select('*').eq('user_id',user.id).order('starts_at',{ascending:true}),
    sb.from('isabella_memories').select('*').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:true})
  ]);
  if(te)throw te;if(ee)throw ee;if(me)throw me;
  const catKey=new Map(maps.cats.map(c=>[c.id,c.client_key])),projKey=new Map(maps.projs.map(p=>[p.id,p.client_key]));
  const deletedTaskIds=new Set(local.deletedTaskIds||[]);
  const deletedEventIds=new Set(local.deletedEventIds||[]);
  const remoteTasks=(tasks||[]).filter(t=>!deletedTaskIds.has(t.client_key||t.id)).map(t=>({id:t.client_key||t.id,title:t.title,date:t.due_date,done:!!t.completed_at,completedAt:t.completed_at||null,archivedAt:t.archived_at||null,sortOrder:Number(t.sort_order||0),reminderTime:t.reminder_time?String(t.reminder_time).slice(0,5):null,categoryId:catKey.get(t.category_id)||'personal',projectId:projKey.get(t.project_id)||null,recurrence:t.recurrence||{},notes:t.notes||'',metadata:t.metadata||{}}));
  const remoteEvents=(events||[]).filter(e=>!deletedEventIds.has(e.client_key||e.id)).map(e=>{const s=new Date(e.starts_at),en=new Date(e.ends_at);return{id:e.client_key||e.id,title:e.title,date:isoDate(s),start:timeOf(s),duration:Math.max(1,Math.round((en-s)/60000)),allDay:!!e.all_day,categoryId:catKey.get(e.category_id)||'personal',projectId:projKey.get(e.project_id)||null,recurrence:e.recurrence||{},notes:e.notes||'',metadata:e.metadata||{}}});
  const remoteMemory=(mem||[]).map(m=>({id:m.client_key||m.id,kind:m.kind,subject:m.subject,content:m.content,status:m.status,confidence:Number(m.confidence),source:m.source,metadata:m.metadata||{}}));
  const remoteMessages=await pullConversation();
  return {...local,tasks:remoteTasks,events:remoteEvents,memory:remoteMemory,messages:remoteMessages.length?remoteMessages:local.messages};
}
async function pullConversation(){
  const {data,error}=await sb.from('conversations').select('id').eq('user_id',user.id).eq('app_scope',APP_SCOPE).order('updated_at',{ascending:false}).limit(1);
  if(error||!data?.length)return[];
  const {data:msgs,error:me}=await sb.from('conversation_messages').select('client_key,role,content,created_at,metadata,conversations!inner(app_scope)').eq('conversations.app_scope',APP_SCOPE).eq('user_id',user.id).eq('conversation_id',data[0].id).order('created_at',{ascending:true});
  if(me)throw me;
  return (msgs||[]).map(m=>({id:m.client_key,role:m.role,text:m.content,at:m.created_at,reaction:m.metadata?.reaction||null}));
}
async function recordProposalFeedback(detail){
  try{
    await sb.from('isabella_proposal_feedback').insert({
      user_id:user.id,
      outcome:detail.outcome,
      proposal:detail.proposal||{}
    });
  }catch{}
}
async function recordActivity(detail){
  try{
    const row={
      user_id:user.id,
      entity_type:detail.entityType,
      entity_key:detail.entityKey,
      action:detail.action,
      source:detail.source||'manual',
      before_state:detail.before||null,
      after_state:detail.after||null
    };
    if(detail.action==='delete'){
      await sb.from('isabella_deleted_items').upsert({user_id:user.id,entity_type:detail.entityType,client_key:detail.entityKey,deleted_at:new Date().toISOString()},{onConflict:'user_id,entity_type,client_key'});
      const table=detail.entityType==='task'?'isabella_tasks':'isabella_events';
      await sb.from(table).delete().eq('user_id',user.id).eq('client_key',detail.entityKey);
    }
    await sb.from('isabella_activity_log').insert(row);
  }catch(e){
    setStatus('Cambio local guardado · historial pendiente');
  }
}
async function syncNow(opts={}){
  if(!user||syncing)return;
  syncing=true;setStatus('Sincronizando…');
  try{
    let local=app.getState();
    const {data:deleted,error:de}=await sb.from('isabella_deleted_items').select('entity_type,client_key').eq('user_id',user.id);
    if(de)throw de;
    const deletedTasks=new Set((deleted||[]).filter(x=>x.entity_type==='task').map(x=>x.client_key));
    const deletedEvents=new Set((deleted||[]).filter(x=>x.entity_type==='event').map(x=>x.client_key));
    local={
      ...local,
      tasks:(local.tasks||[]).filter(x=>!deletedTasks.has(x.id)),
      events:(local.events||[]).filter(x=>!deletedEvents.has(x.id)),
      deletedTaskIds:[...new Set([...(local.deletedTaskIds||[]),...deletedTasks])],
      deletedEventIds:[...new Set([...(local.deletedEventIds||[]),...deletedEvents])]
    };
    hydrating=true;app.replaceState(local);hydrating=false;
    const maps=await ensureTaxonomy(local);
    await pushState(local,maps);
    if(!opts.pushOnly){
      const next=await pullState(local,maps);
      hydrating=true;app.replaceState(next);hydrating=false;
    }
    setStatus('Memoria sincronizada · Supabase');
    try{window.dispatchEvent(new CustomEvent('isabella:synced',{detail:{initial:!!opts.initial}}))}catch{}
  }catch(e){setStatus('Error de sincronización: '+apiError(e))}
  finally{syncing=false}
}
init();
})();