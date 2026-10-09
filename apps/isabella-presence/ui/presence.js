(()=>{'use strict';

const SUPABASE_URL='https://lodexwyyynlarkqgkyhy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_ALAQ5tHd9m5vB7oM9jpj9A_9IAOep2X';
const MINDS_URL='https://gari01234.github.io/minds/isabella/';
const POLL_MS=15000,AGENDA_REFRESH_MS=30000,COMPLETION_HOLD_MS=90000,FAILURE_AUTO_WINDOW_MS=10*60*1000;
const LOCAL_SEEN_KEY='minds-presence-seen-v02',LOCAL_SUPPRESS_KEY='minds-presence-suppressed-v02';
const LOCAL_REVIEW_KEY='minds-presence-review-v01',LOCAL_PANEL_SIZE_KEY='minds-presence-panel-size-v01',LOCAL_TASK_DATE_KEY='minds-presence-task-date-v01';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const parseTime=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0};
const pad=n=>String(n).padStart(2,'0');
const isoDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayIso=()=>isoDate(new Date());
const parseIso=v=>{const [y,m,d]=String(v||'').split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monthStart=v=>{const d=parseIso(v);return new Date(d.getFullYear(),d.getMonth(),1)};
const monthEnd=v=>{const d=parseIso(v);return new Date(d.getFullYear(),d.getMonth()+1,0)};
const monthKey=v=>{const d=parseIso(v);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`};
function fallbackColor(seed=''){
  const palette=['#5A9EC1','#6D7278','#8A72C7','#D08A6A','#9A9466','#2F6FB0','#4F8A62','#B678A2'];
  let h=0;for(const ch of String(seed))h=(h*31+ch.charCodeAt(0))>>>0;
  return palette[h%palette.length];
}
function agendaItemColor(item){
  const project=agendaProjects.get(item?.project_id),category=agendaCategories.get(item?.category_id),raw=String(project?.color||category?.color||'');
  return /^#[0-9a-f]{3,8}$/i.test(raw)?raw:fallbackColor(item?.project_id||item?.category_id||item?.id||'item');
}
const tauri=window.__TAURI__||null;
const appWindow=tauri?.window?.getCurrentWindow?.()||null;
const currentMonitor=tauri?.window?.currentMonitor||null;
const LogicalSize=tauri?.dpi?.LogicalSize||null;
const LogicalPosition=tauri?.dpi?.LogicalPosition||null;
const openUrl=tauri?.opener?.openUrl||null;
const listen=tauri?.event?.listen||null;

let sb=null,user=null,email='',timer=null,polling=false,expanded=false,manualOpen=false,chatBusy=false,panelView='status',homeCollapseTimer=null;
let lastSnapshot='',lastHistorySnapshot='',lastCards=[],priorRunStatus=new Map(),observedActiveRuns=new Set(),chatTurns=[],pendingReview=false,pendingReviewRequestId=String(localStorage.getItem(LOCAL_REVIEW_KEY)||''),pendingReplyContext=null,lastQuickReplies=[];
let panelSize=loadPanelSize(),lastAppliedSizeKey='';
let selectedTaskDate=/^\d{4}-\d{2}-\d{2}$/.test(localStorage.getItem(LOCAL_TASK_DATE_KEY)||'')?localStorage.getItem(LOCAL_TASK_DATE_KEY):todayIso();
let taskCalendarMonth=monthKey(selectedTaskDate),agendaTasks=[],agendaEvents=[],agendaCategories=new Map(),agendaProjects=new Map(),lastAgendaAt=0,agendaBusy=false,activeTaskDetailId=null,draggedTaskId=null;
let seen=loadSet(LOCAL_SEEN_KEY),suppressed=loadSet(LOCAL_SUPPRESS_KEY);

function loadSet(key){try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'))}catch{return new Set()}}
function saveSet(key,set){try{localStorage.setItem(key,JSON.stringify([...set].slice(-200)))}catch{}}
function loadPanelSize(){
  try{
    const value=JSON.parse(localStorage.getItem(LOCAL_PANEL_SIZE_KEY)||'null');
    const width=Math.round(Number(value?.width||0)),height=Math.round(Number(value?.height||0));
    return width>=360&&height>=180?{width,height}:null;
  }catch{return null}
}
function savePanelSize(width,height){
  const next={width:Math.max(360,Math.round(Number(width)||0)),height:Math.max(180,Math.round(Number(height)||0))};
  panelSize=next;try{localStorage.setItem(LOCAL_PANEL_SIZE_KEY,JSON.stringify(next))}catch{}
}
function setPendingReviewRequestId(value){
  const id=/^[0-9a-f-]{36}$/i.test(String(value||''))?String(value):'';
  pendingReviewRequestId=id;pendingReview=!!id;
  try{if(id)localStorage.setItem(LOCAL_REVIEW_KEY,id);else localStorage.removeItem(LOCAL_REVIEW_KEY)}catch{}
}
function rememberSeen(id){if(id){seen.add(String(id));saveSet(LOCAL_SEEN_KEY,seen)}}
function rememberSuppressed(id){if(id){suppressed.add(String(id));saveSet(LOCAL_SUPPRESS_KEY,suppressed)}}
function cleanText(v){return String(v||'').replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'').replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'').replace(/\n{3,}/g,'\n\n').trim()}
function inlineMarkdown(value){
  return esc(value)
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code>$1</code>');
}
function markdownHtml(value){
  const lines=cleanText(value).split(/\r?\n/),out=[];let paragraph=[];
  const flush=()=>{if(paragraph.length){out.push('<p>'+inlineMarkdown(paragraph.join(' '))+'</p>');paragraph=[]}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){flush();continue}
    const heading=line.match(/^#{1,4}\s+(.+)$/);if(heading){flush();out.push('<div class="md-heading">'+inlineMarkdown(heading[1])+'</div>');continue}
    const bullet=line.match(/^[-*]\s+(.+)$/);if(bullet){flush();out.push('<div class="md-bullet"><span>•</span><span>'+inlineMarkdown(bullet[1])+'</span></div>');continue}
    paragraph.push(line);
  }
  flush();return out.join('');
}
function currentPanelSize(){return panelView==='chat'?'chat':panelView==='tasks'?'tasks':'status'}
function clearHomeCollapse(){if(homeCollapseTimer){clearTimeout(homeCollapseTimer);homeCollapseTimer=null}}
function armHomeCollapse(){
  clearHomeCollapse();
  if(!expanded||chatBusy||lastCards.some(x=>x.needsUser)||String($('#chatInput')?.value||'').trim())return;
  homeCollapseTimer=setTimeout(()=>{homeCollapseTimer=null;if(expanded&&!chatBusy&&!lastCards.some(x=>x.needsUser))void collapsePanel()},30000);
}

function humanRunState(status){
  if(status==='queued')return {kind:'preparing',label:'Preparando'};
  if(status==='in_progress')return {kind:'working',label:'Trabajando'};
  if(status==='completed')return {kind:'finished',label:'Listo'};
  if(status==='failed')return {kind:'error',label:'Necesito revisar'};
  return {kind:'idle',label:'Isabella'};
}
function runCard(run){
  const state=humanRunState(String(run.status||''));
  return {id:'run:'+run.id,source:'run',sourceId:run.id,kind:state.kind,label:state.label,title:String(run.title||'Trabajo').trim(),
    body:cleanText(run.status==='failed'?(run.error||run.summary):(run.summary||'')),status:run.status,updatedAt:parseTime(run.updated_at),
    completedAt:parseTime(run.completed_at),priority:run.status==='failed'?90:(run.status==='in_progress'?70:(run.status==='queued'?65:30)),
    cancellable:['queued','in_progress'].includes(run.status),needsUser:false};
}
function missionCard(run){
  const status=String(run.status||'');
  const state=status==='queued'?{kind:'preparing',label:'Preparando'}:
    status==='running'?{kind:'working',label:'Trabajando'}:
    status==='waiting'?{kind:'waiting',label:'Esperando'}:
    {kind:'idle',label:'Isabella'};
  const waitBody=status==='waiting'
    ?(run.wait_kind==='expectation'?'Estoy esperando que ocurra algo antes de seguir. No necesitas hacer nada ahora.':
      run.wait_kind==='capability'?'Estoy preparando una parte de este trabajo. No necesitas hacer nada ahora.':
      'Esto sigue en marcha. Lo retomaré en el momento previsto.')
    :'';
  return {
    id:'mission:'+run.id+':'+status+':'+String(run.wait_kind||''),
    source:'mission',sourceId:run.id,kind:state.kind,label:state.label,
    title:String(run.instruction||'Trabajo en curso').trim().slice(0,90),
    body:cleanText(waitBody||run.result_summary||''),status,updatedAt:parseTime(run.updated_at),
    priority:status==='running'?78:(status==='queued'?74:24),
    cancellable:false,needsUser:false
  };
}
function attentionCard(event){
  const needsUser=event.route==='interrupt'&&event.requires_user===true;
  const metadata=event?.metadata&&typeof event.metadata==='object'?event.metadata:{};
  return {id:'attention:'+event.id,source:'attention',sourceId:event.id,kind:needsUser?'question':'ambient',
    label:needsUser?'Necesito tu decisión':'Para tener en cuenta',title:String(event.title||'Actualización').trim(),body:String(event.body||'').trim(),
    status:event.status,updatedAt:parseTime(event.updated_at||event.created_at),priority:needsUser?100:40,cancellable:false,needsUser,
    replyContext:needsUser?{
      attention_id:String(event.id||''),request_revision:Number(event.request_revision||1),
      source_type:String(event.source_type||''),source_id:String(event.source_id||''),
      mission_run_id:String(metadata.mission_run_id||event.source_id||''),title:String(event.title||'').trim(),
      question:String(event.body||'').trim()
    }:null};
}
function projectCards(runs,missions,events){
  const cards=[];
  for(const run of runs||[]){
    if(run?.metadata?.surface_hidden===true)continue;
    const prev=priorRunStatus.get(run.id);
    if(['queued','in_progress'].includes(run.status))observedActiveRuns.add(run.id);
    const card=runCard(run);
    if(['queued','in_progress','failed'].includes(run.status))cards.push(card);
    else if(run.status==='completed'&&observedActiveRuns.has(run.id)&&now()-card.completedAt<COMPLETION_HOLD_MS)cards.push(card);
    priorRunStatus.set(run.id,run.status);
    if(prev&&prev!==run.status&&run.status==='completed')rememberSeen('transition:'+run.id+':completed');
  }
  for(const mission of missions||[]){
    if(['queued','running','waiting'].includes(String(mission.status||'')))cards.push(missionCard(mission));
  }
  for(const event of events||[])if(event.route==='ambient'||(event.route==='interrupt'&&event.requires_user===true))cards.push(attentionCard(event));
  return cards.sort((a,b)=>b.priority-a.priority||b.updatedAt-a.updatedAt).slice(0,6);
}
function autoCandidate(cards){
  for(const card of cards){
    if(suppressed.has(card.id))continue;
    if(['working','preparing'].includes(card.kind)||card.kind==='question')return card;
    if(card.kind==='ambient'&&!seen.has(card.id))return card;
    if(card.kind==='error'&&!seen.has(card.id)&&now()-card.updatedAt<FAILURE_AUTO_WINDOW_MS)return card;
    if(card.kind==='finished'&&observedActiveRuns.has(card.sourceId))return card;
  }
  return null;
}
const SIZES={pill:[306,60],status:[420,220],tasks:[720,500],chat:[420,320],auth:[370,390],boot:[306,60]};
const PANEL_MIN={width:360,statusHeight:180,tasksHeight:320,chatHeight:220};
async function positionWindow(mode,widthOverride=null){
  if(!appWindow||!currentMonitor||!LogicalPosition)return;
  try{
    const monitor=await currentMonitor();if(!monitor)return;
    const scale=monitor.scaleFactor||1;
    const origin=monitor.position?.toLogical?monitor.position.toLogical(scale):{x:(monitor.position?.x||0)/scale,y:(monitor.position?.y||0)/scale};
    const area=monitor.size?.toLogical?monitor.size.toLogical(scale):{width:(monitor.size?.width||0)/scale,height:(monitor.size?.height||0)/scale};
    const [fallbackW]=SIZES[mode]||SIZES.pill,w=Number(widthOverride)||fallbackW;
    await appWindow.setPosition(new LogicalPosition(Math.round(origin.x+(area.width-w)/2),Math.round(origin.y)));
  }catch{}
}
async function sizeWindow(mode){
  if(!appWindow||!LogicalSize)return;
  const fallback=SIZES[mode]||SIZES.pill;
  const isPanel=['status','tasks','chat'].includes(mode);
  const minHeight=mode==='chat'?PANEL_MIN.chatHeight:mode==='tasks'?PANEL_MIN.tasksHeight:PANEL_MIN.statusHeight;
  const w=isPanel&&panelSize?Math.max(PANEL_MIN.width,panelSize.width):fallback[0];
  const h=isPanel&&panelSize?Math.max(minHeight,panelSize.height):fallback[1];
  const key=mode+':'+w+'x'+h;
  if(lastAppliedSizeKey===key)return;
  try{
    await appWindow.setSize(new LogicalSize(w,h));
    await positionWindow(mode,w);
    lastAppliedSizeKey=key;
  }catch{}
}
async function showWindow({focus=false}={}){
  if(!appWindow)return;
  try{await appWindow.show();if(focus)await appWindow.setFocus()}catch{}
}
async function hideWindow(){
  manualOpen=false;expanded=false;panelView='status';clearHomeCollapse();
  const focal=autoCandidate(lastCards);if(focal)rememberSuppressed(focal.id);
  try{await appWindow?.hide()}catch{}
}
async function openMinds(reviewId=null){
  const target=reviewId?MINDS_URL+'?review='+encodeURIComponent(reviewId):MINDS_URL;
  try{if(openUrl)await openUrl(target);else window.open(target,'_blank')}catch{}
}
function showOnly(id){for(const el of ['bootView','authView','presenceView'])$('#'+el)?.classList.toggle('hidden',el!==id)}
async function renderAuth(message=''){
  showOnly('authView');$('#app').dataset.mode='auth';$('#authMessage').textContent=message;
  await sizeWindow('auth');await showWindow({focus:true});
}
function cardHtml(card){
  const body=card.body?`<div class="card-body">${markdownHtml(card.body.slice(0,360))}</div>`:'';
  const actions=[];
  if(card.cancellable)actions.push(`<button class="cancel" data-cancel="${esc(card.sourceId)}">Cancelar</button>`);
  if(card.needsUser)actions.push(`<button class="respond" data-respond="${esc(card.id)}">Responder aquí</button>`);
  return `<article class="card" data-kind="${esc(card.kind)}"><div class="card-head"><span class="state-dot"></span><div class="card-copy"><b>${esc(card.title)}</b><small>${esc(card.label)}</small></div></div>${body}${actions.length?`<div class="card-actions">${actions.join('')}</div>`:''}</article>`;
}
function renderConversation(){
  $('#conversationEmpty').classList.toggle('hidden',chatTurns.length>0||chatBusy);
  $('#turns').innerHTML=chatTurns.slice(-5).map(t=>`<div class="turn ${esc(t.role)}${t.error?' error':''}">${t.role==='assistant'?markdownHtml(t.text):esc(t.text)}</div>`).join('')+(chatBusy?'<div class="turn assistant"><p>Pensando…</p></div>':'');
  $('#reviewNotice').classList.toggle('hidden',!pendingReview);
  $('#replyContextNotice').classList.toggle('hidden',!pendingReplyContext);
  $('#replyContextTitle').textContent=pendingReplyContext?.title||'';
  $('#replyContextQuestion').textContent=pendingReplyContext?.question||'';
  $('#quickReplies').innerHTML=lastQuickReplies.map((q,i)=>`<button type="button" data-quick="${i}">${esc(q.label)}</button>`).join('');
  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>sendChatText(lastQuickReplies[Number(b.dataset.quick)]?.value||''));
  $('#sendButton').disabled=chatBusy;
  $('#app').dataset.busy=chatBusy?'true':'false';
  requestAnimationFrame(()=>{const s=$('#panelScroll');if(s)s.scrollTop=s.scrollHeight});
}

function agendaDateLabel(value){
  const d=parseIso(value),today=parseIso(todayIso()),tomorrow=addDays(today,1),yesterday=addDays(today,-1);
  if(value===isoDate(today))return {eyebrow:'Hoy',title:new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(d)};
  if(value===isoDate(tomorrow))return {eyebrow:'Mañana',title:new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(d)};
  if(value===isoDate(yesterday))return {eyebrow:'Ayer',title:new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(d)};
  return {eyebrow:new Intl.DateTimeFormat('es-ES',{weekday:'long'}).format(d),title:new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:d.getFullYear()!==today.getFullYear()?'numeric':undefined}).format(d)};
}
function agendaEventDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':isoDate(d)}
function agendaEventTime(event){
  if(event.all_day)return 'Todo el día';
  const d=new Date(event.starts_at);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(d);
}
function taskMeta(task){
  const bits=[],project=agendaProjects.get(task.project_id),category=agendaCategories.get(task.category_id);
  if(project?.name)bits.push(project.name);else if(category?.name)bits.push(category.name);
  if(task.reminder_time)bits.push('⏰ '+String(task.reminder_time).slice(0,5));
  if(task.due_date&&task.due_date<todayIso()&&!task.completed_at)bits.push('Vencida · '+new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'}).format(parseIso(task.due_date)));
  return bits;
}
function taskRowHtml(task){
  const meta=taskMeta(task),important=String(task.priority||'')==='high',done=!!task.completed_at;
  return `<div class="task-row ${done?'is-done':''}" data-task-row="${esc(task.id)}">
    <button class="task-toggle" type="button" data-task-toggle="${esc(task.id)}" aria-label="${done?'Reabrir':'Completar'}">${done?'✓':''}</button>
    <button class="task-copy" type="button" data-task-edit="${esc(task.id)}"><span class="task-title">${esc(task.title)}</span>${meta.length?`<span class="task-meta">${meta.map((x,i)=>`<span class="${i===meta.length-1&&String(x).startsWith('Vencida')?'task-overdue':''}">${esc(x)}</span>`).join('')}</span>`:''}</button>
    <button class="task-star ${important?'is-important':''}" type="button" data-task-star="${esc(task.id)}" aria-label="${important?'Quitar de importantes':'Marcar como importante'}">${important?'★':'☆'}</button>
    <span class="task-drag" draggable="${done?'false':'true'}" data-task-drag="${esc(task.id)}" aria-hidden="true" title="Arrastrar para reordenar">⋮⋮</span>
  </div>`;
}
function renderTaskCalendar(){
  const base=parseIso(taskCalendarMonth+'-01'),start=new Date(base),offset=(base.getDay()+6)%7;start.setDate(start.getDate()-offset);
  $('#calendarMonthLabel').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(base);
  $('#calendarGrid').innerHTML=Array.from({length:42},(_,i)=>{
    const d=addDays(start,i),key=isoDate(d),outside=d.getMonth()!==base.getMonth();
    const colors=[...new Set([
      ...agendaTasks.filter(x=>x.due_date===key).map(agendaItemColor),
      ...agendaEvents.filter(x=>agendaEventDate(x.starts_at)===key).map(agendaItemColor)
    ].filter(Boolean))].slice(0,4);
    const cls=['calendar-day',outside?'is-outside':'',key===todayIso()?'is-today':'',key===selectedTaskDate?'is-selected':''].filter(Boolean).join(' ');
    const dots=colors.length?`<span class="calendar-dots">${colors.map(color=>`<i style="--dot-color:${esc(color)}"></i>`).join('')}</span>`:'';
    return `<button class="${cls}" type="button" data-calendar-date="${key}" aria-label="${esc(new Intl.DateTimeFormat('es-ES',{dateStyle:'full'}).format(d))}"><span>${d.getDate()}</span>${dots}</button>`;
  }).join('');
  document.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>void selectTaskDate(b.dataset.calendarDate));
}
function renderTaskDay(){
  const label=agendaDateLabel(selectedTaskDate);$('#tasksDayEyebrow').textContent=label.eyebrow;$('#tasksDayTitle').textContent=label.title;
  const dayEvents=agendaEvents.filter(x=>agendaEventDate(x.starts_at)===selectedTaskDate).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
  $('#dayEvents').classList.toggle('hidden',!dayEvents.length);
  $('#dayEvents').innerHTML=dayEvents.map(e=>`<div class="day-event"><time>${esc(agendaEventTime(e))}</time><strong>${esc(e.title)}</strong></div>`).join('');
  const dayTasks=agendaTasks.filter(x=>x.due_date===selectedTaskDate);
  const open=dayTasks.filter(x=>!x.completed_at).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.title).localeCompare(String(b.title),'es'));
  const done=dayTasks.filter(x=>!!x.completed_at).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.title).localeCompare(String(b.title),'es'));
  $('#taskList').innerHTML=open.length?open.map(taskRowHtml).join(''):'<div class="task-empty">No hay tareas para este día.</div>';
  $('#completedTasks').classList.toggle('hidden',!done.length);
  $('#completedTasks').innerHTML=done.length?`<details><summary>Completadas · ${done.length}</summary><div class="completed-list">${done.map(taskRowHtml).join('')}</div></details>`:'';
  bindAgendaTaskActions();
}
function renderAgenda(){renderTaskCalendar();renderTaskDay()}
async function loadAgenda({force=false}={}){
  if(!sb||!user||agendaBusy)return;
  if(!force&&Date.now()-lastAgendaAt<AGENDA_REFRESH_MS){renderAgenda();return}
  agendaBusy=true;
  try{
    const base=parseIso(taskCalendarMonth+'-01'),monthFirst=isoDate(base),nextMonth=new Date(base.getFullYear(),base.getMonth()+1,1),monthLast=isoDate(addDays(nextMonth,-1));
    const startIso=new Date(base.getFullYear(),base.getMonth(),1).toISOString(),endIso=new Date(base.getFullYear(),base.getMonth()+1,1).toISOString();
    const results=await Promise.all([
      sb.from('isabella_tasks').select('id,client_key,title,due_date,completed_at,category_id,project_id,priority,reminder_time,sort_order,notes,updated_at').is('archived_at',null).gte('due_date',monthFirst).lte('due_date',monthLast).order('due_date').order('sort_order').limit(300),
      sb.from('isabella_events').select('id,title,starts_at,ends_at,all_day,category_id,project_id').gte('starts_at',startIso).lt('starts_at',endIso).order('starts_at').limit(200),
      sb.from('isabella_categories').select('id,name,color').order('sort_order').limit(50),
      sb.from('isabella_projects').select('id,name,category_id,color,archived').eq('archived',false).limit(100)
    ]);
    for(const q of results)if(q.error)throw q.error;
    agendaTasks=results[0].data||[];agendaEvents=results[1].data||[];
    agendaCategories=new Map((results[2].data||[]).map(x=>[x.id,x]));agendaProjects=new Map((results[3].data||[]).map(x=>[x.id,x]));
    lastAgendaAt=Date.now();renderAgenda();
    if(activeTaskDetailId&&!agendaTasks.some(x=>x.id===activeTaskDetailId))closeTaskDetail();
  }catch(e){
    $('#taskList').innerHTML='<div class="task-empty">No pude cargar tus tareas ahora mismo.</div>';
  }finally{agendaBusy=false}
}
async function selectTaskDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return;
  if(activeTaskDetailId)closeTaskDetail();
  selectedTaskDate=value;localStorage.setItem(LOCAL_TASK_DATE_KEY,value);
  const nextMonth=monthKey(value),changed=nextMonth!==taskCalendarMonth;taskCalendarMonth=nextMonth;
  if(changed){lastAgendaAt=0;await loadAgenda({force:true})}else renderAgenda();
}
async function shiftTaskMonth(delta){
  const base=parseIso(taskCalendarMonth+'-01'),next=new Date(base.getFullYear(),base.getMonth()+delta,1);
  await selectTaskDate(isoDate(next));
}
async function nextTaskSortOrder(date){
  if(!sb||!date)return 10;
  const {data,error}=await sb.from('isabella_tasks').select('sort_order').eq('due_date',date).is('archived_at',null).order('sort_order',{ascending:false}).limit(1);
  if(error)return 10;
  return Number(data?.[0]?.sort_order||0)+10;
}
async function createAgendaTask(event){
  event?.preventDefault?.();const input=$('#quickTaskInput'),title=String(input?.value||'').trim();
  if(!title||!sb||!user)return;
  $('#quickTaskAdd').disabled=true;
  try{
    const sort_order=await nextTaskSortOrder(selectedTaskDate);
    const {error}=await sb.from('isabella_tasks').insert({title,due_date:selectedTaskDate,sort_order,metadata:{source:'presence_manual'}});
    if(error)throw error;input.value='';lastAgendaAt=0;await loadAgenda({force:true});
  }catch{}finally{$('#quickTaskAdd').disabled=false}
}
async function toggleAgendaTask(id){
  const task=agendaTasks.find(x=>x.id===id);if(!task||!sb||!user)return;
  const completed_at=task.completed_at?null:new Date().toISOString();
  try{
    const {error}=await sb.from('isabella_tasks').update({completed_at,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);
    if(error)throw error;task.completed_at=completed_at;renderTaskDay();
  }catch{}
}
async function toggleAgendaTaskPriority(id){
  const task=agendaTasks.find(x=>x.id===id);if(!task||!sb||!user)return;
  const priority=task.priority==='high'?'normal':'high';
  try{
    const {error}=await sb.from('isabella_tasks').update({priority,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);
    if(error)throw error;task.priority=priority;
    if(activeTaskDetailId===id)paintTaskDetail(task);
    renderTaskDay();
  }catch{}
}
function closeTaskDetail(){
  activeTaskDetailId=null;
  $('#taskDetail')?.classList.add('hidden');$('#taskDetail')?.setAttribute('aria-hidden','true');
}
function paintTaskDetail(task){
  if(!task)return;
  $('#taskDetailTitle').value=task.title||'';
  $('#taskDetailDate').value=task.due_date||'';
  $('#taskDetailReminder').value=task.reminder_time?String(task.reminder_time).slice(0,5):'';
  $('#taskDetailNotes').value=task.notes||'';
  $('#taskDetailCategory').innerHTML='<option value="">Sin categoría</option>'+[...agendaCategories.values()].map(x=>`<option value="${esc(x.id)}" ${x.id===task.category_id?'selected':''}>${esc(x.name)}</option>`).join('');
  $('#taskDetailProject').innerHTML='<option value="">Sin proyecto</option>'+[...agendaProjects.values()].map(x=>`<option value="${esc(x.id)}" ${x.id===task.project_id?'selected':''}>${esc(x.name)}</option>`).join('');
  const important=task.priority==='high',star=$('#taskDetailStar');star.dataset.priority=important?'high':'normal';star.textContent=important?'★':'☆';star.classList.toggle('is-important',important);
}
function openTaskDetail(id){
  const task=agendaTasks.find(x=>x.id===id);if(!task)return;
  activeTaskDetailId=id;paintTaskDetail(task);
  $('#taskDetail').classList.remove('hidden');$('#taskDetail').setAttribute('aria-hidden','false');
  setTimeout(()=>$('#taskDetailTitle')?.focus(),20);
}
async function saveTaskDetail(event){
  event?.preventDefault?.();const task=agendaTasks.find(x=>x.id===activeTaskDetailId);if(!task||!sb||!user)return;
  const title=String($('#taskDetailTitle').value||'').trim();if(!title)return;
  const due_date=$('#taskDetailDate').value||null,changedDate=(task.due_date||null)!==due_date;
  const patch={
    title,due_date,reminder_time:due_date?($('#taskDetailReminder').value||null):null,
    category_id:$('#taskDetailCategory').value||null,project_id:$('#taskDetailProject').value||null,
    notes:$('#taskDetailNotes').value||'',priority:$('#taskDetailStar').dataset.priority==='high'?'high':'normal',
    updated_at:new Date().toISOString()
  };
  if(changedDate&&due_date)patch.sort_order=await nextTaskSortOrder(due_date);
  $('#taskDetailSave').disabled=true;
  try{
    const {error}=await sb.from('isabella_tasks').update(patch).eq('id',task.id).eq('user_id',user.id);if(error)throw error;
    Object.assign(task,patch);closeTaskDetail();lastAgendaAt=0;await loadAgenda({force:true});
  }catch{}finally{$('#taskDetailSave').disabled=false}
}
async function deleteTaskDetail(){
  const task=agendaTasks.find(x=>x.id===activeTaskDetailId);if(!task||!sb||!user)return;
  if(!window.confirm(`¿Eliminar “${task.title}”?`))return;
  $('#taskDetailDelete').disabled=true;
  try{
    if(task.client_key){
      const {error:tombstoneError}=await sb.from('isabella_deleted_items').upsert({entity_type:'task',client_key:task.client_key,deleted_at:new Date().toISOString()},{onConflict:'user_id,entity_type,client_key'});
      if(tombstoneError)throw tombstoneError;
    }
    const {error}=await sb.from('isabella_tasks').delete().eq('id',task.id).eq('user_id',user.id);if(error)throw error;
    closeTaskDetail();lastAgendaAt=0;await loadAgenda({force:true});
  }catch{}finally{$('#taskDetailDelete').disabled=false}
}
async function persistTaskOrder(){
  if(!sb||!user)return;
  const ids=[...document.querySelectorAll('#taskList [data-task-row]')].map(x=>x.dataset.taskRow).filter(Boolean);
  if(!ids.length)return;
  const stamp=new Date().toISOString();
  const results=await Promise.all(ids.map((id,i)=>sb.from('isabella_tasks').update({sort_order:(i+1)*10,updated_at:stamp}).eq('id',id).eq('user_id',user.id)));
  if(results.some(x=>x.error)){renderTaskDay();return}
  ids.forEach((id,i)=>{const task=agendaTasks.find(x=>x.id===id);if(task)task.sort_order=(i+1)*10});
  renderTaskDay();
}
function bindAgendaTaskActions(){
  document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();void toggleAgendaTask(b.dataset.taskToggle)});
  document.querySelectorAll('[data-task-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openTaskDetail(b.dataset.taskEdit)});
  document.querySelectorAll('[data-task-star]').forEach(b=>b.onclick=e=>{e.stopPropagation();void toggleAgendaTaskPriority(b.dataset.taskStar)});
  document.querySelectorAll('#taskList [data-task-drag]').forEach(handle=>{
    handle.addEventListener('dragstart',e=>{
      draggedTaskId=handle.dataset.taskDrag||null;
      const row=handle.closest('[data-task-row]');row?.classList.add('is-dragging');
      if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedTaskId||'')}
    });
    handle.addEventListener('dragend',()=>{document.querySelectorAll('[data-task-row]').forEach(x=>x.classList.remove('is-dragging','is-drop-target'));draggedTaskId=null});
  });
  document.querySelectorAll('#taskList [data-task-row]').forEach(row=>{
    row.addEventListener('dragover',e=>{
      if(!draggedTaskId||draggedTaskId===row.dataset.taskRow)return;
      e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
      const dragging=document.querySelector(`#taskList [data-task-row="${CSS.escape(draggedTaskId)}"]`);if(!dragging)return;
      const rect=row.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;
      row.classList.add('is-drop-target');if(after)row.after(dragging);else row.before(dragging);
    });
    row.addEventListener('dragleave',()=>row.classList.remove('is-drop-target'));
    row.addEventListener('drop',e=>{if(!draggedTaskId)return;e.preventDefault();row.classList.remove('is-drop-target');void persistTaskOrder()});
  });
}
async function addTaskViaChat(){
  await setPanelView('chat');
  const label=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(parseIso(selectedTaskDate));
  $('#chatInput').value=`Agrega para ${label} una tarea: `;$('#chatInput').focus();armHomeCollapse();
}

async function renderPresence(cards,{auto=true}={}){
  lastCards=cards;showOnly('presenceView');
  const focal=cards[0]||null;
  $('#compactState').textContent=chatBusy?'Pensando…':(focal?.label||'Isabella');
  $('#compactTitle').textContent=focal?.title||(chatTurns.length?cleanText(chatTurns[chatTurns.length-1].text).slice(0,45):'Disponible');
  $('#pillOrb').classList.toggle('busy',chatBusy||!!cards.find(x=>['working','preparing'].includes(x.kind)));
  $('#pillCount').textContent=cards.length>1?String(cards.length):'';
  $('#pillCount').classList.toggle('hidden',cards.length<2);
  $('#cardsSection').classList.toggle('hidden',!focal);
  $('#statusEmpty').classList.toggle('hidden',!!focal);
  $('#cards').innerHTML=focal?cardHtml(focal):'';
  $('#moreSignals').textContent=cards.length>1?`${cards.length-1} señal${cards.length===2?'':'es'} más`:'';
  $('#moreSignals').classList.toggle('hidden',cards.length<2);
  $('#panelHeading').textContent=panelView==='chat'?'Chat':panelView==='tasks'?'Tareas':(focal?.needsUser?'Necesito tu decisión':(focal?.label||'Ahora'));
  $('#statusTab').classList.toggle('on',panelView==='status');$('#tasksTab').classList.toggle('on',panelView==='tasks');$('#chatTab').classList.toggle('on',panelView==='chat');
  $('#statusView').classList.toggle('hidden',panelView!=='status');$('#tasksView').classList.toggle('hidden',panelView!=='tasks');$('#chatView').classList.toggle('hidden',panelView!=='chat');
  $('#panel').classList.toggle('hidden',!expanded);$('#pill').classList.toggle('hidden',expanded);
  $('#pillMain').setAttribute('aria-expanded',expanded?'true':'false');$('#app').dataset.mode=expanded?'home':'petit';$('#app').dataset.panelView=panelView;
  renderConversation();bindCardActions();
  if(manualOpen||expanded||chatBusy){
    await sizeWindow(expanded?currentPanelSize():'pill');await showWindow({focus:false});if(expanded)armHomeCollapse();return;
  }
  const candidate=autoCandidate(cards);
  if(candidate&&auto){
    if(candidate.needsUser){expanded=true;panelView='status';rememberSeen(candidate.id);return renderPresence(cards,{auto:false})}
    await sizeWindow('pill');await showWindow({focus:false});return;
  }
  if(!candidate&&auto)setTimeout(()=>{if(!manualOpen&&!expanded&&!chatBusy&&!autoCandidate(lastCards))appWindow?.hide().catch(()=>{})},550);
}
function bindCardActions(){
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelRun(b.dataset.cancel));
  document.querySelectorAll('[data-respond]').forEach(b=>b.onclick=()=>focusQuestion(b.dataset.respond));
}
function focusQuestion(cardId){
  const card=lastCards.find(x=>x.id===cardId);if(!card)return;
  pendingReplyContext=card.replyContext||{
    attention_id:card.source==='attention'?String(card.sourceId||''):'',
    source_type:String(card.source||''),source_id:String(card.sourceId||''),
    mission_run_id:card.source==='mission'?String(card.sourceId||''):'',
    title:String(card.title||'').trim(),question:String(card.body||'').trim()
  };
  expanded=true;manualOpen=true;panelView='chat';rememberSeen(card.id);void renderPresence(lastCards,{auto:false}).then(()=>{
    $('#chatInput').value='';
    $('#chatInput').placeholder='Escribe tu respuesta a esta decisión…';
    $('#chatInput').focus();armHomeCollapse();
  });
}
function clearReplyContext(){
  pendingReplyContext=null;
  const input=$('#chatInput');if(input)input.placeholder='Escribe a Isabella…';
  renderConversation();
}
async function cancelRun(id){
  if(!sb||!id)return;
  const button=document.querySelector(`[data-cancel="${CSS.escape(id)}"]`);if(button)button.disabled=true;
  try{const {error}=await sb.functions.invoke('isabella-capability-runtime',{body:{action:'cancel',run_id:id}});if(error)throw error;await refresh({force:true})}
  catch{if(button){button.disabled=false;button.textContent='No pude cancelar'}}
}
async function queryPresence(){
  const sinceRuns=new Date(now()-20*60*1000).toISOString(),sinceAttention=new Date(now()-48*60*60*1000).toISOString();
  const [runQ,missionQ,attentionQ]=await Promise.all([
    sb.from('minds_capability_runs').select('id,title,status,artifact_ids,summary,error,origin_kind,project_id,work_thread_id,metadata,started_at,completed_at,updated_at').gte('updated_at',sinceRuns).order('updated_at',{ascending:false}).limit(12),
    sb.from('minds_mission_runs').select('id,status,phase,instruction,result_summary,blocker_question,wait_kind,wake_at,metadata,updated_at').in('status',['queued','running','waiting','waiting_for_user']).order('updated_at',{ascending:false}).limit(12),
    sb.from('minds_attention_events').select('id,event_key,event_type,title,body,urgency,requires_user,route,status,source_type,source_id,request_revision,metadata,created_at,updated_at,delivered_at').in('route',['ambient','interrupt']).in('status',['pending','delivered']).gte('created_at',sinceAttention).order('updated_at',{ascending:false}).limit(20)
  ]);
  if(runQ.error)throw runQ.error;if(missionQ.error)throw missionQ.error;if(attentionQ.error)throw attentionQ.error;
  const missions=missionQ.data||[],missionById=new Map(missions.map(x=>[String(x.id),x]));
  const attention=(attentionQ.data||[]).filter(event=>{
    if(event.requires_user===true&&event.source_type==='mission'){
      return missionById.get(String(event.source_id||''))?.status==='waiting_for_user';
    }
    return true;
  });
  return projectCards(runQ.data||[],missions,attention);
}
async function loadConversationHistory({render=true}={}){
  if(!sb||!user||chatBusy)return false;
  const {data:convs,error:cErr}=await sb.from('conversations').select('id').eq('user_id',user.id).eq('app_scope','isabella').order('updated_at',{ascending:false}).limit(1);
  if(cErr||!convs?.[0]?.id)return false;
  const {data:msgs,error:mErr}=await sb.from('conversation_messages')
    .select('client_key,role,content,created_at,metadata')
    .eq('user_id',user.id).eq('conversation_id',convs[0].id)
    .in('role',['user','assistant']).order('created_at',{ascending:false}).limit(14);
  if(mErr)return false;
  const next=(msgs||[]).reverse().map(m=>({role:m.role==='assistant'?'assistant':'user',text:cleanText(m.content||''),at:m.created_at,source:m.metadata?.source||null})).filter(x=>x.text);
  const snapshot=JSON.stringify(next.map(x=>[x.role,x.text,x.at]));
  if(snapshot===lastHistorySnapshot)return false;
  lastHistorySnapshot=snapshot;chatTurns=next;
  if(render)renderConversation();
  return true;
}
async function syncPendingReview({discover=false}={}){
  if(!sb||!user)return;
  try{
    let query=sb.from('minds_shadow_decisions').select('request_id,status,created_at').eq('status','pending');
    if(pendingReviewRequestId)query=query.eq('request_id',pendingReviewRequestId).limit(1);
    else if(discover)query=query.gte('created_at',new Date(now()-24*60*60*1000).toISOString()).order('created_at',{ascending:false}).limit(1);
    else return;
    const {data,error}=await query;if(error)return;
    const next=String(data?.[0]?.request_id||'');
    if(next!==pendingReviewRequestId)setPendingReviewRequestId(next);
  }catch{}
}
async function refresh({force=false}={}){
  if(!sb||!user||polling)return;polling=true;
  try{
    await syncPendingReview({discover:!pendingReviewRequestId});
    const cards=await queryPresence(),snapshot=JSON.stringify(cards.map(x=>[x.id,x.kind,x.status,x.updatedAt,x.body]));
    const historyChanged=(expanded||manualOpen)&&!chatBusy?await loadConversationHistory({render:false}):false;
    if(panelView==='tasks'&&expanded)await loadAgenda({force});
    if(force||snapshot!==lastSnapshot){lastSnapshot=snapshot;await renderPresence(cards)}
    else if(historyChanged)renderConversation();
  }catch(e){if(String(e?.message||'').toLowerCase().includes('jwt'))await renderAuth('La sesión de MINDS necesita renovarse.')}
  finally{polling=false}
}
function startPolling(){if(timer)clearInterval(timer);timer=setInterval(()=>refresh(),POLL_MS)}
async function sendChatText(raw){
  const message=String(raw||'').trim();if(!message||chatBusy||!sb||!user)return;
  const replyContext=pendingReplyContext?{...pendingReplyContext}:null;
  expanded=true;manualOpen=true;chatBusy=true;pendingReview=false;lastQuickReplies=[];
  chatTurns.push({role:'user',text:message});$('#chatInput').value='';await renderPresence(lastCards,{auto:false});
  try{
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
    const requestId=globalThis.crypto?.randomUUID?.()||('presence-'+Date.now()+'-'+Math.random().toString(16).slice(2));
    const {data,error}=await sb.functions.invoke('isabella-chat',{body:{
      message,context:{timezone,locale:navigator.language||'es-ES',presence_surface:true,reply_context:replyContext},background:false,attachments:[],
      surface:'presence',client_message_id:requestId
    }});
    if(error)throw error;if(data?.error)throw new Error(data.message||data.detail||data.error);
    chatTurns.push({role:'assistant',text:cleanText(data?.reply||'Te escucho.')});
    const proposals=[data?.proposal,...(Array.isArray(data?.proposals)?data.proposals:[])].filter(Boolean);
    const reviewId=String(proposals.find(x=>/^[0-9a-f-]{36}$/i.test(String(x?.request_id||'')))?.request_id||'');
    if(reviewId)setPendingReviewRequestId(reviewId);else await syncPendingReview({discover:true});
    lastQuickReplies=(Array.isArray(data?.quick_replies)?data.quick_replies:[]).slice(0,4).map(x=>({label:String(x?.label||'').trim(),value:String(x?.value||x?.label||'').trim()})).filter(x=>x.label&&x.value);
    if(replyContext)clearReplyContext();
    chatBusy=false;
    await loadConversationHistory({render:false});
  }catch(e){
    let stale=false;
    if(replyContext&&e?.context?.json){
      try{const payload=await e.context.json();stale=payload?.error==='stale_decision'}catch{}
    }
    if(stale){
      clearReplyContext();
      chatTurns.push({role:'assistant',text:'Esa decisión cambió mientras respondías. Actualicé el estado para que no contestes una versión anterior.',error:true});
      await refresh({force:true});
    }else chatTurns.push({role:'assistant',text:'No pude completar ese turno. Puedes abrir MINDS para continuar.',error:true});
  }
  finally{chatBusy=false;await renderPresence(lastCards,{auto:false})}
}
async function submitChat(event){event.preventDefault();await sendChatText($('#chatInput').value)}
async function connect(){
  if(!window.supabase?.createClient)return renderAuth('No pude cargar el cliente seguro de Supabase.');
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'minds-isabella-presence-auth-v01'}});
  const {data,error}=await sb.auth.getSession();if(error)return renderAuth('No pude leer la sesión de MINDS.');
  user=data.session?.user||null;
  sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user){void loadConversationHistory({render:false}).then(()=>refresh({force:true}));startPolling()}else void renderAuth('')});
  if(!user)return renderAuth('');
  await loadConversationHistory({render:false});
  await refresh({force:true});startPolling();
}
async function sendOtp(event){
  event.preventDefault();email=$('#emailInput').value.trim();if(!email)return;$('#authMessage').textContent='Enviando código…';
  const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error){$('#authMessage').textContent=error.message;return}
  $('#emailForm').classList.add('hidden');$('#otpForm').classList.remove('hidden');$('#authMessage').textContent='Revisa tu correo e introduce el código.';$('#otpInput').focus();
}
async function verifyOtp(event){
  event.preventDefault();const token=$('#otpInput').value.trim();
  if(!email||!/^\d{6,10}$/.test(token)){ $('#authMessage').textContent='Introduce el código completo.';return }
  $('#authMessage').textContent='Verificando…';const {data,error}=await sb.auth.verifyOtp({email,token,type:'email'});
  if(error){$('#authMessage').textContent=error.message;return}
  user=data.user||data.session?.user||null;manualOpen=true;expanded=false;await loadConversationHistory({render:false});await refresh({force:true});startPolling();
}
async function setPanelView(next){
  const target=['status','tasks','chat'].includes(next)?next:'status';
  if(target!=='tasks'&&activeTaskDetailId)closeTaskDetail();
  panelView=target;expanded=true;manualOpen=true;
  if(panelView==='chat')await loadConversationHistory({render:false});
  if(panelView==='tasks')await loadAgenda({force:true});
  await renderPresence(lastCards,{auto:false});
  if(panelView==='chat')setTimeout(()=>$('#chatInput')?.focus(),70);
}
async function expandPanel(){
  expanded=true;manualOpen=true;const focal=lastCards[0]||null;panelView=focal?'status':'chat';
  if(focal)rememberSeen(focal.id);if(panelView==='chat')await loadConversationHistory({render:false});
  await renderPresence(lastCards,{auto:false});if(panelView==='chat')setTimeout(()=>$('#chatInput')?.focus(),70);
}
async function collapsePanel(){expanded=false;manualOpen=true;panelView='status';clearHomeCollapse();await renderPresence(lastCards,{auto:false})}
function bind(){
  $('#emailForm').addEventListener('submit',sendOtp);$('#otpForm').addEventListener('submit',verifyOtp);$('#chatForm').addEventListener('submit',submitChat);
  $('#pillMain').onclick=expandPanel;$('#pillHide').onclick=hideWindow;$('#collapseButton').onclick=collapsePanel;
  $('#statusTab').onclick=()=>setPanelView('status');$('#tasksTab').onclick=()=>setPanelView('tasks');$('#chatTab').onclick=()=>setPanelView('chat');
  $('#openMinds').onclick=()=>openMinds();$('#reviewInMinds').onclick=()=>openMinds(pendingReviewRequestId||null);
  $('#clearReplyContext').onclick=clearReplyContext;
  $('#calendarPrev').onclick=()=>void shiftTaskMonth(-1);$('#calendarNext').onclick=()=>void shiftTaskMonth(1);
  $('#calendarMonthLabel').onclick=()=>void selectTaskDate(todayIso());$('#tasksToday').onclick=()=>void selectTaskDate(todayIso());
  $('#quickTaskForm').addEventListener('submit',createAgendaTask);$('#taskViaChat').onclick=()=>void addTaskViaChat();
  $('#taskDetailClose').onclick=closeTaskDetail;$('#taskDetailForm').addEventListener('submit',saveTaskDetail);$('#taskDetailDelete').onclick=()=>void deleteTaskDetail();
  $('#taskDetailStar').onclick=()=>{
    const star=$('#taskDetailStar'),important=star.dataset.priority!=='high';
    star.dataset.priority=important?'high':'normal';star.textContent=important?'★':'☆';star.classList.toggle('is-important',important);
  };
  document.querySelectorAll('[data-hide]').forEach(b=>b.onclick=hideWindow);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();
      if(activeTaskDetailId){closeTaskDetail();return}
      if(expanded)void collapsePanel();else void hideWindow();return
    }
    if(expanded)armHomeCollapse();
  });
  document.addEventListener('pointerdown',()=>{if(expanded)armHomeCollapse()},{passive:true});
  $('#chatInput').addEventListener('input',armHomeCollapse);
  window.addEventListener('resize',()=>{
    if(!expanded)return;
    const minHeight=panelView==='chat'?PANEL_MIN.chatHeight:panelView==='tasks'?PANEL_MIN.tasksHeight:PANEL_MIN.statusHeight;
    if(window.innerWidth>=PANEL_MIN.width&&window.innerHeight>=minHeight){
      savePanelSize(window.innerWidth,window.innerHeight);
      lastAppliedSizeKey='';
    }
  });
  if(listen){
    listen('presence:manual-open',async()=>{manualOpen=true;expanded=false;panelView='status';if(user)await renderPresence(lastCards,{auto:false});else await renderAuth('')}).catch(()=>{});
    listen('presence:manual-hide',()=>{manualOpen=false;expanded=false;panelView='status';clearHomeCollapse();const focal=autoCandidate(lastCards);if(focal)rememberSuppressed(focal.id)}).catch(()=>{});
  }
}
async function init(){bind();showOnly('bootView');await sizeWindow('boot');await connect()}
window.addEventListener('DOMContentLoaded',()=>void init(),{once:true});
})();