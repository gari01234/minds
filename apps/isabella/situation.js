/* Ahora · Avisos: the source-backed signals that need Gari and are not tasks.
   Tasks of the day live in «Hoy» (the same canonical tasks as the calendar);
   proposals to confirm live in the Bandeja. This block stays empty when all is clear. */
(()=>{
'use strict';
let generation=0;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const displayDay=s=>{const m=String(s||'').match(/^(\d{4})-(\d\d)-(\d\d)/);return m?[m[3],m[2],m[1]].join('.'):'sin fecha'};
const CAP=60;
function normalized(p){
  if(p?.status!=='fulfilled'||p.value?.error)return {ok:false,data:[],count:null};
  return {ok:true,data:Array.isArray(p.value.data)?p.value.data:[],count:p.value.count??null};
}
function row(x,key){
  return '<div class="situation-item situation-'+key+'"><strong>'+esc(x.title)+'</strong><small>'+esc(x.detail)+'</small></div>';
}
function creditRow(s){
  const M=window.MINDS_CREDIT_MODEL;
  if(!s||!M||!['low','critical','empty'].includes(s.level))return '';
  const title=s.level==='empty'?'Saldo de OpenAI agotado (estimado)':s.level==='critical'?'Saldo de OpenAI casi agotado':'Saldo de OpenAI bajo';
  const detail=s.level==='empty'?'Recárgalo en OpenAI → Billing y actualiza el saldo':'≈ '+M.money(s.remaining)+(s.daysLeft!==Infinity?' · unos '+M.daysText(s.daysLeft)+' al ritmo actual':'')+' · Ver uso';
  return '<button type="button" class="situation-item situation-credit is-'+esc(s.level)+'" data-situation-credit><strong>Saldo de IA · '+esc(title)+'</strong><small>'+esc(detail)+'</small></button>';
}
async function render(){
  const el=$('#situationLedger');if(!el)return;
  const version=++generation;
  const sb=window.MINDS_SUPABASE;
  if(!sb){el.innerHTML='<p class="situation-unavailable">La memoria de MINDS no está disponible: no puedo comprobar avisos ni la Bandeja.</p>';return}
  let user='';
  try{const {data,error}=await sb.auth.getSession();if(error)throw error;user=data?.session?.user?.id||''}catch{}
  if(version!==generation)return;
  if(!user){el.innerHTML='<p class="situation-unavailable">Memoria no conectada: solo ves lo guardado en este dispositivo. No puedo comprobar avisos ni la Bandeja.</p>';return}
  const now=new Date(),withinWeek=new Date(now.getTime()+7*86400000).toISOString();
  const queries=[
    sb.from('minds_expectations').select('id,title,due_at,status,observability',{count:'exact'}).eq('user_id',user).in('status',['active','due_unconfirmed']).lte('due_at',withinWeek).order('due_at',{ascending:true}).limit(CAP),
    sb.from('minds_attention_events').select('id,title,reason,deadline_at,route,created_at',{count:'exact'}).eq('user_id',user).eq('requires_user',true).is('consumed_at',null).in('status',['pending','delivered']).order('created_at',{ascending:false}).limit(CAP),
    sb.from('minds_shadow_decisions').select('request_id',{count:'exact',head:true}).eq('user_id',user).eq('status','pending')
  ];
  // The credit estimate is a MINDS signal too: shown only when it needs attention.
  const creditCheck=Promise.resolve(window.MINDS_CREDIT?.status?.()).catch(()=>null);
  const [b,c,d]=await Promise.allSettled(queries);
  const credit=await creditCheck;
  if(version!==generation)return;
  const expectations=normalized(b),attention=normalized(c),reviews=normalized(d);
  const sources=[expectations,attention,reviews],checked=sources.filter(x=>x.ok).length;
  const rowsExpect=expectations.data.map(x=>({title:x.title||'Confirmación esperada',detail:(x.status==='due_unconfirmed'?'Vencida, ocurrencia no confirmada':'Próxima comprobación')+' · '+displayDay(x.due_at)}));
  const rowsAttention=attention.data.map(x=>({title:x.title||'Necesita atención',detail:(x.route||'Atención')+(x.deadline_at?' · '+displayDay(x.deadline_at):'')+(x.reason?' · '+x.reason:'')}));
  const pendingReviews=Number(reviews.count??0);
  const rows=[creditRow(credit),...rowsAttention.map(x=>row(x,'attention')),...rowsExpect.map(x=>row(x,'expectation')),
    pendingReviews?'<button type="button" class="situation-item situation-reviews" data-situation-reviews><strong>'+esc(pendingReviews+(pendingReviews===1?' propuesta de acción espera':' propuestas de acción esperan')+' tu confirmación')+'</strong><small>Revisiones</small></button>':''].filter(Boolean);
  const partial=checked<sources.length?'<p class="situation-coverage">Cobertura parcial: '+checked+' de tres fuentes comprobadas. No pude comprobar: '+
    [expectations.ok?'':'respuestas esperadas',attention.ok?'':'avisos',reviews.ok?'':'revisiones'].filter(Boolean).join(', ')+'. Una omisión de MINDS no equivale a ausencia de obligaciones.</p>':'';
  el.innerHTML=rows.length||partial?'<section class="situation-group ahora-avisos" aria-labelledby="ahoraAvisosTitle"><h2 id="ahoraAvisosTitle" class="ahora-label">Avisos</h2>'+(rows.length?'<div class="ahora-card ahora-avisos-list">'+rows.join('')+'</div>':'')+partial+'</section>':'';
  el.querySelector?.('[data-situation-credit]')?.addEventListener('click',()=>window.ISABELLA_APP?.openAiUsage?.());
  el.querySelector?.('[data-situation-reviews]')?.addEventListener('click',()=>document.querySelector('#drawer [data-action="reviews"]')?.click());
}
window.MINDS_SITUATION={render};
})();
