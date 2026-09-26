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
function proposalFeedback(outcome,proposal){
  try{window.dispatchEvent(new CustomEvent('isabella:proposal-feedback',{detail:{outcome,proposal:clone(proposal)}}))}catch{}
}
function tombstone(kind,id){
  const key=kind==='task'?'deletedTaskIds':'deletedEventIds';
  state[key]=Array.isArray(state[key])?state[key]:[];
  if(!state[key].includes(id))state[key].push(id);
  if(state[key].length>300)state[key]=state[key].slice(-300);
}
function repairKnownDuplicate(){
  const old=state.events.find(e=>String(e.title||'').trim().toLowerCase()==='juego de béisbol de mi hijo'&&e.date==='2026-09-26'&&e.start==='14:00');
  const named=state.events.find(e=>String(e.title||'').trim().toLowerCase()==='juego de béisbol de ezequiel'&&e.date==='2026-09-26'&&e.start==='14:00');
  if(old&&named){
    state.events=state.events.filter(e=>e.id!==old.id);
    tombstone('event',old.id);
    mutation('event','delete',old,null,'manual');
    save();
  }
}
function setOrbPalette(){
  const o=$('#orbButton');if(!o)return;
  const h=new Date().getHours();
  o.dataset.period=h<7?'dawn':h<12?'morning':h<18?'day':h<22?'evening':'night';
}
const base={screen:'assistant',view:'month',date:today(),messages:[],categories:[
  {id:'casa',name:'Casa',color:'#5A9EC1'},
  {id:'trabajo',name:'Trabajo',color:'#6D7278'},
  {id:'minds',name:'MINDS',color:'#8A72C7'},
  {id:'personal',name:'Personal',color:'#D08A6A'},
  {id:'architectures',name:'Architectures',color:'#9A9466'}
],projects:[
  {id:'bernried',categoryId:'trabajo',name:'Bernried',color:'#2F6FB0'},
  {id:'schwarz',categoryId:'trabajo',name:'Schwarz',color:'#4F8A62'}
],tasks:[],events:[],memory:[],pendingIntent:null,deletedTaskIds:[],deletedEventIds:[]};
function normalizeMessages(items){
  const out=[];
  let greetingSeen=false;
  for(const m of items||[]){
    const text=String(m?.text||'').trim();
    if(!text)continue;
    if(/^Edge Function returned a non-2xx status code$/i.test(text))continue;
    if(m.role==='assistant'&&text==='Hola. Soy Isabella.'){
      if(greetingSeen)continue;
      greetingSeen=true;
    }
    const prev=out[out.length-1];
    if(prev&&prev.role===m.role&&prev.text===text)continue;
    out.push({...m,text});
  }
  return out;
}
let state=load();
function load(){try{const x={...base,...JSON.parse(localStorage.getItem(KEY)||'{}')};x.messages=normalizeMessages(x.messages);return x}catch{return JSON.parse(JSON.stringify(base))}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{} window.ISABELLA_STATE=state;try{window.dispatchEvent(new CustomEvent('isabella:state',{detail:JSON.parse(JSON.stringify(state))}))}catch{} renderToday();}
function pretty(s,opt={weekday:'long',day:'numeric',month:'long'}){return fromIso(s).toLocaleDateString('es-ES',opt)}
function cat(id){return state.categories.find(x=>x.id===id)?.name||''} function project(id){return state.projects.find(x=>x.id===id)?.name||''}
function minutes(t){const[a,b]=t.split(':').map(Number);return a*60+b}
function greet(){const h=new Date().getHours();return h<12?'Buenos días.':h<19?'Buenas tardes.':'Buenas noches.'}
function init(){
  repairKnownDuplicate();
  state.messages=normalizeMessages(state.messages);
  if(!state.messages.length)state.messages=[{id:uid(),role:'assistant',text:'Hola. Soy Isabella.'}];
  save();
  setOrbPalette();
  bind();
  renderMessages(true);
  renderToday();
  renderCalendar();
  show(state.screen);
}
async function maybeDailyBrief(){
  try{
    const now=new Date(),d=today();
    if(now.getHours()<8)return false;
    const key='isabella-daily-brief-date';
    if(localStorage.getItem(key)===d)return false;
    if(!window.ISABELLA_AI?.brief)return false;
    const result=await window.ISABELLA_AI.brief(state);
    if(result?.reply){
      localStorage.setItem(key,d);
      say('assistant',result.reply);
      return true;
    }
  }catch{}
  return false;
}
async function maybeProactiveNudge(){
  try{
    if(!window.ISABELLA_AI?.nudge)return;
    const key='isabella-last-nudge-at';
    const last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(now-last<6*60*60*1000)return;
    localStorage.setItem(key,String(now));
    const result=await window.ISABELLA_AI.nudge(state);
    const reply=String(result?.reply||'').trim();
    if(reply&&reply!=='NO_NUDGE'&&!/^NO_NUDGE[.!]?$/i.test(reply))say('assistant',reply);
  }catch{}
}
async function afterSync(){
  const briefed=await maybeDailyBrief();
  if(!briefed)await maybeProactiveNudge();
}
function show(name){state.screen=name; $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name)); save(); if(name==='calendar')renderCalendar();}
function say(role,text,meta={}){state.messages.push({id:uid(),role,text,at:new Date().toISOString(),reaction:null,sources:Array.isArray(meta.sources)?meta.sources:[]}); if(state.messages.length>800)state.messages=state.messages.slice(-800);save();renderMessages();}
function renderMessages(forceBottom=false){
  const box=$('#messages');
  state.messages=normalizeMessages(state.messages);
  const nearBottom=box?box.scrollHeight-box.scrollTop-box.clientHeight<120:true;
  box.innerHTML=state.messages.map(m=>`<div class="message ${m.role}" data-message-id="${esc(m.id||'')}"><span class="message-text">${esc(m.text)}</span>${m.reaction?`<span class="reaction-chip">${esc(m.reaction)}</span>`:''}${Array.isArray(m.sources)&&m.sources.length?`<div class="message-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}</div>`).join('');
  bindMessageReactions();
  setTimeout(()=>{
    const b=$('#messages');
    if(b&&(forceBottom||nearBottom||!b.dataset.initialScroll)){
      b.scrollTop=b.scrollHeight;
      b.dataset.initialScroll='1';
    }
  },20);
}
function bindMessageReactions(){
  $('#messages .message[data-message-id]').forEach(el=>{
    if(el.dataset.reactionBound)return;el.dataset.reactionBound='1';
    let timer=null,sx=0,sy=0;
    const cancel=()=>{clearTimeout(timer);timer=null};
    el.addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      const t=e.touches[0];sx=t.clientX;sy=t.clientY;
      timer=setTimeout(()=>openReactionPicker(el.dataset.messageId),520);
    },{passive:true});
    el.addEventListener('touchmove',e=>{
      if(!timer||e.touches.length!==1)return;
      const t=e.touches[0];if(Math.abs(t.clientX-sx)>9||Math.abs(t.clientY-sy)>9)cancel();
    },{passive:true});
    el.addEventListener('touchend',cancel,{passive:true});
    el.addEventListener('touchcancel',cancel,{passive:true});
  });
}
function openReactionPicker(id){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  try{navigator.vibrate?.(8)}catch{}
  modal('Reaccionar',`<div class="emoji-picker">${['👍','❤️','😂','👏','🙌','💡','😊','❌'].map(x=>`<button data-reaction="${x}">${x}</button>`).join('')}<button data-reaction="" class="emoji-remove">Quitar</button></div>`);
  $('[data-reaction]').forEach(b=>b.onclick=()=>{m.reaction=b.dataset.reaction||null;save();closeModal();renderMessages()});
}
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
function proposalEditor(p,onDone){
  const target=(p.action==='update'||p.action==='delete')?findTarget(p):null;
  const title=(p.title??target?.title??'');
  const date=(p.date??target?.date??today());
  const time=(p.time??(p.kind==='event'?target?.start:'')??'');
  const duration=(p.duration_minutes??(p.kind==='event'?target?.duration:60)??60);
  const reminder=(p.reminder_time??(p.kind==='task'?target?.reminderTime:'')??'');
  const categoryName=(p.category??cat(target?.categoryId)??'Personal')||'Personal';
  const projectName=(p.project??project(target?.projectId)??'')||'';
  const cats=state.categories.map(x=>`<option value="${esc(x.name)}" ${x.name===categoryName?'selected':''}>${esc(x.name)}</option>`).join('');
  const projects='<option value="">Sin proyecto</option>'+state.projects.map(x=>`<option value="${esc(x.name)}" ${x.name===projectName?'selected':''}>${esc(x.name)}</option>`).join('');
  const specific=p.kind==='event'
    ?`<label>Hora<input id="proposalTime" type="time" value="${esc(time||'09:00')}"></label><label>Duración (min)<input id="proposalDuration" type="number" min="5" step="5" value="${Number(duration||60)}"></label>`
    :`<label>Recordatorio<input id="proposalReminder" type="time" value="${esc(reminder||'')}"></label>`;
  modal('Revisar antes de confirmar',`<div class="form proposal-editor">
    <label>Nombre<input id="proposalTitle" value="${esc(title)}"></label>
    <label>Fecha<input id="proposalDate" type="date" value="${esc(date)}"></label>
    ${specific}
    <label>Categoría<select id="proposalCategory">${cats}</select></label>
    <label>Proyecto<select id="proposalProject">${projects}</select></label>
    <label>Notas<textarea id="proposalNotes" rows="2">${esc(p.notes??target?.notes??'')}</textarea></label>
    <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estos datos</button></div>
  </div>`);
  $('#proposalEditCancel').onclick=()=>onDone?.(null);
  $('#proposalEditSave').onclick=()=>{
    const q={...p,
      title:$('#proposalTitle').value.trim()||title,
      date:$('#proposalDate').value||date,
      category:$('#proposalCategory').value||null,
      project:$('#proposalProject').value||null,
      notes:$('#proposalNotes').value||null
    };
    if(q.kind==='event'){
      q.time=$('#proposalTime').value||time||null;
      q.duration_minutes=Math.max(5,Number($('#proposalDuration').value||duration||60));
    }else{
      q.reminder_time=$('#proposalReminder').value||null;
    }
    onDone?.(q);
  };
}
function confirmProposal(p){
  modal('Confirmar',`<div class="row"><div class="row-main"><b>${esc(proposalLabel(p))}</b><div class="small" style="margin-top:7px">Puedes confirmar tal cual o corregir nombre, fecha, hora, categoría o proyecto antes de guardarlo.</div></div></div><div class="proposal-actions"><button id="proposalCancel" class="secondary">Cancelar</button><button id="proposalEdit" class="secondary">Corregir</button><button id="proposalConfirm" class="primary">Confirmar</button></div>`);
  $('#proposalCancel').onclick=()=>{state.pendingIntent=null;save();proposalFeedback('rejected',p);closeModal();say('assistant','De acuerdo, no hice ningún cambio.')};
  $('#proposalEdit').onclick=()=>proposalEditor(p,q=>{if(q)confirmProposal(q);else confirmProposal(p)});
  $('#proposalConfirm').onclick=()=>{state.pendingIntent=null;save();proposalFeedback('accepted',p);applyProposal(p)};
}
function confirmProposals(list){
  const items=(list||[]).filter(Boolean);
  if(!items.length)return;
  if(items.length===1){confirmProposal(items[0]);return}
  modal('Confirmar cambios',`<div class="proposal-list">${items.map((p,i)=>`<div class="proposal-row"><span>${esc(proposalLabel(p))}</span><button data-proposal-edit="${i}" class="proposal-inline-edit">Editar</button></div>`).join('')}</div><div class="small" style="margin-top:10px">Puedes revisar cada cambio antes de confirmar todos.</div><div class="confirm-actions" style="margin-top:18px"><button id="proposalBatchCancel" class="secondary">Cancelar</button><button id="proposalBatchConfirm" class="primary">Confirmar todo</button></div>`);
  $$('[data-proposal-edit]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.proposalEdit);proposalEditor(items[i],q=>{if(q)items[i]=q;confirmProposals(items)})});
  $('#proposalBatchCancel').onclick=()=>{state.pendingIntent=null;save();for(const p of items)proposalFeedback('rejected',p);closeModal();say('assistant','De acuerdo, no hice ningún cambio.')};
  $('#proposalBatchConfirm').onclick=()=>{state.pendingIntent=null;save();closeModal();for(const p of items){proposalFeedback('accepted',p);applyProposal(p)}};
}
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
async function handle(text){
  say('user',text);orb('thinking','Pensando…');
  try{
    if(window.ISABELLA_AI?.ask){
      const result=await window.ISABELLA_AI.ask(text,state);
      state.pendingIntent=null;
      if(result?.reply)say('assistant',result.reply,{sources:result.sources||[]});
      if(result?.question&&result.question!==result.reply)say('assistant',result.question);
      if(result?.memory_candidates?.length)rememberCandidates(result.memory_candidates);
      if(Array.isArray(result?.proposals)&&result.proposals.length){state.pendingIntent=null;save();confirmProposals(result.proposals)}
      else if(result?.proposal){state.pendingIntent=null;save();confirmProposal(result.proposal)}
      else save();
    }else say('assistant',localFallback(text));
  }catch(e){say('assistant',e?.message||localFallback(text))}
  finally{orb()}
}
function bind(){
 const i=$('#chatInput');const autosize=()=>{i.style.height='auto';i.style.height=Math.min(i.scrollHeight,156)+'px'};const send=()=>{const t=i.value.trim();if(!t)return;i.value='';autosize();handle(t)};$('#sendButton').onclick=send;i.addEventListener('input',autosize);i.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});autosize();$('#calendarButton').onclick=()=>show('calendar');$('#todayCard').onclick=()=>{state.date=today();state.view='month';show('calendar')};$('#backButton').onclick=()=>show('assistant');$('#todayButton').onclick=()=>{state.date=today();save();renderCalendar()};$('#prevButton').onclick=()=>move(-1);$('#nextButton').onclick=()=>move(1);$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;save();renderCalendar()});$('#menuButton').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=closeModal;$$('[data-action]').forEach(b=>b.onclick=()=>{closeDrawer();action(b.dataset.action)});initSwipe();initVoice(); }
function initSwipe(){const a=$('#swipeArea');let sx=0,sy=0,on=false;a.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;on=true},{passive:true});a.addEventListener('touchend',e=>{if(!on)return;on=false;const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(dy)*1.05){if(dx<0&&state.screen==='assistant')show('calendar');else if(dx>0&&state.screen==='calendar')show('assistant')}},{passive:true})}
function initVoice(){
  const R=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recorder=null,stream=null,chunks=[],discard=false,fallbackRec=null,phase='idle';
  const transcript=$('#focusTranscript'),primary=$('#focusStop'),secondary=$('#focusKeyboard');
  const setText=t=>{if(transcript){transcript.value=t||'';transcript.textContent=t||''}};
  const getText=()=>String(transcript?.value||transcript?.textContent||'').trim();
  const stopTracks=()=>{try{stream?.getTracks().forEach(t=>t.stop())}catch{}stream=null};
  const cancel=()=>{discard=true;try{fallbackRec?.stop()}catch{};try{if(recorder&&recorder.state!=='inactive')recorder.stop()}catch{}stopTracks();phase='idle';closeFocus()};
  const review=text=>{
    phase='review';setText(text);transcript.readOnly=false;
    $('#focusStatus').textContent='Revisa la transcripción';
    primary.textContent='Enviar';secondary.textContent='Repetir';
    setTimeout(()=>{try{transcript.focus();transcript.setSelectionRange(transcript.value.length,transcript.value.length)}catch{}},80);
  };
  const transcribe=async(blob)=>{
    phase='transcribing';transcript.readOnly=true;$('#focusStatus').textContent='Transcribiendo…';setText('');primary.textContent='…';secondary.textContent='Cancelar';orb('thinking','Transcribiendo…');
    try{
      const text=await window.ISABELLA_AI.transcribe(blob);
      if(!text){$('#focusStatus').textContent='No entendí el audio';secondary.textContent='Repetir';primary.textContent='Cerrar';phase='empty';return}
      review(text);orb();
    }catch(err){
      $('#focusStatus').textContent='No pude transcribir';setText(err?.message||'Inténtalo de nuevo.');transcript.readOnly=true;secondary.textContent='Repetir';primary.textContent='Cerrar';phase='error';orb();
    }
  };
  const browserFallback=()=>{
    if(!R){phase='error';$('#focusStatus').textContent='Voz no disponible';setText('Puedes seguir escribiendo.');primary.textContent='Cerrar';secondary.textContent='Escribir';return}
    try{
      phase='recording';fallbackRec=new R();fallbackRec.lang='es-ES';fallbackRec.interimResults=true;let finalText='';
      fallbackRec.onresult=e=>{let interim='';for(let k=e.resultIndex;k<e.results.length;k++){const x=e.results[k][0].transcript;if(e.results[k].isFinal)finalText+=x;else interim+=x}setText((finalText+' '+interim).trim())};
      fallbackRec.onend=()=>{if(!discard&&phase==='recording')review(finalText||getText())};
      fallbackRec.onerror=()=>{phase='error';$('#focusStatus').textContent='No pude escuchar';setText('Revisa el permiso del micrófono o escribe el mensaje.');primary.textContent='Cerrar';secondary.textContent='Escribir'};
      fallbackRec.start();
    }catch{phase='error';$('#focusStatus').textContent='No pude iniciar el micrófono'}
  };
  const start=async()=>{
    discard=false;openFocus();orb('listening','Escuchando…');phase='recording';
    transcript.readOnly=true;setText('');$('#focusStatus').textContent='Escuchando…';primary.textContent='Detener';secondary.textContent='Cancelar';
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder||!window.ISABELLA_AI?.transcribe){browserFallback();return}
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const candidates=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      const mime=candidates.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
      recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);chunks=[];
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onstop=()=>{
        stopTracks();if(discard){chunks=[];return}
        const blob=new Blob(chunks,{type:recorder?.mimeType||mime||'audio/webm'});chunks=[];
        if(!blob.size){phase='empty';$('#focusStatus').textContent='No escuché audio';primary.textContent='Cerrar';secondary.textContent='Repetir';return}
        transcribe(blob);
      };
      recorder.start(250);
    }catch{stopTracks();browserFallback()}
  };
  const stop=()=>{
    if(phase==='recording'){
      try{fallbackRec?.stop()}catch{}
      if(recorder&&recorder.state!=='inactive')recorder.stop();
      return;
    }
    if(phase==='review'){
      const text=getText();if(!text)return;
      closeFocus();phase='idle';handle(text);return;
    }
    closeFocus();phase='idle';
  };
  const secondaryAction=()=>{
    if(phase==='review'||phase==='error'||phase==='empty'){discard=true;try{fallbackRec?.stop()}catch{};stopTracks();start();return}
    if(phase==='recording'||phase==='transcribing'){cancel();return}
    cancel();
  };
  $('#micButton').onclick=start;$('#orbButton').onclick=start;
  $('#focusClose').onclick=cancel;primary.onclick=stop;secondary.onclick=secondaryAction;
}
function openFocus(){$('#focusMode').classList.remove('hidden');$('#focusStatus').textContent='Escuchando…';const t=$('#focusTranscript');if(t){t.value='';t.textContent='';t.readOnly=true}}function closeFocus(){$('#focusMode').classList.add('hidden');orb()}
function startWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;return addDays(x,-day)} function weekNo(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const n=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-n);const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function move(dir){let d=fromIso(state.date);if(state.view==='day')d=addDays(d,dir);else if(state.view==='week')d=addDays(d,dir*7);else d=new Date(d.getFullYear(),d.getMonth()+dir,1);state.date=iso(d);save();renderCalendar()}
function renderCalendar(){$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));const d=fromIso(state.date);$('#calTitle').textContent=state.view==='month'?d.toLocaleDateString('es-ES',{month:'long'}):state.view==='week'?`Semana ${weekNo(d)}`:d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});if(state.view==='month')month();else if(state.view==='week')week();else day()}
function agendaRow(kind,item){
  const category=cat(item.categoryId),proj=item.projectId?' · '+project(item.projectId):'';
  const time=kind==='event'?item.start:'Todo el día';
  const color=itemColor(item);
  return `<div class="agenda-item ${kind}-item ${kind==='task'?'task-item':''}" data-kind="${kind}" data-id="${item.id}" data-date="${item.date}" tabindex="0" style="--item-color:${color}">
    <span class="adot"></span>
    <div class="agenda-main"><strong>${esc(item.title)}</strong><div class="meta">${esc(category)}${esc(proj)}</div></div>
    <div class="agenda-tail"><div class="atime">${esc(time)}</div>${kind==='task'?'<button class="drag-handle" aria-label="Mantén y arrastra para reordenar">⋮⋮</button>':''}</div>
  </div>`;
}
function month(){
  const f=fromIso(state.date),first=new Date(f.getFullYear(),f.getMonth(),1),start=startWeek(first),wd=['L','M','X','J','V','S','D'];
  let h=`<div class="month-year">${f.getFullYear()}</div><div class="month-grid"><div class="mh"></div>${wd.map(x=>`<div class="mh">${x}</div>`).join('')}`;
  for(let r=0;r<6;r++){
    const rs=addDays(start,r*7);h+=`<div class="mw">${weekNo(rs)}</div>`;
    for(let col=0;col<7;col++){
      const d=addDays(rs,col),di=iso(d),mut=d.getMonth()!==f.getMonth();
      const colors=dayColors(di);
      h+=`<button class="mc ${col>4?'weekend':''} ${mut?'muted':''} ${di===today()?'today':''} ${di===state.date?'selected':''}" data-date="${di}"><span class="mn">${d.getDate()}</span><span class="dotset">${colors.map(color=>`<i style="--item-color:${color}"></i>`).join('')}</span></button>`;
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
    h+=`<div class="wday"><div class="whead">${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>${ev.map(e=>`<button class="witem calendar-entry event-item" data-kind="event" data-id="${e.id}" data-date="${e.date}" style="--item-color:${itemColor(e)}"><b>${esc(e.start)}</b><br>${esc(e.title)}</button>`).join('')}${ta.map(t=>`<button class="witem calendar-entry task-item" data-kind="task" data-id="${t.id}" data-date="${t.date}" style="--item-color:${itemColor(t)}">○ ${esc(t.title)}</button>`).join('')}${!ev.length&&!ta.length?'<div class="meta week-free">Libre</div>':''}</div>`;
  }
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function day(){
  const ev=state.events.filter(x=>x.date===state.date),ta=state.tasks.filter(x=>x.date===state.date&&activeTask(x)).sort(taskOrder);
  let h=`<div class="day-all"><b>Todo el día</b><div>${ta.length?ta.map(t=>`<button class="pill calendar-entry task-item" data-kind="task" data-id="${t.id}" data-date="${t.date}" style="--item-color:${itemColor(t)}">${esc(t.title)}</button>`).join(''):'<span class="meta">Sin tareas</span>'}</div></div><div class="hours">`;
  for(let hr=7;hr<=22;hr++)h+=`<div class="hrow"><div class="hlabel">${pad(hr)}:00</div><div></div></div>`;
  for(const e of ev){const top=((minutes(e.start)-420)/60)*60,height=Math.max(34,(e.duration||60)-3);if(top>=0&&top<960)h+=`<button class="event calendar-entry event-item" data-kind="event" data-id="${e.id}" data-date="${e.date}" style="top:${top}px;height:${height}px;--item-color:${itemColor(e)}"><b>${esc(e.start)} ${esc(e.title)}</b><div class="meta">${esc(cat(e.categoryId))}${e.projectId?' · '+esc(project(e.projectId)):''}</div></button>`}
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function bindCalendarItems(){
  $$('.calendar-entry,.agenda-item[data-kind]').forEach(el=>{
    if(el.dataset.bound)return;el.dataset.bound='1';
    let sx=0,sy=0,moved=false;
    el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;e.stopPropagation()},{passive:true});
    el.addEventListener('touchmove',e=>{const t=e.touches[0];if(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12)moved=true;e.stopPropagation()},{passive:true});
    el.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;e.stopPropagation();if(el.dataset.dragActive==='1'||el.dataset.justDragged==='1'){el.dataset.justDragged='0';return}if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx>0&&el.dataset.kind==='task')completeTask(el.dataset.id);else if(dx<0)itemActions(el.dataset.kind,el.dataset.id);return}if(!moved&&!el.closest('.drag-handle'))editItem(el.dataset.kind,el.dataset.id)},{passive:true});
    el.addEventListener('click',e=>{if(e.detail===0||'ontouchstart' in window)return;if(e.target.closest('.drag-handle'))return;editItem(el.dataset.kind,el.dataset.id)});
  });
  initTaskDrag();
  initEventDrag();
}
function itemBy(kind,id){return (kind==='task'?state.tasks:state.events).find(x=>x.id===id)}
function itemActions(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const archive=kind==='task'?'<button id="quickArchive" class="sheet-action">Archivar</button>':'';
  const complete=kind==='task'?'<button id="quickComplete" class="sheet-action">Marcar como hecha</button>':'';
  modal(item.title,`<div class="sheet-actions">${complete}<button id="quickEdit" class="sheet-action">Editar / mover</button><button id="quickDuplicate" class="sheet-action">Duplicar</button>${archive}<button id="quickDelete" class="sheet-action danger">Eliminar</button></div>`);
  $('#quickEdit').onclick=()=>editItem(kind,id);
  $('#quickDuplicate').onclick=()=>duplicateItem(kind,id);
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
function duplicateItem(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const copy=clone(item);copy.id=uid();copy.title=item.title;copy.metadata={...(copy.metadata||{}),source:'manual-duplicate'};
  if(kind==='task'){copy.done=false;copy.completedAt=null;copy.archivedAt=null;copy.sortOrder=nextTaskOrder(copy.date);state.tasks.push(copy)}
  else state.events.push(copy);
  mutation(kind,'create',null,copy,'manual');save();renderCalendar();closeModal();
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
  $$('.task-item[data-date]').forEach(row=>{
    if(row.dataset.dragBound)return;
    row.dataset.dragBound='1';
    let timer=null,active=false,startY=0,lastY=0,beforeOrder=[];
    const taskSiblings=()=>$$('.task-item[data-date="'+row.dataset.date+'"]').filter(x=>x.parentNode===row.parentNode);
    const finish=()=>{
      clearTimeout(timer);timer=null;
      if(!active)return;
      active=false;
      row.dataset.dragActive='0';
      row.classList.remove('dragging');
      row.dataset.justDragged='1';
      setTimeout(()=>{row.dataset.justDragged='0'},180);
      const ids=taskSiblings().map(x=>x.dataset.id);
      ids.forEach((id,i)=>{const t=state.tasks.find(x=>x.id===id);if(t)t.sortOrder=(i+1)*10});
      if(ids.join('|')!==beforeOrder.join('|'))mutation('task','reorder',{id:row.dataset.id,date:row.dataset.date,order:beforeOrder},{id:row.dataset.id,date:row.dataset.date,order:ids},'manual');
      save();renderCalendar();
    };
    row.addEventListener('touchstart',ev=>{
      if(ev.touches.length!==1)return;
      if(ev.target.closest('input,select,textarea'))return;
      const t=ev.touches[0];startY=lastY=t.clientY;active=false;
      beforeOrder=taskSiblings().map(x=>x.dataset.id);
      timer=setTimeout(()=>{
        active=true;row.dataset.dragActive='1';row.classList.add('dragging');
        try{navigator.vibrate?.(8)}catch{}
      },260);
    },{passive:true});
    row.addEventListener('touchmove',ev=>{
      if(ev.touches.length!==1)return;
      const t=ev.touches[0];lastY=t.clientY;
      if(!active){
        if(Math.abs(lastY-startY)>10){clearTimeout(timer);timer=null}
        return;
      }
      ev.preventDefault();ev.stopPropagation();
      const siblings=taskSiblings().filter(x=>x!==row);
      let before=null;
      for(const el of siblings){const r=el.getBoundingClientRect();if(lastY<r.top+r.height/2){before=el;break}}
      if(before)row.parentNode.insertBefore(row,before);
      else{
        const last=siblings[siblings.length-1];
        if(last&&last.nextSibling)row.parentNode.insertBefore(row,last.nextSibling);else row.parentNode.appendChild(row);
      }
    },{passive:false});
    row.addEventListener('touchend',finish,{passive:true});
    row.addEventListener('touchcancel',finish,{passive:true});
  });
}
function initEventDrag(){
  $$('.hours .event-item[data-kind="event"]').forEach(row=>{
    if(row.dataset.eventDragBound)return;
    row.dataset.eventDragBound='1';
    let timer=null,active=false,startY=0,startTop=0,before=null;
    const hours=row.closest('.hours');
    const finish=()=>{
      clearTimeout(timer);timer=null;
      if(!active)return;
      active=false;row.dataset.dragActive='0';row.classList.remove('dragging');
      const top=Math.max(0,Math.min(945,parseFloat(row.style.top)||0));
      const mins=Math.round((420+top)/15)*15;
      const hr=Math.floor(mins/60),mn=mins%60;
      const item=itemBy('event',row.dataset.id);
      if(item){
        const next=`${pad(hr)}:${pad(mn)}`;
        if(next!==item.start){
          const old=before||clone(item);item.start=next;
          mutation('event','update',old,item,'manual');save();
        }
      }
      row.dataset.justDragged='1';setTimeout(()=>{row.dataset.justDragged='0'},180);
      renderCalendar();
    };
    row.addEventListener('touchstart',ev=>{
      if(ev.touches.length!==1)return;
      const t=ev.touches[0];startY=t.clientY;startTop=parseFloat(row.style.top)||0;before=clone(itemBy('event',row.dataset.id));
      timer=setTimeout(()=>{active=true;row.dataset.dragActive='1';row.classList.add('dragging');try{navigator.vibrate?.(8)}catch{}},260);
    },{passive:true});
    row.addEventListener('touchmove',ev=>{
      if(ev.touches.length!==1)return;
      const t=ev.touches[0],dy=t.clientY-startY;
      if(!active){if(Math.abs(dy)>10){clearTimeout(timer);timer=null}return}
      ev.preventDefault();ev.stopPropagation();
      const top=Math.max(0,Math.min(945,startTop+dy));
      row.style.top=Math.round(top/15)*15+'px';
    },{passive:false});
    row.addEventListener('touchend',finish,{passive:true});
    row.addEventListener('touchcancel',finish,{passive:true});
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
function memoryPanel(){
  const items=(state.memory||[]).filter(m=>typeof m!=='object'||m.status!=='deleted');
  const body=items.length?items.map((m,i)=>{
    const text=typeof m==='object'?m.content:String(m),kind=typeof m==='object'?(m.kind||'context'):'context';
    const id=typeof m==='object'?(m.id||String(i)):String(i);
    return `<div class="memory-row"><div class="row-main"><div>${esc(text)}</div><div class="small">${esc(kind)}</div></div><button data-memory-edit="${esc(id)}">Editar</button><button data-memory-delete="${esc(id)}">×</button></div>`;
  }).join(''):'<div class="small">Todavía no he guardado memoria personal.</div>';
  modal('Lo que Isabella sabe de mí',body);
  $$('[data-memory-edit]').forEach(b=>b.onclick=()=>editMemory(b.dataset.memoryEdit));
  $$('[data-memory-delete]').forEach(b=>b.onclick=()=>deleteMemory(b.dataset.memoryDelete));
}
function memoryById(id){
  return (state.memory||[]).find((m,i)=>String(typeof m==='object'?(m.id||i):i)===String(id));
}
function editMemory(id){
  const m=memoryById(id);if(!m)return;
  const obj=typeof m==='object'?m:{id,kind:'context',content:String(m),status:'active',confidence:1,source:'manual'};
  modal('Editar recuerdo',`<div class="form"><label>Contenido<textarea id="memoryText" rows="5">${esc(obj.content||'')}</textarea></label><label>Tipo<select id="memoryKind">${['fact','person','routine','episodic','preference','context'].map(k=>`<option value="${k}" ${k===obj.kind?'selected':''}>${k}</option>`).join('')}</select></label><button id="memorySave" class="primary">Guardar</button><button id="memoryDeleteFromEdit" class="secondary danger-text">Eliminar recuerdo</button></div>`);
  $('#memorySave').onclick=()=>{
    if(typeof m!=='object'){const idx=state.memory.indexOf(m);state.memory[idx]=obj}
    obj.content=$('#memoryText').value.trim()||obj.content;obj.kind=$('#memoryKind').value;obj.status='active';obj.source=obj.source||'manual';save();memoryPanel();
  };
  $('#memoryDeleteFromEdit').onclick=()=>deleteMemory(id);
}
function deleteMemory(id){
  const m=memoryById(id);if(!m)return;
  if(typeof m==='object'){m.status='deleted'}else{const idx=state.memory.indexOf(m);state.memory[idx]={id:uid(),kind:'context',content:String(m),status:'deleted',confidence:1,source:'manual'}}
  save();memoryPanel();
}
function categoriesPanel(){
  const rows=state.categories.map(x=>`<div class="settings-row color-row"><input type="color" data-cat-color="${x.id}" value="${esc(x.color||fallbackColor(x.id))}" aria-label="Color"><input data-cat-name="${x.id}" value="${esc(x.name)}"><button data-cat-delete="${x.id}" aria-label="Eliminar">×</button></div>`).join('');
  const prows=state.projects.map(x=>`<div class="settings-row project-color-row"><input type="color" data-project-color="${x.id}" value="${esc(x.color||fallbackColor(x.id))}" aria-label="Color"><input data-project-name="${x.id}" value="${esc(x.name)}"><select data-project-cat="${x.id}">${state.categories.map(cat=>`<option value="${cat.id}" ${cat.id===x.categoryId?'selected':''}>${esc(cat.name)}</option>`).join('')}</select><button data-project-delete="${x.id}" aria-label="Eliminar">×</button></div>`).join('');
  modal('Categorías y proyectos',`<div class="small section-label">Categorías</div><div id="categoryRows">${rows}</div><button id="addCategory" class="secondary settings-add">+ Categoría</button><div class="small section-label settings-projects-title">Proyectos</div><div id="projectRows">${prows}</div><button id="addProject" class="secondary settings-add">+ Proyecto</button><button id="saveTaxonomy" class="primary settings-save">Guardar cambios</button>`);
  $('#addCategory').onclick=()=>{const id=uid();state.categories.push({id,name:'Nueva categoría',color:fallbackColor(id)});save();categoriesPanel()};
  $('#addProject').onclick=()=>{const id=uid();state.projects.push({id,categoryId:state.categories[0]?.id||'personal',name:'Nuevo proyecto',color:fallbackColor(id)});save();categoriesPanel()};
  $$('[data-cat-delete]').forEach(b=>b.onclick=()=>{const id=b.dataset.catDelete;if(state.categories.length<=1)return;state.categories=state.categories.filter(x=>x.id!==id);state.projects.forEach(p=>{if(p.categoryId===id)p.categoryId=state.categories[0]?.id||'personal'});state.tasks.forEach(t=>{if(t.categoryId===id)t.categoryId='personal'});state.events.forEach(e=>{if(e.categoryId===id)e.categoryId='personal'});save();categoriesPanel()});
  $$('[data-project-delete]').forEach(b=>b.onclick=()=>{const id=b.dataset.projectDelete;state.projects=state.projects.filter(x=>x.id!==id);state.tasks.forEach(t=>{if(t.projectId===id)t.projectId=null});state.events.forEach(e=>{if(e.projectId===id)e.projectId=null});save();categoriesPanel()});
  $('#saveTaxonomy').onclick=()=>{
    $$('[data-cat-name]').forEach(i=>{const x=state.categories.find(c=>c.id===i.dataset.catName);if(x&&i.value.trim())x.name=i.value.trim()});
    $$('[data-cat-color]').forEach(i=>{const x=state.categories.find(c=>c.id===i.dataset.catColor);if(x)x.color=i.value});
    $$('[data-project-name]').forEach(i=>{const x=state.projects.find(p=>p.id===i.dataset.projectName);if(x&&i.value.trim())x.name=i.value.trim()});
    $$('[data-project-color]').forEach(i=>{const x=state.projects.find(p=>p.id===i.dataset.projectColor);if(x)x.color=i.value});
    $$('[data-project-cat]').forEach(i=>{const x=state.projects.find(p=>p.id===i.dataset.projectCat);if(x)x.categoryId=i.value});
    save();renderCalendar();closeModal();
  };
}
window.ISABELLA_APP={
  getState:()=>JSON.parse(JSON.stringify(state)),
  replaceState:(next)=>{state={...base,...next};state.messages=normalizeMessages(state.messages);save();renderMessages(true);renderToday();renderCalendar();show(state.screen||'assistant')},
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