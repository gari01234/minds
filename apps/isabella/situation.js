/* Build 90.2 — read-only canonical situation lens, not a generated Feed */
(()=>{
'use strict';
let generation=0;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const displayDay=s=>{const m=String(s||'').match(/^(\d{4})-(\d\d)-(\d\d)/);return m?[m[3],m[2],m[1]].join('.'):'sin fecha'};
const CAP=60;
function normalized(p){
  if(p?.status!=='fulfilled'||p.value?.error)return {ok:false,data:[],count:null};
  return {ok:true,data:Array.isArray(p.value.data)?p.value.data:[],count:p.value.count??null};
}
function projectName(id){return String((window.ISABELLA_STATE?.projects||[]).find(x=>x.id===id)?.name||'')}
function section(label,items,zero,key,ok){
  const rows=items.length?items.map(x=>key==='task'&&x.id?'<button type="button" class="situation-item situation-task situation-editable" data-situation-task="'+esc(x.id)+'"><strong>'+esc(x.title)+'</strong><small>'+esc(x.detail)+'</small></button>':'<div class="situation-item situation-'+key+'"><strong>'+esc(x.title)+'</strong><small>'+esc(x.detail)+'</small></div>').join(''):'<p class="situation-zero">'+esc(ok?zero:'Esta fuente no pudo comprobarse.')+'</p>';
  return '<section class="situation-group"><h3>'+esc(label)+'</h3>'+rows+'</section>';
}
async function render(){
  const el=$('#situationLedger');if(!el)return;
  const version=++generation;
  el.innerHTML='<p class="situation-loading">Comprobando tareas y señales registradas…</p>';
  const sb=window.MINDS_SUPABASE;
  if(!sb){el.innerHTML='<p class="situation-unavailable">La memoria de MINDS no está disponible. No puedo verificar tus pendientes.</p>';return}
  let user='';
  try{const {data,error}=await sb.auth.getSession();if(error)throw error;user=data?.session?.user?.id||''}catch{}
  if(version!==generation)return;
  if(!user){el.innerHTML='<p class="situation-unavailable">Memoria no conectada: no puedo comprobar pendientes. Las sugerencias de abajo no son un inventario.</p>';return}
  const now=new Date(),today=localDay(now),withinWeek=new Date(now.getTime()+7*86400000).toISOString();
  const queries=[
    sb.from('isabella_tasks').select('id,title,due_date,project_id',{count:'exact'}).eq('user_id',user).is('completed_at',null).is('archived_at',null).not('due_date','is',null).lte('due_date',today).order('due_date',{ascending:true}).limit(CAP),
    sb.from('minds_expectations').select('id,title,due_at,status,observability',{count:'exact'}).eq('user_id',user).in('status',['active','due_unconfirmed']).lte('due_at',withinWeek).order('due_at',{ascending:true}).limit(CAP),
    sb.from('minds_attention_events').select('id,title,reason,deadline_at,route,created_at',{count:'exact'}).eq('user_id',user).eq('requires_user',true).is('consumed_at',null).in('status',['pending','delivered']).order('created_at',{ascending:false}).limit(CAP),
    sb.from('minds_shadow_decisions').select('request_id',{count:'exact',head:true}).eq('user_id',user).eq('status','pending')
  ];
  const [a,b,c,d]=await Promise.allSettled(queries);
  if(version!==generation)return;
  const tasks=normalized(a),expectations=normalized(b),attention=normalized(c),reviews=normalized(d);
  const checked=[tasks,expectations,attention,reviews].filter(x=>x.ok).length;
  const rowsTask=tasks.data.map(t=>({id:t.id,title:t.title||'Tarea sin título',detail:(t.due_date<today?'Vencida':'Para hoy')+' · '+displayDay(t.due_date)+(projectName(t.project_id)?' · '+projectName(t.project_id):'')}));
  const rowsExpect=expectations.data.map(x=>({title:x.title||'Confirmación esperada',detail:(x.status==='due_unconfirmed'?'Vencida, ocurrencia no confirmada':'Próxima comprobación')+' · '+displayDay(x.due_at)}));
  const rowsAttention=attention.data.map(x=>({title:x.title||'Necesita atención',detail:(x.route||'Atención')+(x.deadline_at?' · '+displayDay(x.deadline_at):'')+(x.reason?' · '+x.reason:'')}));
  const truncated=[tasks,expectations,attention].some(x=>x.ok&&x.count!==null&&x.count>x.data.length);
  const note=checked===4?'Cuatro fuentes consultadas':'Cobertura parcial: '+checked+' de cuatro fuentes comprobadas';
  const reviewLabel=reviews.ok?String(reviews.count??0)+' propuestas de acción pendientes de confirmar':'Propuestas pendientes: fuente no disponible';
  const empty=rowsTask.length+rowsExpect.length+rowsAttention.length===0;
  el.innerHTML='<div class="situation-heading"><div><span class="situation-kicker">REGISTROS DE MINDS</span><h2>Ahora</h2></div><button type="button" data-situation-calendar>Calendario ↗</button></div>'+
    '<p class="situation-coverage">'+esc(note+(truncated?' · Hay más resultados que los mostrados':'')+' · '+now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}))+'</p>'+
    section('Tareas para hoy y vencidas',rowsTask,'Sin tareas fechadas en esta consulta.','task',tasks.ok)+
    section('Respuestas por comprobar',rowsExpect,'Sin Expectations próximas o sin confirmar.','expectation',expectations.ok)+
    section('Atención que requiere respuesta',rowsAttention,'Sin avisos sin consumir en esta consulta.','attention',attention.ok)+
    '<div class="situation-reviews">'+esc(reviewLabel)+'</div>'+
    (empty?'<p class="situation-caution">No aparecen elementos en las fuentes consultadas. Esto no certifica que no existan otros pendientes.</p>':'')+
    '<p class="situation-limit">Cobertura limitada a tareas fechadas hasta hoy, Expectations próximas, avisos que requieren respuesta y propuestas de acción pendientes. No incluye todas las conversaciones, obligaciones sin fecha ni fuentes externas no conectadas. Una omisión de MINDS no equivale a ausencia de obligaciones.</p>';
  el.querySelector('[data-situation-calendar]')?.addEventListener('click',()=>document.querySelector('.main-nav-item[data-nav="calendar"]')?.click());
  (el.querySelectorAll?.('[data-situation-task]')||[]).forEach(button=>button.addEventListener('click',()=>window.ISABELLA_APP?.editTaskById?.(button.dataset.situationTask)));
}
window.MINDS_SITUATION={render};
})();