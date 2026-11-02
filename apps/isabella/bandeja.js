/* Bandeja · what Isabella proposes, for when Gari has time.
   «Por confirmar» gathers the proposed Akte entries of every project (the same cards and the
   same one-tap decisions as Panorama «Para ti»); «Sugerencias» and «Ideas» are Isabella's
   suggestions and ideas, moved here from Ahora. Only «Por confirmar» carries a number. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VIEWS=['confirm','suggest','ideas'];
const SELECT='id,project_id,memory_type,title,body,status,occurred_at,metadata,created_at,isabella_projects(name,client_key)';
let view='confirm',entries=null,loadError='',loading=null,count=null,countAt=0,countLoading=null,shown={suggest:false,ideas:false};
try{const saved=localStorage.getItem('minds-bandeja-view');if(VIEWS.includes(saved))view=saved}catch{}

function akte(){return window.MINDS_WORK?.akte||null}
async function signedIn(){
  const sb=window.MINDS_SUPABASE;if(!sb)return false;
  try{const {data}=await sb.auth.getSession();return !!data?.session}catch{return false}
}
async function fetchPending(){
  const sb=window.MINDS_SUPABASE;
  const {data,error}=await sb.from('minds_work_memory').select(SELECT).eq('status','proposed')
    .in('memory_type',['deadline','decision','commitment','open_question']).order('created_at',{ascending:false}).limit(200);
  if(error)throw error;
  return akte()?.toConfirm?.(data||[])||[];
}
function publish(n){
  count=n;countAt=Date.now();
  $$('[data-bandeja-badge]').forEach(b=>{b.textContent=n>99?'99+':String(n);b.classList.toggle('hidden',!(n>0))});
  const tab=$('[data-bandeja-view="confirm"]');if(tab)tab.textContent=n>0?'Por confirmar · '+n:'Por confirmar';
  try{window.dispatchEvent(new CustomEvent('minds:bandeja-count',{detail:{count:n}}))}catch{}
}
// The number on the tab: refreshed at most every minute unless something changed.
function refreshCount(force=false){
  if(countLoading)return countLoading;
  if(!force&&count!==null&&Date.now()-countAt<60000)return Promise.resolve(count);
  countLoading=(async()=>{
    if(!await signedIn())return count;
    try{const list=await fetchPending();entries=list;loadError='';publish(list.length);}catch{}
    return count;
  })().finally(()=>{countLoading=null});
  return countLoading;
}

function groupsOf(list){
  const groups=new Map();
  for(const r of list){
    const name=r.isabella_projects?.name||'Sin proyecto';
    if(!groups.has(name))groups.set(name,{name,key:r.isabella_projects?.client_key||'',rows:[]});
    groups.get(name).rows.push(r);
  }
  return [...groups.values()];
}
function paintConfirm(){
  const box=$('#bandejaConfirm');if(!box)return;
  if(entries===null){box.innerHTML='<div class="surface-loading">Leyendo lo que espera tu confirmación…</div>';return}
  if(loadError){box.innerHTML='<div class="surface-empty">'+esc(loadError)+'</div>';return}
  if(!entries.length){box.innerHTML='<p class="bandeja-empty">Nada por confirmar. Lo nuevo que encuentren Claude o Isabella en tus proyectos aparecerá aquí.</p>';return}
  const card=akte()?.card;
  box.innerHTML=groupsOf(entries).map(g=>'<section class="bandeja-group" aria-label="'+esc(g.name)+'"><div class="bandeja-group-head"><h2 class="ahora-label">'+esc(g.name)+'</h2>'+
    (g.key?'<button type="button" class="ahora-text-button" data-bandeja-project="'+esc(g.key)+'">Panorama</button>':'')+'</div>'+
    '<div class="cockpit-cards">'+g.rows.map(r=>card?card(r):'').join('')+'</div></section>').join('')+
    '<p class="bandeja-note" role="status" aria-live="polite"></p>';
}
async function loadConfirm(force=false){
  if(loading)return loading;
  loading=(async()=>{
    if(!window.MINDS_SUPABASE){entries=[];loadError='La memoria de MINDS no está disponible.';paintConfirm();return}
    if(!await signedIn()){entries=[];loadError='Memoria no conectada: conéctala en el menú ••• para ver lo que espera tu confirmación.';paintConfirm();return}
    if(force||entries===null){
      try{const list=await fetchPending();entries=list;loadError='';publish(list.length)}
      catch{entries=entries||[];loadError='No pude leer la Bandeja ahora mismo. Desliza hacia abajo para intentarlo de nuevo.'}
    }
    paintConfirm();
  })().finally(()=>{loading=null});
  return loading;
}
function note(text){const el=$('#bandejaConfirm .bandeja-note');if(el)el.textContent=text||''}
async function decide(button,run){
  const card=button.closest('.cockpit-card');
  card?.querySelectorAll('button').forEach(b=>b.disabled=true);
  const result=await run();
  if(!result?.ok){card?.querySelectorAll('button').forEach(b=>b.disabled=false);note(result?.message||'No pude guardar la decisión.');return}
  await loadConfirm(true);
  note(result.message||'');
}

function paintTabs(){
  $$('[data-bandeja-view]').forEach(b=>{const on=b.dataset.bandejaView===view;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on))});
  $$('[data-bandeja-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.bandejaPanel!==view));
}
function openView(next,{force=false}={}){
  if(VIEWS.includes(next))view=next;
  try{localStorage.setItem('minds-bandeja-view',view)}catch{}
  paintTabs();
  if(view==='confirm')void loadConfirm(force);
  if(view==='suggest'&&(force||!shown.suggest)){shown.suggest=true;void window.ISABELLA_APP?.renderSuggestions?.(false)}
  if(view==='ideas'&&(force||!shown.ideas)){shown.ideas=true;void window.ISABELLA_APP?.renderIdeas?.(false)}
}
function bind(){
  const screen=$('#bandejaScreen');if(!screen||screen.dataset.bandejaBound)return;screen.dataset.bandejaBound='1';
  screen.addEventListener('click',e=>{
    const t=e.target.closest?.('[data-bandeja-view],[data-akte-decide],[data-akte-task],[data-bandeja-project]');if(!t)return;
    if(t.dataset.bandejaView){openView(t.dataset.bandejaView);return}
    const a=akte();
    if(t.dataset.akteDecide&&a){void decide(t,()=>a.decide(t.dataset.akteId,t.dataset.akteDecide));return}
    if(t.dataset.akteTask&&a){void decide(t,()=>a.toTask(t.dataset.akteTask));return}
    if(t.dataset.bandejaProject){window.MINDS_WORK?.open?.(t.dataset.bandejaProject,'overview');window.ISABELLA_APP?.show?.('work')}
  });
}
window.MINDS_BANDEJA={
  show:(next)=>{bind();openView(next||view)},
  refresh:()=>{bind();shown={suggest:false,ideas:false};return Promise.resolve(openView(view,{force:true}))},
  refreshCount,
  lastCount:()=>count,
  // A decision taken elsewhere (Panorama) changes the number here too.
  changed:()=>{entries=null;countAt=0;void refreshCount(true);if(document.body?.dataset?.section==='bandeja'&&view==='confirm')void loadConfirm(true)}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCount()});
setTimeout(()=>{void refreshCount(true)},1500);
})();
