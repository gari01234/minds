(()=>{'use strict';

const SUPABASE_URL='https://lodexwyyynlarkqgkyhy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_ALAQ5tHd9m5vB7oM9jpj9A_9IAOep2X';
const MINDS_URL='https://gari01234.github.io/minds/isabella/';
const POLL_MS=5000;
const COMPLETION_HOLD_MS=90000;
const FAILURE_AUTO_WINDOW_MS=10*60*1000;
const LOCAL_SEEN_KEY='minds-presence-seen-v01';
const LOCAL_SUPPRESS_KEY='minds-presence-suppressed-v01';

const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const parseTime=value=>{const n=Date.parse(String(value||''));return Number.isFinite(n)?n:0};
const tauri=window.__TAURI__||null;
const appWindow=tauri?.window?.getCurrentWindow?.()||null;
const LogicalSize=tauri?.dpi?.LogicalSize||null;
const openUrl=tauri?.opener?.openUrl||null;
const listen=tauri?.event?.listen||null;

let sb=null;
let user=null;
let email='';
let timer=null;
let polling=false;
let expanded=false;
let manualOpen=false;
let lastSnapshot='';
let lastCards=[];
let priorRunStatus=new Map();
let observedActiveRuns=new Set();
let seen=loadSet(LOCAL_SEEN_KEY);
let suppressed=loadSet(LOCAL_SUPPRESS_KEY);

function loadSet(key){try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'))}catch{return new Set()}}
function saveSet(key,set){try{localStorage.setItem(key,JSON.stringify([...set].slice(-200)))}catch{}}
function rememberSeen(id){if(!id)return;seen.add(String(id));saveSet(LOCAL_SEEN_KEY,seen)}
function rememberSuppressed(id){if(!id)return;suppressed.add(String(id));saveSet(LOCAL_SUPPRESS_KEY,suppressed)}
function cleanText(value){return String(value||'').replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'').replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'').replace(/\n{3,}/g,'\n\n').trim()}
function humanRunState(status){
  if(status==='queued')return {kind:'preparing',label:'Preparando'};
  if(status==='in_progress')return {kind:'working',label:'Trabajando'};
  if(status==='completed')return {kind:'finished',label:'Listo'};
  if(status==='failed')return {kind:'error',label:'Necesito revisar'};
  return {kind:'idle',label:'Isabella'};
}
function runCard(run){
  const state=humanRunState(String(run.status||''));
  return {
    id:'run:'+run.id,source:'run',sourceId:run.id,kind:state.kind,label:state.label,
    title:String(run.title||'Trabajo').trim(),body:cleanText(run.status==='failed'?(run.error||run.summary):(run.summary||'')),
    status:run.status,updatedAt:parseTime(run.updated_at),completedAt:parseTime(run.completed_at),
    priority:run.status==='failed'?90:(run.status==='in_progress'?70:(run.status==='queued'?65:30)),
    cancellable:['queued','in_progress'].includes(run.status),needsUser:false
  };
}
function attentionCard(event){
  const needsUser=event.route==='interrupt'&&event.requires_user===true;
  return {
    id:'attention:'+event.id,source:'attention',sourceId:event.id,kind:needsUser?'question':'ambient',
    label:needsUser?'Necesito que decidas algo':'Para tener en cuenta',title:String(event.title||'Actualización').trim(),
    body:String(event.body||'').trim(),status:event.status,updatedAt:parseTime(event.updated_at||event.created_at),
    priority:needsUser?100:40,cancellable:false,needsUser
  };
}
function projectCards(runs,events){
  const cards=[];
  for(const run of runs||[]){
    const prev=priorRunStatus.get(run.id);
    if(['queued','in_progress'].includes(run.status))observedActiveRuns.add(run.id);
    const card=runCard(run);
    if(['queued','in_progress','failed'].includes(run.status))cards.push(card);
    else if(run.status==='completed'&&observedActiveRuns.has(run.id)&&now()-card.completedAt<COMPLETION_HOLD_MS)cards.push(card);
    priorRunStatus.set(run.id,run.status);
    if(prev&&prev!==run.status&&run.status==='completed')rememberSeen('transition:'+run.id+':completed');
  }
  for(const event of events||[]){
    if(event.route==='ambient'||(event.route==='interrupt'&&event.requires_user===true))cards.push(attentionCard(event));
  }
  return cards.sort((a,b)=>b.priority-a.priority||b.updatedAt-a.updatedAt).slice(0,8);
}
function autoCandidate(cards){
  for(const card of cards){
    if(suppressed.has(card.id))continue;
    if(['working','preparing'].includes(card.kind))return card;
    if(card.kind==='question')return card;
    if(card.kind==='ambient'&&!seen.has(card.id))return card;
    if(card.kind==='error'&&!seen.has(card.id)&&now()-card.updatedAt<FAILURE_AUTO_WINDOW_MS)return card;
    if(card.kind==='finished'&&observedActiveRuns.has(card.sourceId))return card;
  }
  return null;
}
async function sizeWindow(mode){
  if(!appWindow||!LogicalSize)return;
  const sizes={compact:[390,112],panel:[430,520],auth:[420,430],boot:[390,112]};
  const [w,h]=sizes[mode]||sizes.compact;
  try{await appWindow.setSize(new LogicalSize(w,h))}catch{}
}
async function showWindow({focus=false}={}){
  if(!appWindow)return;
  try{await appWindow.show();if(focus)await appWindow.setFocus()}catch{}
}
async function hideWindow(){
  manualOpen=false;expanded=false;
  const focal=autoCandidate(lastCards);if(focal)rememberSuppressed(focal.id);
  try{await appWindow?.hide()}catch{}
}
async function openMinds(attentionId=null){
  const target=attentionId?`${MINDS_URL}?attention=${encodeURIComponent(attentionId)}`:MINDS_URL;
  try{if(openUrl)await openUrl(target);else window.open(target,'_blank')}catch{}
}
function showOnly(id){for(const el of ['bootView','authView','presenceView'])$('#'+el)?.classList.toggle('hidden',el!==id)}
async function renderAuth(message=''){
  showOnly('authView');$('#app').dataset.mode='auth';$('#authMessage').textContent=message;
  await sizeWindow('auth');await showWindow({focus:true});
}
function cardHtml(card){
  const body=card.body?`<p>${esc(card.body.slice(0,420))}</p>`:'';
  const actions=[];
  if(card.cancellable)actions.push(`<button class="cancel" data-cancel="${esc(card.sourceId)}">Cancelar</button>`);
  if(card.needsUser)actions.push(`<button class="respond" data-respond="${esc(card.sourceId)}">Responder en Isabella</button>`);
  return `<article class="card" data-kind="${esc(card.kind)}"><div class="card-head"><span class="state-dot"></span><div class="card-copy"><b>${esc(card.title)}</b><small>${esc(card.label)}</small></div></div>${body}${actions.length?`<div class="card-actions">${actions.join('')}</div>`:''}</article>`;
}
async function renderPresence(cards,{auto=true}={}){
  lastCards=cards;
  showOnly('presenceView');
  const focal=cards[0]||null;
  $('#compactState').textContent=focal?.label||'Isabella';
  $('#compactTitle').textContent=focal?.title||'Disponible';
  $('#cards').innerHTML=cards.length?cards.map(cardHtml).join(''):'<div class="empty">No hay nada que necesite ocupar tu atención ahora.</div>';
  $('#panelHeading').textContent=cards.some(x=>x.needsUser)?'Necesito tu decisión':(cards.some(x=>['working','preparing'].includes(x.kind))?'Trabajando':'Ahora');
  $('#panel').classList.toggle('hidden',!expanded);
  $('#compactButton').classList.toggle('hidden',expanded);
  $('#compactButton').setAttribute('aria-expanded',expanded?'true':'false');
  $('#app').dataset.mode=expanded?'panel':'compact';
  bindCardActions();

  if(manualOpen||expanded){await sizeWindow('panel');await showWindow({focus:false});return}
  const candidate=autoCandidate(cards);
  if(candidate&&auto){await sizeWindow('compact');await showWindow({focus:false});return}
  if(!candidate&&auto){setTimeout(()=>{if(!manualOpen&&!expanded&&!autoCandidate(lastCards))appWindow?.hide().catch(()=>{})},700)}
}
function bindCardActions(){
  document.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>cancelRun(button.dataset.cancel));
  document.querySelectorAll('[data-respond]').forEach(button=>button.onclick=()=>openMinds(button.dataset.respond));
}
async function cancelRun(id){
  if(!sb||!id)return;
  const button=document.querySelector(`[data-cancel="${CSS.escape(id)}"]`);if(button)button.disabled=true;
  try{
    const {error}=await sb.functions.invoke('isabella-capability-runtime',{body:{action:'cancel',run_id:id}});
    if(error)throw error;
    await refresh({force:true});
  }catch{if(button){button.disabled=false;button.textContent='No pude cancelar'}}
}
async function queryPresence(){
  const sinceRuns=new Date(now()-20*60*1000).toISOString();
  const sinceAttention=new Date(now()-48*60*60*1000).toISOString();
  const [runQ,attentionQ]=await Promise.all([
    sb.from('minds_capability_runs').select('id,title,status,artifact_ids,summary,error,origin_kind,project_id,work_thread_id,started_at,completed_at,updated_at').gte('updated_at',sinceRuns).order('updated_at',{ascending:false}).limit(12),
    sb.from('minds_attention_events').select('id,event_key,event_type,title,body,urgency,requires_user,route,status,source_type,source_id,metadata,created_at,updated_at,delivered_at').in('route',['ambient','interrupt']).in('status',['pending','delivered']).gte('created_at',sinceAttention).order('updated_at',{ascending:false}).limit(20)
  ]);
  if(runQ.error)throw runQ.error;if(attentionQ.error)throw attentionQ.error;
  return projectCards(runQ.data||[],attentionQ.data||[]);
}
async function refresh({force=false}={}){
  if(!sb||!user||polling)return;
  polling=true;
  try{
    const cards=await queryPresence();
    const snapshot=JSON.stringify(cards.map(x=>[x.id,x.kind,x.status,x.updatedAt,x.body]));
    if(force||snapshot!==lastSnapshot){lastSnapshot=snapshot;await renderPresence(cards)}
  }catch(e){
    if(String(e?.message||'').toLowerCase().includes('jwt')){await renderAuth('La sesión de MINDS necesita renovarse.');}
  }finally{polling=false}
}
function startPolling(){if(timer)clearInterval(timer);timer=setInterval(()=>refresh(),POLL_MS)}
async function connect(){
  if(!window.supabase?.createClient){return renderAuth('No pude cargar el cliente seguro de Supabase.');}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'minds-isabella-presence-auth-v01'}});
  const {data,error}=await sb.auth.getSession();
  if(error)return renderAuth('No pude leer la sesión de MINDS.');
  user=data.session?.user||null;
  sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user){void refresh({force:true});startPolling()}else void renderAuth('')});
  if(!user)return renderAuth('');
  await refresh({force:true});startPolling();
}
async function sendOtp(event){
  event.preventDefault();email=$('#emailInput').value.trim();if(!email)return;
  $('#authMessage').textContent='Enviando código…';
  const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  if(error){$('#authMessage').textContent=error.message;return}
  $('#emailForm').classList.add('hidden');$('#otpForm').classList.remove('hidden');$('#authMessage').textContent='Revisa tu correo e introduce el código.';$('#otpInput').focus();
}
async function verifyOtp(event){
  event.preventDefault();const token=$('#otpInput').value.trim();if(!email||!/^\d{6,10}$/.test(token)){ $('#authMessage').textContent='Introduce el código completo.';return }
  $('#authMessage').textContent='Verificando…';
  const {data,error}=await sb.auth.verifyOtp({email,token,type:'email'});
  if(error){$('#authMessage').textContent=error.message;return}
  user=data.user||data.session?.user||null;manualOpen=true;expanded=true;await refresh({force:true});startPolling();
}
async function signOut(){try{await sb?.auth.signOut()}catch{}user=null;await renderAuth('Sesión desconectada.');}
async function toggleExpanded(){expanded=!expanded;manualOpen=expanded||manualOpen;await renderPresence(lastCards,{auto:false});}
function bind(){
  $('#emailForm').addEventListener('submit',sendOtp);$('#otpForm').addEventListener('submit',verifyOtp);
  $('#compactButton').onclick=toggleExpanded;$('#openMinds').onclick=()=>openMinds();$('#refreshButton').onclick=()=>refresh({force:true});$('#signOutButton').onclick=signOut;
  document.querySelectorAll('[data-hide]').forEach(button=>button.onclick=hideWindow);
  if(listen){
    listen('presence:manual-open',async()=>{manualOpen=true;expanded=true;if(user)await renderPresence(lastCards,{auto:false});else await renderAuth('')}).catch(()=>{});
    listen('presence:manual-hide',()=>{manualOpen=false;expanded=false;const focal=autoCandidate(lastCards);if(focal)rememberSuppressed(focal.id)}).catch(()=>{});
  }
}
async function init(){bind();showOnly('bootView');await sizeWindow('boot');await connect()}
window.addEventListener('DOMContentLoaded',()=>void init(),{once:true});
})();
