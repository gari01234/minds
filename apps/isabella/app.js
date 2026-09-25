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
const base={screen:'assistant',view:'month',date:today(),messages:[],categories:[{id:'casa',name:'Casa'},{id:'trabajo',name:'Trabajo'},{id:'minds',name:'MINDS'},{id:'personal',name:'Personal'},{id:'architectures',name:'Architectures'}],projects:[{id:'bernried',categoryId:'trabajo',name:'Bernried'},{id:'schwarz',categoryId:'trabajo',name:'Schwarz'}],tasks:[],events:[],memory:[]};
let state=load();
function load(){try{return {...base,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return JSON.parse(JSON.stringify(base))}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{} window.ISABELLA_STATE=state;try{window.dispatchEvent(new CustomEvent('isabella:state',{detail:JSON.parse(JSON.stringify(state))}))}catch{} renderToday();}
function pretty(s,opt={weekday:'long',day:'numeric',month:'long'}){return fromIso(s).toLocaleDateString('es-ES',opt)}
function cat(id){return state.categories.find(x=>x.id===id)?.name||''} function project(id){return state.projects.find(x=>x.id===id)?.name||''}
function minutes(t){const[a,b]=t.split(':').map(Number);return a*60+b}
function greet(){const h=new Date().getHours();return h<12?'Buenos días.':h<19?'Buenas tardes.':'Buenas noches.'}
function init(){ $('#greeting').textContent=greet(); if(!state.messages.length){state.messages=[{id:uid(),role:'assistant',text:'Hola. Soy Isabella.'}];save()} bind(); renderMessages(); renderToday(); renderCalendar(); show(state.screen); }
function show(name){state.screen=name; $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name)); save(); if(name==='calendar')renderCalendar();}
function say(role,text){state.messages.push({id:uid(),role,text}); if(state.messages.length>150)state.messages=state.messages.slice(-150);save();renderMessages();}
function renderMessages(){const box=$('#messages');box.innerHTML=state.messages.slice(-7).map(m=>`<div class="message ${m.role}">${esc(m.text)}</div>`).join('');setTimeout(()=>{const sc=$('.assistant-scroll');if(sc)sc.scrollTop=sc.scrollHeight},20)}
function renderToday(){const d=today(),ev=state.events.filter(x=>x.date===d).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===d&&!x.done);$('#todaySummary').textContent=`${ev.length} ${ev.length===1?'evento':'eventos'} · ${ta.length} ${ta.length===1?'tarea':'tareas'}`;$('#todayNext').textContent=ev[0]?`${ev[0].start} · ${ev[0].title}`:'Sin próxima cita'}
function orb(mode='idle',label='Aquí contigo'){const o=$('#orbButton');o.classList.remove('listening','thinking');if(mode!=='idle')o.classList.add(mode);$('#orbStatus').textContent=label}
function localFallback(text){const n=text.toLowerCase();if(/qué tengo hoy|que tengo hoy|agenda de hoy/.test(n)){const d=today(),e=state.events.filter(x=>x.date===d),t=state.tasks.filter(x=>x.date===d&&!x.done);return `Hoy tienes ${e.length} ${e.length===1?'evento':'eventos'} y ${t.length} ${t.length===1?'tarea pendiente':'tareas pendientes'}.`}if(/calendario|agenda/.test(n)){show('calendar');return 'Te abro el calendario.'}return 'Te escucho. Para usar la IA, conecta la memoria desde el menú •••.'}
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
    if(action==='delete'){
      const list=p.kind==='task'?state.tasks:state.events;
      const idx=list.findIndex(x=>x.id===target.id);
      if(idx>=0)list.splice(idx,1);
      save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó eliminado.');return;
    }
    if(p.title!=null&&String(p.title).trim())target.title=String(p.title).trim();
    if(p.date)target.date=p.date;
    if(p.kind==='event'){
      if(p.time)target.start=p.time;
      if(p.duration_minutes!=null)target.duration=Number(p.duration_minutes);
      if(p.all_day!=null)target.allDay=!!p.all_day;
    }else if(Object.prototype.hasOwnProperty.call(p,'reminder_time')){
      target.reminderTime=p.reminder_time||null;
    }
    if(categoryId)target.categoryId=categoryId;
    if(projectId)target.projectId=projectId;
    if(p.project===null&&Object.prototype.hasOwnProperty.call(p,'project'))target.projectId=null;
    if(p.recurrence!==undefined&&p.recurrence!==null)target.recurrence=p.recurrence?{text:p.recurrence}:{};
    if(p.notes!==undefined&&p.notes!==null)target.notes=p.notes||'';
    save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó actualizado.');return;
  }
  const createCategoryId=categoryId||'personal';
  if(p.kind==='event'){
    if(!p.time){closeModal();say('assistant','Me falta una hora para crear ese evento.');return}
    state.events.push({id:uid(),title:p.title||'Evento',date,start:p.time,duration:Number(p.duration_minutes||60),allDay:!!p.all_day,categoryId:createCategoryId,projectId:projectId||null,recurrence:p.recurrence?{text:p.recurrence}:{},notes:p.notes||'',metadata:{source:'isabella'}});
  }else{
    state.tasks.push({id:uid(),title:p.title||'Tarea',date,done:false,categoryId:createCategoryId,projectId:projectId||null,recurrence:p.recurrence?{text:p.recurrence}:{},reminderTime:p.reminder_time||null,notes:p.notes||'',metadata:{source:'isabella'}});
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
function month(){const f=fromIso(state.date),first=new Date(f.getFullYear(),f.getMonth(),1),start=startWeek(first),wd=['L','M','X','J','V','S','D'];let h=`<div class="month-year">${f.getFullYear()}</div><div class="month-grid"><div class="mh"></div>${wd.map(x=>`<div class="mh">${x}</div>`).join('')}`;for(let r=0;r<6;r++){const rs=addDays(start,r*7);h+=`<div class="mw">${weekNo(rs)}</div>`;for(let c=0;c<7;c++){const d=addDays(rs,c),di=iso(d),mut=d.getMonth()!==f.getMonth(),total=state.events.filter(x=>x.date===di).length+state.tasks.filter(x=>x.date===di&&!x.done).length;h+=`<button class="mc ${c>4?'weekend':''} ${mut?'muted':''} ${di===today()?'today':''} ${di===state.date?'selected':''}" data-date="${di}"><span class="mn">${d.getDate()}</span><span class="dot ${total?'':'off'}"></span></button>`}}h+='</div>';const ev=state.events.filter(x=>x.date===state.date).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===state.date&&!x.done);h+=`<div class="agenda"><div class="agenda-head">${esc(pretty(state.date))}${state.date===today()?' · Hoy':''}</div>`;if(!ev.length&&!ta.length)h+='<div class="meta" style="font-size:16px;padding:20px 0">No tienes nada previsto para este día.</div>';for(const e of ev)h+=`<div class="agenda-item"><span class="adot"></span><div><strong>${esc(e.title)}</strong><div class="meta">${esc(cat(e.categoryId))}${e.projectId?' · '+esc(project(e.projectId)):''}</div></div><div class="atime">${esc(e.start)}</div></div>`;for(const t of ta)h+=`<div class="agenda-item"><span class="adot"></span><div><strong>${esc(t.title)}</strong><div class="meta">${esc(cat(t.categoryId))}${t.projectId?' · '+esc(project(t.projectId)):''}</div></div><div class="atime">Todo el día</div></div>`;h+='</div>';$('#calendarContent').innerHTML=h;$$('[data-date]').forEach(b=>b.onclick=()=>{state.date=b.dataset.date;save();month()})}
function week(){const s=startWeek(fromIso(state.date));let h='<div class="week">';for(let i=0;i<7;i++){const d=addDays(s,i),di=iso(d),ev=state.events.filter(x=>x.date===di).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===di&&!x.done);h+=`<div class="wday"><div class="whead">${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>${ev.map(e=>`<div class="witem"><b>${esc(e.start)}</b><br>${esc(e.title)}</div>`).join('')}${ta.map(t=>`<div class="witem">○ ${esc(t.title)}</div>`).join('')}${!ev.length&&!ta.length?'<div class="meta" style="padding-top:10px">Libre</div>':''}</div>`}h+='</div>';$('#calendarContent').innerHTML=h}
function day(){const ev=state.events.filter(x=>x.date===state.date),ta=state.tasks.filter(x=>x.date===state.date&&!x.done);let h=`<div class="day-all"><b>Todo el día</b><div>${ta.length?ta.map(t=>`<span class="pill">${esc(t.title)}</span>`).join(''):'<span class="meta">Sin tareas</span>'}</div></div><div class="hours">`;for(let hr=7;hr<=22;hr++)h+=`<div class="hrow"><div class="hlabel">${pad(hr)}:00</div><div></div></div>`;for(const e of ev){const top=((minutes(e.start)-420)/60)*60,height=Math.max(34,(e.duration||60)-3);if(top>=0&&top<960)h+=`<div class="event" style="top:${top}px;height:${height}px"><b>${esc(e.start)} ${esc(e.title)}</b><div class="meta">${esc(cat(e.categoryId))}</div></div>`}h+='</div>';$('#calendarContent').innerHTML=h}
function openDrawer(){$('#drawer').classList.remove('hidden');$('#drawerBackdrop').classList.remove('hidden')}function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawerBackdrop').classList.add('hidden')}function modal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').classList.remove('hidden');$('#modalBackdrop').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden');$('#modalBackdrop').classList.add('hidden')}
function action(a){if(a==='tasks')tasksPanel();if(a==='new')newPanel();if(a==='memory')memoryPanel();if(a==='categories')categoriesPanel()}
function tasksPanel(){modal('Tareas',state.tasks.length?state.tasks.map(t=>`<div class="row"><input type="checkbox" data-done="${t.id}" ${t.done?'checked':''}><div class="row-main"><div>${esc(t.title)}</div><div class="small">${esc(t.date)} · ${esc(cat(t.categoryId))}</div></div></div>`).join(''):'<div class="small">Todavía no hay tareas.</div>');$$('[data-done]').forEach(x=>x.onchange=()=>{const t=state.tasks.find(t=>t.id===x.dataset.done);t.done=x.checked;save();tasksPanel()})}
function newPanel(){modal('Agregar manualmente',`<div class="form"><select id="newType"><option value="task">Tarea de día completo</option><option value="event">Evento</option></select><input id="newTitle" placeholder="Nombre"><input id="newDate" type="date" value="${today()}"><select id="newCat">${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input id="newTime" type="time" value="09:00"><button id="newSave" class="primary">Guardar</button></div>`);$('#newSave').onclick=()=>{const title=$('#newTitle').value.trim();if(!title)return;const type=$('#newType').value,date=$('#newDate').value,categoryId=$('#newCat').value;if(type==='task')state.tasks.push({id:uid(),title,date,categoryId,done:false});else state.events.push({id:uid(),title,date,categoryId,start:$('#newTime').value||'09:00',duration:60});save();closeModal();say('assistant',`He agregado “${title}”.`);renderCalendar()}}
function memoryPanel(){modal('Lo que Isabella sabe de mí',state.memory.length?state.memory.map(m=>{const text=typeof m==='object'?m.content:String(m),kind=typeof m==='object'?(m.kind||'context'):'context';return `<div class="row"><div class="row-main"><div>${esc(text)}</div><div class="small">${esc(kind)}</div></div></div>`}).join(''):'<div class="small">Todavía no he guardado memoria personal en esta staging.</div>')}
function categoriesPanel(){modal('Categorías y proyectos',`<div class="small">Categorías</div>${state.categories.map(c=>`<div class="row"><div class="row-main">${esc(c.name)}</div></div>`).join('')}<div class="small" style="margin-top:18px">Proyectos de Trabajo</div>${state.projects.map(p=>`<div class="row"><div class="row-main">${esc(p.name)}</div></div>`).join('')}`)}
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