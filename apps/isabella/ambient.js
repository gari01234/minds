(()=>{
'use strict';

const $=s=>document.querySelector(s);
let sb=null,timer=null,lastSnapshot='',open=false,lastCompletedShownAt=0;

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function stateOf(run){
  const status=String(run?.status||'');
  if(status==='queued')return {key:'thinking',label:'Preparando',verb:'Preparando'};
  if(status==='in_progress')return {key:'working',label:'Trabajando',verb:'Trabajando'};
  if(status==='completed')return {key:'finished',label:'Listo',verb:'Terminado'};
  if(status==='failed')return {key:'error',label:'Necesito revisar',verb:'Falló'};
  if(status==='cancelled')return {key:'idle',label:'Cancelado',verb:'Cancelado'};
  return {key:'idle',label:'Isabella',verb:'Estado'};
}
function inject(){
  if($('#isabellaAmbient'))return;
  const root=document.createElement('div');
  root.id='isabellaAmbient';
  root.className='ambient-presence hidden';
  root.innerHTML=`<button class="ambient-pill" id="ambientPill" aria-expanded="false">
    <span class="ambient-orb" aria-hidden="true"><i></i><i></i></span>
    <span class="ambient-copy"><b id="ambientLabel">Isabella</b><small id="ambientTitle"></small></span>
    <span class="ambient-chevron">⌄</span>
  </button>
  <div class="ambient-panel hidden" id="ambientPanel">
    <div class="ambient-panel-head"><span>ISABELLA · TRABAJO</span><button id="ambientClose" aria-label="Cerrar">×</button></div>
    <div id="ambientRuns"></div>
  </div>`;
  document.body.appendChild(root);
  $('#ambientPill').onclick=()=>setOpen(!open);
  $('#ambientClose').onclick=e=>{e.stopPropagation();setOpen(false)};
}
function setOpen(value){
  open=!!value;
  $('#ambientPanel')?.classList.toggle('hidden',!open);
  $('#ambientPill')?.setAttribute('aria-expanded',open?'true':'false');
  $('#isabellaAmbient')?.classList.toggle('expanded',open);
}
async function signedArtifacts(ids=[]){
  if(!ids.length||!sb)return [];
  try{
    const {data}=await sb.from('minds_artifacts')
      .select('id,kind,title,mime_type,storage_path')
      .in('id',ids.slice(0,8));
    return await Promise.all((data||[]).map(async a=>{
      const {data:signed}=await sb.storage.from('minds-artifacts').createSignedUrl(a.storage_path,3600);
      return {...a,url:signed?.signedUrl||''};
    }));
  }catch{return []}
}
function artifactLabel(kind){
  return ({docx:'WORD',pdf:'PDF',xlsx:'EXCEL',pptx:'POWERPOINT',csv:'CSV',zip:'ZIP',html:'HTML',txt:'TXT',json:'JSON',image:'IMAGEN'}[String(kind||'')]||String(kind||'ARCHIVO').toUpperCase());
}
function cleanCapabilitySummary(text){
  return String(text||'')
    .replace(/^\s*[-*]\s*\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)\s*$/gmi,'')
    .replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'')
    .replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'')
    .replace(/\n{3,}/g,'\n\n').trim();
}
function primaryArtifacts(items=[]){
  const rows=Array.isArray(items)?items:[];
  return rows.some(x=>String(x?.kind||'')!=='image')?rows.filter(x=>String(x?.kind||'')!=='image'):rows;
}
async function render(runs){
  inject();
  const root=$('#isabellaAmbient');if(!root)return;
  const active=(runs||[]).filter(x=>['queued','in_progress'].includes(x.status));
  const recent=(runs||[]).filter(x=>['completed','failed'].includes(x.status));
  const focal=active[0]||recent[0]||null;
  if(!focal){root.classList.add('hidden');setOpen(false);return}
  const state=stateOf(focal);
  root.dataset.state=state.key;
  $('#ambientLabel').textContent=state.label;
  $('#ambientTitle').textContent=String(focal.title||'').slice(0,90);

  const completedAt=focal.completed_at?Date.parse(focal.completed_at):0;
  const showRecent=!active.length&&completedAt&&Date.now()-completedAt<120000;
  if(!active.length&&!showRecent){root.classList.add('hidden');setOpen(false);return}
  root.classList.remove('hidden');

  const panel=$('#ambientRuns');if(!panel)return;
  const visible=[...active,...recent.filter(x=>!active.some(a=>a.id===x.id)).slice(0,2)].slice(0,4);
  const rows=[];
  for(const run of visible){
    const s=stateOf(run),allArtifacts=run.status==='completed'?await signedArtifacts(run.artifact_ids||[]):[],artifacts=primaryArtifacts(allArtifacts);
    rows.push(`<article class="ambient-run ${esc(s.key)}">
      <div class="ambient-run-state"><span></span><div><b>${esc(run.title||'Trabajo')}</b><small>${esc(s.verb)}</small></div></div>
      ${run.summary?`<p>${esc(cleanCapabilitySummary(run.summary).slice(0,260))}</p>`:''}
      ${run.error?`<p class="ambient-error">${esc(String(run.error).slice(0,220))}</p>`:''}
      ${artifacts.length?`<div class="ambient-artifacts">${artifacts.map(a=>a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener"><span>${esc(artifactLabel(a.kind))}</span>${esc(a.title)}</a>`:'').join('')}</div>`:''}
      ${['queued','in_progress'].includes(run.status)?`<button class="ambient-cancel" data-capability-cancel="${esc(run.id)}">Cancelar</button>`:''}
    </article>`);
  }
  panel.innerHTML=rows.join('');
  panel.querySelectorAll('[data-capability-cancel]').forEach(btn=>btn.onclick=()=>void cancelRun(btn.dataset.capabilityCancel));
  if(!active.length&&focal.status==='completed'&&completedAt>lastCompletedShownAt){
    lastCompletedShownAt=completedAt;
    try{window.ISABELLA_SYNC_PULL_NOW?.()}catch{}
  }
}
async function cancelRun(id){
  if(!sb||!id)return;
  try{
    const {error}=await sb.functions.invoke('isabella-capability-runtime',{body:{action:'cancel',run_id:id}});
    if(error)throw error;
    await refresh();
  }catch{}
}
async function refresh(){
  if(document.hidden)return;
  sb=window.MINDS_SUPABASE||sb;if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session){$('#isabellaAmbient')?.classList.add('hidden');return}
    const since=new Date(Date.now()-10*60*1000).toISOString();
    const {data,error}=await sb.from('minds_capability_runs')
      .select('id,title,status,artifact_ids,summary,error,origin_kind,project_id,work_thread_id,metadata,started_at,completed_at,updated_at')
      .gte('updated_at',since)
      .order('updated_at',{ascending:false})
      .limit(8);
    if(error)return;
    const visible=(data||[]).filter(x=>x?.metadata?.surface_hidden!==true);
    const snapshot=JSON.stringify(visible.map(x=>[x.id,x.status,x.updated_at,x.artifact_ids,x.summary,x.error]));
    if(snapshot===lastSnapshot)return;
    lastSnapshot=snapshot;
    await render(visible);
  }catch{}
}
function start(){
  inject();void refresh();
  if(timer)clearInterval(timer);
  timer=setInterval(()=>void refresh(),4500);
}
window.addEventListener('load',start,{once:true});
window.addEventListener('focus',()=>void refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
window.addEventListener('isabella:synced',()=>void refresh());
window.ISABELLA_AMBIENT={refresh,setOpen};
})();