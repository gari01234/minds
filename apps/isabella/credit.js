/* MINDS · OpenAI credit: estimated balance, daily spend and the low-credit signal.
   Reads only the owner's rows (RLS). The balance is what Gari last saw in OpenAI Billing;
   spend since then is estimated from MINDS' own usage log with OpenAI list prices. */
(()=>{
'use strict';
const KEY='ai_credit',CACHE_MS=5*60*1000,HISTORY_DAYS=14;
const LABELS={isabella_chat:'Chat Isabella',isabella_background:'Procesos de Isabella',isabella_embedding:'Memoria semántica',
  decision_router:'Router adaptativo',memory_flush:'Checkpoint de memoria',work_file_read:'Lectura Work',work_source_extraction:'Lectura de fuentes Work',
  situational_feed:'Feed',feed_detail:'Detalle del Feed',ideas_generation:'Ideas',idea_worker:'Trabajos de Ideas',artifact_image:'Imágenes',
  sofia_chat:'Chat Sofía',sofia_background:'Procesos de Sofía',sofia_memory_flush:'Memoria de Sofía',research:'Investigación',research_discovery:'Investigación',
  routine:'Rutinas',window_review:'Revisión de Window',akte_pflege:'Akte-Pflege nocturna',window_code:'Preparación de código de Window',
  capability_general_execution:'Capacidades',model_independence_probe:'Pruebas de modelo'};
let cache=null,cacheAt=0,inflight=null;
const model=()=>window.MINDS_CREDIT_MODEL;
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const label=k=>LABELS[k]||String(k||'Otro').replace(/_/g,' ');
async function session(sb){const {data,error}=await sb.auth.getSession();if(error)throw error;return data?.session?.user?.id||''}
async function paged(build,max=10){
  const out=[];
  for(let page=0;page<max;page++){
    const {data,error}=await build().range(page*1000,page*1000+999);
    if(error)throw error;out.push(...(data||[]));
    if(!data||data.length<1000)break;
  }
  return out;
}
async function load(force){
  const M=model(),sb=window.MINDS_SUPABASE;
  if(!M||!sb)return null;
  if(!force&&cache&&Date.now()-cacheAt<CACHE_MS)return cache;
  if(inflight)return inflight;
  inflight=(async()=>{
    const user=await session(sb);if(!user)return null;
    const pref=await sb.from('isabella_preferences').select('value').eq('user_id',user).eq('preference_key',KEY).maybeSingle();
    if(pref.error)throw pref.error;
    const credit=pref.data?.value||{},balance=M.readBalance(credit);
    const floor=new Date(Date.now()-HISTORY_DAYS*864e5);
    const from=(balance&&balance.at<floor?balance.at:floor).toISOString();
    const [usage,reports,jobs]=await Promise.all([
      paged(()=>sb.from('minds_ai_usage').select('feature,model,input_tokens,cached_input_tokens,output_tokens,total_tokens,metadata,created_at').eq('user_id',user).gte('created_at',from).order('created_at',{ascending:true})),
      sb.from('minds_self_review_reports').select('id,coverage,created_at,completed_at').eq('user_id',user).gte('created_at',from).limit(200).then(r=>r.error?[]:(r.data||[]),()=>[]),
      sb.from('minds_window_code_jobs').select('id,status,created_at').eq('user_id',user).gte('created_at',floor.toISOString()).limit(200).then(r=>r.error?[]:(r.data||[]),()=>[])
    ]);
    const rows=[...usage,...M.reviewRows(reports,usage)];
    const loggedJobs=new Set(usage.filter(r=>r.feature==='window_code'&&r.metadata?.job_id).map(r=>String(r.metadata.job_id)));
    const unmeteredJobs=jobs.filter(j=>!loggedJobs.has(String(j.id)));
    const summary=M.summarize(rows,{credit,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin'});
    cache={user,credit,summary,unmeteredJobs};cacheAt=Date.now();
    return cache;
  })().finally(()=>{inflight=null});
  return inflight;
}
async function status(){try{return (await load(false))?.summary||null}catch{return null}}
async function saveBalance(amount){
  const sb=window.MINDS_SUPABASE,user=sb&&await session(sb);
  if(!user)throw new Error('Sin sesión');
  const current=cache?.credit||{};
  const value={balance_usd:Math.round(amount*100)/100,balance_at:new Date().toISOString(),low_days:Number(current.low_days)||7};
  const {error}=await sb.from('isabella_preferences').upsert({user_id:user,preference_key:KEY,value,status:'confirmed',confidence:1,
    evidence:[{source:'isabella_client',kind:'openai_balance_entry',at:value.balance_at}],updated_at:value.balance_at},{onConflict:'user_id,preference_key'});
  if(error)throw error;
  cache=null;
  void window.MINDS_SITUATION?.render?.();
}
function lastDays(n){
  const out=[],M=model(),tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
  for(let i=n-1;i>=0;i--)out.push(M.dayKey(new Date(Date.now()-i*864e5),tz));
  return out;
}
function dayLabel(key){const m=String(key).match(/^\d{4}-(\d\d)-(\d\d)$/);return m?m[2]+'.'+m[1]:key}
function panelHtml(data){
  const M=model(),s=data.summary,days=lastDays(HISTORY_DAYS);
  const jobsByDay={};for(const j of data.unmeteredJobs){const k=M.dayKey(new Date(j.created_at),Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin');jobsByDay[k]=(jobsByDay[k]||0)+1}
  const max=Math.max(0.01,...days.map(d=>s.byDay[d]?.usd||0));
  const bars=days.map(d=>{
    const v=s.byDay[d]?.usd||0,top=Object.entries(s.byDay[d]?.features||{}).sort((a,b)=>b[1]-a[1])[0],jobs=jobsByDay[d]||0;
    const title=dayLabel(d)+' · '+M.money(v)+(top?' · sobre todo '+label(top[0]):'')+(jobs?' · '+jobs+(jobs===1?' preparación':' preparaciones')+' de código sin medir':'');
    return '<div class="credit-day" title="'+esc(title)+'"><span class="credit-day-value">'+(v>=0.005?esc(M.money(v)):'')+'</span>'+
      '<span class="credit-day-bar"><i style="height:'+Math.max(v>0?3:0,Math.round(v/max*100))+'%"></i></span>'+
      '<span class="credit-day-label">'+esc(dayLabel(d))+(jobs?'<b class="credit-day-flag" aria-label="Preparación de código sin medir">+</b>':'')+'</span></div>';
  }).join('');
  const features=Object.entries(s.byFeature).sort((a,b)=>b[1].usd-a[1].usd);
  const fmtTok=n=>new Intl.NumberFormat('es-ES',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n||0);
  const breakdown=features.map(([k,v])=>'<div class="usage-row credit-row"><span>'+esc(label(k))+'</span><strong>'+esc(M.money(v.usd))+'</strong><em>'+esc(fmtTok(v.tokens))+' tok. · '+v.calls+' llamada'+(v.calls===1?'':'s')+'</em></div>').join('');
  const hasBalance=!!s.balance,updated=hasBalance?dayLabel(model().dayKey(new Date(s.balance.at),Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin')):'';
  const daysLeft=s.daysLeft===Infinity?'Sin gasto reciente':s.daysLeft===null?'—':'≈ '+M.daysText(s.daysLeft);
  const tone=s.level==='ok'||s.level==='unset'?'':' is-'+s.level;
  const unmetered=data.unmeteredJobs.length;
  return '<div class="usage-panel credit-panel">'+
    '<div class="usage-summary credit-summary'+tone+'">'+
      '<div><span>SALDO ESTIMADO</span><strong>'+(hasBalance?esc(M.money(Math.max(0,s.remaining))):'—')+'</strong><small>'+(hasBalance?'Saldo del '+esc(updated)+': '+esc(M.money(s.balance.amount))+' · gastado desde entonces ≈ '+esc(M.money(s.spentSince)):'Introduce tu saldo de OpenAI')+'</small></div>'+
      '<div><span>AL RITMO ACTUAL</span><strong>'+esc(hasBalance?daysLeft:'—')+'</strong><small>'+esc(s.level==='low'||s.level==='critical'||s.level==='empty'?'Isabella te avisará en Ahora y en tu resumen':'Aviso cuando quede menos de una semana')+'</small></div>'+
      '<div><span>MEDIA · '+s.windowDays+' DÍAS</span><strong>'+esc(M.money(s.burnPerDay))+'</strong><small>por día · '+esc(M.money(s.windowUsd))+' en total</small></div>'+
    '</div>'+
    '<form class="credit-form" data-credit-form><label for="creditBalanceInput">Saldo en OpenAI (USD)</label>'+
      '<div class="credit-form-row"><input id="creditBalanceInput" name="balance" inputmode="decimal" autocomplete="off" placeholder="p. ej. 21.40" value="'+(hasBalance?esc(String(s.balance.amount)):'')+'"><button type="submit" class="send-pill">Guardar</button></div>'+
      '<small>Míralo en platform.openai.com → Billing. Cada vez que lo actualices, la estimación vuelve a partir de ese número.</small><output data-credit-status aria-live="polite"></output></form>'+
    '<section class="credit-chart-wrap"><h3 class="credit-heading">Gasto estimado por día</h3><div class="credit-chart">'+bars+'</div>'+
      (unmetered?'<p class="credit-note"><b>+</b> '+unmetered+(unmetered===1?' preparación de código de Window en estos días no registró sus tokens (supone 2–3 llamadas a un modelo grande)':' preparaciones de código de Window en estos días no registraron sus tokens (cada una supone 2–3 llamadas a un modelo grande)')+'. A partir de esta versión quedan medidas.</p>':'')+'</section>'+
    '<section><h3 class="credit-heading">En qué se va · '+s.windowDays+' días</h3><div class="usage-breakdown">'+(breakdown||'<div class="small">Todavía no hay llamadas medidas.</div>')+'</div></section>'+
    '<p class="credit-note">Estimación con los precios de OpenAI del '+esc(s.pricesAsOf.split('-').reverse().join('.'))+'. No incluye búsquedas web (se cobran por llamada), transcripción e imágenes'+(s.unpricedCalls?' ('+s.unpricedCalls+' llamadas sin precio)':'')+', ni otros usos de la misma cuenta fuera de MINDS. El gasto exacto está en OpenAI → Usage.</p>'+
  '</div>';
}
async function panel(modal){
  modal('Uso IA','<div class="surface-loading">Leyendo consumo…</div>');
  let data;
  try{data=await load(true)}catch{data=null}
  if(!data){modal('Uso IA','<div class="small">No pude leer el consumo ahora mismo.</div>');return}
  modal('Uso IA',panelHtml(data));
  const form=document.querySelector('[data-credit-form]');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const out=form.querySelector('[data-credit-status]'),raw=String(form.balance.value||'').trim().replace(/[$\s]/g,'').replace(',','.');
    const amount=Number(raw);
    if(!raw||!isFinite(amount)||amount<0||amount>100000){out.textContent='Escribe el saldo en dólares, por ejemplo 21.40.';return}
    out.textContent='Guardando…';
    try{await saveBalance(amount);await panel(modal)}catch{out.textContent='No pude guardar el saldo. Inténtalo de nuevo.'}
  });
}
window.MINDS_CREDIT={load,status,saveBalance,panel,label};
})();
