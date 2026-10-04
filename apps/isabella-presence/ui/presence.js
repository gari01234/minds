(()=>{'use strict';

const SUPABASE_URL='https://lodexwyyynlarkqgkyhy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_ALAQ5tHd9m5vB7oM9jpj9A_9IAOep2X';
const MINDS_URL='https://gari01234.github.io/minds/isabella/';
const POLL_MS=5000,COMPLETION_HOLD_MS=90000,FAILURE_AUTO_WINDOW_MS=10*60*1000;
const LOCAL_SEEN_KEY='minds-presence-seen-v02',LOCAL_SUPPRESS_KEY='minds-presence-suppressed-v02';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const parseTime=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0};
const tauri=window.__TAURI__||null;
const appWindow=tauri?.window?.getCurrentWindow?.()||null;
const currentMonitor=tauri?.window?.currentMonitor||null;
const LogicalSize=tauri?.dpi?.LogicalSize||null;
const LogicalPosition=tauri?.dpi?.LogicalPosition||null;
const openUrl=tauri?.opener?.openUrl||null;
const listen=tauri?.event?.listen||null;

let sb=null,user=null,email='',timer=null,polling=false,expanded=false,manualOpen=false,chatBusy=false;
let lastSnapshot='',lastCards=[],priorRunStatus=new Map(),observedActiveRuns=new Set(),chatTurns=[],pendingReview=false,lastQuickReplies=[];
let seen=loadSet(LOCAL_SEEN_KEY),suppressed=loadSet(LOCAL_SUPPRESS_KEY);

function loadSet(key){try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'))}catch{return new Set()}}
function saveSet(key,set){try{localStorage.setItem(key,JSON.stringify([...set].slice(-200)))}catch{}}
function rememberSeen(id){if(id){seen.add(String(id));saveSet(LOCAL_SEEN_KEY,seen)}}
function rememberSuppressed(id){if(id){suppressed.add(String(id));saveSet(LOCAL_SUPPRESS_KEY,suppressed)}}
function cleanText(v){return String(v||'').replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'').replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'').replace(/\n{3,}/g,'\n\n').trim()}
function humanRunState(status){
  if(status==='queued')return {kind:'preparing',label:'Preparando'};
  if(status==='in_progress')return {kind:'working',label:'Trabajando'};
  if(status==='completed')return {kind:'finished',label:'Listo'};
  if(status==='failed')return {kind:'error',label:'Necesito revisar'};
  return {kind:'idle',label:'Isabella'};
}
function runCard(run){
  const state=humanRunState(String(run.status||''));
  return {id:'run:'+run.id,source:'run',sourceId:run.id,kind:state.kind,label:state.label,title:String(run.title||'Trabajo').trim(),
    body:cleanText(run.status==='failed'?(run.error||run.summary):(run.summary||'')),status:run.status,updatedAt:parseTime(run.updated_at),
    completedAt:parseTime(run.completed_at),priority:run.status==='failed'?90:(run.status==='in_progress'?70:(run.status==='queued'?65:30)),
    cancellable:['queued','in_progress'].includes(run.status),needsUser:false};
}
function attentionCard(event){
  const needsUser=event.route==='interrupt'&&event.requires_user===true;
  return {id:'attention:'+event.id,source:'attention',sourceId:event.id,kind:needsUser?'question':'ambient',
    label:needsUser?'Necesito tu decisión':'Para tener en cuenta',title:String(event.title||'Actualización').trim(),body:String(event.body||'').trim(),
    status:event.status,updatedAt:parseTime(event.updated_at||event.created_at),priority:needsUser?100:40,cancellable:false,needsUser};
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
  for(const event of events||[])if(event.route==='ambient'||(event.route==='interrupt'&&event.requires_user===true))cards.push(attentionCard(event));
  return cards.sort((a,b)=>b.priority-a.priority||b.updatedAt-a.updatedAt).slice(0,6);
}
function autoCandidate(cards){
  for(const card of cards){
    if(suppressed.has(card.id))continue;
    if(['working','preparing'].includes(card.kind)||card.kind==='question')return card;
    if(card.kind==='ambient'&&!seen.has(card.id))return card;
    if(card.kind==='error'&&!seen.has(card.id)&&now()-card.updatedAt<FAILURE_AUTO_WINDOW_MS)return card;
    if(card.kind==='finished'&&observedActiveRuns.has(card.sourceId))return card;
  }
  return null;
}
const SIZES={pill:[284,74],panel:[370,472],auth:[370,390],boot:[284,74]};
async function positionWindow(mode){
  if(!appWindow||!currentMonitor||!LogicalPosition)return;
  try{
    const monitor=await currentMonitor();if(!monitor)return;
    const scale=monitor.scaleFactor||1;
    const origin=monitor.position?.toLogical?monitor.position.toLogical(scale):{x:(monitor.position?.x||0)/scale,y:(monitor.position?.y||0)/scale};
    const area=monitor.size?.toLogical?monitor.size.toLogical(scale):{width:(monitor.size?.width||0)/scale,height:(monitor.size?.height||0)/scale};
    const [w]=SIZES[mode]||SIZES.pill;
    await appWindow.setPosition(new LogicalPosition(Math.round(origin.x+area.width-w-18),Math.round(origin.y+18)));
  }catch{}
}
async function sizeWindow(mode){
  if(!appWindow||!LogicalSize)return;
  const [w,h]=SIZES[mode]||SIZES.pill;
  try{await appWindow.setSize(new LogicalSize(w,h));await positionWindow(mode)}catch{}
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
  const target=attentionId?MINDS_URL+'?attention='+encodeURIComponent(attentionId):MINDS_URL;
  try{if(openUrl)await openUrl(target);else window.open(target,'_blank')}catch{}
}
function showOnly(id){for(const el of ['bootView','authView','presenceView'])$('#'+el)?.classList.toggle('hidden',el!==id)}
async function renderAuth(message=''){
  showOnly('authView');$('#app').dataset.mode='auth';$('#authMessage').textContent=message;
  await sizeWindow('auth');await showWindow({focus:true});
}
function cardHtml(card){
  const body=card.body?`<p>${esc(card.body.slice(0,300))}</p>`:'';
  const actions=[];
  if(card.cancellable)actions.push(`<button class="cancel" data-cancel="${esc(card.sourceId)}">Cancelar</button>`);
  if(card.needsUser)actions.push(`<button class="respond" data-respond="${esc(card.id)}">Responder aquí</button>`);
  return `<article class="card" data-kind="${esc(card.kind)}"><div class="card-head"><span class="state-dot"></span><div class="card-copy"><b>${esc(card.title)}</b><small>${esc(card.label)}</small></div></div>${body}${actions.length?`<div class="card-actions">${actions.join('')}</div>`:''}</article>`;
}
function renderConversation(){
  $('#conversationEmpty').classList.toggle('hidden',chatTurns.length>0||chatBusy);
  $('#turns').innerHTML=chatTurns.slice(-6).map(t=>`<div class="turn ${esc(t.role)}${t.error?' error':''}">${esc(t.text)}</div>`).join('')+(chatBusy?'<div class="turn assistant">Pensando…</div>':'');
  $('#reviewNotice').classList.toggle('hidden',!pendingReview);
  $('#quickReplies').innerHTML=lastQuickReplies.map((q,i)=>`<button type="button" data-quick="${i}">${esc(q.label)}</button>`).join('');
  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>sendChatText(lastQuickReplies[Number(b.dataset.quick)]?.value||''));
  $('#sendButton').disabled=chatBusy;
  $('#app').dataset.busy=chatBusy?'true':'false';
  requestAnimationFrame(()=>{const s=$('#panelScroll');if(s)s.scrollTop=s.scrollHeight});
}
async function renderPresence(cards,{auto=true}={}){
  lastCards=cards;showOnly('presenceView');
  const focal=cards[0]||null;
  $('#compactState').textContent=chatBusy?'Pensando…':(focal?.label||'Isabella');
  $('#compactTitle').textContent=focal?.title||(chatTurns.length?chatTurns[chatTurns.length-1].text.slice(0,45):'Disponible');
  $('#pillOrb').classList.toggle('busy',chatBusy||!!cards.find(x=>['working','preparing'].includes(x.kind)));
  $('#pillCount').textContent=cards.length>1?String(cards.length):'';
  $('#pillCount').classList.toggle('hidden',cards.length<2);
  $('#cardsSection').classList.toggle('hidden',!cards.length);
  $('#cards').innerHTML=cards.map(cardHtml).join('');
  $('#panelHeading').textContent=cards.some(x=>x.needsUser)?'Necesito tu decisión':(cards.some(x=>['working','preparing'].includes(x.kind))?'Trabajando':'Isabella');
  $('#panel').classList.toggle('hidden',!expanded);$('#pill').classList.toggle('hidden',expanded);
  $('#pillMain').setAttribute('aria-expanded',expanded?'true':'false');$('#app').dataset.mode=expanded?'panel':'pill';
  renderConversation();bindCardActions();
  if(manualOpen||expanded||chatBusy){await sizeWindow(expanded?'panel':'pill');await showWindow({focus:false});return}
  const candidate=autoCandidate(cards);
  if(candidate&&auto){await sizeWindow('pill');await showWindow({focus:false});return}
  if(!candidate&&auto)setTimeout(()=>{if(!manualOpen&&!expanded&&!chatBusy&&!autoCandidate(lastCards))appWindow?.hide().catch(()=>{})},550);
}
function bindCardActions(){
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelRun(b.dataset.cancel));
  document.querySelectorAll('[data-respond]').forEach(b=>b.onclick=()=>focusQuestion(b.dataset.respond));
}
function focusQuestion(cardId){
  const card=lastCards.find(x=>x.id===cardId);if(!card)return;
  expanded=true;manualOpen=true;void renderPresence(lastCards,{auto:false}).then(()=>{
    $('#chatInput').value='Sobre “'+card.title+'”: ';
    $('#chatInput').focus();
  });
}
async function cancelRun(id){
  if(!sb||!id)return;
  const button=document.querySelector(`[data-cancel="${CSS.escape(id)}"]`);if(button)button.disabled=true;
  try{const {error}=await sb.functions.invoke('isabella-capability-runtime',{body:{action:'cancel',run_id:id}});if(error)throw error;await refresh({force:true})}
  catch{if(button){button.disabled=false;button.textContent='No pude cancelar'}}
}
async function queryPresence(){
  const sinceRuns=new Date(now()-20*60*1000).toISOString(),sinceAttention=new Date(now()-48*60*60*1000).toISOString();
  const [runQ,attentionQ]=await Promise.all([
    sb.from('minds_capability_runs').select('id,title,status,artifact_ids,summary,error,origin_kind,project_id,work_thread_id,started_at,completed_at,updated_at').gte('updated_at',sinceRuns).order('updated_at',{ascending:false}).limit(12),
    sb.from('minds_attention_events').select('id,event_key,event_type,title,body,urgency,requires_user,route,status,source_type,source_id,metadata,created_at,updated_at,delivered_at').in('route',['ambient','interrupt']).in('status',['pending','delivered']).gte('created_at',sinceAttention).order('updated_at',{ascending:false}).limit(20)
  ]);
  if(runQ.error)throw runQ.error;if(attentionQ.error)throw attentionQ.error;
  return projectCards(runQ.data||[],attentionQ.data||[]);
}
async function refresh({force=false}={}){
  if(!sb||!user||polling)return;polling=true;
  try{
    const cards=await queryPresence(),snapshot=JSON.stringify(cards.map(x=>[x.id,x.kind,x.status,x.updatedAt,x.body]));
    if(force||snapshot!==lastSnapshot){lastSnapshot=snapshot;await renderPresence(cards)}
  }catch(e){if(String(e?.message||'').toLowerCase().includes('jwt'))await renderAuth('La sesión de MINDS necesita renovarse.')}
  finally{polling=false}
}
function startPolling(){if(timer)clearInterval(timer);timer=setInterval(()=>refresh(),POLL_MS)}
async function sendChatText(raw){
  const message=String(raw||'').trim();if(!message||chatBusy||!sb||!user)return;
  expanded=true;manualOpen=true;chatBusy=true;pendingReview=false;lastQuickReplies=[];
  chatTurns.push({role:'user',text:message});$('#chatInput').value='';await renderPresence(lastCards,{auto:false});
  try{
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
    const {data,error}=await sb.functions.invoke('isabella-chat',{body:{message,context:{timezone,locale:navigator.language||'es-ES',presence_surface:true},background:false,attachments:[]}});
    if(error)throw error;if(data?.error)throw new Error(data.message||data.detail||data.error);
    chatTurns.push({role:'assistant',text:cleanText(data?.reply||'Te escucho.')});
    pendingReview=!!data?.proposal||(Array.isArray(data?.proposals)&&data.proposals.length>0);
    lastQuickReplies=(Array.isArray(data?.quick_replies)?data.quick_replies:[]).slice(0,4).map(x=>({label:String(x?.label||'').trim(),value:String(x?.value||x?.label||'').trim()})).filter(x=>x.label&&x.value);
  }catch(e){chatTurns.push({role:'assistant',text:'No pude completar ese turno. Puedes abrir MINDS para continuar.',error:true})}
  finally{chatBusy=false;await renderPresence(lastCards,{auto:false})}
}
async function submitChat(event){event.preventDefault();await sendChatText($('#chatInput').value)}
async function connect(){
  if(!window.supabase?.createClient)return renderAuth('No pude cargar el cliente seguro de Supabase.');
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'minds-isabella-presence-auth-v01'}});
  const {data,error}=await sb.auth.getSession();if(error)return renderAuth('No pude leer la sesión de MINDS.');
  user=data.session?.user||null;
  sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user){void refresh({force:true});startPolling()}else void renderAuth('')});
  if(!user)return renderAuth('');
  await refresh({force:true});startPolling();
}
async function sendOtp(event){
  event.preventDefault();email=$('#emailInput').value.trim();if(!email)return;$('#authMessage').textContent='Enviando código…';
  const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error){$('#authMessage').textContent=error.message;return}
  $('#emailForm').classList.add('hidden');$('#otpForm').classList.remove('hidden');$('#authMessage').textContent='Revisa tu correo e introduce el código.';$('#otpInput').focus();
}
async function verifyOtp(event){
  event.preventDefault();const token=$('#otpInput').value.trim();
  if(!email||!/^\d{6,10}$/.test(token)){ $('#authMessage').textContent='Introduce el código completo.';return }
  $('#authMessage').textContent='Verificando…';const {data,error}=await sb.auth.verifyOtp({email,token,type:'email'});
  if(error){$('#authMessage').textContent=error.message;return}
  user=data.user||data.session?.user||null;manualOpen=true;expanded=false;await refresh({force:true});startPolling();
}
async function signOut(){try{await sb?.auth.signOut()}catch{}user=null;chatTurns=[];await renderAuth('Sesión desconectada.')}
async function expandPanel(){expanded=true;manualOpen=true;await renderPresence(lastCards,{auto:false});setTimeout(()=>$('#chatInput')?.focus(),80)}
async function collapsePanel(){expanded=false;manualOpen=true;await renderPresence(lastCards,{auto:false})}
function bind(){
  $('#emailForm').addEventListener('submit',sendOtp);$('#otpForm').addEventListener('submit',verifyOtp);$('#chatForm').addEventListener('submit',submitChat);
  $('#pillMain').onclick=expandPanel;$('#pillHide').onclick=hideWindow;$('#collapseButton').onclick=collapsePanel;
  $('#openMinds').onclick=()=>openMinds();$('#reviewInMinds').onclick=()=>openMinds();$('#refreshButton').onclick=()=>refresh({force:true});$('#signOutButton').onclick=signOut;
  document.querySelectorAll('[data-hide]').forEach(b=>b.onclick=hideWindow);
  if(listen){
    listen('presence:manual-open',async()=>{manualOpen=true;expanded=false;if(user)await renderPresence(lastCards,{auto:false});else await renderAuth('')}).catch(()=>{});
    listen('presence:manual-hide',()=>{manualOpen=false;expanded=false;const focal=autoCandidate(lastCards);if(focal)rememberSuppressed(focal.id)}).catch(()=>{});
  }
}
async function init(){bind();showOnly('bootView');await sizeWindow('boot');await connect()}
window.addEventListener('DOMContentLoaded',()=>void init(),{once:true});
})();