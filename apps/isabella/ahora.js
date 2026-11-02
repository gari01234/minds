/* Ahora · your day. The same canonical tasks and events as the calendar, seen in one column:
   what is coming (Fristen and Termine), the selected day with its tasks, and a line to the Bandeja.
   No second task list: ticking or opening a task here is the calendar's own action. */
(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const M=()=>window.MINDS_DESK_MODEL;
const APP=()=>window.ISABELLA_APP;
const SESSION_KIND='task_work_session_v1';
const NEXT_DAYS=14,NEXT_MAX=5;
let offset=0,fristen={rows:[],at:0,loading:null,ok:false},renderQueued=0;

const todayKey=()=>M().dayKey(new Date());
const cap=t=>t?t.charAt(0).toUpperCase()+t.slice(1):'';
const shortMonth=d=>d.toLocaleDateString('es-ES',{day:'numeric',month:'short'}).replace('.','');
function dayWord(key,today){
  const n=dayDiff(today,key);
  return n===0?'Hoy':n===1?'Mañana':n===-1?'Ayer':'';
}
function dayDiff(from,to){return Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/864e5)}
function dayTitle(key,today){
  const d=M().dateFromKey(key);if(!d)return key;
  const word=dayWord(key,today),rest=d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'short'}).replace(',','').replace('.','');
  return word?word+' · '+rest:cap(rest);
}
function nameOf(list,id){return (list||[]).find(x=>x.id===id)?.name||''}
function minutesText(min){const n=Number(min);if(!Number.isFinite(n)||n<=0)return '';return n%60===0?(n/60)+' h':n>60?Math.floor(n/60)+' h '+(n%60)+' min':n+' min'}
function isSession(e){return e?.metadata?.kind===SESSION_KIND}

// Confirmed Fristen of every project, from today on (the calendar shows the same ones).
function loadFristen(force=false){
  const sb=window.MINDS_SUPABASE;
  if(!sb)return Promise.resolve();
  if(fristen.loading)return fristen.loading;
  if(!force&&Date.now()-fristen.at<5*60000)return Promise.resolve();
  const today=todayKey();
  fristen.loading=Promise.resolve(sb.from('minds_work_memory').select('id,title,occurred_at,project_id,isabella_projects(name,client_key)')
    .eq('memory_type','deadline').eq('status','confirmed').gte('occurred_at',today).order('occurred_at',{ascending:true}).limit(12))
    .then(({data,error})=>{
      fristen.at=Date.now();fristen.ok=!error;
      if(!error)fristen.rows=(data||[]).filter(r=>r.occurred_at).map(r=>({id:r.id,title:r.title||'Frist',date:String(r.occurred_at).slice(0,10),project:r.isabella_projects?.name||'',projectKey:r.isabella_projects?.client_key||''}));
    },()=>{fristen.at=Date.now();fristen.ok=false})
    .finally(()=>{fristen.loading=null});
  return fristen.loading;
}

function nextItems(state,today){
  const end=M().addDays(today,NEXT_DAYS),tomorrow=M().addDays(today,1);
  const deadlines=fristen.rows.filter(f=>f.date>=today&&f.date<=end).map(f=>({kind:'frist',date:f.date,order:0,f}));
  // Today's Termine are in the day list below; Próximo starts tomorrow for them.
  const events=(state.events||[]).filter(e=>e.date>=tomorrow&&e.date<=end&&!isSession(e))
    .map(e=>({kind:'termin',date:e.date,order:1,time:e.allDay?'':String(e.start||''),e}));
  return [...deadlines,...events].sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||String(a.time||'').localeCompare(String(b.time||''))).slice(0,NEXT_MAX);
}
function nextRow(item,state,today){
  const n=dayDiff(today,item.date),d=M().dateFromKey(item.date);
  const weekday=d?d.toLocaleDateString('es-ES',{weekday:'short'}).replace('.',''):'';
  const when=n===0?'hoy':n===1?'mañana':weekday;
  if(item.kind==='frist'){
    const f=item.f,big=n===0?'Hoy':String(n),small=n===0?'':n===1?'día':'días';
    return '<button type="button" class="ahora-row ahora-next-row" data-ahora-frist="'+esc(f.projectKey)+'">'+
      '<span class="ahora-badge is-frist"><strong>'+esc(big)+'</strong>'+(small?'<span>'+esc(small)+'</span>':'')+'</span>'+
      '<span class="ahora-row-main"><span class="ahora-kind is-frist">Frist</span><strong>'+esc(f.title)+'</strong><small>'+esc([f.project,weekday+' '+(d?String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.':'')].filter(Boolean).join(' · '))+'</small></span></button>';
  }
  const e=item.e,meta=[e.projectId?nameOf(state.projects,e.projectId):'',e.allDay?'Todo el día':minutesText(e.duration)].filter(Boolean).join(' · ');
  return '<button type="button" class="ahora-row ahora-next-row" data-ahora-event="'+esc(e.id)+'">'+
    '<span class="ahora-badge is-termin"><strong>'+esc(item.time||'·')+'</strong><span>'+esc(when)+'</span></span>'+
    '<span class="ahora-row-main"><span class="ahora-kind is-termin">Termin</span><strong>'+esc(e.title||'Termin')+'</strong>'+(meta?'<small>'+esc(meta)+'</small>':'')+'</span></button>';
}

function taskMeta(task,state,key){
  const bits=[nameOf(state.categories,task.categoryId),task.projectId?nameOf(state.projects,task.projectId):''];
  if(M().spansDay(task,key)){const d=M().dateFromKey(task.date);if(d)bits.push('en curso hasta '+shortMonth(d))}
  if(task.reminderTime&&task.date===key)bits.push('Recordatorio '+task.reminderTime);
  return bits.filter(Boolean).join(' · ');
}
function taskRow(task,sessions,state,key,today,overdue=false){
  const done=!!task.done,span=!done&&M().spansDay(task,key);
  const d=overdue?M().dateFromKey(task.date):null;
  const label=done?'Hecha':overdue?'Vencida'+(d?' · '+String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.':''):span?'En curso':dayWord(key,today);
  const chips=(sessions||[]).map(s=>'<span class="ahora-session">'+esc([s.start,minutesText(s.duration)?minutesText(s.duration)+' reservados':''].filter(Boolean).join(' · ')||'Tiempo reservado')+'</span>').join('');
  return '<div class="ahora-row ahora-task'+(done?' is-done':'')+(overdue?' is-overdue':'')+'">'+
    '<button type="button" class="ahora-check'+(done?' is-checked':'')+'" data-ahora-toggle="'+esc(task.id)+'" aria-pressed="'+String(done)+'" aria-label="'+esc((done?'Reabrir ':'Marcar como hecha ')+(task.title||'tarea'))+'">'+(done?'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')+'</button>'+
    '<button type="button" class="ahora-row-main" data-ahora-task="'+esc(task.id)+'" aria-label="'+esc('Abrir '+(task.title||'tarea'))+'"><strong>'+esc(task.title||'Tarea sin título')+'</strong>'+
      (taskMeta(task,state,key)?'<small>'+esc(taskMeta(task,state,key))+'</small>':'')+chips+'</button>'+
    (label?'<span class="ahora-state">'+esc(label)+'</span>':'')+'</div>';
}
function eventRow(e,state){
  const meta=[e.projectId?nameOf(state.projects,e.projectId):nameOf(state.categories,e.categoryId),e.allDay?'':minutesText(e.duration)].filter(Boolean).join(' · ');
  return '<button type="button" class="ahora-row ahora-event" data-ahora-event="'+esc(e.id)+'">'+
    '<span class="ahora-badge is-termin"><strong>'+esc(e.allDay?'Día':String(e.start||'·'))+'</strong></span>'+
    '<span class="ahora-row-main"><strong>'+esc(e.title||'Termin')+'</strong>'+(meta?'<small>'+esc(meta)+'</small>':'')+'</span></button>';
}

function bandejaLine(){
  const el=$('#ahoraBandejaLink');if(!el)return;
  const n=Number(window.MINDS_BANDEJA?.lastCount?.());
  if(!Number.isFinite(n)||n<=0){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');
  el.innerHTML='<span><strong>'+esc(n+' por confirmar')+'</strong> en la Bandeja</span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function paint(){
  const day=$('#ahoraDay'),next=$('#ahoraNext');if(!day||!next||!M()||!APP())return;
  const state=APP().getState(),today=todayKey(),key=M().addDays(today,offset);
  const dateEl=$('#ahoraDate');if(dateEl)dateEl.textContent=cap(new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}));
  bandejaLine();

  const upcoming=nextItems(state,today);
  next.classList.remove('hidden');
  next.innerHTML='<h2 id="ahoraNextTitle" class="ahora-label">Próximo</h2>'+
    (upcoming.length?'<div class="ahora-card">'+upcoming.map(x=>nextRow(x,state,today)).join('')+'</div>'
      :'<p class="ahora-empty">'+(fristen.ok||!window.MINDS_SUPABASE?'Sin Fristen ni citas en los próximos 14 días.':'Sin citas en los próximos 14 días. No pude comprobar las Fristen.')+'</p>');

  const groups=M().monthAgendaGroups(state,key);
  const events=groups.events.filter(e=>!isSession(e));
  const overdue=key===today?(state.tasks||[]).filter(t=>!t.done&&!t.archivedAt&&t.date&&t.date<today&&!M().spansDay(t,today)).sort((a,b)=>String(a.date).localeCompare(String(b.date))):[];
  const rows=[...events.map(e=>eventRow(e,state)),
    ...overdue.map(t=>taskRow(t,[],state,key,today,true)),
    ...groups.tasks.map(g=>taskRow(g.task,g.sessions,state,key,today))];
  day.innerHTML='<div class="ahora-day-head"><h2 id="ahoraDayTitle" class="ahora-label">'+esc(dayTitle(key,today))+'</h2><div class="ahora-day-nav">'+
      (offset!==0?'<button type="button" class="ahora-text-button" data-ahora-day="today">Hoy</button>':'')+
      '<button type="button" class="ahora-round" data-ahora-day="-1" aria-label="Día anterior"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
      '<button type="button" class="ahora-round" data-ahora-day="1" aria-label="Día siguiente"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>'+
    '<div class="ahora-card">'+(rows.length?rows.join(''):'<p class="ahora-empty ahora-empty-inline">'+(offset===0?'Nada para hoy en tu calendario.':'Nada para este día en tu calendario.')+'</p>')+
      '<button type="button" class="ahora-add" data-ahora-add="'+esc(key)+'"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Añadir tarea</button></div>';
}

async function render(options={}){
  paint();
  void window.MINDS_SITUATION?.render?.();
  window.MINDS_BANDEJA?.refreshCount?.();
  const before=JSON.stringify(fristen.rows);
  await loadFristen(!!options.fresh);
  if(JSON.stringify(fristen.rows)!==before||options.fresh)paint();
}
function queue(){
  if(document.body?.dataset?.section!=='feed')return;
  clearTimeout(renderQueued);renderQueued=setTimeout(paint,120);
}
function bind(){
  const screen=$('#feedScreen');if(!screen||screen.dataset.ahoraBound)return;screen.dataset.ahoraBound='1';
  screen.addEventListener('click',e=>{
    const t=e.target.closest?.('[data-ahora-toggle],[data-ahora-task],[data-ahora-event],[data-ahora-frist],[data-ahora-day],[data-ahora-add],#ahoraBandejaLink');if(!t)return;
    if(t.id==='ahoraBandejaLink'){APP()?.show?.('bandeja',{view:'confirm'});return}
    if(t.dataset.ahoraToggle){APP()?.toggleTaskById?.(t.dataset.ahoraToggle);paint();return}
    if(t.dataset.ahoraTask){APP()?.editTaskById?.(t.dataset.ahoraTask);return}
    if(t.dataset.ahoraEvent){APP()?.editEventById?.(t.dataset.ahoraEvent);return}
    if(t.dataset.ahoraFrist!==undefined){if(t.dataset.ahoraFrist)window.MINDS_WORK?.open?.(t.dataset.ahoraFrist,'overview');APP()?.show?.('work');return}
    if(t.dataset.ahoraDay){offset=t.dataset.ahoraDay==='today'?0:Math.max(-30,Math.min(60,offset+Number(t.dataset.ahoraDay)));paint();return}
    if(t.dataset.ahoraAdd){APP()?.openNewItem?.(t.dataset.ahoraAdd);return}
  });
  window.addEventListener('isabella:state',queue);
  window.addEventListener('minds:bandeja-count',()=>{if(document.body?.dataset?.section==='feed')bandejaLine()});
}
window.MINDS_AHORA={render:(options)=>{bind();return render(options)},paint};
})();
