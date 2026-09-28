(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sb=window.MINDS_SUPABASE;
const DEFAULT_BUCKETS=['Projektorganisation','Entwurf','Genehmigung','Ausführungsplanung','Ausschreibung/Vergabe','Baustelle','Dokumentation'];
let projectKey=localStorage.getItem('minds-work-project')||'bernried',view=localStorage.getItem('minds-work-view')||'desktop',folderId=null,project=null,folders=[],files=[],buckets=[],tasks=[],bound=false;
function setStatus(t=''){const el=$('#workStatus');if(el)el.textContent=t}
function safeName(name){return String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,150)||'file'}
function sourceKind(file){const n=String(file?.name||'').toLowerCase(),m=String(file?.type||'');if(n.endsWith('.eml')||n.endsWith('.msg')||m==='message/rfc822')return'email';if(m.startsWith('image/'))return'image';if(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/i.test(n))return'document';return'file'}
async function getSession(){if(!sb)return null;const {data}=await sb.auth.getSession();return data?.session||null}
async function loadProject(){const session=await getSession();if(!session)return null;const {data,error}=await sb.from('isabella_projects').select('id,client_key,name').eq('user_id',session.user.id).eq('client_key',projectKey).maybeSingle();if(error)throw error;return data||null}
function bindStatic(){
  if(bound)return;bound=true;
  $$('[data-work-project]').forEach(b=>b.onclick=()=>{projectKey=b.dataset.workProject;localStorage.setItem('minds-work-project',projectKey);folderId=null;void render()});
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
    if(view==='planner')await renderPlanner();else await renderDesktop();
  }catch(e){console.error(e);$('#workBody').innerHTML='<div class="work-empty">No pude abrir Work ahora mismo.</div>'}
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
  const {data:t,error:te}=await sb.from('isabella_tasks').select('id,client_key,title,due_date,completed_at,notes,work_bucket_id,work_status,priority,start_date,assignee,labels,checklist,attachments,links,sort_order').eq('project_id',project.id).is('archived_at',null).order('sort_order');if(te)throw te;tasks=t||[];
}
function taskMeta(t){const parts=[];if(t.due_date)parts.push(new Date(t.due_date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}));if(t.priority&&t.priority!=='normal')parts.push(t.priority==='urgent'?'Dringend':t.priority==='important'?'Wichtig':'Niedrig');if(t.assignee)parts.push(t.assignee);const ck=Array.isArray(t.checklist)?t.checklist:[],done=ck.filter(x=>x?.done).length;if(ck.length)parts.push(`${done}/${ck.length}`);return parts.join(' · ')}
async function renderPlanner(){
  await loadPlanner();const body=$('#workBody');
  body.innerHTML=`<div class="work-planner-toolbar"><div><strong>Board</strong><span>${tasks.filter(t=>!t.completed_at).length} offen</span></div><button data-work-add-bucket>＋ Bucket</button></div><div class="work-board">${buckets.map(b=>`<section class="work-bucket"><header><strong>${esc(b.name)}</strong><button data-work-edit-bucket="${b.id}" aria-label="Bucket bearbeiten">•••</button></header><div class="work-task-list">${tasks.filter(t=>t.work_bucket_id===b.id).map(t=>`<button class="work-task ${t.completed_at?'is-done':''}" data-work-task="${t.id}"><strong>${esc(t.title)}</strong><small>${esc(taskMeta(t))}</small></button>`).join('')}</div><button class="work-add-task" data-work-add-task="${b.id}">＋ Aufgabe</button></section>`).join('')}</div>`;
  $('[data-work-add-bucket]')?.addEventListener('click',()=>void addBucket());$$('[data-work-edit-bucket]').forEach(b=>b.onclick=e=>{e.stopPropagation();void editBucket(b.dataset.workEditBucket)});$$('[data-work-add-task]').forEach(b=>b.onclick=()=>editTask(null,b.dataset.workAddTask));$$('[data-work-task]').forEach(b=>b.onclick=()=>editTask(tasks.find(t=>t.id===b.dataset.workTask)||null,null));
}
async function addBucket(){const name=window.prompt('Nombre del Bucket');if(!name?.trim())return;const next=(buckets.at(-1)?.sort_order||0)+10;const {error}=await sb.from('minds_work_buckets').insert({project_id:project.id,name:name.trim(),sort_order:next});if(!error)await renderPlanner()}
async function editBucket(id){const b=buckets.find(x=>x.id===id);if(!b)return;const name=window.prompt('Nombre del Bucket',b.name);if(!name?.trim()||name.trim()===b.name)return;const {error}=await sb.from('minds_work_buckets').update({name:name.trim(),updated_at:new Date().toISOString()}).eq('id',id);if(!error)await renderPlanner()}
function checklistRows(items=[]){return (items||[]).map(x=>`<div class="work-check-row"><input type="checkbox" data-work-check-done ${x?.done?'checked':''}><input data-work-check-text value="${esc(x?.text||'')}" placeholder="Punto de checklist"><button type="button" data-work-check-remove>×</button></div>`).join('')}
function bindChecklist(){$$('[data-work-check-remove]').forEach(b=>b.onclick=()=>b.closest('.work-check-row')?.remove())}
function editTask(task,bucketId){
  const t=task||{title:'',due_date:'',start_date:'',priority:'normal',work_status:'not_started',assignee:'',notes:'',labels:[],checklist:[]},bucket=t.work_bucket_id||bucketId||buckets[0]?.id||'';
  window.ISABELLA_APP?.openModal?.(task?'Aufgabe':'Neue Aufgabe',`<div class="form work-task-form"><label>Titel<input id="workTaskTitle" value="${esc(t.title||'')}"></label><div class="work-task-grid"><label>Bucket<select id="workTaskBucket">${buckets.map(b=>`<option value="${b.id}" ${b.id===bucket?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label>Status<select id="workTaskStatus"><option value="not_started" ${t.work_status==='not_started'?'selected':''}>Nicht begonnen</option><option value="in_progress" ${t.work_status==='in_progress'?'selected':''}>In Bearbeitung</option><option value="waiting" ${t.work_status==='waiting'?'selected':''}>Warten</option><option value="completed" ${t.work_status==='completed'?'selected':''}>Erledigt</option></select></label></div><div class="work-task-grid"><label>Start<input id="workTaskStart" type="date" value="${esc(t.start_date||'')}"></label><label>Fällig<input id="workTaskDue" type="date" value="${esc(t.due_date||'')}"></label></div><div class="work-task-grid"><label>Priorität<select id="workTaskPriority"><option value="low" ${t.priority==='low'?'selected':''}>Niedrig</option><option value="normal" ${t.priority==='normal'?'selected':''}>Normal</option><option value="important" ${t.priority==='important'?'selected':''}>Wichtig</option><option value="urgent" ${t.priority==='urgent'?'selected':''}>Dringend</option></select></label><label>Zuständig<input id="workTaskAssignee" value="${esc(t.assignee||'')}"></label></div><label>Labels<input id="workTaskLabels" value="${esc((Array.isArray(t.labels)?t.labels:[]).join(', '))}" placeholder="TGA, Bauherr, Freigabe"></label><label>Notizen<textarea id="workTaskNotes" rows="3">${esc(t.notes||'')}</textarea></label><div class="work-check-head"><span>Checklist</span><button id="workAddCheck" type="button">＋ Punkt</button></div><div id="workChecklist">${checklistRows(t.checklist)}</div><button id="workSaveTask" class="primary">Speichern</button></div>`);
  bindChecklist();$('#workAddCheck').onclick=()=>{const row=document.createElement('div');row.className='work-check-row';row.innerHTML='<input type="checkbox" data-work-check-done><input data-work-check-text placeholder="Punto de checklist"><button type="button" data-work-check-remove>×</button>';$('#workChecklist').appendChild(row);bindChecklist()};$('#workSaveTask').onclick=()=>void saveTask(task);
}
async function saveTask(existing){
  const title=$('#workTaskTitle').value.trim();if(!title)return;const status=$('#workTaskStatus').value;
  const checklist=$$('.work-check-row').map(r=>({id:Math.random().toString(36).slice(2),text:r.querySelector('[data-work-check-text]').value.trim(),done:r.querySelector('[data-work-check-done]').checked})).filter(x=>x.text);
  const row={title,project_id:project.id,work_bucket_id:$('#workTaskBucket').value||null,work_status:status,priority:$('#workTaskPriority').value,start_date:$('#workTaskStart').value||null,due_date:$('#workTaskDue').value||null,assignee:$('#workTaskAssignee').value.trim()||null,labels:$('#workTaskLabels').value.split(',').map(x=>x.trim()).filter(Boolean),notes:$('#workTaskNotes').value,checklist,completed_at:status==='completed'?(existing?.completed_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
  let error;if(existing)({error}=await sb.from('isabella_tasks').update(row).eq('id',existing.id));else({error}=await sb.from('isabella_tasks').insert({...row,sort_order:tasks.length*10}));
  if(error){setStatus('No pude guardar la Aufgabe.');return}window.ISABELLA_APP?.closeModal?.();await renderPlanner();setTimeout(()=>window.ISABELLA_SYNC_NOW?.(),0);
}
window.MINDS_WORK={render};
})();