(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sb=window.MINDS_SUPABASE;
const DEFAULT_BUCKETS=['Projektorganisation','Entwurf','Genehmigung','Ausführungsplanung','Ausschreibung/Vergabe','Baustelle','Dokumentation'];
let projectKey=localStorage.getItem('minds-work-project')||'bernried',view=localStorage.getItem('minds-work-view')||'overview',folderId=null,project=null,folders=[],files=[],buckets=[],tasks=[],threads=[],activeThreadId=null,bound=false,pendingTaskFiles=[],editingAttachments=[],draggedWorkTaskId=null,draggedWorkBucketId=null;
const workSignedCache=new Map();
let team=[],reviewSettings=null,reviewReportLimit=20,workRenderVersion=0;
/* Purely visual preferences and labels; no task statuses are rewritten. */
const WORK_MOBILE_LAYOUT_KEY='minds-work-mobile-planner-layout-v1';

function setStatus(t=''){const el=$('#workStatus');if(el)el.textContent=t}
function safeName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150)||'file'}
function sourceKind(file){const n=String(file?.name||'').toLowerCase(),m=String(file?.type||'');if(n.endsWith('.eml')||n.endsWith('.msg')||m==='message/rfc822')return'email';if(m.startsWith('image/'))return'image';if(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/i.test(n))return'document';return'file'}
async function getSession(){if(!sb)return null;const {data}=await sb.auth.getSession();return data?.session||null}
async function loadProject(knownSession=null){const session=knownSession||await getSession();if(!session)return null;const {data,error}=await sb.from('isabella_projects').select('id,client_key,name').eq('user_id',session.user.id).eq('client_key',projectKey).maybeSingle();if(error)throw error;return data||null}
function bindStatic(){
  if(bound)return;bound=true;
  $('.work-project-switch')?.addEventListener('click',e=>{const b=e.target.closest('[data-work-project]');if(!b)return;projectKey=b.dataset.workProject;localStorage.setItem('minds-work-project',projectKey);folderId=null;activeThreadId=null;reviewReportLimit=20;void render()});
  $$('[data-work-view]').forEach(b=>b.onclick=()=>{view=b.dataset.workView;localStorage.setItem('minds-work-view',view);paintChrome();void render()});
  const input=$('#workFileInput');if(input)input.onchange=()=>{const fs=[...(input.files||[])];input.value='';if(fs.length)void uploadFiles(fs)};
  const body=$('#workBody');
  body?.addEventListener('click',e=>{if(e.target.closest('[data-work-retry]'))void render()});
  body?.addEventListener('dragover',e=>{if(view!=='desktop')return;e.preventDefault();body.classList.add('is-dragging')});
  body?.addEventListener('dragleave',()=>body.classList.remove('is-dragging'));
  body?.addEventListener('drop',e=>{if(view!=='desktop')return;e.preventDefault();body.classList.remove('is-dragging');const fs=[...(e.dataTransfer?.files||[])];if(fs.length)void uploadFiles(fs)});
}
function paintChrome(){
  $('#workProjectTitle').textContent=project?.name||projectKey;
  $$('[data-work-project]').forEach(b=>b.classList.toggle('active',b.dataset.workProject===projectKey));
  $$('[data-work-view]').forEach(b=>b.classList.toggle('active',b.dataset.workView===view));
}
async function waitForWork(promise,stage,ms=14000){
  let timeoutId;
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('Work '+stage+' timeout')),ms)})
    ]);
  }finally{clearTimeout(timeoutId)}
}
function workBootFailure(message,switchLabel=''){
  const body=$('#workBody');
  if(body)body.innerHTML='<div class="work-empty" role="status"><p>'+esc(message)+'</p><button type="button" data-work-retry class="secondary">Reintentar</button></div>';
  const switcher=$('.work-project-switch');
  if(switcher&&switchLabel)switcher.textContent=switchLabel;
}
async function render(){
  const current=++workRenderVersion;
  bindStatic();setStatus('');
  paintChrome();
  $('#workBody')?.classList.toggle('work-overview-host',view==='overview');
  // Only the planner board manages its own scrolling; every other Work view scrolls the body.
  $('#workBody')?.classList.toggle('work-scroll-host',view!=='planner');
  const latest=()=>current===workRenderVersion;
  try{
    const session=await waitForWork(getSession(),'session');
    if(!latest())return;
    if(!session){
      project=null;
      workBootFailure('No hay una sesión activa de MINDS. Inicia sesión y vuelve a intentarlo.','Sesión no disponible');
      return;
    }
    const catalog=await waitForWork(
      sb.from('isabella_projects').select('id,client_key,name').eq('user_id',session.user.id).eq('archived',false).order('name'),
      'project catalog'
    );
    if(!latest())return;
    if(catalog.error)throw catalog.error;
    const switcher=$('.work-project-switch');
    if(switcher)switcher.innerHTML=(catalog.data||[]).length
      ?catalog.data.map(p=>'<button data-work-project="'+esc(p.client_key)+'">'+esc(p.name)+'</button>').join('')
      :'<span class="small">Sin proyectos disponibles</span>';
    if(!(catalog.data||[]).some(p=>p.client_key===projectKey)&&catalog.data?.length)
      projectKey=catalog.data[0].client_key;
    const loadedProject=await waitForWork(loadProject(session),'project');
    if(!latest())return;
    project=loadedProject;
    paintChrome();
    const settings=project?await waitForWork(
      sb.from('minds_self_review_settings').select('enabled,timezone,local_hour,code_preparation_enabled')
        .eq('project_id',project.id).eq('user_id',session.user.id).maybeSingle(),
      'project settings'
    ):null;
    if(!latest())return;
    reviewSettings=settings?.data||null;
    if(!project){
      workBootFailure('No encontré este proyecto en MINDS.');
      return;
    }
    const scene=view==='overview'&&reviewSettings?renderSelfReview()
      :view==='overview'?renderOverview()
      :view==='threads'?renderThreads()
      :view==='knowledge'?renderKnowledge()
      :view==='planner'?renderPlanner():renderDesktop();
    await waitForWork(scene,'view');
  }catch(e){
    if(!latest())return;
    console.error('Work initialization failed:',e);
    workBootFailure('No pude abrir Work ahora mismo. Comprueba la conexión o tu sesión y vuelve a intentarlo.','No se pudieron cargar proyectos');
  }
}
async function renderSelfReview(){
  const body=$('#workBody');
  const [reportsQ,proposalsQ,codeQ]=await Promise.all([
    sb.from('minds_self_review_reports').select('id,review_key,window_start,window_end,status,report,evidence,coverage,error,created_at,completed_at',{count:'exact'}).eq('project_id',project.id).order('created_at',{ascending:false}).limit(reviewReportLimit),
    sb.from('minds_self_review_proposals').select('id,report_id,title,details,status,owner_note,created_at,reviewed_at').eq('project_id',project.id).order('created_at',{ascending:false}).limit(200),
    sb.from('minds_window_code_jobs').select('id,proposal_id,status,base_sha,branch,pr_url,result,attempts,retry_requested,history,created_at,completed_at').order('created_at',{ascending:false}).limit(100)
  ]);
  if(reportsQ.error||proposalsQ.error)throw reportsQ.error||proposalsQ.error;
  const reports=reportsQ.data||[],proposals=proposalsQ.data||[];
  const codeJobs=codeQ?.data||[];
  const codeState={preparing:'Preparando código',review_ready:'Borrador listo para revisar',no_change:'No se propone cambiar el código actual',failed:'La preparación no se completó',blocked:'Preparación bloqueada'};
  const codeView=p=>{const j=codeJobs.find(j=>j.proposal_id===p.id);if(!j)return '';const url=String(j.pr_url||'');const safe=/^https:\/\/github\.com\/gari01234\/minds\/pull\/[0-9]+$/.test(url);return `<div class="work-empty"><strong>${esc(codeState[j.status]||j.status)}</strong><p>${esc(j.result?.reason||'')}</p>${safe?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Revisar cambios en GitHub</a>`:''}<p class="small">Pruebas: ${j.result?.test_exit_code===0?'suite de regresión y construcción correctas':typeof j.result?.test_exit_code==='number'?'fallaron o no se completaron':'no ejecutadas'}. Base: ${esc(j.base_sha?.slice(0,12)||'')}</p><p class="small">${esc((j.result?.limitations||[]).join(' · '))}</p><p class="small">${esc(j.branch||'')} · No publicado en producción.</p>${j.result?.diagnostics?`<details><summary>Diagnóstico de pruebas</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(j.result.diagnostics)}</pre></details>`:''}${j.status==='failed'&&!j.branch&&(j.attempts||1)<3?`<button data-code-retry="${esc(j.id)}" ${j.retry_requested?'disabled':''}>${j.retry_requested?'Reintento solicitado':'Solicitar otro intento'}</button>`:''}</div>`};
  const labels={proposed:'Pendiente',accepted:'Aceptada para trabajar',rejected:'Descartada',testing:'En prueba',implemented:'Implementada',verified:'Verificada'};
  const prose=t=>`<p style="white-space:pre-wrap">${esc(t||'')}</p>`;
  const field=(label,text)=>text?`<strong>${label}</strong>${prose(text)}`:'';
  body.innerHTML=`<div class="work-threads">
    <div class="work-desktop-toolbar"><div><strong>Revisión de Isabella</strong><p class="small">Esta es la revisión de Window como aplicación: cómo te está funcionando y qué mejorar. La Akte de cada proyecto (Projektsteckbrief, Entscheidungen & Fristen) está en el Panorama de ese proyecto.</p><p class="small">${reviewSettings.enabled?'Revisión cada 3 días':'Revisión pausada'} · ${String(reviewSettings.local_hour).padStart(2,'0')}:15 · ${esc(reviewSettings.timezone)}. Cubre todo lo ocurrido desde la anterior. Los informes se guardan aquí, sin avisos.</p><p class="small">Aceptar una propuesta permite planificarla; no cambia el código, los permisos ni el comportamiento de Isabella.</p></div></div>
    ${codeQ?.error?'<p>No pude consultar el estado de preparación de código.</p>':''}
    <p class="small">Preparación de código: ${reviewSettings.code_preparation_enabled?'activada, solo a mano. Una propuesta aceptada espera hasta que se lanza en GitHub → Actions → «Window code preparation»':'pausada'}. Los resultados y los bloqueos quedan registrados aquí.</p><button data-code-toggle>${reviewSettings.code_preparation_enabled?'Pausar preparación de código':'Activar preparación de código'}</button>
    <h3>Propuestas · ${proposals.filter(p=>p.status==='proposed').length} pendientes</h3>
    ${proposals.length?proposals.map(p=>`<details class="work-thread-row" style="display:block;padding:14px"><summary><strong>${esc(p.title)}</strong> · ${esc(labels[p.status]||p.status)}</summary>
      ${codeView(p)}${field('Observación',p.details.observation)}${field('Causa probable, pendiente de comprobar',p.details.suspected_cause)}${field('Cambio propuesto',p.details.change)}${field('Prueba de aceptación',p.details.acceptance_test)}${field('Qué hace falta',p.details.owner_action)}
      <p class="small">Propuesta ${esc(p.id)} · Informe ${esc(p.report_id)} · Confianza declarada: ${esc(p.details.confidence)}</p>
      <details><summary>Referencias de evidencia</summary>${prose((p.details.evidence_refs||[]).join('\n'))}<p class="small">Puedes consultar estos registros en el informe de origen.</p></details>
      ${['proposed','accepted','rejected'].includes(p.status)?`<label>Tu comentario<textarea data-review-note="${p.id}" rows="3">${esc(p.owner_note)}</textarea></label><div class="work-thread-toolbar-actions"><button data-review-decision="accepted" data-id="${p.id}">Aceptar propuesta</button><button data-review-decision="rejected" data-id="${p.id}">Descartar</button><button data-review-decision="proposed" data-id="${p.id}">Dejar pendiente</button></div>`:prose(p.owner_note)}
    </details>`).join(''):'<p>Todavía no hay propuestas. Una revisión puede concluir sin proponer cambios.</p>'}
    <h3>Informes · ${reportsQ.count||0}</h3>
    ${reports.length?reports.map(r=>`<details class="work-thread-row" style="display:block;padding:14px"><summary><strong>${r.review_key==='baseline'?'Revisión inicial':esc(r.review_key)}</strong> · ${esc({completed:'Guardado',running:'En revisión',pending:'Pendiente',failed:'No se pudo completar'}[r.status])}</summary>
      <p class="small">${esc(new Date(r.window_start).toLocaleString('es-ES'))} — ${esc(new Date(r.window_end).toLocaleString('es-ES'))} · ${esc(r.id)}</p>
      ${r.status==='completed'?`${field('Evaluación',r.report.summary)}${field('Qué funcionó',r.report.what_worked)}${field('Límites de la revisión',r.report.limitations)}<p class="small">Esta evaluación es una propuesta del modelo, no una verificación independiente.</p>`:prose(r.error||'El informe aparecerá cuando termine la revisión.')}
      <details><summary>Cobertura y evidencia consultada</summary>${prose(JSON.stringify(r.coverage,null,2))}${(r.evidence||[]).map(e=>`<details><summary>${esc(e.ref)}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(e,null,2))}</pre></details>`).join('')}</details>
    </details>`).join(''):'<p>La primera revisión está pendiente. Se conservará aquí al terminar.</p>'}
    ${(reportsQ.count||0)>reports.length?'<button data-more-reviews>Mostrar informes anteriores</button>':''}
  </div>`;
  $$('[data-code-retry]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await sb.rpc('minds_retry_window_code_v1',{p_id:b.dataset.codeRetry});if(r.error){b.disabled=false;setStatus('No pude solicitar el reintento.');return}await render()});
  $('[data-code-toggle]')?.addEventListener('click',async()=>{const r=await sb.rpc('minds_set_window_code_v1',{p_enabled:!reviewSettings.code_preparation_enabled});if(r.error){setStatus('No pude cambiar la preparación de código.');return}await render()});
  $('[data-more-reviews]')?.addEventListener('click',()=>{reviewReportLimit+=20;void renderSelfReview()});
  $$('[data-review-decision]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{const note=$(`[data-review-note="${b.dataset.id}"]`)?.value||'';const result=await sb.rpc('minds_review_improvement_v1',{p_id:b.dataset.id,p_status:b.dataset.reviewDecision,p_note:note});if(result.error)throw result.error;await renderSelfReview();setStatus('Revisión guardada. No se ha aplicado ningún cambio al sistema.');}
    catch(e){b.disabled=false;setStatus('No pude guardar tu revisión: '+(e.message||String(e)))}
  });
}
let knowledgeRows=[],knowledgeFilter='active',knowledgeQuery='',projectModelSnapshot=null;

/* Build 90.3 — Project as a usable, source-bound understanding lens.
   Read-only projection: no bucket creation, canonical mutation or secondary model. */
// Proposed register entries wait for Gari: one tap confirms or discards them.
async function decideAkteEntry(id,decision){
  if(!id||!['confirmed','rejected'].includes(decision))return;
  const patch={status:decision,updated_at:new Date().toISOString(),...(decision==='confirmed'?{confirmed_at:new Date().toISOString()}:{})};
  const {error}=await sb.from('minds_work_memory').update(patch).eq('id',id).eq('status','proposed');
  if(error){setStatus('No pude guardar la decisión. Inténtalo de nuevo.');return}
  await renderOverview();
}
function projektakteMarkup(rows){
  if(!Array.isArray(rows))return '';
  const brief=rows.find(r=>r.memory_type==='document_state'&&r.metadata?.kind==='projektsteckbrief');
  const register=rows.filter(r=>r.memory_type==='decision'||r.memory_type==='deadline');
  if(!brief&&!register.length)return '';
  const pending=register.filter(r=>r.status==='proposed'),done=register.filter(r=>r.status==='confirmed').slice(0,8);
  const row=r=>'<article class="work-akte-entry'+(r.status==='proposed'?' is-proposed':'')+'"><span class="work-akte-kind">'+(r.memory_type==='deadline'?'Frist':'Entscheidung')+(r.occurred_at?' · '+esc(akteDate(r.occurred_at)):'')+'</span><p>'+esc(r.title)+'</p>'+
    ((r.metadata?.quelle||r.metadata?.thema)?'<small>'+esc([r.metadata?.thema,r.metadata?.quelle].filter(Boolean).join(' · '))+'</small>':'')+
    (r.status==='proposed'?'<div class="work-akte-actions"><button type="button" data-akte-id="'+esc(r.id)+'" data-akte-decide="confirmed">Bestätigen</button><button type="button" class="secondary" data-akte-id="'+esc(r.id)+'" data-akte-decide="rejected">Verwerfen</button></div>':'')+'</article>';
  return '<section class="work-akte"><div class="work-akte-grid">'+
    (brief?'<div class="work-akte-brief"><div class="work-overview-section-head"><h3>Projektsteckbrief</h3><small>'+esc('aktualisiert '+akteDate(brief.updated_at))+'</small></div><div class="work-akte-brief-text">'+esc(brief.body)+'</div></div>':'')+
    (register.length?'<div class="work-akte-register"><div class="work-overview-section-head"><h3>Entscheidungen & Fristen</h3>'+(pending.length?'<small>'+pending.length+' zu bestätigen</small>':'')+'</div>'+pending.map(row).join('')+done.map(row).join('')+'</div>':'')+
    '</div></section>';
}
async function renderOverview(){
  const WORK_STATUS_LABELS=Object.freeze({not_started:'Sin empezar',in_progress:'En curso',waiting:'En espera',completed:'Completada'});
  function workStatusText(value){if(!value)return '';return Object.prototype.hasOwnProperty.call(WORK_STATUS_LABELS,value)?WORK_STATUS_LABELS[value]:'Estado sin clasificar ('+String(value)+')'}
  const body=$('#workBody'),projectId=project.id;
  body.classList.add('work-overview-host');
  body.innerHTML='<div class="work-empty">Leyendo el estado del proyecto…</div>';
  const [t,c,f,m,a]=await Promise.allSettled([
    sb.from('isabella_tasks').select('id,title,due_date,assignee,work_status').eq('project_id',projectId).is('completed_at',null).is('archived_at',null).order('due_date',{ascending:true,nullsFirst:false}).limit(80),
    sb.from('minds_work_claims').select('id,statement,status,provenance_class,claim_type').eq('project_id',projectId).in('status',['proposed','disputed']).order('updated_at',{ascending:false}).limit(40),
    sb.from('minds_work_files').select('id',{count:'exact',head:true}).eq('project_id',projectId),
    sb.rpc('minds_project_model_snapshot',{p_project_id:projectId}),
    sb.from('minds_work_memory').select('id,memory_type,title,body,status,occurred_at,metadata,updated_at,created_at').eq('project_id',projectId).in('memory_type',['document_state','decision','deadline']).in('status',['proposed','confirmed']).order('created_at',{ascending:false}).limit(60)
  ]);
  if(view!=='overview'||project?.id!==projectId)return;
  const norm=r=>r.status==='fulfilled'&&!r.value?.error?r.value:null;
  const taskResult=norm(t),claimResult=norm(c),fileResult=norm(f),modelResult=norm(m),akteResult=norm(a);
  const taskRows=taskResult?.data||[],claimRows=claimResult?.data||[];
  projectModelSnapshot=modelResult?.data||null;
  const known=[taskResult,claimResult,fileResult,modelResult].filter(Boolean).length;
  const taskText=taskRows.map(x=>'<button type="button" class="work-overview-item work-overview-task" data-work-edit-task="'+esc(x.id)+'"><strong>'+esc(x.title||'Sin título')+'</strong><small>'+esc([x.assignee||'Responsable sin indicar',x.due_date||'Sin fecha',workStatusText(x.work_status)].filter(Boolean).join(' · '))+'</small></button>').join('')||'<p class="small">No hay tareas abiertas en la consulta.</p>';
  const claimText=claimRows.map(x=>'<article class="work-overview-item"><span class="model-badge '+(x.status==='disputed'?'attention':'')+'">'+esc(x.status==='disputed'?'En disputa':'Por revisar')+'</span><p>'+esc(x.statement||'')+'</p><small>'+esc(provenanceNames[x.provenance_class]||x.provenance_class||'Origen sin clasificar')+'</small></article>').join('')||'<p class="small">No hay claims propuestos o disputados en la consulta.</p>';
  const filesLabel=fileResult?String(fileResult.count??0)+' documentos registrados':'Cobertura documental no comprobable';
  const rev=projectModelSnapshot?.current_revision;
  const revLabel=rev?'Revisión del Model: '+String(rev.id||'').slice(0,8):'Sin revisión del Project Model publicada';
  body.innerHTML='<div class="work-overview">'+
    '<div class="work-overview-intro"><div class="eyebrow">MINDS · PROJECT</div><h2>Panorama de '+esc(project.name)+'</h2><p>Lectura operativa del proyecto. Los hechos, inferencias y decisiones conservan su procedencia y autoridad propias.</p></div>'+
    '<div class="work-overview-coverage">'+esc('Fuentes consultadas: '+known+'/4 · '+filesLabel+' · '+revLabel)+(known<4?'<p>La lectura es parcial: alguna fuente no respondió.</p>':'')+'</div>'+
    projektakteMarkup(akteResult?.data||null)+
    '<div class="work-overview-columns">'+
    '<section class="work-overview-section"><div class="work-overview-section-head"><h3>Movimientos abiertos</h3><button data-work-go="planner">Abrir Planner ↗</button></div>'+
    (taskResult?taskText:'<p class="small">No pude consultar las tareas de este proyecto.</p>')+
    (taskRows.length===80?'<p class="small">Puede haber más tareas abiertas; consulta Planner.</p>':'')+'</section>'+
    '<section class="work-overview-section"><div class="work-overview-section-head"><h3>Claims en revisión</h3><button data-work-go="knowledge">Ver Conocimiento ↗</button></div>'+
    (claimResult?claimText:'<p class="small">No pude comprobar el conocimiento del proyecto.</p>')+
    (claimRows.length===40?'<p class="small">Hay más registros; abre Conocimiento.</p>':'')+'</section></div>'+
    '<div class="work-overview-model">'+projectModelPanel()+'</div>'+
    '<div class="work-overview-footer"><button data-work-go="desktop">Abrir Desktop ↗</button><button data-work-go="threads">Abrir Threads ↗</button><p>Los documentos que todavía no están en el Desktop no forman parte de esta lectura. Un modelo sin lagunas registradas no demuestra cobertura completa.</p></div>'+
    '</div>';
  $$('[data-work-go]').forEach(button=>button.onclick=()=>document.querySelector('[data-work-view="'+button.dataset.workGo+'"]')?.click());
  $$('[data-work-edit-task]').forEach(button=>button.onclick=()=>void window.ISABELLA_APP?.openCanonicalTaskById?.(button.dataset.workEditTask));
  $$('[data-akte-decide]').forEach(button=>button.onclick=()=>void decideAkteEntry(button.dataset.akteId,button.dataset.akteDecide));
}
const knowledgeStates={proposed:'Propuesto',confirmed:'Confirmado',disputed:'En disputa',superseded:'Sustituido',resolved:'Resuelto',rejected:'Descartado'};
const provenanceNames={user:'Afirmación del usuario',project_source:'Fuente del proyecto',external:'Fuente externa',inferred:'Inferencia',system:'Sistema'};
function knowledgeFlags(c){
  const evidence=c.minds_work_evidence||[];
  return {contradiction:c.status==='disputed'||evidence.some(e=>e.stance==='contradicts'),expired:!!c.valid_to&&new Date(c.valid_to)<new Date(),unreviewed:c.status==='proposed',noEvidence:!evidence.length};
}
async function renderKnowledge(){
  const [q,fq,mq]=await Promise.all([
    sb.from('minds_work_claims').select('*,minds_work_evidence(*)').eq('project_id',project.id).order('updated_at',{ascending:false}),
    sb.from('minds_work_files').select('id,name,storage_path,index_status').eq('project_id',project.id),
    sb.rpc('minds_project_model_snapshot',{p_project_id:project.id})
  ]);
  if(q.error)throw q.error;knowledgeRows=q.data||[];
  if(fq.error)throw fq.error;files=fq.data||[];
  projectModelSnapshot=mq.error?null:(mq.data||null);
  paintKnowledge();
}
function projectModelPanel(){
  const m=projectModelSnapshot;if(!m)return '<section class="project-model-panel"><div><b>Lectura de Isabella</b><p class="small">El Project Model no está disponible ahora mismo. El conocimiento canónico sigue debajo.</p></div></section>';
  const revision=m.current_revision||null,claims=Array.isArray(m.claims)?m.claims:[],variants=Array.isArray(m.variants)?m.variants:[],elements=Array.isArray(m.revision_elements)?m.revision_elements:[],perimeter=Array.isArray(m.perimeter)?m.perimeter:[];
  const claimById=new Map(claims.map(x=>[String(x.id),x]));
  const inferred=claims.filter(x=>x.status==='proposed'||x.status==='disputed'||x.author_kind==='isabella'||x.model_kind).slice(0,6);
  const gaps=elements.filter(x=>x.element_kind==='gap').slice(0,6);
  const weakPerimeter=perimeter.filter(x=>x.observation_mode==='unobserved'||['missing','unknown'].includes(x.coverage)||['unreadable','unknown'].includes(x.readability)).slice(0,6);
  const revWhen=revision?.published_at||revision?.created_at;
  return `<section class="project-model-panel">
    <div class="project-model-head"><div><b>Lectura de Isabella</b><p class="small">Interpretación versionada del proyecto; no sustituye decisiones ni hechos confirmados.</p></div><div class="project-model-revision">${revision?`Rev. ${esc(String(revision.id||'').slice(0,8))}${revWhen?' · '+esc(new Date(revWhen).toLocaleString('es-ES')):''}`:'Sin revisión publicada'}</div></div>
    <div class="project-model-grid">
      <article><strong>Qué interpreta ahora</strong>${inferred.map(x=>`<p><span class="model-badge">${esc(x.status==='disputed'?'En disputa':'Inferencia')}</span> ${esc(x.statement)}</p>`).join('')||'<p class="small">Todavía no hay inferencias estructuradas.</p>'}</article>
      <article><strong>Tensiones / Variantes</strong>${variants.filter(x=>x.status==='open').slice(0,6).map(v=>{const a=claimById.get(String(v.source_claim_id)),b=claimById.get(String(v.target_claim_id));return `<p><span class="model-badge attention">${esc(v.variant_kind)}</span> ${esc(a?.statement||'Nueva formulación')}${b?.statement?' ↔ '+esc(b.statement):''}</p>`}).join('')||'<p class="small">No hay variantes abiertas en la revisión actual.</p>'}</article>
      <article><strong>Qué no sabe</strong>${gaps.map(g=>`<p>${esc(g.metadata?.source_class||g.metadata?.verdict||g.element_ref)}</p>`).join('')||weakPerimeter.map(p=>`<p>${esc(p.source_class)} · ${esc(p.coverage)} · ${esc(p.observation_mode)}</p>`).join('')||'<p class="small">No hay lagunas estructuradas visibles.</p>'}</article>
    </div>
    <details class="project-model-inspect"><summary>Inspeccionar fundamento y cobertura</summary>
      <div class="small">Trigger: ${esc(revision?.trigger_kind||'—')}${revision?.parent_revision_id?' · deriva de '+esc(String(revision.parent_revision_id).slice(0,8)):''}</div>
      <div class="project-model-perimeter">${perimeter.map(p=>`<p><b>${esc(p.source_class)}</b> · ${esc(p.observation_mode)} · ${esc(p.coverage)} · ${esc(p.readability)}${p.last_checked_at?' · comprobado '+esc(new Date(p.last_checked_at).toLocaleString('es-ES')):''}</p>`).join('')||'<p class="small">Perimeter todavía sin declarar.</p>'}</div>
    </details>
  </section>`;
}
function paintKnowledge(){
  const filtered=knowledgeRows.filter(c=>{
    const f=knowledgeFlags(c),q=knowledgeQuery.toLocaleLowerCase();
    return (!q||[c.statement,c.subject,c.topic,c.discipline].join(' ').toLocaleLowerCase().includes(q))&&(knowledgeFilter==='all'||knowledgeFilter==='review'&&(f.unreviewed||f.contradiction||f.expired)||knowledgeFilter==='active'&&!['superseded','rejected','resolved'].includes(c.status));
  });
  const knowledgeEmpty='<div class="work-empty">'+esc(knowledgeRows.length?'No hay conocimiento que coincida con este filtro.':'Todavía no hay Claims registrados para este proyecto. Desktop contiene '+files.length+' archivo(s) registrado(s); '+files.filter(f=>f.index_status==='indexed').length+' constan como indexados. Registrar un archivo no lo convierte automáticamente en conocimiento validado.')+'</div>';
  $('#workBody').innerHTML=`<div class="work-knowledge"><div class="work-desktop-toolbar"><div><strong>Conocimiento de ${esc(project.name)}</strong><p class="small">Afirmaciones, decisiones y preguntas con su evidencia e historia. Confirmar una revisión no convierte una fuente en certeza.</p></div><button data-knowledge-new>＋ Añadir</button></div>
    ${projectModelPanel()}
    <div class="knowledge-filters"><input id="knowledgeSearch" aria-label="Buscar conocimiento" placeholder="Buscar tema, disciplina o decisión…" value="${esc(knowledgeQuery)}"><select id="knowledgeFilter" aria-label="Estado del conocimiento">${[['active','Activo'],['review','Por revisar'],['all','Todo e historial']].map(([v,l])=>`<option value="${v}" ${knowledgeFilter===v?'selected':''}>${l}</option>`).join('')}</select></div>
    ${filtered.map(c=>{const f=knowledgeFlags(c);return `<article class="knowledge-card"><div class="knowledge-meta"><b>${esc(knowledgeStates[c.status]||c.status)}</b><span>${esc(c.claim_type)} · ${esc(provenanceNames[c.provenance_class]||c.provenance_class)}</span>${f.contradiction?'<span class="knowledge-attention">Contradicción por revisar</span>':''}${f.expired?'<span class="knowledge-attention">Vigencia vencida</span>':''}</div><p>${esc(c.statement)}</p><div class="small">${esc([c.discipline,c.topic,c.subject].filter(Boolean).join(' · '))}</div>
      <details><summary>${(c.minds_work_evidence||[]).length} evidencias · Historia</summary>${(c.minds_work_evidence||[]).map(e=>`<blockquote><b>${esc(e.stance==='contradicts'?'Contradice':e.stance==='context'?'Contexto':'Apoya')}</b><p>${esc(e.excerpt||'Sin extracto')}</p><small>${esc(e.trust_level)} · ${esc(JSON.stringify(e.locator||{}))}</small>${e.source_file_id?`<button data-evidence-file="${esc(e.source_file_id)}">Abrir ${esc(files.find(x=>x.id===e.source_file_id)?.name||'fuente')}</button>`:''}</blockquote>`).join('')||'<p class="small">Sin evidencia vinculada.</p>'}
      <p class="small">Revisado: ${c.confirmed_at?new Date(c.confirmed_at).toLocaleString('es-ES'):'Pendiente'}${c.valid_to?' · Válido hasta '+new Date(c.valid_to).toLocaleDateString('es-ES'):''}</p>${c.supersedes_id?'<p class="small">Sustituye una formulación anterior.</p>':''}${c.superseded_by?'<p class="small">Hay una formulación posterior.</p>':''}${(c.metadata?.previous_versions||[]).slice().reverse().map(v=>`<p class="small">${esc(knowledgeStates[v.status]||v.status)} · ${esc(v.statement)}</p>`).join('')}</details>
      <div class="knowledge-actions"><button data-knowledge-edit="${c.id}">Revisar</button><button data-knowledge-replace="${c.id}">Proponer sustitución</button></div></article>`}).join('')||knowledgeEmpty}</div>`;
  $('#knowledgeSearch').onchange=e=>{knowledgeQuery=e.target.value;paintKnowledge()};
  $('#knowledgeFilter').onchange=e=>{knowledgeFilter=e.target.value;paintKnowledge()};
  $('[data-knowledge-new]').onclick=()=>window.MINDS_PROPOSALS?.edit({kind:'work_claim',project:project.name,status:'proposed',claim_type:'fact',provenance_class:'user'});
  $$('[data-knowledge-edit]').forEach(b=>b.onclick=()=>{const c=knowledgeRows.find(x=>x.id===b.dataset.knowledgeEdit);window.MINDS_PROPOSALS?.edit({...c,kind:'work_claim',project:project.name,evidence_excerpt:null})});
  $$('[data-knowledge-replace]').forEach(b=>b.onclick=()=>{const c=knowledgeRows.find(x=>x.id===b.dataset.knowledgeReplace);window.MINDS_PROPOSALS?.edit({kind:'work_claim',project:project.name,statement:c.statement,claim_type:c.claim_type,topic:c.topic,discipline:c.discipline,provenance_class:c.provenance_class,status:'confirmed',supersedes_id:c.id})});
  $$('[data-evidence-file]').forEach(b=>b.onclick=()=>void openFile(b.dataset.evidenceFile));
}
async function loadFolders(){const {data,error}=await sb.from('minds_work_folders').select('id,parent_id,name,sort_order,created_at').eq('project_id',project.id).order('sort_order').order('name');if(error)throw error;folders=data||[]}
function folderTrail(){const out=[];let id=folderId,guard=0;while(id&&guard++<30){const f=folders.find(x=>x.id===id);if(!f)break;out.unshift(f);id=f.parent_id}return out}
function workKnowledgeStatus(file){
  const k=String(file?.index_status||'stored');
  const intake=file?.metadata?.knowledge_intake||{};
  const coverage=String(intake.coverage||'');
  const readable=intake.structured_text||{};
  if(k==='queued')return 'Lectura pendiente';
  if(k==='waiting_parser'){
    const reason=String(file?.metadata?.knowledge_intake?.reason||'');
    if(reason==='needs_larger_worker')return 'Pendiente · archivo grande';
    if(reason==='needs_format_reader')return 'Pendiente · lector de formato';
    return 'Pendiente · lector especializado';
  }
  if(k==='indexed'){
    if(readable.status==='needs_review')return 'Claims conservados · texto pendiente de revisión';
    if(readable.status==='materialized'){
      const type=String(readable.coverage||coverage);
      return type==='complete_text'?'Texto recuperable · sin confirmar':'Texto parcial recuperable · sin confirmar';
    }
    if(coverage==='claims_only')return 'Claims propuestos · texto aún no extraído';
    return 'Evidencia extraída · cobertura parcial';
  }
  if(k==='failed')return 'No se pudo leer · revisar';
  return 'Solo almacenado · aún sin leer';
}
// Desktop tiles: Finder-like vector icons and a readable file type instead of a raw MIME string.
const WORK_TILE_COLORS={pdf:'#e5484d',doc:'#2f6fdb',docx:'#2f6fdb',rtf:'#2f6fdb',txt:'#6b7280',md:'#6b7280',xls:'#1f9d55',xlsx:'#1f9d55',csv:'#1f9d55',numbers:'#1f9d55',ppt:'#e8762c',pptx:'#e8762c',key:'#e8762c',dwg:'#8a5cf6',dxf:'#8a5cf6',ifc:'#8a5cf6',rvt:'#8a5cf6',pln:'#8a5cf6',skp:'#8a5cf6',zip:'#6b7280',rar:'#6b7280'};
function workFileExt(f){const m=String(f?.name||'').toLowerCase().match(/\.([a-z0-9]{1,8})$/);return m?m[1]:''}
function workFileTypeLabel(f){
  const ext=workFileExt(f);if(ext)return ext.toUpperCase();
  const sub=String(f?.mime_type||'').split('/').pop()||'';
  return (sub.length<=6?sub:'Datei').toUpperCase();
}
function workTileIcon(kind,f=null){
  const svg=(w,h,body)=>'<svg class="work-tile-svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" aria-hidden="true" focusable="false">'+body+'</svg>';
  if(kind==='folder')return svg(48,40,'<path d="M3 8a4 4 0 0 1 4-4h10.2a4 4 0 0 1 3 1.35L23 8h18a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="#5ea4f0"/><path d="M3 15a4 4 0 0 1 4-4h34a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="#8cc3fb"/><path d="M7 11h34a4 4 0 0 1 4 4v1.2H3V15a4 4 0 0 1 4-4z" fill="#b3d8fe"/>');
  if(kind==='back')return svg(48,40,'<rect x="6" y="4" width="36" height="32" rx="10" fill="#f1f3f6"/><path d="M27 14h-9.5l3.5-3.5M17.5 14l3.5 3.5M17.5 14h9a5.5 5.5 0 0 1 0 11H20" fill="none" stroke="#5d626a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
  if(kind==='image')return svg(48,40,'<rect x="7" y="3" width="34" height="34" rx="7" fill="#eaf4ff" stroke="#cfe0f5" stroke-width="1.4"/><circle cx="17" cy="13.5" r="3.4" fill="#ffb020"/><path d="M8.5 31.5l9.5-10.5 6.5 6.5 4.5-4.5 10.5 10.5v.5a2.6 2.6 0 0 1-2.6 2.6H11.1a2.6 2.6 0 0 1-2.6-2.6z" fill="#34c759"/>');
  if(kind==='email')return svg(48,40,'<rect x="5" y="7" width="38" height="27" rx="6" fill="#eaf3ff" stroke="#b9d4f6" stroke-width="1.4"/><path d="M8 11l16 11.5L40 11" fill="none" stroke="#2f80ed" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
  const ext=workFileExt(f),label=(ext||'doc').slice(0,4).toUpperCase(),color=WORK_TILE_COLORS[ext]||'#7b8494';
  return svg(48,40,'<path d="M13 2h14.5L36 10.5V35a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z" fill="#fff" stroke="#d3d8df" stroke-width="1.4"/><path d="M27.5 2v6a2.5 2.5 0 0 0 2.5 2.5h6" fill="#eef1f5" stroke="#d3d8df" stroke-width="1.4" stroke-linejoin="round"/><rect x="5" y="22" width="'+(label.length>3?28:24)+'" height="11" rx="3" fill="'+color+'"/><text x="'+(label.length>3?19:17)+'" y="29.9" text-anchor="middle" font-size="6.8" font-weight="700" letter-spacing=".2" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">'+label+'</text>');
}
// Thread previews show prose, not Markdown markers.
function workPlainPreview(text){
  return String(text||'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/(\*\*|__|`+)/g,'').replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm,'').replace(/\s+/g,' ').trim();
}
async function renderDesktop(){
  await loadFolders();
  let fq=sb.from('minds_work_files').select('id,folder_id,name,mime_type,size_bytes,source_kind,index_status,metadata,storage_path,created_at').eq('project_id',project.id).order('created_at',{ascending:false});
  fq=folderId?fq.eq('folder_id',folderId):fq.is('folder_id',null);
  const {data:fileRows,error:fe}=await fq;if(fe)throw fe;files=fileRows||[];
  const childFolders=folders.filter(x=>(x.parent_id||null)===(folderId||null)),trail=folderTrail(),body=$('#workBody');
  body.innerHTML=`<div class="work-desktop-toolbar"><div class="work-breadcrumb"><button data-work-project-root>${esc(project.name)}</button>${trail.map(f=>`<span>›</span><button data-work-crumb="${f.id}">${esc(f.name)}</button>`).join('')}</div><div class="work-toolbar-actions"><button data-work-new-folder>＋ Ordner</button><button data-work-upload>↑ Dateien</button></div></div>
    <div class="work-drop-hint">Dateien, PDFs, Word, Excel, Bilder oder E-Mails hierher ziehen</div>
    <div class="work-files">
      ${folderId?`<button class="work-file work-folder work-up" data-work-up><span class="work-file-icon">${workTileIcon('back')}</span><strong>Zurück</strong><small>Ordner</small></button>`:''}
      ${childFolders.map(f=>`<button class="work-file work-folder" data-work-folder="${f.id}"><span class="work-file-icon">${workTileIcon('folder')}</span><strong>${esc(f.name)}</strong><small>Ordner</small></button>`).join('')}
      ${files.map(f=>`<button class="work-file" data-work-file="${f.id}"><span class="work-file-icon">${workTileIcon(f.source_kind==='email'?'email':f.source_kind==='image'?'image':'file',f)}</span><strong>${esc(f.name)}</strong><small>${esc(workFileTypeLabel(f))} · ${Math.max(1,Math.round(Number(f.size_bytes||0)/1024))} KB · ${esc(workKnowledgeStatus(f))}</small></button>`).join('')}
      ${!childFolders.length&&!files.length&&!folderId?'<div class="work-empty work-empty-wide">Este Desktop está vacío. Crea un Ordner o arrastra aquí tus primeros Unterlagen.</div>':''}
    </div>`;
  $('[data-work-upload]')?.addEventListener('click',()=>$('#workFileInput')?.click());
  $('[data-work-new-folder]')?.addEventListener('click',()=>void newFolder());
  $('[data-work-project-root]')?.addEventListener('click',()=>{folderId=null;void renderDesktop()});
  $$('[data-work-crumb]').forEach(b=>b.onclick=()=>{folderId=b.dataset.workCrumb;void renderDesktop()});
  $$('[data-work-folder]').forEach(b=>b.onclick=()=>{folderId=b.dataset.workFolder;void renderDesktop()});
  $('[data-work-up]')?.addEventListener('click',()=>{folderId=folders.find(x=>x.id===folderId)?.parent_id||null;void renderDesktop()});
  $$('[data-work-file]').forEach(b=>b.onclick=()=>void openFile(b.dataset.workFile));
}
async function newFolder(){const name=window.prompt('Nombre del Ordner');if(!name?.trim())return;setStatus('Creando Ordner…');const {error}=await sb.from('minds_work_folders').insert({project_id:project.id,parent_id:folderId,name:name.trim()});setStatus(error?'No pude crear el Ordner.':'');if(!error)await renderDesktop()}
async function uploadFiles(list){
  const session=await getSession();if(!session||!project)return;
  const attempted=[...(list||[])],failed=[];let succeeded=0;
  setStatus(`Subiendo ${attempted.length} archivo${attempted.length===1?'':'s'}…`);
  for(const file of attempted){
    const path=`${session.user.id}/${project.client_key}/${folderId||'root'}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName(file.name)}`;
    let stored=false;
    try{
      const {error:ue}=await sb.storage.from('minds-work').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
      if(ue)throw ue;
      stored=true;
      const {error:ie}=await sb.from('minds_work_files').insert({project_id:project.id,folder_id:folderId,name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,storage_path:path,source_kind:sourceKind(file),metadata:{last_modified:file.lastModified||null}});
      if(ie)throw ie;
      succeeded++;
    }catch(e){
      failed.push(file.name);
      if(stored)try{await sb.storage.from('minds-work').remove([path])}catch{}
    }
  }
  try{await renderDesktop()}catch(e){setStatus('La subida terminó, pero no pude actualizar Desktop. Recarga para comprobar el resultado.');return}
  if(failed.length)setStatus(`${succeeded} archivo${succeeded===1?'':'s'} registrado${succeeded===1?'':'s'}; ${failed.length} sin guardar: ${failed.join(', ')}. Vuelve a intentarlo con los fallidos.`);
  else setStatus(`${succeeded} archivo${succeeded===1?'':'s'} guardado${succeeded===1?'':'s'} en Desktop.`);
}
async function openFile(id){const f=files.find(x=>x.id===id);if(!f)return;const {data,error}=await sb.storage.from('minds-work').createSignedUrl(f.storage_path,900);if(error||!data?.signedUrl){setStatus('No pude abrir el archivo.');return}window.open(data.signedUrl,'_blank','noopener')}
async function loadPlanner(){
  let {data:b,error:be}=await sb.from('minds_work_buckets').select('id,name,sort_order,archived').eq('project_id',project.id).eq('archived',false).order('sort_order').order('id');if(be)throw be;
  if(!b?.length){
    // Defaults are only seeded for brand-new projects. Archiving the last Bucket must not recreate them.
    const existing=await sb.from('minds_work_buckets').select('id').eq('project_id',project.id).limit(1);
    if(existing.error)throw existing.error;
    if(!existing.data?.length){
      const rows=DEFAULT_BUCKETS.map((name,i)=>({project_id:project.id,name,sort_order:i*10}));
      const ins=await sb.from('minds_work_buckets').insert(rows).select('id,name,sort_order,archived');
      if(ins.error)throw ins.error;
      b=ins.data||[];
    }
  }
  buckets=b||[];
  const {data:t,error:te}=await sb.from('isabella_tasks').select('id,client_key,title,due_date,completed_at,notes,work_bucket_id,work_status,priority,start_date,assignee,labels,checklist,attachments,links,sort_order,work_sort_order,assignee_person_id').eq('project_id',project.id).is('archived_at',null).order('work_sort_order',{ascending:true,nullsFirst:false}).order('sort_order').order('id');if(te)throw te;tasks=t||[];
  if(tasks.length){
  const teamIdsFor=(links,primary)=>{
    const ids=[...new Set([...links].filter(x=>x.person_id)
      .sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||
        String(a.person_id).localeCompare(String(b.person_id)))
      .map(x=>x.person_id))];
    if(primary&&ids.includes(primary)){
      ids.splice(ids.indexOf(primary),1);ids.unshift(primary);
    }
    return ids;
  };
    const {data:links,error:ae}=await sb.from('minds_work_task_assignees')
      .select('task_id,person_id,created_at').in('task_id',tasks.map(t=>t.id));
    if(ae)throw ae;
    for(const task of tasks){
      const ids=teamIdsFor((links||[]).filter(l=>l.task_id===task.id),task.assignee_person_id);
      task.assignee_person_ids=ids.length?ids:(task.assignee_person_id?[task.assignee_person_id]:[]);
    }
  }
}
function localIso(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function taskMeta(t){
  const parts=[];if(t.priority&&t.priority!=='normal')parts.push(t.priority==='urgent'?'Dringend':t.priority==='important'?'Wichtig':'Niedrig');
  const ids=t.assignee_person_ids||[],name=ids.length?ids.map(id=>team.find(p=>p.id===id)?.name||'Responsable').join(', '):t.assignee;
  if(name)parts.push(name);
  return parts.join(' · ')
}
function taskChecklist(t){return Array.isArray(t.checklist)?t.checklist:[]}
function taskAttachments(t){return Array.isArray(t.attachments)?t.attachments:[]}

const WORK_ICON={
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 checklist:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 9 2 2 3-3M14 10h3M7 16h10"/>',
 attachment:'<path d="m20.8 11.6-8.9 8.8a5.2 5.2 0 0 1-7.4-7.4l9.3-9.2a3.5 3.5 0 0 1 5 5L9.5 18a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2"/>',
 pencil:'<path d="m16 5 3 3M4 20l4.3-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/>',
 trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
 left:'<path d="M20 12H4m7-7-7 7 7 7"/>',
 right:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>'
};
function workIcon(name){
 return '<svg class="work-ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(WORK_ICON[name]||'')+'</svg>'
}
function workAssigneeName(t){
 const ids=t.assignee_person_ids||[];
 return ids.length?ids.map(id=>team.find(p=>p.id===id)?.name||'Unbekannt').join(', '):String(t.assignee||'').trim()
}
function workAvatarInitials(name){
 return String(name||'').split(/[\s,]+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toLocaleUpperCase('de-DE')).join('')||'–'
}
function taskCard(t){
  const checks=taskChecklist(t),done=checks.filter(x=>x?.done).length,attachments=taskAttachments(t);
  const firstImage=attachments.find(a=>a?.path&&String(a?.mime||a?.type||'').startsWith('image/')),cached=firstImage?cachedWorkUrl(firstImage.path):'';
  const due=t.due_date?new Date(t.due_date+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'}):'';
  const overdue=!!(t.due_date&&t.due_date<localIso()&&!t.completed_at);
  const name=workAssigneeName(t);
  const priority=t.priority&&t.priority!=='normal'
    ?t.priority==='urgent'?'Dringend':t.priority==='important'?'Wichtig':'Niedrig':'';
  return `<article class="work-task-card ${t.completed_at?'is-done':''}" draggable="true" data-work-task="${t.id}" tabindex="0">
    <div class="work-task-title-row"><button type="button" class="work-task-toggle ${t.completed_at?'is-checked':''}" data-work-toggle="${t.id}" aria-label="${t.completed_at?'Reabrir':'Completar'}: ${esc(t.title)}" aria-pressed="${!!t.completed_at}">${t.completed_at?'✓':''}</button><strong>${esc(t.title)}</strong></div>
    ${firstImage?`<img class="work-task-cover" loading="lazy" ${cached?`src="${esc(cached)}" data-loaded="1"`:''} data-work-task-image="${esc(firstImage.path)}" alt="${esc(firstImage.name||t.title)}">`:''}
    ${checks.length?`<div class="work-card-checks">${checks.slice(0,5).map(x=>`<div class="${x.done?'done':''}"><span class="work-subcheck" aria-hidden="true">${x.done?'✓':''}</span><span>${esc(x.text||'')}</span></div>`).join('')}${checks.length>5?`<div class="work-check-more">+${checks.length-5} weitere</div>`:''}</div>`:''}
    <footer>
      <div class="work-task-chips">
        ${due?`<span class="work-due ${overdue?'is-overdue':''}" title="Fällig am ${esc(t.due_date)}">${workIcon('calendar')}<time datetime="${esc(t.due_date)}">${esc(due)}</time></span>`:''}
        ${checks.length?`<span class="work-meta-chip" title="Checkliste">${workIcon('checklist')}${done}/${checks.length}</span>`:''}
        ${attachments.length?`<span class="work-meta-chip" title="${attachments.length} Anlagen">${workIcon('attachment')}${attachments.length}</span>`:''}
        ${priority?`<span class="work-meta-priority">${priority}</span>`:''}
      </div>
      ${name?`<div class="work-card-assignee" aria-label="Verantwortlich: ${esc(name)}" title="Verantwortlich: ${esc(name)}"><span class="work-assignee-avatar" aria-hidden="true">${esc(workAvatarInitials(name))}</span><span class="work-assignee-name">${esc(name)}</span></div>`:''}
    </footer>
  </article>`
}

async function hydratePlannerImages(root=document){
  const imgs=[...root.querySelectorAll?.('[data-work-task-image],[data-work-edit-image]')||[]].filter(x=>!x.dataset.loaded);
  await Promise.all(imgs.map(async img=>{const path=img.dataset.workTaskImage||img.dataset.workEditImage;if(!path)return;const url=await workSignedUrl(path);if(url&&img.isConnected){img.src=url;img.dataset.loaded='1'}}));
}
async function renderPlanner(){
  await loadPlanner();team=await window.MINDS_WORK_TEAM.members(project.id);const body=$('#workBody'),unbucketed=tasks.some(t=>!t.work_bucket_id),columns=[...(unbucketed?[{id:'__none',name:'Ohne Bucket',virtual:true}]:[]),...buckets];
  const mobileList=localStorage.getItem(WORK_MOBILE_LAYOUT_KEY)!=='columns';
  body.innerHTML=`<div class="work-planner-toolbar"><div><strong>Board</strong><span>${tasks.filter(t=>!t.completed_at).length} offen · ${buckets.length} Buckets</span></div><span class="work-planner-actions"><button type="button" class="work-mobile-layout" data-work-layout-toggle aria-pressed="${mobileList}" aria-label="Vista lista en iPhone">Vista lista</button><button type="button" data-work-team>Team · ${team.length}</button><button data-work-add-bucket>＋ Bucket</button><button type="button" data-work-show-bucket-archive title="Archivierte Buckets und erledigte Aufgaben ansehen">Archiv</button></span></div>
    <div class="work-board ${mobileList?'mobile-stack':''}">${columns.map(b=>{const all=tasks.filter(t=>b.virtual?!t.work_bucket_id:t.work_bucket_id===b.id),open=all.filter(t=>!t.completed_at),done=all.filter(t=>t.completed_at);return `<section class="work-bucket" data-work-bucket-drop="${b.virtual?'':b.id}">
      <header class="work-bucket-header">${b.virtual
        ?`<strong>${esc(b.name)}</strong>`
        :`<span class="work-bucket-grab" draggable="true" data-work-bucket-handle="${b.id}" title="Bucket ziehen, um die Reihenfolge zu ändern"><span class="work-bucket-grip" aria-hidden="true">⠿</span><strong>${esc(b.name)}</strong><span class="work-bucket-count" aria-label="${open.length} offene Aufgaben">${open.length}</span></span>
          <div class="work-bucket-actions">
            <button type="button" class="work-bucket-more" data-work-edit-bucket="${b.id}" aria-label="Aktionen für ${esc(b.name)}" aria-haspopup="menu" aria-expanded="false">•••</button>
            <div class="work-bucket-menu" data-work-bucket-menu="${b.id}" role="menu" hidden>
              <button type="button" role="menuitem" data-work-rename-bucket="${b.id}">${workIcon('pencil')}Umbenennen</button>
              <button type="button" role="menuitem" data-work-shift-bucket="${b.id}" data-work-shift-direction="left" ${buckets[0]?.id===b.id?'disabled':''}>${workIcon('left')}Nach links</button>
              <button type="button" role="menuitem" data-work-shift-bucket="${b.id}" data-work-shift-direction="right" ${buckets.at(-1)?.id===b.id?'disabled':''}>${workIcon('right')}Nach rechts</button>
              <button type="button" role="menuitem" class="work-bucket-danger" data-work-archive-bucket="${b.id}">${workIcon('trash')}Entfernen</button>
            </div>
          </div>`}
      </header>
      ${b.virtual?'':`<button type="button" class="work-add-task" data-work-add-task="${b.id}">${workIcon('plus')}Aufgabe hinzufügen</button>`}
      <div class="work-bucket-scroll"><div class="work-task-list" data-work-task-list="open" data-work-list-bucket="${b.virtual?'':b.id}">${open.map(taskCard).join('')}</div>
      ${done.length?`<details class="work-completed"><summary>Erledigte Aufgaben <span>${done.length}</span></summary><div class="work-task-list" data-work-task-list="done" data-work-list-bucket="${b.virtual?'':b.id}">${done.map(taskCard).join('')}</div></details>`:''}</div>
    </section>`}).join('')}</div>`;
  $('[data-work-layout-toggle]')?.addEventListener('click',e=>{
    const board=body.querySelector('.work-board');if(!board)return;
    const listMode=!board.classList.contains('mobile-stack');
    board.classList.toggle('mobile-stack',listMode);
    e.currentTarget.setAttribute('aria-pressed',String(listMode));
    localStorage.setItem(WORK_MOBILE_LAYOUT_KEY,listMode?'list':'columns');
  });
  $('[data-work-team]')?.addEventListener('click',()=>void window.MINDS_WORK_TEAM.open(project,()=>renderPlanner()).catch(e=>setStatus('Team: '+(e?.message||e))));
  $('[data-work-add-bucket]')?.addEventListener('click',()=>void addBucket());
  $('[data-work-show-bucket-archive]')?.addEventListener('click',()=>void openArchivedBuckets());
  $$('[data-work-edit-bucket]').forEach(button=>button.onclick=e=>{
    e.stopPropagation();
    const menu=body.querySelector('[data-work-bucket-menu="'+button.dataset.workEditBucket+'"]');
    const opening=!!menu?.hidden;
    body.querySelectorAll('[data-work-bucket-menu]').forEach(x=>x.hidden=true);
    body.querySelectorAll('[data-work-edit-bucket]').forEach(x=>x.setAttribute('aria-expanded','false'));
    if(menu&&opening){menu.hidden=false;button.setAttribute('aria-expanded','true');menu.querySelector('button:not(:disabled)')?.focus()}
  });
  $$('[data-work-rename-bucket]').forEach(button=>button.onclick=()=>editBucket(button.dataset.workRenameBucket));
  $$('[data-work-shift-bucket]').forEach(button=>button.onclick=()=>void shiftBucket(button.dataset.workShiftBucket,button.dataset.workShiftDirection));
  $$('[data-work-archive-bucket]').forEach(button=>button.onclick=()=>archiveBucketDialog(button.dataset.workArchiveBucket));
  $$('[data-work-bucket-handle]').forEach(handle=>{
    handle.ondragstart=e=>{
      draggedWorkBucketId=handle.dataset.workBucketHandle;
      draggedWorkTaskId=null;
      handle.closest('.work-bucket')?.classList.add('is-bucket-dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-minds-bucket',draggedWorkBucketId)}
    };
    handle.ondragend=()=>{
      draggedWorkBucketId=null;
      $$('.work-bucket').forEach(el=>el.classList.remove('is-bucket-dragging','is-bucket-drop-before','is-bucket-drop-after'));
    };
  });
  // Menus close when focus moves elsewhere; keyboard and touch users can use left/right menu actions.
  body.onclick=e=>{
    if(e.target.closest('[data-work-edit-bucket],[data-work-bucket-menu]'))return;
    closeBucketMenus(body);
  };
  body.onkeydown=e=>{if(e.key==='Escape')closeBucketMenus(body)};
  $$('[data-work-add-task]').forEach(b=>b.onclick=()=>editTask(null,b.dataset.workAddTask));
  $$('[data-work-task]').forEach(card=>{
    card.onclick=e=>{if(card.dataset.justDragged==='1'){card.dataset.justDragged='0';return}if(e.target.closest('[data-work-toggle]'))return;editTask(tasks.find(t=>t.id===card.dataset.workTask)||null,null)};
    card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('[data-work-toggle]')){e.preventDefault();editTask(tasks.find(t=>t.id===card.dataset.workTask)||null,null)}};
    card.ondragstart=e=>{draggedWorkBucketId=null;draggedWorkTaskId=card.dataset.workTask;card.dataset.justDragged='1';card.classList.add('is-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedWorkTaskId||'')}};
    card.ondragend=()=>{draggedWorkTaskId=null;card.classList.remove('is-dragging');$$('.work-bucket.is-drop-target').forEach(x=>x.classList.remove('is-drop-target'));setTimeout(()=>{card.dataset.justDragged='0'},120)};
  });
  $$('[data-work-bucket-drop]').forEach(bucket=>{
    bucket.ondragover=e=>{
      if(draggedWorkBucketId){
        if(!bucket.dataset.workBucketDrop||draggedWorkBucketId===bucket.dataset.workBucketDrop)return;
        e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
        const before=e.clientX<bucket.getBoundingClientRect().left+bucket.getBoundingClientRect().width/2;
        bucket.classList.toggle('is-bucket-drop-before',before);
        bucket.classList.toggle('is-bucket-drop-after',!before);
        return;
      }
      if(!draggedWorkTaskId)return;
      const task=tasks.find(x=>x.id===draggedWorkTaskId);if(!task)return;
      const kind=task.completed_at?'done':'open';
      const targetList=[...bucket.querySelectorAll('[data-work-task-list]')].find(x=>x.dataset.workTaskList===kind);
      if(!targetList)return;
      e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';bucket.classList.add('is-drop-target');
      const dragged=$$('[data-work-task]').find(x=>x.dataset.workTask===draggedWorkTaskId);if(!dragged)return;
      const over=e.target.closest?.('[data-work-task]');
      if(over&&over!==dragged&&over.parentNode===targetList){
        const r=over.getBoundingClientRect();
        targetList.insertBefore(dragged,e.clientY<r.top+r.height/2?over:over.nextSibling);
      }else if(dragged.parentNode!==targetList)targetList.appendChild(dragged);
    };
    bucket.ondragleave=e=>{if(!bucket.contains(e.relatedTarget))bucket.classList.remove('is-drop-target','is-bucket-drop-before','is-bucket-drop-after')};
    bucket.ondrop=e=>{
      if(draggedWorkBucketId){
        if(!bucket.dataset.workBucketDrop)return;
        e.preventDefault();
        const dragged=draggedWorkBucketId;draggedWorkBucketId=null;
        const before=e.clientX<bucket.getBoundingClientRect().left+bucket.getBoundingClientRect().width/2;
        $$('.work-bucket').forEach(x=>x.classList.remove('is-bucket-dragging','is-bucket-drop-before','is-bucket-drop-after'));
        void moveBucket(dragged,bucket.dataset.workBucketDrop,before);
        return;
      }
      e.preventDefault();bucket.classList.remove('is-drop-target');
      const id=draggedWorkTaskId||e.dataTransfer?.getData('text/plain'),task=tasks.find(x=>x.id===id);if(!task)return;
      const kind=task.completed_at?'done':'open';
      const targetList=[...bucket.querySelectorAll('[data-work-task-list]')].find(x=>x.dataset.workTaskList===kind);
      if(targetList)void persistWorkTaskOrder(id,bucket.dataset.workBucketDrop||null,targetList);
    };
  });
  $$('[data-work-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();void toggleTask(b.dataset.workToggle)});
  void hydratePlannerImages(body);
}
async function toggleTask(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;const done=!t.completed_at;
  const {error}=await sb.from('isabella_tasks').update({completed_at:done?new Date().toISOString():null,work_status:done?'completed':'not_started',updated_at:new Date().toISOString()}).eq('id',id);
  if(!error){await renderPlanner();setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0)}
}
async function persistWorkTaskOrder(id,bucketId,list){
  const dragged=tasks.find(x=>x.id===id);if(!dragged||!list)return;
  const target=bucketId||null,ids=[...list.querySelectorAll('[data-work-task]')].map(x=>x.dataset.workTask).filter(Boolean);
  if(!ids.includes(id))ids.push(id);
  const now=new Date().toISOString();
  const writes=ids.map((taskId,i)=>sb.from('isabella_tasks').update({
    ...(taskId===id?{work_bucket_id:target}:{}),
    work_sort_order:(i+1)*10,
    updated_at:now
  }).eq('id',taskId));
  const results=await Promise.all(writes),failed=results.find(x=>x.error);
  if(failed){setStatus('No pude guardar el nuevo orden de las Aufgaben.');await renderPlanner();return}
  setStatus('');await renderPlanner();setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0);
}
function closeBucketMenus(root=document){
  root.querySelectorAll('[data-work-bucket-menu]').forEach(menu=>menu.hidden=true);
  root.querySelectorAll('[data-work-edit-bucket]').forEach(button=>button.setAttribute('aria-expanded','false'));
}
async function persistBucketOrder(ids){
  if(!project||ids.length!==buckets.length||new Set(ids).size!==ids.length||
     ids.some(id=>!buckets.some(b=>b.id===id)))return;
  const {data,error}=await sb.rpc('minds_work_bucket_reorder',{p_project_id:project.id,p_bucket_ids:ids});
  if(error||Number(data)!==ids.length){
    setStatus('Bucket-Reihenfolge konnte nicht gespeichert werden. Bitte erneut versuchen.');
    await renderPlanner();return;
  }
  await renderPlanner();
  setStatus('');
}
async function moveBucket(id,targetId,before=true){
  if(!id||id===targetId)return;
  const ids=buckets.map(b=>b.id),from=ids.indexOf(id);
  if(from<0)return;
  ids.splice(from,1);
  const at=ids.indexOf(targetId);
  if(at<0)return;
  ids.splice(at+(before?0:1),0,id);
  if(ids.every((x,i)=>x===buckets[i].id))return;
  await persistBucketOrder(ids);
}
async function shiftBucket(id,direction){
  const ids=buckets.map(b=>b.id),index=ids.indexOf(id);
  const next=index+(direction==='left'?-1:1);
  if(index<0||next<0||next>=ids.length)return;
  [ids[index],ids[next]]=[ids[next],ids[index]];
  await persistBucketOrder(ids);
}
function bucketNameDialog(bucket){
  closeBucketMenus($('#workBody'));
  window.ISABELLA_APP?.openModal?.(bucket?'Bucket umbenennen':'Neuer Bucket',`<div class="form work-bucket-editor">
    <label>Bucket-Name<input id="workBucketName" maxlength="120" value="${esc(bucket?.name||'')}" placeholder="Name"></label>
    <div class="work-bucket-dialog-actions"><button id="workBucketSave" type="button" class="primary">Speichern</button><button id="workBucketCancel" type="button" class="secondary">Abbrechen</button></div>
  </div>`);
  $('#workBucketCancel').onclick=()=>window.ISABELLA_APP?.closeModal?.();
  $('#workBucketSave').onclick=()=>void saveBucketName(bucket);
  $('#workBucketName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void saveBucketName(bucket)}};
  $('#workBucketName').focus();
}
async function saveBucketName(bucket){
  const field=$('#workBucketName'),name=field?.value.trim();
  if(!name||name.length>120){setStatus('Der Bucket-Name muss zwischen 1 und 120 Zeichen enthalten.');field?.focus();return}
  if(buckets.some(b=>b.id!==bucket?.id&&b.name.toLocaleLowerCase()===name.toLocaleLowerCase())){
    setStatus('Ein Bucket mit diesem Namen ist bereits vorhanden.');field?.focus();return;
  }
  if(bucket?.name===name){window.ISABELLA_APP?.closeModal?.();return}
  const button=$('#workBucketSave');if(button)button.disabled=true;
  const {data,error}=bucket
    ?await sb.from('minds_work_buckets').update({name,updated_at:new Date().toISOString()})
        .eq('id',bucket.id).eq('project_id',project.id).eq('archived',false).select('id')
    :await sb.from('minds_work_buckets').insert({project_id:project.id,name,
        sort_order:Math.max(0,...buckets.map(b=>Number(b.sort_order)||0))+10}).select('id');
  if(error||data?.length!==1){
    if(button)button.disabled=false;
    setStatus('Bucket konnte nicht gespeichert werden.');return;
  }
  window.ISABELLA_APP?.closeModal?.();
  await renderPlanner();setStatus('');
}
function addBucket(){bucketNameDialog(null)}
function editBucket(id){const bucket=buckets.find(x=>x.id===id);if(bucket)bucketNameDialog(bucket)}
function archiveBucketDialog(id){
  const bucket=buckets.find(x=>x.id===id);if(!bucket)return;
  closeBucketMenus($('#workBody'));
  const matching=tasks.filter(t=>t.work_bucket_id===id);
  const unfinished=matching.filter(t=>!t.completed_at).length;
  const completed=matching.filter(t=>!!t.completed_at).length;
  const pendingText=unfinished
    ?`${unfinished} offene Aufgabe${unfinished===1?'':'n'} ${unfinished===1?'wird':'werden'} nach <strong>Ohne Bucket</strong> verschoben.`
    :'Keine offenen Aufgaben müssen verschoben werden.';
  const completedText=completed
    ?`${completed} erledigte Aufgabe${completed===1?' bleibt':'n bleiben'} im Archiv.`
    :'';
  window.ISABELLA_APP?.openModal?.('Bucket entfernen?',`<div class="form work-bucket-editor">
    <p class="work-bucket-confirm-subject"><strong>${esc(bucket.name)}</strong></p>
    ${completedText?`<p>${completedText}</p>`:''}
    <p>${pendingText}</p>
    <p class="work-bucket-recoverable">Später wiederherstellbar.</p>
    <div class="work-bucket-dialog-actions"><button id="workBucketArchiveCancel" type="button" class="secondary">Abbrechen</button><button id="workBucketArchive" type="button" class="work-bucket-confirm-danger">Entfernen</button></div>
  </div>`);
  $('#workBucketArchiveCancel').onclick=()=>window.ISABELLA_APP?.closeModal?.();
  $('#workBucketArchive').onclick=()=>void archiveBucket(id);
}
async function archiveBucket(id){
  const button=$('#workBucketArchive');if(button)button.disabled=true;
  const {data,error}=await sb.rpc('minds_work_bucket_archive',{p_project_id:project.id,p_bucket_id:id});
  if(error||!Number.isInteger(Number(data))){
    if(button)button.disabled=false;
    setStatus('Bucket konnte nicht entfernt werden. Aufgaben wurden nicht gelöscht.');return;
  }
  window.ISABELLA_APP?.closeModal?.();
  await renderPlanner();setStatus('');
  setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0);
}

async function openArchivedBuckets(){
  if(!project)return;
  const {data:archived,error}=await sb.from('minds_work_buckets')
    .select('id,name,updated_at').eq('project_id',project.id).eq('archived',true)
    .order('updated_at',{ascending:false}).limit(100);
  if(error){setStatus('Archivierte Buckets konnten nicht geladen werden.');return}
  const ids=(archived||[]).map(b=>b.id);
  let history=[];
  if(ids.length){
    const {data,error:taskError}=await sb.from('isabella_tasks')
      .select('id,title,completed_at,work_bucket_id')
      .eq('project_id',project.id).in('work_bucket_id',ids).limit(1000);
    if(taskError){setStatus('Aufgabenverlauf konnte nicht geladen werden.');return}
    history=data||[];
  }
  const markup=archived?.length
    ?archived.map(bucket=>{
      const associated=history.filter(task=>task.work_bucket_id===bucket.id);
      const finished=associated.filter(task=>!!task.completed_at);
      const unfinished=associated.length-finished.length;
      const taskPreview=associated.slice(0,40).map(task=>
        `<li>${esc(task.title)} <small>${task.completed_at?'Erledigt':'Offen'}</small></li>`).join('');
      return `<section class="work-bucket-archive-item">
        <details><summary><strong>${esc(bucket.name)}</strong><small>${finished.length} erledigt${unfinished?', '+unfinished+' offen':''}</small></summary>
          ${associated.length?`<ul>${taskPreview}</ul>`:'<p>Keine zugeordneten Aufgaben.</p>'}
          ${associated.length>40?'<p>Weitere Aufgaben bleiben im Archiv erhalten.</p>':''}
        </details>
        <button type="button" data-work-restore-bucket="${bucket.id}">Wiederherstellen</button>
      </section>`;
    }).join('')
    :'<p>Keine archivierten Buckets vorhanden.</p>';
  window.ISABELLA_APP?.openModal?.('Archivierte Buckets',
    `<div class="work-bucket-archive">${markup}</div>`);
  $$('[data-work-restore-bucket]').forEach(button=>
    button.onclick=()=>void restoreArchivedBucket(button.dataset.workRestoreBucket,button));
}
async function restoreArchivedBucket(id,button){
  if(!project||!id)return;
  if(button)button.disabled=true;
  const {data,error}=await sb.rpc('minds_work_bucket_restore',
    {p_project_id:project.id,p_bucket_id:id});
  if(error||data!==true){
    if(button)button.disabled=false;
    setStatus('Bucket konnte nicht wiederhergestellt werden.');return;
  }
  window.ISABELLA_APP?.closeModal?.();
  await renderPlanner();setStatus('');
}

function checklistRows(items=[]){return (items||[]).map(x=>`<div class="work-check-row" data-check-id="${esc(x?.id||'')}"><input type="checkbox" data-work-check-done ${x?.done?'checked':''}><input data-work-check-text value="${esc(x?.text||'')}" placeholder="Punto de checklist"><button type="button" data-work-check-remove>×</button></div>`).join('')}
function bindChecklist(){$$('[data-work-check-remove]').forEach(b=>b.onclick=()=>b.closest('.work-check-row')?.remove())}
function attachmentEditorMarkup(){
  const existing=editingAttachments.map((a,i)=>`<div class="work-attachment-row">${a?.path&&String(a?.mime||'').startsWith('image/')?`<img ${cachedWorkUrl(a.path)?`src="${esc(cachedWorkUrl(a.path))}" data-loaded="1"`:''} data-work-edit-image="${esc(a.path)}" alt="">`:'<span>⌕</span>'}<div><strong>${esc(a?.name||'Anlage')}</strong><small>${a?.path?'gespeichert':'Teams-Referenz · Original noch nicht importiert'}</small></div></div>`).join('');
  const pending=pendingTaskFiles.map((f,i)=>`<div class="work-attachment-row is-pending"><span>＋</span><div><strong>${esc(f.name)}</strong><small>se guarda al guardar la Aufgabe</small></div><button type="button" data-remove-pending="${i}">×</button></div>`).join('');
  return existing+pending||'<div class="work-attachment-empty">Noch keine Anlagen</div>';
}
function renderAttachmentEditor(){
  const box=$('#workTaskAttachments');if(!box)return;box.innerHTML=attachmentEditorMarkup();
  $$('[data-remove-pending]').forEach(b=>b.onclick=()=>{pendingTaskFiles.splice(Number(b.dataset.removePending),1);renderAttachmentEditor()});
  void hydratePlannerImages(box);
}
function editTask(task,bucketId){
  if(window.MINDS_TASK_DETAIL?.open){
    void window.MINDS_TASK_DETAIL.open({taskId:task?.id||null,projectId:project.id,
      bucketId:task?.work_bucket_id||bucketId||null,onUpdated:()=>renderPlanner()});return;
  }
  const assigneeOptions='<option value="">Nicht zugewiesen</option>'+team.map(p=>`<option value="${esc(p.id)}" ${p.id===task?.assignee_person_id?'selected':''}>${esc(p.name)}</option>`).join('')+
    (task?.assignee&&!task.assignee_person_id?`<option value="__legacy__" selected>Aus Bestand: ${esc(task.assignee)}</option>`:'');
  pendingTaskFiles=[];editingAttachments=[...taskAttachments(task||{})];
  const t=task||{title:'',due_date:'',start_date:'',priority:'normal',work_status:'not_started',assignee:'',notes:'',labels:[],checklist:[]},bucket=t.work_bucket_id||bucketId||'';
  window.ISABELLA_APP?.openModal?.(task?'Aufgabe':'Neue Aufgabe',`<div class="form work-task-form">
    <label class="work-task-title-field">Titel<input id="workTaskTitle" value="${esc(t.title||'')}"></label>
    <div class="work-task-grid"><label>Bucket<select id="workTaskBucket"><option value="">Ohne Bucket</option>${buckets.map(b=>`<option value="${b.id}" ${b.id===bucket?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label>Status<select id="workTaskStatus"><option value="not_started" ${t.work_status==='not_started'?'selected':''}>Nicht begonnen</option><option value="in_progress" ${t.work_status==='in_progress'?'selected':''}>In Bearbeitung</option><option value="waiting" ${t.work_status==='waiting'?'selected':''}>Warten</option><option value="completed" ${t.work_status==='completed'?'selected':''}>Erledigt</option></select></label></div>
    <div class="work-task-grid"><label>Start<input id="workTaskStart" type="date" value="${esc(t.start_date||'')}"></label><label>Fällig<input id="workTaskDue" type="date" value="${esc(t.due_date||'')}"></label></div>
    <div class="work-task-grid"><label>Priorität<select id="workTaskPriority"><option value="low" ${t.priority==='low'?'selected':''}>Niedrig</option><option value="normal" ${t.priority==='normal'?'selected':''}>Normal</option><option value="important" ${t.priority==='important'?'selected':''}>Wichtig</option><option value="urgent" ${t.priority==='urgent'?'selected':''}>Dringend</option></select></label><label>Zuständig<select id="workTaskAssignee">${assigneeOptions}</select></label></div>
    <label>Labels<input id="workTaskLabels" value="${esc((Array.isArray(t.labels)?t.labels:[]).join(', '))}" placeholder="TGA, Bauherr, Freigabe"></label>
    <label>Notizen<textarea id="workTaskNotes" rows="4">${esc(t.notes||'')}</textarea></label>
    <div class="work-task-detail-section"><div class="work-check-head"><span>Checklist</span><button id="workAddCheck" type="button">＋ Punkt</button></div><div id="workChecklist">${checklistRows(t.checklist)}</div></div>
    <div class="work-task-detail-section"><div class="work-check-head"><span>Anlagen</span><button id="workAddAttachment" type="button">＋ Bild / Datei</button></div><input id="workTaskAttachmentInput" class="hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"><div id="workTaskAttachments"></div></div>
    <button id="workSaveTask" class="primary">Speichern</button>
    ${task?'<button id="workDeleteTask" class="secondary danger-text">Aufgabe löschen</button>':''}
  </div>`);
  bindChecklist();renderAttachmentEditor();
  $('#workAddCheck').onclick=()=>{const row=document.createElement('div');row.className='work-check-row';row.dataset.checkId=Math.random().toString(36).slice(2);row.innerHTML='<input type="checkbox" data-work-check-done><input data-work-check-text placeholder="Punto de checklist"><button type="button" data-work-check-remove>×</button>';$('#workChecklist').appendChild(row);bindChecklist()};
  const attachmentInput=$('#workTaskAttachmentInput');$('#workAddAttachment').onclick=()=>attachmentInput.click();attachmentInput.onchange=()=>{pendingTaskFiles.push(...[...(attachmentInput.files||[])]);attachmentInput.value='';renderAttachmentEditor()};
  $('#workSaveTask').onclick=()=>void saveTask(task);
  if(task)$('#workDeleteTask').onclick=()=>void deleteWorkTask(task);
}
async function deleteWorkTask(task){
  if(!task||!window.confirm(`„${task.title}“ wirklich löschen?`))return;
  const paths=taskAttachments(task).map(a=>a?.path).filter(Boolean);
  const {error}=await sb.from('isabella_tasks').delete().eq('id',task.id);
  if(error){setStatus('No pude eliminar la Aufgabe.');return}
  if(paths.length)try{await sb.storage.from('minds-work').remove(paths)}catch{}
  window.ISABELLA_APP?.closeModal?.();await renderPlanner();setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0);
}
async function saveTask(existing){
  const title=$('#workTaskTitle').value.trim();if(!title)return;const status=$('#workTaskStatus').value,targetBucket=$('#workTaskBucket').value||null;
  const checklist=$$('.work-check-row').map(r=>({id:r.dataset.checkId||Math.random().toString(36).slice(2),text:r.querySelector('[data-work-check-text]').value.trim(),done:r.querySelector('[data-work-check-done]').checked})).filter(x=>x.text);
  const sameBucket=!!existing&&(existing.work_bucket_id||null)===targetBucket;
  const workOrder=sameBucket&&Number(existing.work_sort_order||0)>0
    ?Number(existing.work_sort_order)
    :Math.max(0,...tasks.filter(x=>x.id!==existing?.id&&(x.work_bucket_id||null)===targetBucket).map(x=>Number(x.work_sort_order||0)))+10;
  const selectedPerson=$('#workTaskAssignee').value;
  const chosen=team.find(p=>p.id===selectedPerson)||null;
  const oldAssignee=selectedPerson==='__legacy__'?existing?.assignee||null:null;
  const row={title,project_id:project.id,work_bucket_id:targetBucket,work_sort_order:workOrder,work_status:status,priority:$('#workTaskPriority').value,start_date:$('#workTaskStart').value||null,due_date:$('#workTaskDue').value||null,assignee:chosen?.name||oldAssignee,assignee_person_id:chosen?.id||null,labels:$('#workTaskLabels').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#workTaskNotes').value,checklist,completed_at:status==='completed'?(existing?.completed_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
  let savedId=existing?.id||null,error=null;
  if(existing)({error}=await sb.from('isabella_tasks').update(row).eq('id',existing.id));
  else{const res=await sb.from('isabella_tasks').insert({...row,sort_order:tasks.length*10}).select('id').single();error=res.error;savedId=res.data?.id||null}
  if(error||!savedId){setStatus('No pude guardar la Aufgabe.');return}
  if(pendingTaskFiles.length){
    const session=await getSession(),next=[...editingAttachments];
    if(session){
      for(const file of pendingTaskFiles){
        const path=`${session.user.id}/${project.client_key}/tasks/${savedId}/${Date.now()}-${Math.random().toString(36).slice(2,7)}-${safeName(file.name)}`;
        const {error:ue}=await sb.storage.from('minds-work').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
        if(!ue)next.push({id:Math.random().toString(36).slice(2),name:file.name,path,mime:file.type||'application/octet-stream',size:file.size,created_at:new Date().toISOString()});
      }
      await sb.from('isabella_tasks').update({attachments:next,updated_at:new Date().toISOString()}).eq('id',savedId);
    }
  }
  pendingTaskFiles=[];editingAttachments=[];window.ISABELLA_APP?.closeModal?.();await renderPlanner();setTimeout(()=>window.ISABELLA_SYNC_PULL_NOW?.(),0);
}

async function loadThreads(){
  const {data,error}=await sb.from('minds_work_threads')
    .select('id,project_id,conversation_id,title,summary,status,capability_profile,sort_order,last_activity_at,updated_at,metadata')
    .eq('project_id',project.id).in('status',['active','archived'])
    .order('sort_order',{ascending:true}).order('updated_at',{ascending:false});
  if(error)throw error;threads=data||[];
  const ids=threads.map(x=>x.conversation_id).filter(Boolean);
  if(ids.length){
    const {data:msgs}=await sb.from('conversation_messages')
      .select('conversation_id,role,content,created_at')
      .in('conversation_id',ids).in('role',['user','assistant'])
      .order('created_at',{ascending:false}).limit(240);
    const latest=new Map();
    for(const m of msgs||[])if(!latest.has(m.conversation_id))latest.set(m.conversation_id,m);
    threads=threads.map(t=>({...t,preview:latest.get(t.conversation_id)||null}));
  }
}
function threadDate(value){
  if(!value)return '';
  try{return new Date(value).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:new Date(value).getFullYear()!==new Date().getFullYear()?'2-digit':undefined})}catch{return''}
}
function threadError(message){
  const el=$('#workThreadEditorError');if(el)el.textContent=message||'';
  else if(message)setStatus(message);
}
async function renderThreads(){
  await loadThreads();
  const active=threads.filter(x=>x.status==='active'),archived=threads.filter(x=>x.status==='archived');
  if(activeThreadId&&active.some(x=>x.id===activeThreadId)){await renderThreadConversation(activeThreadId);return}
  activeThreadId=null;
  const body=$('#workBody');
  body.innerHTML=`<div class="work-threads">
    <div class="work-desktop-toolbar"><div><strong>Threads</strong><p class="small">Conversaciones de trabajo por tema. Comparten Desktop, Conocimiento y Planner de ${esc(project.name)} sin mezclar sus historiales.</p></div><div class="work-thread-toolbar-actions">${archived.length?`<button data-work-archived>Archivados · ${archived.length}</button>`:''}<button data-work-new-thread>＋ Thread</button></div></div>
    <div class="work-thread-list">${active.map(t=>{
      const preview=String(t.preview?.content||t.summary||'').trim();
      const at=t.last_activity_at||t.preview?.created_at||t.updated_at;
      return `<div class="work-thread-row">
        <button class="work-thread-card" data-work-thread="${t.id}">
          <span class="work-thread-card-main"><strong>${esc(t.title)}</strong><span>${esc(preview?workPlainPreview(preview).slice(0,150):'Todavía sin conversación')}</span></span>
          <span class="work-thread-card-meta">${esc(threadDate(at))}<b>›</b></span>
        </button>
        <button class="work-thread-more" data-work-thread-actions="${t.id}" aria-label="Opciones de ${esc(t.title)}">•••</button>
      </div>`;
    }).join('')||'<div class="work-empty work-empty-wide">Todavía no hay Threads activos en este proyecto.</div>'}</div>
  </div>`;
  $('[data-work-new-thread]')?.addEventListener('click',createThread);
  $('[data-work-archived]')?.addEventListener('click',openArchivedThreads);
  $$('[data-work-thread]').forEach(b=>b.onclick=()=>{activeThreadId=b.dataset.workThread;void renderThreads()});
  $$('[data-work-thread-actions]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openThreadActions(threads.find(x=>x.id===b.dataset.workThread))});
}
function openThreadEditor(thread=null){
  const isRename=!!thread;
  window.ISABELLA_APP?.openModal?.(isRename?'Renombrar Thread':'Nuevo Thread',`<div class="form work-thread-editor">
    <label>Nombre<input id="workThreadName" maxlength="160" value="${esc(thread?.title||'')}" placeholder="Nombre del Thread"></label>
    <div id="workThreadEditorError" class="human-inline-error"></div>
    <button id="workThreadSave" class="primary">${isRename?'Guardar nombre':'Crear Thread'}</button>
  </div>`);
  const input=$('#workThreadName');input?.focus();input?.select();
  $('#workThreadSave').onclick=()=>void saveThreadName(thread);
  input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void saveThreadName(thread)}});
}
async function saveThreadName(thread){
  const title=String($('#workThreadName')?.value||'').trim();
  if(!title){threadError('Escribe un nombre para el Thread.');return}
  threadError('');
  if(thread){
    const {error}=await sb.rpc('minds_rename_work_thread',{p_thread_id:thread.id,p_title:title});
    if(error){threadError(error.code==='23505'?'Ya existe un Thread activo con ese nombre.':'No pude cambiar el nombre del Thread.');return}
  }else{
    const order=(threads.reduce((m,x)=>Math.max(m,Number(x.sort_order||0)),0)||0)+10;
    const {data,error}=await sb.from('minds_work_threads').insert({project_id:project.id,title,sort_order:order,metadata:{source:'work_ui'}}).select('id').single();
    if(error){threadError(error.code==='23505'?'Ya existe un Thread activo con ese nombre.':'No pude crear el Thread.');return}
    activeThreadId=data.id;
  }
  window.ISABELLA_APP?.closeModal?.();setStatus('');await renderThreads();
}
function createThread(){openThreadEditor(null)}
function openThreadActions(thread){
  if(!thread)return;
  window.ISABELLA_APP?.openModal?.(thread.title,`<div class="work-thread-action-sheet">
    <button id="workThreadRename" class="secondary">Renombrar</button>
    <button id="workThreadArchive" class="secondary danger-text">Archivar Thread</button>
    <p class="small">Archivar lo quita de la lista activa, pero conserva toda la conversación para poder recuperarla después.</p>
  </div>`);
  $('#workThreadRename').onclick=()=>openThreadEditor(thread);
  $('#workThreadArchive').onclick=()=>confirmArchiveThread(thread);
}
function confirmArchiveThread(thread){
  window.ISABELLA_APP?.openModal?.('Archivar Thread',`<div class="confirm-copy">¿Archivar “${esc(thread.title)}”? La conversación se conserva y Isabella podrá recuperarla como contexto histórico.</div><div class="confirm-actions"><button id="workThreadArchiveCancel" class="secondary">Cancelar</button><button id="workThreadArchiveConfirm" class="primary">Archivar</button></div>`);
  $('#workThreadArchiveCancel').onclick=()=>window.ISABELLA_APP?.closeModal?.();
  $('#workThreadArchiveConfirm').onclick=()=>void setThreadStatus(thread,'archived');
}
async function setThreadStatus(thread,status){
  const {error}=await sb.rpc('minds_set_work_thread_status',{p_thread_id:thread.id,p_status:status});
  if(error){
    setStatus(error.code==='23505'?'No puedo restaurarlo porque ya existe un Thread activo con ese nombre.':'No pude actualizar el Thread.');
    return;
  }
  if(status==='archived'&&activeThreadId===thread.id)activeThreadId=null;
  window.ISABELLA_APP?.closeModal?.();setStatus('');await renderThreads();
}
function openArchivedThreads(){
  const archived=threads.filter(x=>x.status==='archived');
  window.ISABELLA_APP?.openModal?.('Threads archivados',`<div class="work-thread-archive-list">${archived.map(t=>`<div class="work-thread-archive-row"><div><strong>${esc(t.title)}</strong><span>${esc(threadDate(t.last_activity_at||t.updated_at))}</span></div><div><button class="secondary" data-thread-archive-rename="${t.id}">Renombrar</button><button class="secondary" data-thread-restore="${t.id}">Restaurar</button></div></div>`).join('')||'<div class="small">No hay Threads archivados.</div>'}</div>`);
  $$('[data-thread-archive-rename]').forEach(b=>b.onclick=()=>openThreadEditor(threads.find(x=>x.id===b.dataset.threadArchiveRename)));
  $$('[data-thread-restore]').forEach(b=>b.onclick=()=>void setThreadStatus(threads.find(x=>x.id===b.dataset.threadRestore),'active'));
}
async function ensureThreadConversation(thread){
  if(thread.conversation_id)return thread.conversation_id;
  const {data,error}=await sb.rpc('minds_ensure_work_thread_conversation',{p_thread_id:thread.id});
  if(error||!data)throw error||new Error('No pude abrir la conversación.');
  thread.conversation_id=String(data);return thread.conversation_id;
}
async function loadThreadMessages(thread){
  const cid=await ensureThreadConversation(thread);
  const {data,error}=await sb.from('conversation_messages')
    .select('client_key,role,content,created_at,metadata')
    .eq('conversation_id',cid).in('role',['user','assistant'])
    .order('created_at',{ascending:true}).limit(400);
  if(error)throw error;return data||[];
}
function threadArtifactLabel(kind){return ({docx:'WORD',pdf:'PDF',xlsx:'EXCEL',pptx:'POWERPOINT',csv:'CSV',zip:'ZIP',html:'HTML',txt:'TXT',json:'JSON',image:'IMAGEN'}[String(kind||'')]||String(kind||'ARCHIVO').toUpperCase())}
function cleanThreadDeliverableText(text,artifacts=[]){
  let out=String(text||'');
  if(!Array.isArray(artifacts)||!artifacts.length)return out;
  out=out.replace(/^\s*[-*]\s*\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)\s*$/gmi,'');
  out=out.replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'');
  out=out.replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'');
  out=out.replace(/^\s*[-*]\s*$/gm,'');
  return out.replace(/\n{3,}/g,'\n\n').trim();
}
function threadArtifactGroups(artifacts=[]){
  const items=(Array.isArray(artifacts)?artifacts:[]).filter(x=>x?.storage_path);
  const hasMaterial=items.some(x=>String(x?.kind||'')!=='image');
  return {previews:hasMaterial?items.filter(x=>String(x?.kind||'')==='image'):[],deliverables:hasMaterial?items.filter(x=>String(x?.kind||'')!=='image'):items};
}
function threadMessageMarkup(m){
  const role=m.role==='user'?'user':'assistant';
  const sources=Array.isArray(m.metadata?.sources)?m.metadata.sources:[];
  const artifacts=Array.isArray(m.metadata?.artifacts)?m.metadata.artifacts:[];
  const groups=threadArtifactGroups(artifacts),copy=cleanThreadDeliverableText(m.content,artifacts);
  const previews=groups.previews.length?`<div class="work-thread-previews">${groups.previews.slice(0,2).map(a=>`<button type="button" data-thread-artifact-preview="${esc(a.storage_path)}" aria-label="Abrir vista previa"><img data-thread-artifact-image="${esc(a.storage_path)}" alt="Vista previa del documento"></button>`).join('')}</div>`:'';
  const deliverables=groups.deliverables.length?`<div class="work-thread-artifacts">${groups.deliverables.slice(0,8).map(a=>a?.storage_path?`<a href="#" data-thread-artifact="${esc(a.storage_path)}"><span>${esc(threadArtifactLabel(a.kind))}</span>${esc(a.title||'Archivo')}</a>`:'').join('')}</div>`:'';
  // Messages Claude saved through the Window connector carry their author.
  const author=m.metadata?.source==='claude_connector'&&role==='assistant'?'<div class="work-thread-author">Claude</div>':'';
  return `<article class="work-thread-message ${role}${author?' from-claude':''}">${author}${copy?`<div class="work-thread-message-copy">${window.ISABELLA_APP?.formatMessageText?.(copy)||esc(copy).replace(/\n/g,'<br>')}</div>`:''}${previews}${deliverables}${sources.length?`<details><summary>Fuentes</summary>${sources.slice(0,6).map(s=>`<div class="small">${esc(s.title||s.url||'Fuente')}</div>`).join('')}</details>`:''}${role==='assistant'&&!sources.length&&!author?'<div class="work-thread-source-boundary">Esta respuesta no incluye fuentes citadas verificables.</div>':''}${role==='assistant'&&m.metadata?.incomplete_response?`<div class="message-incomplete">Respuesta interrumpida. El texto recibido es parcial.<button type="button" data-thread-continue="${esc(m.client_key||m.id||'')}">Continuar respuesta</button></div>`:''}</article>`;
}
async function hydrateThreadArtifacts(root=document){
  const files=[...root.querySelectorAll?.('[data-thread-artifact]')||[]],images=[...root.querySelectorAll?.('[data-thread-artifact-image]')||[]];
  await Promise.all([...files,...images].map(async node=>{
    try{
      const path=String(node.dataset.threadArtifact||node.dataset.threadArtifactImage||'');if(!path)return;
      const {data}=await sb.storage.from('minds-artifacts').createSignedUrl(path,3600);if(!data?.signedUrl)return;
      if(node.matches('img')){
        node.src=data.signedUrl;
        const button=node.closest('[data-thread-artifact-preview]');
        if(button)button.onclick=()=>window.open(data.signedUrl,'_blank','noopener');
      }else{node.href=data.signedUrl;node.target='_blank';node.rel='noopener'}
    }catch{}
  }));
}
// Ephemeral transport/presentation state, never a persisted epistemic fact.
const threadInFlight=new Set();
let threadProgress={id:null,phase:'',label:''};
function setThreadProgress(id,phase,label){
  threadProgress={id,phase,label};
  const node=$('#workThreadProgress');
  if(node&&activeThreadId===id){
    node.textContent=label;
    node.hidden=!label;
    node.dataset.phase=phase;
  }
  const form=$('#workThreadForm');
  if(form&&activeThreadId===id)form.classList.toggle('is-busy',threadInFlight.has(id));
}
// Projektakte (German): the topic's Themenblatt as written by Claude through the Window connector.
function akteDate(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:''}
function themenblattMarkup(thread){
  const t=thread?.metadata?.themenblatt;if(!t||!t.stand)return '';
  const items=(arr,fn)=>Array.isArray(arr)&&arr.length?'<ul>'+arr.map(x=>'<li>'+fn(x)+'</li>').join('')+'</ul>':'';
  const decisions=items(t.entscheidungen,e=>esc((e.datum?akteDate(e.datum)+' · ':'')+e.text)+(e.quelle?' <small>'+esc(e.quelle)+'</small>':'')+(e.bestaetigt?'':' <em>vorgeschlagen</em>'));
  let open=true;try{open=localStorage.getItem('minds-themenblatt-open')!=='0'}catch{}
  return `<details class="work-themenblatt"${open?' open':''}><summary><span>Themenblatt</span><small>${esc(['aktualisiert '+akteDate(t.aktualisiert_am),t.aktualisiert_von].filter(Boolean).join(' · '))}</small></summary>
    <div class="work-themenblatt-body"><p class="work-themenblatt-stand">${esc(t.stand)}</p>
    ${decisions?'<h4>Entscheidungen</h4>'+decisions:''}
    ${items(t.offene_fragen,x=>esc(x))?'<h4>Offene Fragen</h4>'+items(t.offene_fragen,x=>esc(x)):''}
    ${items(t.naechste_schritte,x=>esc(x))?'<h4>Nächste Schritte</h4>'+items(t.naechste_schritte,x=>esc(x)):''}
    ${Array.isArray(t.dokumente)&&t.dokumente.length?'<p class="work-themenblatt-docs"><small>Dokumente: '+esc(t.dokumente.map(d=>d?.name||d).join(', '))+'</small></p>':''}</div></details>`;
}
// Remember whether Gari keeps the Themenblatt open or folded (toggle does not bubble, so capture it).
document.addEventListener?.('toggle',event=>{const el=event.target;if(el?.classList?.contains('work-themenblatt'))try{localStorage.setItem('minds-themenblatt-open',el.open?'1':'0')}catch{}},true);
function claudeContinueUrl(thread){
  return 'https://claude.ai/new?q='+encodeURIComponent('Retoma en Window el proyecto '+project.name+', tema «'+thread.title+'»: abre el tema y dime dónde estamos.');
}
async function renderThreadConversation(id){
  const thread=threads.find(x=>x.id===id);if(!thread){activeThreadId=null;await renderThreads();return}
  const body=$('#workBody');body.innerHTML='<div class="surface-loading">Abriendo Thread…</div>';
  try{
    const messages=await loadThreadMessages(thread);
    body.innerHTML=`<section class="work-thread-conversation">
      <header class="work-thread-head"><button data-thread-back class="text-btn">‹ Threads</button><div><strong>${esc(thread.title)}</strong><span>${esc(project.name)}</span></div><a class="work-thread-claude" href="${esc(claudeContinueUrl(thread))}" target="_blank" rel="noopener" title="Abrir este tema en Claude con el conector Window">Continuar en Claude</a><button data-thread-actions class="work-thread-head-more" aria-label="Opciones del Thread">•••</button></header>
      ${themenblattMarkup(thread)}<div class="work-thread-log" id="workThreadLog">${messages.map(threadMessageMarkup).join('')||'<div class="work-thread-empty">Este Thread está vacío. Empieza con la primera pregunta o tarea.</div>'}</div>
      <div class="work-thread-compose-region"><div id="workThreadProgress" class="chat-activity work-thread-progress" role="status" aria-live="polite" data-phase="${esc(threadProgress.phase)}" ${threadProgress.id===thread.id&&threadProgress.label?'':'hidden'}>${threadProgress.id===thread.id?esc(threadProgress.label):''}</div><form class="work-thread-composer ${threadInFlight.has(thread.id)?'is-busy':''}" id="workThreadForm"><textarea id="workThreadInput" rows="1" placeholder="Preguntar en ${esc(thread.title)}…"></textarea><button class="send" aria-label="Enviar"><svg class="chat-ui-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></form></div>
    </section>`;
    $('[data-thread-back]').onclick=()=>{activeThreadId=null;void renderThreads()};
    $('[data-thread-actions]').onclick=()=>openThreadActions(thread);
    $('#workThreadForm').onsubmit=e=>{e.preventDefault();void sendThreadMessage(thread)};
    $$('[data-thread-continue]').forEach(button=>button.onclick=()=>{
      const i=messages.findIndex(m=>(m.client_key||m.id)===button.dataset.threadContinue);
      if(i<0)return;
      const preceding=messages.slice(0,i).reverse().find(m=>m.role==='user');
      const original=String(preceding?.content||'').slice(0,900);
      void sendThreadMessage(thread,'Continúa desde el punto donde se interrumpió tu respuesta anterior, sin repetir la parte ya escrita. Pregunta original: '+original);
    });
    $('#workThreadInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#workThreadForm')?.requestSubmit()}
    });
    void hydrateThreadArtifacts(body);
    requestAnimationFrame(()=>{const log=$('#workThreadLog');if(log)log.scrollTop=log.scrollHeight});
  }catch(e){console.error(e);body.innerHTML='<div class="work-empty">No pude abrir este Thread.</div>'}
}
async function persistThreadMessage(conversationId,role,content,metadata={}){
  const session=await getSession();if(!session)throw new Error('Sin sesión');
  const key=(globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2));
  const {error}=await sb.from('conversation_messages').insert({
    user_id:session.user.id,conversation_id:conversationId,client_key:key,role,content:String(content||''),provisional:false,citations:[],
    metadata:{...metadata,app:'work_thread',work_thread_id:activeThreadId,project_id:project.id}
  });
  if(error)throw error;
  await sb.from('conversations').update({updated_at:new Date().toISOString()}).eq('id',conversationId);
  return key;
}
async function sendThreadMessage(thread,overrideMessage=null){
  if(threadInFlight.has(thread.id))return;
  const input=$('#workThreadInput'),message=String(overrideMessage??input?.value??'').trim();if(!message)return;
  threadInFlight.add(thread.id);
  if(input){input.disabled=true;if(overrideMessage===null)input.value=''}
  setThreadProgress(thread.id,'sending','Enviando mensaje a MINDS…');
  try{
    const cid=await ensureThreadConversation(thread);
    await persistThreadMessage(cid,'user',message);
    setThreadProgress(thread.id,'saved','Mensaje guardado en MINDS.');
    if(activeThreadId===thread.id&&view==='threads')await renderThreadConversation(thread.id);
    setThreadProgress(thread.id,'thinking','Isabella está revisando el contexto del proyecto…');
    const state=window.ISABELLA_APP?.getState?.()||{};
    const result=await window.ISABELLA_AI.ask(message,state,{
      workThread:{id:thread.id,project:project.name},
      onProgress:event=>{if(event?.label)setThreadProgress(thread.id,'thinking',String(event.label))},
      onTextDelta:()=>setThreadProgress(thread.id,'thinking','Isabella está escribiendo…')
    });
    const reply=String(result?.reply||result?.streamed_text||'').trim();
    setThreadProgress(thread.id,'saving','Guardando la respuesta…');
    if(reply)await persistThreadMessage(cid,'assistant',reply,{sources:Array.isArray(result?.sources)?result.sources.slice(0,8):[],artifacts:Array.isArray(result?.artifacts)?result.artifacts.slice(0,8):[],incomplete_response:!!result?.incomplete,incomplete_reason:result?.incomplete_reason||null});
    const proposal=result?.proposal||(Array.isArray(result?.proposals)?result.proposals[0]:null);
    await sb.from('minds_work_threads').update({last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',thread.id);
    setThreadProgress(thread.id,'received',result?.incomplete?'Respuesta parcial recibida. Puedes continuarla.':reply?'Respuesta recibida.':'Solicitud procesada; no hubo respuesta textual.');
    setStatus('');
    if(activeThreadId===thread.id&&view==='threads')await renderThreads();
    if(proposal&&!result?.incomplete)window.MINDS_PROPOSALS?.edit?.(proposal);
  }catch(e){
    console.error(e);
    setThreadProgress(thread.id,'error','No se completó la respuesta. Comprueba el historial antes de reenviar: el mensaje podría estar guardado.');
    if(activeThreadId===thread.id&&view==='threads')await renderThreads();
  }finally{
    threadInFlight.delete(thread.id);
    $('#workThreadForm')?.classList.remove('is-busy');
    const field=$('#workThreadInput');if(field)field.disabled=false;
  }
}

window.MINDS_WORK={render,refresh:()=>document.body.dataset.section==='work'?render():null,context:()=>project?{name:project.name,key:project.client_key,active:document.body.dataset.section==='work',view,thread_id:activeThreadId||null}:null};
if(document.body.dataset.section==='work'&&typeof setTimeout==='function')setTimeout(()=>{if(!bound)void render()},0);
})();
