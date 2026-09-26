(()=>{'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const KEY='isabella-staging-v03';
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const today=()=>iso(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
const activeTask=t=>!t.done&&!t.archivedAt;
const taskOrder=(a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.title||'').localeCompare(String(b.title||''),'es');
function nextTaskOrder(date){const xs=state.tasks.filter(t=>t.date===date&&!t.archivedAt);return xs.length?Math.max(...xs.map(t=>Number(t.sortOrder||0)))+10:10}
function mutation(entityType,action,before,after,source='manual'){
  const entityKey=(after||before)?.id;
  if(!entityKey)return;
  try{window.dispatchEvent(new CustomEvent('isabella:mutation',{detail:{entityType,entityKey,action,source,before:clone(before),after:clone(after)}}))}catch{}
}
function tombstone(kind,id){
  const key=kind==='task'?'deletedTaskIds':'deletedEventIds';
  state[key]=Array.isArray(state[key])?state[key]:[];
  if(!state[key].includes(id))state[key].push(id);
  if(state[key].length>300)state[key]=state[key].slice(-300);
}
function setOrbPalette(){
  const o=$('#orbButton');if(!o)return;
  const h=new Date().getHours();
  o.dataset.period=h<7?'dawn':h<12?'morning':h<18?'day':h<22?'evening':'night';
}
const base={screen:'assistant',view:'month',date:today(),messages:[],categories:[{id:'casa',name:'Casa'},{id:'trabajo',name:'Trabajo'},{id:'minds',name:'MINDS'},{id:'personal',name:'Personal'},{id:'architectures',name:'Architectures'}],projects:[{id:'bernried',categoryId:'trabajo',name:'Bernried'},{id:'schwarz',categoryId:'trabajo',name:'Schwarz'}],tasks:[],events:[],memory:[],deletedTaskIds:[],deletedEventIds:[]};
let state=load();
function load(){try{return {...base,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return JSON.parse(JSON.stringify(base))}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{} window.ISABELLA_STATE=state;try{window.dispatchEvent(new CustomEvent('isabella:state',{detail:JSON.parse(JSON.stringify(state))}))}catch{} renderToday();}
function pretty(s,opt={weekday:'long',day:'numeric',month:'long'}){return fromIso(s).toLocaleDateString('es-ES',opt)}
function cat(id){return state.categories.find(x=>x.id===id)?.name||''} function project(id){return state.projects.find(x=>x.id===id)?.name||''}
function minutes(t){const[a,b]=t.split(':').map(Number);return a*60+b}
function greet(){const h=new Date().getHours();return h<12?'Buenos días.':h<19?'Buenas tardes.':'Buenas noches.'}
function init(){ if(!state.messages.length){state.messages=[{id:uid(),role:'assistant',text:'Hola. Soy Isabella.'}];save()} setOrbPalette();bind(); renderMessages(); renderToday(); renderCalendar(); show(state.screen); }
function show(name){state.screen=name; $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name)); save(); if(name==='calendar')renderCalendar();}
function say(role,text){state.messages.push({id:uid(),role,text}); if(state.messages.length>150)state.messages=state.messages.slice(-150);save();renderMessages();}
function renderMessages(){const box=$('#messages');box.innerHTML=state.messages.map(m=>`<div class="message ${m.role}">${esc(m.text)}</div>`).join('');setTimeout(()=>{const sc=$('.assistant-scroll');if(sc&&!sc.dataset.initialScroll){sc.scrollTop=sc.scrollHeight;sc.dataset.initialScroll='1'}},20)}
function renderToday(){const d=today(),ev=state.events.filter(x=>x.date===d).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===d&&activeTask(x));$('#todaySummary').textContent=`${ev.length} ${ev.length===1?'evento':'eventos'} · ${ta.length} ${ta.length===1?'tarea':'tareas'}`;$('#todayNext').textContent=ev[0]?`${ev[0].start} · ${ev[0].title}`:'Sin próxima cita'}
function orb(mode='idle',label=''){const o=$('#orbButton');if(!o)return;o.classList.remove('listening','thinking');if(mode!=='idle')o.classList.add(mode);const s=$('#orbStatus');if(s)s.textContent=label}
function localFallback(text){const n=text.toLowerCase();if(/qué tengo hoy|que tengo hoy|agenda de hoy/.test(n)){const d=today(),e=state.events.filter(x=>x.date===d),t=state.tasks.filter(x=>x.date===d&&activeTask(x));return `Hoy tienes ${e.length} ${e.length===1?'evento':'eventos'} y ${t.length} ${t.length===1?'tarea pendiente':'tareas pendientes'}.`}if(/calendario|agenda/.test(n)){show('calendar');return 'Te abro el calendario.'}return 'Te escucho. Para usar la IA, conecta la memoria desde el menú •••.'}
function rememberCandidates(items){for(const m of items||[]){if(!m?.content)continue;const exists=(state.memory||[]).some(x=>(typeof x==='object'?x.content:String(x))===m.content);if(!exists)state.memory.push({id:uid(),kind:m.kind||'context',content:m.content,confidence:Number(m.confidence??.7),status:'active',source:'ai',metadata:{}})}save()}
function proposalLabel(p){
  const action=p.action||'create';
  const actionName=action==='update'?'Modificar':action==='delete'?'Eliminar':'Agregar';
  const bits=[actionName,p.kind==='event'?'evento':'tarea',p.title,p.date];
  if(p.time)bits.push(p.time);
  if(p.duration_minutes)bits.push(p.duration_minutes+' min');
  if(p.category)bits.push(p.category);
  if(p.project)bits.push(p.project);
  if(p.reminder_time)bits.push('recordatorio '+p.reminder_time);
  if(p.recurrence)bits.push(p.recurrence);
  return bits.filter(Boolean).join(' · ');
}
function confirmProposal(p){modal('Confirmar',`<div class="row"><div class="row-main"><b>${esc(proposalLabel(p))}</b><div class="small" style="margin-top:7px">Isabella no hará el cambio hasta que lo confirmes.</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px"><button id="proposalCancel" class="primary" style="background:#f2f2f3;color:#111">Cancelar</button><button id="proposalConfirm" class="primary">Confirmar</button></div>`);$('#proposalCancel').onclick=()=>{closeModal();say('assistant','De acuerdo, no hice ningún cambio.')};$('#proposalConfirm').onclick=()=>applyProposal(p)}
function findTarget(p){
  const list=p.kind==='task'?state.tasks:state.events;
  if(p.target_id){const exact=list.find(x=>x.id===p.target_id);if(exact)return exact}
  let matches=[...list];
  const d=p.target_date||p.date;
  const t=p.target_time||p.time;
  const title=(p.target_title||'').trim().toLowerCase();
  if(d)matches=matches.filter(x=>x.date===d);
  if(t&&p.kind==='event')matches=matches.filter(x=>x.start===t);
  if(title)matches=matches.filter(x=>String(x.title||'').trim().toLowerCase()===title);
  return matches.length===1?matches[0]:null;
}
function applyProposal(p){
  const action=p.action||'create';
  const categoryId=p.category?state.categories.find(c=>c.name.toLowerCase()===String(p.category).toLowerCase())?.id:null;
  const projectId=p.project?state.projects.find(x=>x.name.toLowerCase()===String(p.project).toLowerCase())?.id:null;
  const date=p.date||today();
  if(action==='update'||action==='delete'){
    const target=findTarget(p);
    if(!target){closeModal();say('assistant','No pude identificar con seguridad cuál elemento quieres cambiar. Dime cuál y lo intento de nuevo.');return}
    const before=clone(target);
    if(action==='delete'){
      const list=p.kind==='task'?state.tasks:state.events;
      const idx=list.findIndex(x=>x.id===target.id);
      if(idx>=0)list.splice(idx,1);
      tombstone(p.kind,target.id);
      mutation(p.kind,'delete',before,null,'assistant');
      save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó eliminado.');return;
    }
    if(p.title!=null&&String(p.title).trim())target.title=String(p.title).trim();
    if(p.date)target.date=p.date;
    if(p.kind==='event'){
      if(p.time)target.start=p.time;
      if(p.duration_minutes!=null)target.duration=Number(p.duration_minutes);
      if(p.all_day!=null)target.allDay=!!p.all_day;
    }else{
      if(Object.prototype.hasOwnProperty.call(p,'reminder_time'))target.reminderTime=p.reminder_time||null;
      if(target.sortOrder==null)target.sortOrder=nextTaskOrder(target.date);
    }
    if(categoryId)target.categoryId=categoryId;
    if(projectId)target.projectId=projectId;
    if(p.project===null&&Object.prototype.hasOwnProperty.call(p,'project'))target.projectId=null;
    if(p.recurrence!==undefined&&p.recurrence!==null)target.recurrence=p.recurrence?{text:p.recurrence}:{};
    if(p.notes!==undefined&&p.notes!==null)target.notes=p.notes||'';
    mutation(p.kind,'update',before,target,'assistant');
    save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó actualizado.');return;
  }
  const createCategoryId=categoryId||'personal';
  if(p.kind==='event'){
    if(!p.time){closeModal();say('assistant','Me falta una hora para crear ese evento.');return}
    const item={id:uid(),title:p.title||'Evento',date,start:p.time,duration:Number(p.duration_minutes||60),allDay:!!p.all_day,categoryId:createCategoryId,projectId:projectId||null,recurrence:p.recurrence?{text:p.recurrence}:{},notes:p.notes||'',metadata:{source:'isabella'}};
    state.events.push(item);mutation('event','create',null,item,'assistant');
  }else{
    const item={id:uid(),title:p.title||'Tarea',date,done:false,completedAt:null,archivedAt:null,sortOrder:nextTaskOrder(date),categoryId:createCategoryId,projectId:projectId||null,recurrence:p.recurrence?{text:p.recurrence}:{},reminderTime:p.reminder_time||null,notes:p.notes||'',metadata:{source:'isabella'}};
    state.tasks.push(item);mutation('task','create',null,item,'assistant');
  }
  save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó agregado.');
}
async function handle(text){say('user',text);orb('thinking','Pensando…');try{if(window.ISABELLA_AI?.ask){const result=await window.ISABELLA_AI.ask(text,state);if(result?.reply)say('assistant',result.reply);if(result?.question&&result.question!==result.reply)say('assistant',result.question);if(result?.memory_candidates?.length)rememberCandidates(result.memory_candidates);if(result?.proposal)confirmProposal(result.proposal)}else say('assistant',localFallback(text))}catch(e){say('assistant',e?.message||localFallback(text))}finally{orb()}}
function bind(){
 const i=$('#chatInput');const autosize=()=>{i.style.height='auto';i.style.height=Math.min(i.scrollHeight,156)+'px'};const send=()=>{const t=i.value.trim();if(!t)return;i.value='';autosize();handle(t)};$('#sendButton').onclick=send;i.addEventListener('input',autosize);i.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});autosize();$('#calendarButton').onclick=()=>show('calendar');$('#todayCard').onclick=()=>{state.date=today();state.view='month';show('calendar')};$('#backButton').onclick=()=>show('assistant');$('#todayButton').onclick=()=>{state.date=today();save();renderCalendar()};$('#prevButton').onclick=()=>move(-1);$('#nextButton').onclick=()=>move(1);$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;save();renderCalendar()});$('#menuButton').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=closeModal;$$('[data-action]').forEach(b=>b.onclick=()=>{closeDrawer();action(b.dataset.action)});initSwipe();initVoice(); }
function initSwipe(){const a=$('#swipeArea');let sx=0,sy=0,on=false;a.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;on=true},{passive:true});a.addEventListener('touchend',e=>{if(!on)return;on=false;const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(dy)*1.05){if(dx<0&&state.screen==='assistant')show('calendar');else if(dx>0&&state.screen==='calendar')show('assistant')}},{passive:true})}
function initVoice(){const R=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;const start=()=>{openFocus();orb('listening','Escuchando…');if(!R){$('#focusStatus').textContent='Voz no disponible';$('#focusTranscript').textContent='Este navegador no ofrece dictado. Puedes seguir escribiendo.';return}try{rec=new R();rec.lang='es-ES';rec.interimResults=true;rec.onresult=e=>{let f='',i='';for(let k=e.resultIndex;k<e.results.length;k++){const x=e.results[k][0].transcript;e.results[k].isFinal?f+=x:i+=x}$('#focusTranscript').textContent=(f||i||'Te escucho…').trim();if(f.trim()){const t=f.trim();$('#focusStatus').textContent='Pensando…';orb('thinking','Pensando…');setTimeout(()=>{closeFocus();handle(t)},300)}};rec.onerror=()=>{$('#focusStatus').textContent='No pude escuchar';$('#focusTranscript').textContent='Revisa el permiso del micrófono o escribe el mensaje.'};rec.start()}catch{$('#focusStatus').textContent='No pude iniciar el micrófono'}};$('#micButton').onclick=start;$('#orbButton').onclick=start;$('#focusClose').onclick=()=>{try{rec?.stop()}catch{}closeFocus()};$('#focusStop').onclick=()=>{try{rec?.stop()}catch{}closeFocus()};$('#focusKeyboard').onclick=()=>{try{rec?.stop()}catch{}closeFocus();setTimeout(()=>$('#chatInput').focus(),50)}}
function openFocus(){$('#focusMode').classList.remove('hidden');$('#focusStatus').textContent='Escuchando…';$('#focusTranscript').textContent='Puedes hablar con naturalidad.'}function closeFocus(){$('#focusMode').classList.add('hidden');orb()}
function startWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;return addDays(x,-day)} function weekNo(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const n=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-n);const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function move(dir){let d=fromIso(state.date);if(state.view==='day')d=addDays(d,dir);else if(state.view==='week')d=addDays(d,dir*7);else d=new Date(d.getFullYear(),d.getMonth()+dir,1);state.date=iso(d);save();renderCalendar()}
function renderCalendar(){$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));const d=fromIso(state.date);$('#calTitle').textContent=state.view==='month'?d.toLocaleDateString('es-ES',{month:'long'}):state.view==='week'?`Semana ${weekNo(d)}`:d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});if(state.view==='month')month();else if(state.view==='week')week();else day()}
function agendaRow(kind,item){
  const category=cat(item.categoryId),proj=item.projectId?' · '+project(item.projectId):'';
  const time=kind==='event'?item.start:'Todo el día';
  return `<div class="agenda-item ${kind}-item" data-kind="${kind}" data-id="${item.id}" data-date="${item.date}" tabindex="0">
    <span class="adot"></span>
    <div class="agenda-main"><strong>${esc(item.title)}</strong><div class="meta">${esc(category)}${esc(proj)}</div></div>
    <div class="agenda-tail"><div class="atime">${esc(time)}</div>${kind==='task'?'<button class="drag-handle" aria-label="Reordenar">⋮⋮</button>':''}</div>
  </div>`;
}
function month(){
  const f=fromIso(state.date),first=new Date(f.getFullYear(),f.getMonth(),1),start=startWeek(first),wd=['L','M','X','J','V','S','D'];
  let h=`<div class="month-year">${f.getFullYear()}</div><div class="month-grid"><div class="mh"></div>${wd.map(x=>`<div class="mh">${x}</div>`).join('')}`;
  for(let r=0;r<6;r++){
    const rs=addDays(start,r*7);h+=`<div class="mw">${weekNo(rs)}</div>`;
    for(let col=0;col<7;col++){
      const d=addDays(rs,col),di=iso(d),mut=d.getMonth()!==f.getMonth();
      const total=state.events.filter(x=>x.date===di).length+state.tasks.filter(x=>x.date===di&&activeTask(x)).length;
      h+=`<button class="mc ${col>4?'weekend':''} ${mut?'muted':''} ${di===today()?'today':''} ${di===state.date?'selected':''}" data-date="${di}"><span class="mn">${d.getDate()}</span><span class="dot ${total?'':'off'}"></span></button>`;
    }
  }
  h+='</div>';
  const ev=state.events.filter(x=>x.date===state.date).sort((a,b)=>a.start.localeCompare(b.start));
  const ta=state.tasks.filter(x=>x.date===state.date&&activeTask(x)).sort(taskOrder);
  h+=`<div class="agenda"><div class="agenda-head">${esc(pretty(state.date))}${state.date===today()?' · Hoy':''}</div>`;
  if(!ev.length&&!ta.length)h+='<div class="meta empty-day">No tienes nada previsto para este día.</div>';
  for(const e of ev)h+=agendaRow('event',e);
  for(const t of ta)h+=agendaRow('task',t);
  h+='</div>';
  $('#calendarContent').innerHTML=h;
  $$('[data-date]').forEach(b=>b.onclick=()=>{state.date=b.dataset.date;save();month()});
  bindCalendarItems();
}
function week(){
  const s=startWeek(fromIso(state.date));let h='<div class="week">';
  for(let i=0;i<7;i++){
    const d=addDays(s,i),di=iso(d),ev=state.events.filter(x=>x.date===di).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===di&&activeTask(x)).sort(taskOrder);
    h+=`<div class="wday"><div class="whead">${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>${ev.map(e=>`<button class="witem calendar-entry" data-kind="event" data-id="${e.id}"><b>${esc(e.start)}</b><br>${esc(e.title)}</button>`).join('')}${ta.map(t=>`<button class="witem calendar-entry" data-kind="task" data-id="${t.id}">○ ${esc(t.title)}</button>`).join('')}${!ev.length&&!ta.length?'<div class="meta week-free">Libre</div>':''}</div>`;
  }
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function day(){
  const ev=state.events.filter(x=>x.date===state.date),ta=state.tasks.filter(x=>x.date===state.date&&activeTask(x)).sort(taskOrder);
  let h=`<div class="day-all"><b>Todo el día</b><div>${ta.length?ta.map(t=>`<button class="pill calendar-entry" data-kind="task" data-id="${t.id}">${esc(t.title)}</button>`).join(''):'<span class="meta">Sin tareas</span>'}</div></div><div class="hours">`;
  for(let hr=7;hr<=22;hr++)h+=`<div class="hrow"><div class="hlabel">${pad(hr)}:00</div><div></div></div>`;
  for(const e of ev){const top=((minutes(e.start)-420)/60)*60,height=Math.max(34,(e.duration||60)-3);if(top>=0&&top<960)h+=`<button class="event calendar-entry" data-kind="event" data-id="${e.id}" style="top:${top}px;height:${height}px"><b>${esc(e.start)} ${esc(e.title)}</b><div class="meta">${esc(cat(e.categoryId))}</div></button>`}
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function bindCalendarItems(){
  $$('.calendar-entry,.agenda-item[data-kind]').forEach(el=>{
    if(el.dataset.bound)return;el.dataset.bound='1';
    let sx=0,sy=0,moved=false;
    el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;e.stopPropagation()},{passive:true});
    el.addEventListener('touchmove',e=>{const t=e.touches[0];if(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12)moved=true;e.stopPropagation()},{passive:true});
    el.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;e.stopPropagation();if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx>0&&el.dataset.kind==='task')completeTask(el.dataset.id);else if(dx<0)itemActions(el.dataset.kind,el.dataset.id);return}if(!moved&&!el.closest('.drag-handle'))editItem(el.dataset.kind,el.dataset.id)},{passive:true});
    el.addEventListener('click',e=>{if(e.detail===0||'ontouchstart' in window)return;if(e.target.closest('.drag-handle'))return;editItem(el.dataset.kind,el.dataset.id)});
  });
  initTaskDrag();
}
function itemBy(kind,id){return (kind==='task'?state.tasks:state.events).find(x=>x.id===id)}
function itemActions(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const archive=kind==='task'?'<button id="quickArchive" class="sheet-action">Archivar</button>':'';
  const complete=kind==='task'?'<button id="quickComplete" class="sheet-action">Marcar como hecha</button>':'';
  modal(item.title,`<div class="sheet-actions">${complete}<button id="quickEdit" class="sheet-action">Editar</button>${archive}<button id="quickDelete" class="sheet-action danger">Eliminar</button></div>`);
  $('#quickEdit').onclick=()=>editItem(kind,id);
  if(kind==='task'){
    $('#quickComplete').onclick=()=>completeTask(id);
    $('#quickArchive').onclick=()=>archiveTask(id);
  }
  $('#quickDelete').onclick=()=>deleteItem(kind,id);
}
function editItem(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const cats=state.categories.map(x=>`<option value="${x.id}" ${x.id===item.categoryId?'selected':''}>${esc(x.name)}</option>`).join('');
  const projects='<option value="">Sin proyecto</option>'+state.projects.map(x=>`<option value="${x.id}" ${x.id===item.projectId?'selected':''}>${esc(x.name)}</option>`).join('');
  const specific=kind==='event'
    ?`<label>Hora<input id="editTime" type="time" value="${esc(item.start||'09:00')}"></label><label>Duración (min)<input id="editDuration" type="number" min="5" step="5" value="${Number(item.duration||60)}"></label>`
    :`<label>Recordatorio<input id="editReminder" type="time" value="${esc(item.reminderTime||'')}"></label>`;
  modal(kind==='event'?'Editar evento':'Editar tarea',`<div class="form item-editor">
    <label>Título<input id="editTitle" value="${esc(item.title)}"></label>
    <label>Fecha<input id="editDate" type="date" value="${esc(item.date)}"></label>
    ${specific}
    <label>Categoría<select id="editCategory">${cats}</select></label>
    <label>Proyecto<select id="editProject">${projects}</select></label>
    <label>Notas<textarea id="editNotes" rows="3">${esc(item.notes||'')}</textarea></label>
    <button id="editSave" class="primary">Guardar cambios</button>
    <button id="editDelete" class="secondary danger-text">Eliminar</button>
  </div>`);
  $('#editSave').onclick=()=>{
    const before=clone(item);
    item.title=$('#editTitle').value.trim()||item.title;
    item.date=$('#editDate').value||item.date;
    item.categoryId=$('#editCategory').value||'personal';
    item.projectId=$('#editProject').value||null;
    item.notes=$('#editNotes').value||'';
    if(kind==='event'){item.start=$('#editTime').value||item.start;item.duration=Math.max(5,Number($('#editDuration').value||item.duration||60))}
    else {item.reminderTime=$('#editReminder').value||null;if(item.sortOrder==null)item.sortOrder=nextTaskOrder(item.date)}
    mutation(kind,'update',before,item,'manual');save();renderCalendar();closeModal();
  };
  $('#editDelete').onclick=()=>deleteItem(kind,id);
}
function completeTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;const before=clone(t);
  t.done=true;t.completedAt=new Date().toISOString();
  mutation('task','complete',before,t,'manual');save();renderCalendar();closeModal();
}
function archiveTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;const before=clone(t);
  t.archivedAt=new Date().toISOString();
  mutation('task','archive',before,t,'manual');save();renderCalendar();closeModal();
}
function restoreTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;const before=clone(t);
  t.archivedAt=null;t.done=false;t.completedAt=null;
  mutation('task','restore',before,t,'manual');save();tasksPanel();
}
function deleteItem(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const title=item.title;
  modal('Eliminar',`<div class="confirm-copy">¿Eliminar “${esc(title)}”?</div><div class="confirm-actions"><button id="deleteCancel" class="secondary">Cancelar</button><button id="deleteConfirm" class="primary danger-button">Eliminar</button></div>`);
  $('#deleteCancel').onclick=closeModal;
  $('#deleteConfirm').onclick=()=>{
    const before=clone(item),list=kind==='task'?state.tasks:state.events,idx=list.findIndex(x=>x.id===id);
    if(idx>=0)list.splice(idx,1);
    tombstone(kind,id);
    mutation(kind,'delete',before,null,'manual');save();renderCalendar();closeModal();
  };
}
function initTaskDrag(){
  $$('.drag-handle').forEach(handle=>{
    handle.onpointerdown=e=>{
      e.preventDefault();e.stopPropagation();
      const row=handle.closest('.task-item');if(!row)return;
      const date=row.dataset.date,beforeOrder=$$('.task-item[data-date="'+date+'"]').map(x=>x.dataset.id);
      row.classList.add('dragging');handle.setPointerCapture?.(e.pointerId);
      const move=ev=>{
        ev.preventDefault();
        const siblings=$$('.task-item[data-date="'+date+'"]').filter(x=>x!==row);
        let before=null;
        for(const el of siblings){const r=el.getBoundingClientRect();if(ev.clientY<r.top+r.height/2){before=el;break}}
        if(before)row.parentNode.insertBefore(row,before);else{
          const last=siblings[siblings.length-1];
          if(last&&last.nextSibling)row.parentNode.insertBefore(row,last.nextSibling);else row.parentNode.appendChild(row);
        }
      };
      const up=ev=>{
        handle.releasePointerCapture?.(e.pointerId);row.classList.remove('dragging');
        handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);
        const ids=$$('.task-item[data-date="'+date+'"]').map(x=>x.dataset.id);
        ids.forEach((id,i)=>{const t=state.tasks.find(x=>x.id===id);if(t)t.sortOrder=(i+1)*10});
        if(ids.join('|')!==beforeOrder.join('|'))mutation('task','reorder',{id:row.dataset.id,date,order:beforeOrder},{id:row.dataset.id,date,order:ids},'manual');
        save();renderCalendar();
      };
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
    };
  });
}
function openDrawer(){$('#drawer').classList.remove('hidden');$('#drawerBackdrop').classList.remove('hidden')}function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawerBackdrop').classList.add('hidden')}function modal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').classList.remove('hidden');$('#modalBackdrop').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden');$('#modalBackdrop').classList.add('hidden')}
function action(a){if(a==='tasks')tasksPanel();if(a==='new')newPanel();if(a==='memory')memoryPanel();if(a==='categories')categoriesPanel()}
function tasksPanel(){
  const active=state.tasks.filter(t=>!t.archivedAt).sort((a,b)=>String(a.date).localeCompare(String(b.date))||taskOrder(a,b));
  const archived=state.tasks.filter(t=>t.archivedAt).sort((a,b)=>String(b.archivedAt).localeCompare(String(a.archivedAt)));
  let body='<div class="small section-label">Activas</div>';
  body+=active.length?active.map(t=>`<button class="task-panel-row" data-edit-task="${t.id}"><span class="${t.done?'done-text':''}">${esc(t.title)}</span><small>${esc(t.date)} · ${esc(cat(t.categoryId))}</small></button>`).join(''):'<div class="small empty-panel">No hay tareas activas.</div>';
  body+='<div class="small section-label archived-label">Archivadas</div>';
  body+=archived.length?archived.map(t=>`<div class="task-panel-row archived"><span>${esc(t.title)}</span><button data-restore-task="${t.id}">Restaurar</button></div>`).join(''):'<div class="small empty-panel">No hay tareas archivadas.</div>';
  modal('Tareas',body);
  $$('[data-edit-task]').forEach(x=>x.onclick=()=>editItem('task',x.dataset.editTask));
  $$('[data-restore-task]').forEach(x=>x.onclick=e=>{e.stopPropagation();restoreTask(x.dataset.restoreTask)});
}
function newPanel(){modal('Agregar manualmente',`<div class="form"><select id="newType"><option value="task">Tarea de día completo</option><option value="event">Evento</option></select><input id="newTitle" placeholder="Nombre"><input id="newDate" type="date" value="${today()}"><select id="newCat">${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input id="newTime" type="time" value="09:00"><button id="newSave" class="primary">Guardar</button></div>`);$('#newSave').onclick=()=>{const title=$('#newTitle').value.trim();if(!title)return;const type=$('#newType').value,date=$('#newDate').value,categoryId=$('#newCat').value;if(type==='task'){const item={id:uid(),title,date,categoryId,done:false,completedAt:null,archivedAt:null,sortOrder:nextTaskOrder(date)};state.tasks.push(item);mutation('task','create',null,item,'manual')}else{const item={id:uid(),title,date,categoryId,start:$('#newTime').value||'09:00',duration:60};state.events.push(item);mutation('event','create',null,item,'manual')}save();closeModal();renderCalendar()}}
function memoryPanel(){modal('Lo que Isabella sabe de mí',state.memory.length?state.memory.map(m=>{const text=typeof m==='object'?m.content:String(m),kind=typeof m==='object'?(m.kind||'context'):'context';return `<div class="row"><div class="row-main"><div>${esc(text)}</div><div class="small">${esc(kind)}</div></div></div>`}).join(''):'<div class="small">Todavía no he guardado memoria personal en esta staging.</div>')}
function categoriesPanel(){
  const rows=state.categories.map(x=>`<div class="settings-row"><input data-cat-name="${x.id}" value="${esc(x.name)}"><button data-cat-delete="${x.id}" aria-label="Eliminar">×</button></div>`).join('');
  const prows=state.projects.map(x=>`<div class="settings-row"><input data-project-name="${x.id}" value="${esc(x.name)}"><select data-project-cat="${x.id}">${state.categories.map(cat=>`<option value="${cat.id}" ${cat.id===x.categoryId?'selected':''}>${esc(cat.name)}</option>`).join('')}</select><button data-project-delete="${x.id}" aria-label="Eliminar">×</button></div>`).join('');
  modal('Categorías y proyectos',`<div class="small section-label">Categorías</div><div id="categoryRows">${rows}</div><button id="addCategory" class="secondary settings-add">+ Categoría</button><div class="small section-label settings-projects-title">Proyectos</div><div id="projectRows">${prows}</div><button id="addProject" class="secondary settings-add">+ Proyecto</button><button id="saveTaxonomy" class="primary settings-save">Guardar cambios</button>`);
  $('#addCategory').onclick=()=>{state.categories.push({id:uid(),name:'Nueva categoría'});save();categoriesPanel()};
  $('#addProject').onclick=()=>{state.projects.push({id:uid(),categoryId:state.categories[0]?.id||'personal',name:'Nuevo proyecto'});save();categoriesPanel()};
  $$('[data-cat-delete]').forEach(b=>b.onclick=()=>{const id=b.dataset.catDelete;if(state.categories.length<=1)return;state.categories=state.categories.filter(x=>x.id!==id);state.projects.forEach(p=>{if(p.categoryId===id)p.categoryId=state.categories[0]?.id||'personal'});state.tasks.forEach(t=>{if(t.categoryId===id)t.categoryId='personal'});state.events.forEach(e=>{if(e.categoryId===id)e.categoryId='personal'});save();categoriesPanel()});
  $$('[data-project-delete]').forEach(b=>b.onclick=()=>{const id=b.dataset.projectDelete;state.projects=state.projects.filter(x=>x.id!==id);state.tasks.forEach(t=>{if(t.projectId===id)t.projectId=null});state.events.forEach(e=>{if(e.projectId===id)e.projectId=null});save();categoriesPanel()});
  $('#saveTaxonomy').onclick=()=>{
    $$('[data-cat-name]').forEach(i=>{const x=state.categories.find(c=>c.id===i.dataset.catName);if(x&&i.value.trim())x.name=i.value.trim()});
    $$('[data-project-name]').forEach(i=>{const x=state.projects.find(p=>p.id===i.dataset.projectName);if(x&&i.value.trim())x.name=i.value.trim()});
    $$('[data-project-cat]').forEach(i=>{const x=state.projects.find(p=>p.id===i.dataset.projectCat);if(x)x.categoryId=i.value});
    save();closeModal();
  };
}
window.ISABELLA_APP={
  getState:()=>JSON.parse(JSON.stringify(state)),
  replaceState:(next)=>{state={...base,...next};save();renderMessages();renderToday();renderCalendar();show(state.screen||'assistant')},
  addAssistantMessage:(text)=>say('assistant',text),
  addUserMessage:(text)=>say('user',text),
  refresh:()=>{renderMessages();renderToday();renderCalendar()},
  openModal:modal,
  closeModal,
  show,
  save
};
init();
})();