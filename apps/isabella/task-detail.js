/* Build 97B · One canonical, auto-saving task detail across Work, Chat and Tiempo.
 * Owner-scoped Supabase row is source of truth. Never silently overwrite conflicts. */
(()=>{
'use strict';
const sb=window.MINDS_SUPABASE,app=()=>window.ISABELLA_APP;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now();
let generation=0;
const status=(text,error=false)=>{
  const node=$('#taskDetailStatus');if(node){node.textContent=text;node.dataset.error=String(error)}
};
const fail=err=>status('No guardado · '+(err?.message||String(err)),true);
const selectOption=(id,name,selected)=>'<option value="'+E(id)+'" '+(String(id)===String(selected)?'selected':'')+'>'+E(name)+'</option>';
const datesValid=(start,due)=>!start||!due||start<=due;
const yes=(value)=>Array.isArray(value)?value:[];
async function readTask(opts){
  let query=sb.from('isabella_tasks').select('*');
  if(opts.taskId)query=query.eq('id',opts.taskId);
  else query=query.eq('client_key',opts.clientKey);
  const {data,error}=await query.maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('La tarea no existe o no está disponible.');
  return data;
}
async function readChoices(projectId){
  const [pr,cat]=await Promise.all([
    sb.from('isabella_projects').select('id,client_key,name').order('name'),
    sb.from('isabella_categories').select('id,client_key,name').order('name')
  ]);
  if(pr.error||cat.error)throw pr.error||cat.error;
  const projects=pr.data||[],categories=cat.data||[];
  const project=projects.find(p=>p.id===projectId);
  const [buckets,people]=await Promise.all([
    project?sb.from('minds_work_buckets').select('id,name').eq('project_id',project.id).eq('archived',false).order('sort_order'):Promise.resolve({data:[],error:null}),
    project&&window.MINDS_WORK_TEAM?.members?window.MINDS_WORK_TEAM.members(project.id):Promise.resolve([])
  ]);
  if(buckets.error)throw buckets.error;
  return {projects,categories,buckets:buckets.data||[],people,project};
}
function errView(message){
  app()?.openModal?.('Tarea','<div class="minds-task-detail-error">'+E(message)+'</div>');
}
async function open(opts={}){
  const ticket=++generation;
  app()?.openModal?.('Tarea','<div class="minds-task-loading">Cargando tarea…</div>');
  if(!sb){errView('No hay conexión con Supabase.');return}
  let task=null;
  try{
    const auth=await sb.auth.getSession();
    if(!auth.data?.session)throw new Error('Inicia sesión para editar tareas.');
    if(opts.taskId||opts.clientKey)task=await readTask(opts);
    const state=app()?.getState?.()||{};
    let projectId=task?.project_id||opts.projectId||null;
    if(!projectId&&opts.projectKey){
      const project=(state.projects||[]).find(x=>x.id===opts.projectKey);
      const key=project?.id||opts.projectKey;
      const found=await sb.from('isabella_projects').select('id').eq('client_key',key).maybeSingle();
      if(found.error)throw found.error;
      projectId=found.data?.id||null;
    }
    let choices=await readChoices(projectId);
    if(ticket!==generation)return;
    if(!projectId&&task)projectId=task.project_id;
    const categoryId=task?.category_id||choices.categories.find(c=>c.client_key===opts.categoryKey)?.id||null;
    const teamData=task&&window.MINDS_TASK_TEAM?.read?await window.MINDS_TASK_TEAM.read(task.id,task.assignee_person_id):{ids:[],allocations:[]};
    const ctx={ticket,task,projectId,categoryId,choices,opts,queue:Promise.resolve(),blocked:false,
      teamIds:teamData.ids.length?teamData.ids:(task?.assignee_person_id?[task.assignee_person_id]:[]),
      allocations:teamData.allocations};
    render(ctx);
  }catch(error){if(ticket===generation)errView(error?.message||error)}
}
function render(ctx){
  if(ctx.ticket!==generation)return;
  const t=ctx.task||{},choices=ctx.choices;
  const person=t.assignee_person_id||'',legacy=t.assignee&&!person;
  const statusValue=t.work_status||'not_started',priority=t.priority||'normal';
  const projectOptions=selectOption('','Sin proyecto',t.project_id||ctx.projectId)+
    choices.projects.map(p=>selectOption(p.id,p.name,t.project_id||ctx.projectId)).join('');
  const categoryOptions=selectOption('','Sin categoría',t.category_id||ctx.categoryId)+
    choices.categories.map(c=>selectOption(c.id,c.name,t.category_id||ctx.categoryId)).join('');
  const bucketOptions=selectOption('','Sin bucket',t.work_bucket_id||ctx.opts.bucketId)+
    choices.buckets.map(b=>selectOption(b.id,b.name,t.work_bucket_id||ctx.opts.bucketId)).join('');
  const peopleOptions=selectOption('','Sin responsable',person)+
    choices.people.map(p=>selectOption(p.id,p.name,person)).join('')+
    (legacy?selectOption('__legacy__','Asignación antigua · '+t.assignee,'__legacy__'):'');
  const checklist=yes(t.checklist),attachments=yes(t.attachments),links=yes(t.links);
  const checks=checklist.map(c=>checkRow(c)).join('');
  const attachmentsHtml=attachments.map(a=>'<div class="minds-task-attachment"><button type="button" data-task-attachment="'+E(a.path||'')+'">'+E(a.name||'Archivo adjunto')+'</button></div>').join('');
  const linksHtml=links.map((l,i)=>'<div class="minds-task-link"><a target="_blank" rel="noopener noreferrer" href="'+
    (String(l.url||'').match(/^https?:\/\//i)?E(l.url):'#')+'">'+E(l.title||l.url||'Enlace')+'</a>'+
    '<button type="button" data-task-link-remove="'+i+'" title="Quitar enlace">×</button></div>').join('');
  const estimate=Number(t.metadata?.planning?.estimated_minutes||0);
  const body='<div class="minds-task-detail" data-task-detail>'+
    '<header class="minds-task-detail-top"><button type="button" class="minds-task-complete" id="taskDetailComplete" aria-label="Marcar como completada">'+
    (t.completed_at?'✓':'○')+'</button><input id="taskDetailTitle" aria-label="Título" placeholder="Nombre de la tarea" value="'+E(t.title||ctx.opts.title||'')+'">'+
    '<button class="minds-task-more" type="button" id="taskDetailMore" aria-label="Opciones de tarea">···</button></header>'+
    '<div id="taskDetailMenu" class="minds-task-menu hidden">'+
    '<button type="button" data-task-action="archive">Archivar</button>'+
    '<button type="button" data-task-action="delete" class="danger-text">Eliminar definitivamente…</button></div>'+
    '<div class="minds-task-fields">'+
    '<label>Proyecto<select id="taskDetailProject">'+projectOptions+'</select></label>'+
    '<label>Bucket<select id="taskDetailBucket">'+bucketOptions+'</select></label>'+
    '<label>Inicio<input type="date" id="taskDetailStart" value="'+E(t.start_date||ctx.opts.startDate||'')+'"></label>'+
    '<label>Entrega<input type="date" id="taskDetailDue" value="'+E(t.due_date||ctx.opts.date||'')+'"></label>'+
    '<div class="minds-task-team-field"><span>Responsables</span>'+window.MINDS_TASK_TEAM.selectorHtml(ctx)+'</div>'+
    '<label>Estado<select id="taskDetailWorkStatus">'+
    [['not_started','Nicht begonnen'],['in_progress','In Bearbeitung'],['waiting','Warten'],['completed','Erledigt']]
      .map(([id,name])=>selectOption(id,name,statusValue)).join('')+'</select></label>'+
    '<label>Prioridad<select id="taskDetailPriority">'+
    [['low','Niedrig'],['normal','Normal'],['important','Wichtig'],['urgent','Dringend']]
      .map(([id,name])=>selectOption(id,name,priority)).join('')+'</select></label>'+
    '<label>Categoría<select id="taskDetailCategory">'+categoryOptions+'</select></label>'+
    '<label>Tiempo estimado (min)<input id="taskDetailEstimate" type="number" min="0" max="43200" step="15" value="'+(estimate||'')+'" placeholder="Sin estimación"></label>'+
    '<label>Recordatorio<input id="taskDetailReminder" type="time" value="'+E(String(t.reminder_time||'').slice(0,5))+'"></label>'+
    '</div>'+
    '<label class="minds-task-long-field">Etiquetas<input id="taskDetailLabels" value="'+E(yes(t.labels).join(', '))+'" placeholder="TGA, Bauherr, Freigabe"></label>'+
    '<label class="minds-task-long-field">Notas<textarea id="taskDetailNotes" rows="3" placeholder="Añadir notas">'+E(t.notes||'')+'</textarea></label>'+
    '<div class="minds-task-section"><div class="minds-task-section-head"><strong>Checklist</strong><span>'+checklist.filter(c=>c.done).length+'/'+checklist.length+'</span></div>'+
    '<div id="taskDetailChecks">'+checks+'</div><button type="button" class="minds-task-inline-add" id="taskDetailAddCheck">＋ Añadir paso</button></div>'+
    '<div class="minds-task-section"><div class="minds-task-section-head"><strong>Adjuntos</strong>'+
    '<button type="button" class="minds-task-inline-add" id="taskDetailAddFile">＋ Añadir archivo</button></div>'+
    '<div id="taskDetailAttachments">'+(attachmentsHtml||'<span class="minds-task-muted">Sin adjuntos</span>')+'</div>'+
    '<input type="file" id="taskDetailFile" class="hidden" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></div>'+
    '<div class="minds-task-section"><div class="minds-task-section-head"><strong>Enlaces</strong>'+
    '<button type="button" class="minds-task-inline-add" id="taskDetailAddLink">＋ Añadir enlace</button></div>'+
    '<div id="taskDetailLinks">'+linksHtml+'</div></div>'+
    window.MINDS_TASK_TEAM.allocationsHtml(ctx)+
    '<div class="minds-task-section"><div class="minds-task-section-head"><strong>Sesiones de trabajo</strong>'+
    '<div class="minds-task-session-actions"><button type="button" class="minds-task-inline-add" id="taskDetailPropose">◇ Proponer bloques</button>'+ 
    '<button type="button" class="minds-task-inline-add" id="taskDetailBook">＋ Reservar tiempo</button></div></div>'+
    '<div id="taskDetailSessions"><span class="minds-task-muted">Las reservas están vinculadas a la misma tarea.</span></div></div>'+
    '<footer class="minds-task-footer"><span id="taskDetailStatus" role="status" aria-live="polite">'+
    (ctx.task?'Los cambios se guardan automáticamente':'Completa los campos y crea la tarea')+'</span>'+
    (!ctx.task?'<button type="button" class="minds-task-create" id="taskDetailCreate">Crear tarea</button>':'')+
    '<button type="button" class="minds-task-reload hidden" id="taskDetailReload">Recargar versión actual</button></footer></div>';
  app()?.openModal?.(ctx.task?'Tarea':'Nueva tarea',body);
  bind(ctx);
  if(ctx.task)void loadSessions(ctx);
}
function checkRow(c){
  return '<div class="minds-task-check-row" data-task-check-id="'+E(c.id||uid())+'">'+
    '<input type="checkbox" data-task-check-done aria-label="Paso completado" '+(c.done?'checked':'')+'>'+
    '<input type="text" data-task-check-text placeholder="Añadir paso…" value="'+E(c.text||'')+'">'+
    '<button type="button" data-task-check-remove title="Quitar paso">×</button></div>';
}
function bind(ctx){
  const field=(name,make)=>{const node=$(name);if(!node)return;
    node.addEventListener('change',()=>{void update(ctx,make(node.value))});
  };
  const blur=(name,make)=>{const node=$(name);if(!node)return;
    node.addEventListener('blur',()=>{void update(ctx,make(node.value))});
  };
  const dates=()=>datesValid($('#taskDetailStart').value,$('#taskDetailDue').value);
  const validDate=(make)=>value=>{
    if(!dates()){status('La fecha de inicio debe ser anterior o igual a la entrega.',true);return null}
    return make(value);
  };
  blur('#taskDetailTitle',value=>({title:value.trim()}));
  blur('#taskDetailNotes',value=>({notes:value}));
  blur('#taskDetailLabels',value=>({labels:value.split(',').map(s=>s.trim()).filter(Boolean)}));
  field('#taskDetailStart',validDate(value=>({start_date:value||null})));
  field('#taskDetailDue',validDate(value=>({due_date:value||null})));
  field('#taskDetailBucket',value=>({work_bucket_id:value||null}));
  field('#taskDetailPriority',value=>({priority:value}));
  field('#taskDetailCategory',value=>({category_id:value||null}));
  field('#taskDetailReminder',value=>({reminder_time:$('#taskDetailDue').value?(value||null):null}));
  field('#taskDetailEstimate',value=>{
    const n=value===''?0:Number(value);
    if(!Number.isInteger(n)||n<0||n>43200){status('Estimación fuera de rango.',true);return null}
    return {metadata:{...(ctx.task?.metadata||{}),planning:{...(ctx.task?.metadata?.planning||{}),estimated_minutes:n}}};
  });
  field('#taskDetailWorkStatus',value=>({work_status:value,completed_at:value==='completed'?(ctx.task?.completed_at||new Date().toISOString()):null}));
  field('#taskDetailProject',value=>{void changeProject(ctx,value||null);return null});
  $('#taskDetailComplete').onclick=()=>void update(ctx,{completed_at:ctx.task?.completed_at?null:new Date().toISOString(),
    work_status:ctx.task?.completed_at?'not_started':'completed'},true);
  $('#taskDetailMore').onclick=()=>$('#taskDetailMenu').classList.toggle('hidden');
  $$('[data-task-action]').forEach(b=>b.onclick=()=>void doAction(ctx,b.dataset.taskAction));
  $('#taskDetailReload').onclick=()=>void open(ctx.task?{taskId:ctx.task.id}:ctx.opts);
  $('#taskDetailAddCheck').onclick=()=>{const list=$('#taskDetailChecks');list.insertAdjacentHTML('beforeend',checkRow({id:uid(),text:'',done:false}));
    list.lastElementChild.querySelector('[data-task-check-text]')?.focus()};
  $('#taskDetailChecks').addEventListener('change',event=>{if(event.target.matches('[data-task-check-done]'))void updateChecks(ctx)});
  $('#taskDetailChecks').addEventListener('focusout',event=>{if(event.target.matches('[data-task-check-text]'))void updateChecks(ctx)});
  $('#taskDetailChecks').addEventListener('click',event=>{
    const button=event.target.closest('[data-task-check-remove]');
    if(!button)return;button.closest('.minds-task-check-row')?.remove();void updateChecks(ctx);
  });
  $('#taskDetailAddFile').onclick=()=>$('#taskDetailFile').click();
  $('#taskDetailFile').onchange=event=>{void uploadFiles(ctx,[...(event.target.files||[])]);event.target.value=''};
  $('#taskDetailAttachments').addEventListener('click',event=>{
    const btn=event.target.closest('[data-task-attachment]');if(btn)void openAttachment(btn.dataset.taskAttachment);
  });
  $('#taskDetailAddLink').onclick=()=>{
    const url=window.prompt('URL del enlace (https://)');
    if(!url)return;
    if(!/^https?:\/\/\S+$/i.test(url)){status('URL inválida.',true);return}
    void update(ctx,{links:[...yes(ctx.task?.links),{url}]},true);
  };
  $('#taskDetailLinks').addEventListener('click',event=>{
    const b=event.target.closest('[data-task-link-remove]');if(!b)return;
    void update(ctx,{links:yes(ctx.task?.links).filter((_,i)=>i!==Number(b.dataset.taskLinkRemove))},true);
  });
  $('#taskDetailPropose').onclick=async()=>{
    if(!ctx.task){status('Crea primero la tarea.',true);return}
    await ctx.queue;
    if(ctx.blocked){status('Hay cambios sin confirmar. Recarga la tarea antes de planificar.',true);return}
    if(!window.MINDS_TIME_PLANNING?.open){status('La planificación no está disponible.',true);return}
    await window.MINDS_TIME_PLANNING.open({taskId:ctx.task.id});
  };
  $('#taskDetailBook').onclick=()=>{
    if(!ctx.task){status('Crea primero la tarea.',true);return}
    const key=ctx.task.client_key||ctx.task.id;
    if(!app()?.planTaskSession?.(key))status('Sincroniza la tarea antes de reservar tiempo.',true);
  };
  window.MINDS_TASK_TEAM?.bind?.(ctx);
  if(!ctx.task)$('#taskDetailCreate').onclick=()=>void createTask(ctx);
}
function collectChecks(){
  return $$('#taskDetailChecks [data-task-check-id]').map(row=>({
    id:row.dataset.taskCheckId,text:row.querySelector('[data-task-check-text]')?.value.trim()||'',
    done:!!row.querySelector('[data-task-check-done]')?.checked
  })).filter(c=>c.text);
}
function updateChecks(ctx){return update(ctx,{checklist:collectChecks()})}
async function perform(ctx,patch,rerender=false){
  if(ctx.blocked||ctx.ticket!==generation)return;
  if(!ctx.task){status('Crea primero la tarea.',true);return}
  try{
    const newer=new Date(Date.now()+1).toISOString();
    const {data,error}=await sb.from('isabella_tasks')
      .update({...patch,updated_at:newer})
      .eq('id',ctx.task.id).eq('updated_at',ctx.task.updated_at)
      .select('*').maybeSingle();
    if(error)throw error;
    if(!data){ctx.blocked=true;status('Conflicto: otra edición modificó esta tarea. Recarga para no sobrescribirla.',true);
      $('#taskDetailReload')?.classList.remove('hidden');return}
    ctx.task=data;status('Guardado');
    if(rerender)render(ctx);
    void app()?.refresh?.();
    void window.ISABELLA_SYNC_PULL_NOW?.().catch(()=>{});
    if(typeof ctx.opts.onUpdated==='function')void Promise.resolve(ctx.opts.onUpdated()).catch(()=>{});
  }catch(error){ctx.blocked=true;fail(error);$('#taskDetailReload')?.classList.remove('hidden')}
}
function update(ctx,patch,rerender=false){
  if(!patch)return Promise.resolve();
  if(!ctx.task){status('Crea primero la tarea.',true);return Promise.resolve()}
  if(!Object.keys(patch).length)return Promise.resolve();
  if(ctx.blocked){status('Modificaciones detenidas: revisa el error y recarga.',true);return Promise.resolve()}
  const changed=Object.entries(patch).filter(([k,v])=>JSON.stringify(ctx.task[k])!==JSON.stringify(v));
  if(!changed.length)return ctx.queue;
  status('Guardando…');
  const values=Object.fromEntries(changed);
  ctx.queue=ctx.queue.then(()=>perform(ctx,values,rerender));
  return ctx.queue;
}
async function changeProject(ctx,id){
  if(ctx.task&&ctx.allocations?.length){
    render(ctx);
    status('Antes de cambiar de proyecto, retira las jornadas previstas del equipo.',true);
    return;
  }
  if(!ctx.task){
    ctx.projectId=id;ctx.opts.projectId=id;ctx.opts.bucketId=null;ctx.choices=await readChoices(id);
    if(ctx.ticket===generation)render(ctx);return;
  }
  await update(ctx,{project_id:id,assignee_person_id:null,assignee:null,work_bucket_id:null});
  if(ctx.blocked)return;
  ctx.projectId=id;ctx.opts.bucketId=null;ctx.choices=await readChoices(id);
  ctx.teamIds=[];ctx.allocations=[];
  if(ctx.ticket===generation)render(ctx);
}
async function createTask(ctx){
  const title=$('#taskDetailTitle')?.value.trim();
  if(!title){status('Escribe primero un título.',true);return}
  if(!datesValid($('#taskDetailStart').value,$('#taskDetailDue').value)){
    status('La fecha de inicio debe ser anterior o igual a la entrega.',true);return;
  }
  const member=ctx.choices.people.find(p=>(ctx.teamIds||[]).includes(p.id));
  const estimate=Number($('#taskDetailEstimate').value||0);
  if(!Number.isInteger(estimate)||estimate<0||estimate>43200){status('Estimación fuera de rango.',true);return}
  const projectId=$('#taskDetailProject').value||null;
  if(member&&!projectId){status('Selecciona un proyecto antes del responsable.',true);return}
  const statusValue=$('#taskDetailWorkStatus').value;
  const row={title,project_id:projectId,category_id:$('#taskDetailCategory').value||null,
    work_bucket_id:$('#taskDetailBucket').value||null,work_status:statusValue,
    priority:$('#taskDetailPriority').value,start_date:$('#taskDetailStart').value||null,
    due_date:$('#taskDetailDue').value||null,assignee_person_id:null,
    assignee:null,labels:$('#taskDetailLabels').value.split(',').map(s=>s.trim()).filter(Boolean),
    notes:$('#taskDetailNotes').value,checklist:collectChecks(),
    completed_at:statusValue==='completed'?new Date().toISOString():null,
    metadata:{planning:{estimated_minutes:estimate}},reminder_time:$('#taskDetailDue').value?($('#taskDetailReminder').value||null):null,
    sort_order:0,work_sort_order:10};
  status('Creando…');
  const button=$('#taskDetailCreate');button.disabled=true;
  try{
    const {data,error}=await sb.from('isabella_tasks').insert(row).select('*').single();
    if(error||!data)throw error||new Error('El servidor no confirmó la tarea.');
    ctx.task=data;ctx.projectId=data.project_id;ctx.categoryId=data.category_id;
    if(ctx.teamIds?.length){
      const assigned=await sb.rpc('minds_work_set_task_assignees',{
        p_task_id:data.id,p_person_ids:ctx.teamIds,p_expected_updated_at:data.updated_at
      });
      if(assigned.error)throw assigned.error;
      const fresh=await readTask({taskId:data.id});
      ctx.task=fresh;
    }
    await app()?.refresh?.();
    void window.ISABELLA_SYNC_PULL_NOW?.().catch(()=>{});
    if(typeof ctx.opts.onUpdated==='function')void Promise.resolve(ctx.opts.onUpdated()).catch(()=>{});
    render(ctx);status('Tarea creada · guardado automático activo');
  }catch(error){
    if(ctx.task){render(ctx);status('La tarea se creó, pero falta confirmar la asignación: '+(error?.message||error),true)}
    else{fail(error);button.disabled=false}
  }
}
async function doAction(ctx,action){
  if(!ctx.task){status('Aún no existe una tarea para esta acción.',true);return}
  $('#taskDetailMenu').classList.add('hidden');
  if(action==='archive'){
    if(!window.confirm('¿Archivar esta tarea? Podrás recuperarla después.'))return;
    await update(ctx,{archived_at:new Date().toISOString()},false);
    if(!ctx.blocked)app()?.closeModal?.();
  }else if(action==='delete'){
    if(!window.confirm('¿Eliminar definitivamente esta tarea? Sus sesiones de calendario no se eliminarán automáticamente.'))return;
    try{
      const {data,error}=await sb.from('isabella_tasks').delete().eq('id',ctx.task.id)
        .eq('updated_at',ctx.task.updated_at).select('id').maybeSingle();
      if(error||!data)throw error||new Error('La tarea cambió. Recarga y vuelve a comprobar.');
      app()?.closeModal?.();
      if(typeof ctx.opts.onUpdated==='function')void Promise.resolve(ctx.opts.onUpdated()).catch(()=>{});
      void window.ISABELLA_SYNC_PULL_NOW?.().catch(()=>{});
    }catch(error){fail(error)}
  }
}
async function uploadFiles(ctx,files){
  if(!files.length)return;
  if(!ctx.task){status('Crea primero la tarea para adjuntar archivos.',true);return}
  const auth=await sb.auth.getSession(),userId=auth.data?.session?.user?.id;
  if(!userId){status('No hay sesión autenticada.',true);return}
  const project=ctx.choices.projects.find(p=>p.id===ctx.task.project_id);
  for(const file of files){
    if(file.size>12*1024*1024){status('El archivo supera 12 MiB.',true);continue}
    const name=String(file.name||'archivo').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=userId+'/'+(project?.client_key||'personal')+'/tasks/'+ctx.task.id+'/'+uid()+'-'+name;
    status('Subiendo '+file.name+'…');
    const {error}=await sb.storage.from('minds-work').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error){fail(error);continue}
    await update(ctx,{attachments:[...yes(ctx.task.attachments),{id:uid(),name:file.name,path,
      mime:file.type||'application/octet-stream',size:file.size,created_at:new Date().toISOString()}]},true);
  }
}
async function openAttachment(path){
  if(!path)return;
  const {data,error}=await sb.storage.from('minds-work').createSignedUrl(path,60);
  if(error||!data?.signedUrl){fail(error||'No disponible');return}
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}
async function loadSessions(ctx){
  const key=ctx.task?.client_key;if(!key)return;
  const {data,error}=await sb.from('isabella_events').select('client_key,title,starts_at,ends_at,metadata')
    .contains('metadata',{kind:'task_work_session_v1',task_client_key:key}).order('starts_at');
  if(error||ctx.ticket!==generation)return;
  const target=$('#taskDetailSessions');if(!target)return;
  target.innerHTML=(data||[]).map(e=>'<div class="minds-task-session">'+
    '<span>'+E(new Date(e.starts_at).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+
    '</span><button type="button" data-task-session="'+E(e.client_key)+'">Editar ↗</button></div>').join('')||
    '<span class="minds-task-muted">Sin reservas todavía.</span>';
  target.querySelectorAll('[data-task-session]').forEach(b=>b.onclick=()=>app()?.editEventById?.(b.dataset.taskSession));
}

/** One-save task creation with authenticated canonical readback. The stable
 * client_key supports retry after a committed insert with a lost response. */
async function createQuick({title,date=null,categoryKey=null,projectKey=null,clientKey}={}){
  title=String(title||'').trim();
  if(!title)throw new Error('Escribe un nombre para la tarea.');
  if(date!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00Z').getTime())))
    throw new Error('La fecha de la tarea no es válida.');
  if(typeof clientKey!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientKey))
    throw new Error('El intento de guardado no tiene un identificador válido.');
  if(!sb)throw new Error('Supabase no está conectado.');
  const {data:auth,error:authError}=await sb.auth.getSession();
  const owner=auth?.session?.user?.id;
  if(authError||!owner)throw new Error('Inicia sesión para guardar esta tarea.');
  const choices=await readChoices(null);
  const category=categoryKey?choices.categories.find(c=>c.client_key===categoryKey||c.id===categoryKey):null;
  const project=projectKey?choices.projects.find(p=>p.client_key===projectKey||p.id===projectKey):null;
  if(categoryKey&&!category)throw new Error('La categoría ya no está disponible. Actualiza MINDS.');
  if(projectKey&&!project)throw new Error('El proyecto ya no está disponible. Actualiza MINDS.');
  const row={client_key:clientKey,title,due_date:date||null,
    category_id:category?.id||null,project_id:project?.id||null};
  const read=async()=>{
    const {data,error}=await sb.from('isabella_tasks')
      .select('id,client_key,user_id,title,due_date,category_id,project_id,updated_at')
      .eq('user_id',owner).eq('client_key',clientKey).maybeSingle();
    if(error)throw error;
    return data;
  };
  let task=await read();
  if(!task){
    const result=await sb.from('isabella_tasks').insert(row).select('id').maybeSingle();
    if(result.error){
      task=await read();
      if(!task)throw result.error;
    }else task=await read();
  }
  if(!task)throw new Error('No pude verificar la creación en Supabase. Reintenta Guardar.');
  if(task.client_key!==clientKey||task.user_id!==owner||task.title!==row.title||
     task.due_date!==row.due_date||task.category_id!==row.category_id||
     task.project_id!==row.project_id)
    throw new Error('Existe un guardado anterior con otros datos. No se ha duplicado la tarea.');
  return task;
}

window.MINDS_TASK_DETAIL={open,datesValid,createQuick};
})();