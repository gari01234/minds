(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sb=window.MINDS_SUPABASE;
const DEFAULT_BUCKETS=['Projektorganisation','Entwurf','Genehmigung','Ausführungsplanung','Ausschreibung/Vergabe','Baustelle','Dokumentation'];
let projectKey=localStorage.getItem('minds-work-project')||'bernried',view=localStorage.getItem('minds-work-view')||'desktop',folderId=null,project=null,folders=[],files=[],buckets=[],tasks=[],threads=[],activeThreadId=null,bound=false,pendingTaskFiles=[],editingAttachments=[],draggedWorkTaskId=null;
const workSignedCache=new Map();
function setStatus(t=''){const el=$('#workStatus');if(el)el.textContent=t}
function safeName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150)||'file'}
function sourceKind(file){const n=String(file?.name||'').toLowerCase(),m=String(file?.type||'');if(n.endsWith('.eml')||n.endsWith('.msg')||m==='message/rfc822')return'email';if(m.startsWith('image/'))return'image';if(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/i.test(n))return'document';return'file'}
async function getSession(){if(!sb)return null;const {data}=await sb.auth.getSession();return data?.session||null}
async function loadProject(){const session=await getSession();if(!session)return null;const {data,error}=await sb.from('isabella_projects').select('id,client_key,name').eq('user_id',session.user.id).eq('client_key',projectKey).maybeSingle();if(error)throw error;return data||null}
function bindStatic(){
  if(bound)return;bound=true;
  $$('[data-work-project]').forEach(b=>b.onclick=()=>{projectKey=b.dataset.workProject;localStorage.setItem('minds-work-project',projectKey);folderId=null;activeThreadId=null;void render()});
  $$('[data-work-view]').forEach(b=>b.onclick=()=>{view=b.dataset.workView;localStorage.setItem('minds-work-view',view);void render()});
  const input=$('#workFileInput');if(input)input.onchange=()=>{const fs=[...(input.files||[])];input.value='';if(fs.length)void uploadFiles(fs)};
  const body=$('#workBody');
  body?.addEventListener('dragover',e=>{if(view!=='desktop')return;e.preventDefault();body.classList.add('is-dragging')});
  body?.addEventListener('dragleave',()=>body.classList.remove('is-dragging'));
  body?.addEventListener('drop',e=>{if(view!=='desktop')return;e.preventDefault();body.classList.remove('is-dragging');const fs=[...(e.dataTransfer?.files||[])];if(fs.length)void uploadFiles(fs)});
}
function paintChrome(){
  $('#workProjectTitle').textContent=project?.name||projectKey;
  $$('[data-work-project]').forEach(b=>b.classList.toggle('active',b.dataset.workProject===projectKey));
  $$('[data-work-view]').forEach(b=>b.classList.toggle('active',b.dataset.workView===view));
}
async function render(){
  bindStatic();setStatus('');
  try{
    const session=await getSession();
    if(!session){$('#workBody').innerHTML='<div class="work-empty">Conecta la memoria de MINDS para abrir Work.</div>';return}
    project=await loadProject();paintChrome();
    if(!project){$('#workBody').innerHTML='<div class="work-empty">No encontré este proyecto en MINDS.</div>';return}
    if(view==='threads')await renderThreads();else if(view==='knowledge')await renderKnowledge();else if(view==='planner')await renderPlanner();else await renderDesktop();
  }catch(e){console.error(e);$('#workBody').innerHTML='<div class="work-empty">No pude abrir Work ahora mismo.</div>'}
}
let knowledgeRows=[],knowledgeFilter='active',knowledgeQuery='';
const knowledgeStates={proposed:'Propuesto',confirmed:'Confirmado',disputed:'En disputa',superseded:'Sustituido',resolved:'Resuelto',rejected:'Descartado'};
const provenanceNames={user:'Afirmación del usuario',project_source:'Fuente del proyecto',external:'Fuente externa',inferred:'Inferencia',system:'Sistema'};
function knowledgeFlags(c){
  const evidence=c.minds_work_evidence||[];
  return {contradiction:c.status==='disputed'||evidence.some(e=>e.stance==='contradicts'),expired:!!c.valid_to&&new Date(c.valid_to)<new Date(),unreviewed:c.status==='proposed',noEvidence:!evidence.length};
}
async function renderKnowledge(){
  const q=await sb.from('minds_work_claims').select('*,minds_work_evidence(*)').eq('project_id',project.id).order('updated_at',{ascending:false});
  if(q.error)throw q.error;knowledgeRows=q.data||[];
  const fq=await sb.from('minds_work_files').select('id,name,storage_path').eq('project_id',project.id);if(fq.error)throw fq.error;files=fq.data||[];
  paintKnowledge();
}
function paintKnowledge(){
  const filtered=knowledgeRows.filter(c=>{
    const f=knowledgeFlags(c),q=knowledgeQuery.toLocaleLowerCase();
    return (!q||[c.statement,c.subject,c.topic,c.discipline].join(' ').toLocaleLowerCase().includes(q))&&(knowledgeFilter==='all'||knowledgeFilter==='review'&&(f.unreviewed||f.contradiction||f.expired)||knowledgeFilter==='active'&&!['superseded','rejected','resolved'].includes(c.status));
  });
  $('#workBody').innerHTML=`<div class="work-knowledge"><div class="work-desktop-toolbar"><div><strong>Conocimiento de ${esc(project.name)}</strong><p class="small">Afirmaciones, decisiones y preguntas con su evidencia e historia. Confirmar una revisión no convierte una fuente en certeza.</p></div><button data-knowledge-new>＋ Añadir</button></div>
    <div class="knowledge-filters"><input id="knowledgeSearch" aria-label="Buscar conocimiento" placeholder="Buscar tema, disciplina o decisión…" value="${esc(knowledgeQuery)}"><select id="knowledgeFilter" aria-label="Estado del conocimiento">${[['active','Activo'],['review','Por revisar'],['all','Todo e historial']].map(([v,l])=>`<option value="${v}" ${knowledgeFilter===v?'selected':''}>${l}</option>`).join('')}</select></div>
    ${filtered.map(c=>{const f=knowledgeFlags(c);return `<article class="knowledge-card"><div class="knowledge-meta"><b>${esc(knowledgeStates[c.status]||c.status)}</b><span>${esc(c.claim_type)} · ${esc(provenanceNames[c.provenance_class]||c.provenance_class)}</span>${f.contradiction?'<span class="knowledge-attention">Contradicción por revisar</span>':''}${f.expired?'<span class="knowledge-attention">Vigencia vencida</span>':''}</div><p>${esc(c.statement)}</p><div class="small">${esc([c.discipline,c.topic,c.subject].filter(Boolean).join(' · '))}</div>
      <details><summary>${(c.minds_work_evidence||[]).length} evidencias · Historia</summary>${(c.minds_work_evidence||[]).map(e=>`<blockquote><b>${esc(e.stance==='contradicts'?'Contradice':e.stance==='context'?'Contexto':'Apoya')}</b><p>${esc(e.excerpt||'Sin extracto')}</p><small>${esc(e.trust_level)} · ${esc(JSON.stringify(e.locator||{}))}</small>${e.source_file_id?`<button data-evidence-file="${esc(e.source_file_id)}">Abrir ${esc(files.find(x=>x.id===e.source_file_id)?.name||'fuente')}</button>`:''}</blockquote>`).join('')||'<p class="small">Sin evidencia vinculada.</p>'}
      <p class="small">Revisado: ${c.confirmed_at?new Date(c.confirmed_at).toLocaleString('es-ES'):'Pendiente'}${c.valid_to?' · Válido hasta '+new Date(c.valid_to).toLocaleDateString('es-ES'):''}</p>${c.supersedes_id?'<p class="small">Sustituye una formulación anterior.</p>':''}${c.superseded_by?'<p class="small">Hay una formulación posterior.</p>':''}${(c.metadata?.previous_versions||[]).slice().reverse().map(v=>`<p class="small">${esc(knowledgeStates[v.status]||v.status)} · ${esc(v.statement)}</p>`).join('')}</details>
      <div class="knowledge-actions"><button data-knowledge-edit="${c.id}">Revisar</button><button data-knowledge-replace="${c.id}">Proponer sustitución</button></div></article>`}).join('')||'<div class="work-empty">No hay conocimiento que coincida con este filtro. Puedes añadirlo aquí o pedirle a Isabella que prepare una propuesta a partir de un documento.</div>'}</div>`;
  $('#knowledgeSearch').onchange=e=>{knowledgeQuery=e.target.value;paintKnowledge()};
  $('#knowledgeFilter').onchange=e=>{knowledgeFilter=e.target.value;paintKnowledge()};
  $('[data-knowledge-new]').onclick=()=>window.MINDS_PROPOSALS?.edit({kind:'work_claim',project:project.name,status:'proposed',claim_type:'fact',provenance_class:'user'});
  $$('[data-knowledge-edit]').forEach(b=>b.onclick=()=>{const c=knowledgeRows.find(x=>x.id===b.dataset.knowledgeEdit);window.MINDS_PROPOSALS?.edit({...c,kind:'work_claim',project:project.name,evidence_excerpt:null})});
  $$('[data-knowledge-replace]').forEach(b=>b.onclick=()=>{const c=knowledgeRows.find(x=>x.id===b.dataset.knowledgeReplace);window.MINDS_PROPOSALS?.edit({kind:'work_claim',project:project.name,statement:c.statement,claim_type:c.claim_type,topic:c.topic,discipline:c.discipline,provenance_class:c.provenance_class,status:'confirmed',supersedes_id:c.id})});
  $$('[data-evidence-file]').forEach(b=>b.onclick=()=>void openFile(b.dataset.evidenceFile));
}
async function loadFolders(){const {data,error}=await sb.from('minds_work_folders').select('id,parent_id,name,sort_order,created_at').eq('project_id',project.id).order('sort_order').order('name');if(error)throw error;folders=data||[]}
function folderTrail(){const out=[];let id=folderId,guard=0;while(id&&guard++<30){const f=folders.find(x=>x.id===id);if(!f)break;out.unshift(f);id=f.parent_id}return out}
async function renderDesktop(){
  await loadFolders();
  let fq=sb.from('minds_work_files').select('id,folder_id,name,mime_type,size_bytes,source_kind,index_status,storage_path,created_at').eq('project_id',project.id).order('created_at',{ascending:false});
  fq=folderId?fq.eq('folder_id',folderId):fq.is('folder_id',null);
  const {data:fileRows,error:fe}=await fq;if(fe)throw fe;files=fileRows||[];
  const childFolders=folders.filter(x=>(x.parent_id||null)===(folderId||null)),trail=folderTrail(),body=$('#workBody');
  body.innerHTML=`<div class="work-desktop-toolbar"><div class="work-breadcrumb"><button data-work-project-root>${esc(project.name)}</button>${trail.map(f=>`<span>›</span><button data-work-crumb="${f.id}">${esc(f.name)}</button>`).join('')}</div><div class="work-toolbar-actions"><button data-work-new-folder>＋ Ordner</button><button data-work-upload>↑ Dateien</button></div></div>
    <div class="work-drop-hint">Dateien, PDFs, Word, Excel, Bilder oder E-Mails hierher ziehen</div>
    <div class="work-files">
      ${folderId?`<button class="work-file work-folder work-up" data-work-up><span class="work-file-icon">↰</span><strong>Zurück</strong><small>Ordner</small></button>`:''}
      ${childFolders.map(f=>`<button class="work-file work-folder" data-work-folder="${f.id}"><span class="work-file-icon">▰</span><strong>${esc(f.name)}</strong><small>Ordner</small></button>`).join('')}
      ${files.map(f=>`<button class="work-file" data-work-file="${f.id}"><span class="work-file-icon">${f.source_kind==='email'?'✉':f.source_kind==='image'?'▧':'▤'}</span><strong>${esc(f.name)}</strong><small>${esc((f.mime_type||'Datei').split('/').pop())} · ${Math.max(1,Math.round(Number(f.size_bytes||0)/1024))} KB</small></button>`).join('')}
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
  const session=await getSession();if(!session||!project)return;setStatus(`Subiendo ${list.length} archivo${list.length===1?'':'s'}…`);
  for(const file of list){
    const path=`${session.user.id}/${project.client_key}/${folderId||'root'}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName(file.name)}`;
    const {error:ue}=await sb.storage.from('minds-work').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(ue){setStatus('Falló la subida de '+file.name);continue}
    const {error:ie}=await sb.from('minds_work_files').insert({project_id:project.id,folder_id:folderId,name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,storage_path:path,source_kind:sourceKind(file),metadata:{last_modified:file.lastModified||null}});
    if(ie){await sb.storage.from('minds-work').remove([path]);setStatus('No pude registrar '+file.name)}
  }
  setStatus('');await renderDesktop();
}
async function openFile(id){const f=files.find(x=>x.id===id);if(!f)return;const {data,error}=await sb.storage.from('minds-work').createSignedUrl(f.storage_path,900);if(error||!data?.signedUrl){setStatus('No pude abrir el archivo.');return}window.open(data.signedUrl,'_blank','noopener')}
async function loadPlanner(){
  let {data:b,error:be}=await sb.from('minds_work_buckets').select('id,name,sort_order,archived').eq('project_id',project.id).eq('archived',false).order('sort_order');if(be)throw be;
  if(!b?.length){const rows=DEFAULT_BUCKETS.map((name,i)=>({project_id:project.id,name,sort_order:i*10}));const ins=await sb.from('minds_work_buckets').insert(rows).select('id,name,sort_order,archived');if(ins.error)throw ins.error;b=ins.data||[]}
  buckets=b||[];
  const {data:t,error:te}=await sb.from('isabella_tasks').select('id,client_key,title,due_date,completed_at,notes,work_bucket_id,work_status,priority,start_date,assignee,labels,checklist,attachments,links,sort_order,work_sort_order').eq('project_id',project.id).is('archived_at',null).order('work_sort_order',{ascending:true,nullsFirst:false}).order('sort_order');if(te)throw te;tasks=t||[];
}
function localIso(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function taskMeta(t){
  const parts=[];if(t.priority&&t.priority!=='normal')parts.push(t.priority==='urgent'?'Dringend':t.priority==='important'?'Wichtig':'Niedrig');if(t.assignee)parts.push(t.assignee);
  return parts.join(' · ')
}
function taskChecklist(t){return Array.isArray(t.checklist)?t.checklist:[]}
function taskAttachments(t){return Array.isArray(t.attachments)?t.attachments:[]}
function taskCard(t){
  const checks=taskChecklist(t),done=checks.filter(x=>x?.done).length,attachments=taskAttachments(t);
  const firstImage=attachments.find(a=>a?.path&&String(a?.mime||a?.type||'').startsWith('image/')),cached=firstImage?cachedWorkUrl(firstImage.path):'';
  const due=t.due_date?new Date(t.due_date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):'';
  const overdue=!!(t.due_date&&t.due_date<localIso()&&!t.completed_at);
  return `<article class="work-task-card ${t.completed_at?'is-done':''}" draggable="true" data-work-task="${t.id}" tabindex="0">
    ${firstImage?`<img class="work-task-cover" ${cached?`src="${esc(cached)}" data-loaded="1"`:''} data-work-task-image="${esc(firstImage.path)}" alt="${esc(firstImage.name||t.title)}">`:''}
    <div class="work-task-title-row"><button class="work-task-toggle" data-work-toggle="${t.id}" aria-label="${t.completed_at?'Reabrir':'Completar'}">${t.completed_at?'✓':'○'}</button><strong>${esc(t.title)}</strong></div>
    ${checks.length?`<div class="work-card-checks">${checks.slice(0,5).map(x=>`<div class="${x.done?'done':''}"><span>${x.done?'●':'○'}</span><span>${esc(x.text||'')}</span></div>`).join('')}${checks.length>5?`<div class="work-check-more">+${checks.length-5} weitere</div>`:''}</div>`:''}
    <footer>
      <div class="work-task-chips">${due?`<span class="work-due ${overdue?'is-overdue':''}">▣ ${esc(due)}</span>`:''}${checks.length?`<span>☑ ${done}/${checks.length}</span>`:''}${attachments.length?`<span>⌕ ${attachments.length}</span>`:''}</div>
      ${taskMeta(t)?`<small>${esc(taskMeta(t))}</small>`:''}
    </footer>
  </article>`
}
async function hydratePlannerImages(root=document){
  const imgs=[...root.querySelectorAll?.('[data-work-task-image],[data-work-edit-image]')||[]].filter(x=>!x.dataset.loaded);
  await Promise.all(imgs.map(async img=>{const path=img.dataset.workTaskImage||img.dataset.workEditImage;if(!path)return;const url=await workSignedUrl(path);if(url&&img.isConnected){img.src=url;img.dataset.loaded='1'}}));
}
async function renderPlanner(){
  await loadPlanner();const body=$('#workBody'),unbucketed=tasks.some(t=>!t.work_bucket_id),columns=[...(unbucketed?[{id:'__none',name:'Ohne Bucket',virtual:true}]:[]),...buckets];
  body.innerHTML=`<div class="work-planner-toolbar"><div><strong>Board</strong><span>${tasks.filter(t=>!t.completed_at).length} offen · ${buckets.length} Buckets</span></div><button data-work-add-bucket>＋ Bucket</button></div>
    <div class="work-board">${columns.map(b=>{const all=tasks.filter(t=>b.virtual?!t.work_bucket_id:t.work_bucket_id===b.id),open=all.filter(t=>!t.completed_at),done=all.filter(t=>t.completed_at);return `<section class="work-bucket" data-work-bucket-drop="${b.virtual?'':b.id}">
      <header><strong>${esc(b.name)}</strong>${b.virtual?'':`<button data-work-edit-bucket="${b.id}" aria-label="Bucket bearbeiten">•••</button>`}</header>
      <div class="work-bucket-scroll"><div class="work-task-list" data-work-task-list="open" data-work-list-bucket="${b.virtual?'':b.id}">${open.map(taskCard).join('')}</div>
      ${done.length?`<details class="work-completed"><summary>Erledigte Aufgaben <span>${done.length}</span></summary><div class="work-task-list" data-work-task-list="done" data-work-list-bucket="${b.virtual?'':b.id}">${done.map(taskCard).join('')}</div></details>`:''}</div>
      ${b.virtual?'':`<button class="work-add-task" data-work-add-task="${b.id}">＋ Aufgabe hinzufügen</button>`}
    </section>`}).join('')}</div>`;
  $('[data-work-add-bucket]')?.addEventListener('click',()=>void addBucket());
  $$('[data-work-edit-bucket]').forEach(b=>b.onclick=e=>{e.stopPropagation();void editBucket(b.dataset.workEditBucket)});
  $$('[data-work-add-task]').forEach(b=>b.onclick=()=>editTask(null,b.dataset.workAddTask));
  $$('[data-work-task]').forEach(card=>{
    card.onclick=e=>{if(card.dataset.justDragged==='1'){card.dataset.justDragged='0';return}if(e.target.closest('[data-work-toggle]'))return;editTask(tasks.find(t=>t.id===card.dataset.workTask)||null,null)};
    card.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('[data-work-toggle]')){e.preventDefault();editTask(tasks.find(t=>t.id===card.dataset.workTask)||null,null)}};
    card.ondragstart=e=>{draggedWorkTaskId=card.dataset.workTask;card.dataset.justDragged='1';card.classList.add('is-dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedWorkTaskId||'')}};
    card.ondragend=()=>{draggedWorkTaskId=null;card.classList.remove('is-dragging');$$('.work-bucket.is-drop-target').forEach(x=>x.classList.remove('is-drop-target'));setTimeout(()=>{card.dataset.justDragged='0'},120)};
  });
  $$('[data-work-bucket-drop]').forEach(bucket=>{
    bucket.ondragover=e=>{
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
    bucket.ondragleave=e=>{if(!bucket.contains(e.relatedTarget))bucket.classList.remove('is-drop-target')};
    bucket.ondrop=e=>{
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
async function addBucket(){const name=window.prompt('Nombre del Bucket');if(!name?.trim())return;const next=(buckets.at(-1)?.sort_order||0)+10;const {error}=await sb.from('minds_work_buckets').insert({project_id:project.id,name:name.trim(),sort_order:next});if(!error)await renderPlanner()}
async function editBucket(id){const b=buckets.find(x=>x.id===id);if(!b)return;const name=window.prompt('Nombre del Bucket',b.name);if(!name?.trim()||name.trim()===b.name)return;const {error}=await sb.from('minds_work_buckets').update({name:name.trim(),updated_at:new Date().toISOString()}).eq('id',id);if(!error)await renderPlanner()}
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
  pendingTaskFiles=[];editingAttachments=[...taskAttachments(task||{})];
  const t=task||{title:'',due_date:'',start_date:'',priority:'normal',work_status:'not_started',assignee:'',notes:'',labels:[],checklist:[]},bucket=t.work_bucket_id||bucketId||'';
  window.ISABELLA_APP?.openModal?.(task?'Aufgabe':'Neue Aufgabe',`<div class="form work-task-form">
    <label class="work-task-title-field">Titel<input id="workTaskTitle" value="${esc(t.title||'')}"></label>
    <div class="work-task-grid"><label>Bucket<select id="workTaskBucket"><option value="">Ohne Bucket</option>${buckets.map(b=>`<option value="${b.id}" ${b.id===bucket?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label>Status<select id="workTaskStatus"><option value="not_started" ${t.work_status==='not_started'?'selected':''}>Nicht begonnen</option><option value="in_progress" ${t.work_status==='in_progress'?'selected':''}>In Bearbeitung</option><option value="waiting" ${t.work_status==='waiting'?'selected':''}>Warten</option><option value="completed" ${t.work_status==='completed'?'selected':''}>Erledigt</option></select></label></div>
    <div class="work-task-grid"><label>Start<input id="workTaskStart" type="date" value="${esc(t.start_date||'')}"></label><label>Fällig<input id="workTaskDue" type="date" value="${esc(t.due_date||'')}"></label></div>
    <div class="work-task-grid"><label>Priorität<select id="workTaskPriority"><option value="low" ${t.priority==='low'?'selected':''}>Niedrig</option><option value="normal" ${t.priority==='normal'?'selected':''}>Normal</option><option value="important" ${t.priority==='important'?'selected':''}>Wichtig</option><option value="urgent" ${t.priority==='urgent'?'selected':''}>Dringend</option></select></label><label>Zuständig<input id="workTaskAssignee" value="${esc(t.assignee||'')}"></label></div>
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
  const checklist=$('.work-check-row').map(r=>({id:r.dataset.checkId||Math.random().toString(36).slice(2),text:r.querySelector('[data-work-check-text]').value.trim(),done:r.querySelector('[data-work-check-done]').checked})).filter(x=>x.text);
  const sameBucket=!!existing&&(existing.work_bucket_id||null)===targetBucket;
  const workOrder=sameBucket&&Number(existing.work_sort_order||0)>0
    ?Number(existing.work_sort_order)
    :Math.max(0,...tasks.filter(x=>x.id!==existing?.id&&(x.work_bucket_id||null)===targetBucket).map(x=>Number(x.work_sort_order||0)))+10;
  const row={title,project_id:project.id,work_bucket_id:targetBucket,work_sort_order:workOrder,work_status:status,priority:$('#workTaskPriority').value,start_date:$('#workTaskStart').value||null,due_date:$('#workTaskDue').value||null,assignee:$('#workTaskAssignee').value.trim()||null,labels:$('#workTaskLabels').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#workTaskNotes').value,checklist,completed_at:status==='completed'?(existing?.completed_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
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
    .select('id,project_id,conversation_id,title,summary,status,capability_profile,sort_order,last_activity_at,updated_at')
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
          <span class="work-thread-card-main"><strong>${esc(t.title)}</strong><span>${esc(preview?preview.slice(0,150):'Todavía sin conversación')}</span></span>
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
  return `<article class="work-thread-message ${role}">${copy?`<div class="work-thread-message-copy">${esc(copy).replace(/\n/g,'<br>')}</div>`:''}${previews}${deliverables}${sources.length?`<details><summary>Fuentes</summary>${sources.slice(0,6).map(s=>`<div class="small">${esc(s.title||s.url||'Fuente')}</div>`).join('')}</details>`:''}</article>`;
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
async function renderThreadConversation(id){
  const thread=threads.find(x=>x.id===id);if(!thread){activeThreadId=null;await renderThreads();return}
  const body=$('#workBody');body.innerHTML='<div class="surface-loading">Abriendo Thread…</div>';
  try{
    const messages=await loadThreadMessages(thread);
    body.innerHTML=`<section class="work-thread-conversation">
      <header class="work-thread-head"><button data-thread-back class="text-btn">‹ Threads</button><div><strong>${esc(thread.title)}</strong><span>${esc(project.name)}</span></div><button data-thread-actions class="work-thread-head-more" aria-label="Opciones del Thread">•••</button></header>
      <div class="work-thread-log" id="workThreadLog">${messages.map(threadMessageMarkup).join('')||'<div class="work-thread-empty">Este Thread está vacío. Empieza con la primera pregunta o tarea.</div>'}</div>
      <form class="work-thread-composer" id="workThreadForm"><textarea id="workThreadInput" rows="1" placeholder="Preguntar en ${esc(thread.title)}…"></textarea><button class="send" aria-label="Enviar">↑</button></form>
    </section>`;
    $('[data-thread-back]').onclick=()=>{activeThreadId=null;void renderThreads()};
    $('[data-thread-actions]').onclick=()=>openThreadActions(thread);
    $('#workThreadForm').onsubmit=e=>{e.preventDefault();void sendThreadMessage(thread)};
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
async function sendThreadMessage(thread){
  const input=$('#workThreadInput'),message=String(input?.value||'').trim();if(!message)return;
  const form=$('#workThreadForm');if(form)form.classList.add('is-busy');if(input){input.value='';input.disabled=true}
  try{
    const cid=await ensureThreadConversation(thread);
    await persistThreadMessage(cid,'user',message);
    await renderThreadConversation(thread.id);
    const currentInput=$('#workThreadInput');if(currentInput)currentInput.disabled=true;
    setStatus('Isabella está revisando el contexto del proyecto…');
    const state=window.ISABELLA_APP?.getState?.()||{};
    const result=await window.ISABELLA_AI.ask(message,state,{workThread:{id:thread.id,project:project.name}});
    const reply=String(result?.reply||result?.streamed_text||'').trim();
    if(reply)await persistThreadMessage(cid,'assistant',reply,{sources:Array.isArray(result?.sources)?result.sources.slice(0,8):[],artifacts:Array.isArray(result?.artifacts)?result.artifacts.slice(0,8):[]});
    const proposal=result?.proposal||(Array.isArray(result?.proposals)?result.proposals[0]:null);
    await sb.from('minds_work_threads').update({last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',thread.id);
    setStatus('');await renderThreads();
    if(proposal)window.MINDS_PROPOSALS?.edit?.(proposal);
  }catch(e){
    console.error(e);setStatus('No pude completar el mensaje del Thread.');
    await renderThreads();
  }
}

window.MINDS_WORK={render,refresh:()=>document.body.dataset.section==='work'?render():null,context:()=>project?{name:project.name,key:project.client_key,active:document.body.dataset.section==='work',view,thread_id:activeThreadId||null}:null};
})();
