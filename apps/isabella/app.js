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
const humanSurface=()=>window.MINDS_HUMAN_SURFACE;
function humanStateHTML(value,technical=''){
  if(!value)return '';
  const labels=humanSurface()?.metaLabels?.(value)||{};
  const meta=[labels.owner,labels.certainty,labels.action].filter(Boolean).map(x=>'<span>'+esc(x)+'</span>').join('');
  return '<div class="human-state tone-'+esc(value.tone||'neutral')+'"><b>'+esc(value.headline||'')+'</b>'+
    (value.detail?'<p>'+esc(value.detail)+'</p>':'')+
    (meta?'<div class="human-state-meta">'+meta+'</div>':'')+
    (technical?'<details class="human-tech"><summary>Ver detalle técnico</summary>'+technical+'</details>':'')+
    '</div>';
}

const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
const signedAssetCache=new Map();
let lastMessagesRenderKey='';
function cachedSignedAsset(bucket,path){
  const key=`${bucket}:${path}`,hit=signedAssetCache.get(key);
  if(!hit||hit.expiresAt<=Date.now()){if(hit)signedAssetCache.delete(key);return ''}
  return hit.url||'';
}
async function signedAssetUrl(bucket,path,expires=3600){
  if(!path)return '';
  const cached=cachedSignedAsset(bucket,path);if(cached)return cached;
  const sb=window.MINDS_SUPABASE;if(!sb)return '';
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return '';
    const {data}=await sb.storage.from(bucket).createSignedUrl(path,expires);
    const url=data?.signedUrl||'';
    if(url)signedAssetCache.set(`${bucket}:${path}`,{url,expiresAt:Date.now()+Math.max(60,expires-120)*1000});
    return url;
  }catch{return ''}
}
function messageRenderKey(messages){
  return JSON.stringify((messages||[]).map(m=>[
    m.id,m.role,m.text,m.reaction,m.replyTo?.id||'',m.replyTo?.text||'',
    (m.attachments||[]).map(a=>[a.path,a.name]),
    (m.artifacts||[]).map(a=>[a.id,a.storage_path,a.kind,a.title]),
    (m.sources||[]).map(s=>[s.url,s.title]),
    (m.quickReplies||[]).map(q=>[q.label,q.value])
  ]));
}
const activeTask=t=>!t.done&&!t.archivedAt;
const MEMORY_KINDS=new Set(['fact','person','routine','episodic','preference','context']);
const MEMORY_KIND_ALIASES={schedule:'routine',habit:'routine',working_style:'preference',interaction:'preference',constraint:'context',goal:'context',priority:'context',value:'preference',project:'context',relation:'context',relationship:'person',work:'context',identity:'fact',note:'context',other:'context'};
function normalizeMemoryKind(kind){const k=String(kind||'context').trim().toLowerCase();return MEMORY_KINDS.has(k)?k:(MEMORY_KIND_ALIASES[k]||'context')}
const taskOrder=(a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.title||'').localeCompare(String(b.title||''),'es');
function nextTaskOrder(date){const key=date||null,xs=state.tasks.filter(t=>(t.date||null)===key&&!t.archivedAt);return xs.length?Math.max(...xs.map(t=>Number(t.sortOrder||0)))+10:10}
function mutation(entityType,action,before,after,source='manual'){
  const entityKey=(after||before)?.id;
  if(!entityKey)return;
  if(after&&['task','event'].includes(String(entityType||'')))after.updatedAt=new Date().toISOString();
  if(['event','task','project'].includes(String(entityType||'')))try{localStorage.setItem('isabella-feed-dirty','1')}catch{}
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
function canonicalFeedPreferences(value={}){
  const p=value&&typeof value==='object'?value:{};
  return {
    mode:'situational_personal',
    instructions:String(p.instructions||'').trim(),
    weatherLocation:String(p.weatherLocation||'').trim(),
    topics:[],customTopics:[],following:[],followGraph:[]
  };
}
function canonicalAttentionPreferences(value={}){
  const p=value&&typeof value==='object'?value:{};
  const route=(v,f)=>['interrupt','briefing','ambient','silent'].includes(String(v||''))?String(v):f;
  return {
    missionCompleted:route(p.missionCompleted,'briefing'),
    missionFailed:route(p.missionFailed,'briefing'),
    imminentEvent:route(p.imminentEvent,'interrupt'),
    overdueTasks:route(p.overdueTasks,'ambient'),
    routineFailure:route(p.routineFailure,'briefing'),
    maxInterruptionsPerHour:Math.max(0,Math.min(12,Number(p.maxInterruptionsPerHour??3))),
    quietHoursEnabled:p.quietHoursEnabled===true,
    quietStart:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.quietStart||''))?String(p.quietStart):'22:00',
    quietEnd:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.quietEnd||''))?String(p.quietEnd):'07:00'
  };
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
],tasks:[],events:[],memory:[],pendingIntent:null,deletedTaskIds:[],deletedEventIds:[],feedThreads:{},feedSignals:[],assistantPreferences:{
  curiosityEnabled:true,
  curiosityCadenceHours:30,
  behaviorRules:[],
  attention:canonicalAttentionPreferences()
},feedPreferences:{
  mode:'situational_personal',
  instructions:'',
  topics:[],
  customTopics:[],
  following:[],
  followGraph:[],
  weatherLocation:''
}};
function normalizeMessages(items){
  const out=[];
  let greetingSeen=false;
  for(const m of items||[]){
    const text=String(m?.text||'').trim(),artifacts=Array.isArray(m?.artifacts)?m.artifacts.filter(x=>x?.storage_path):[];
    if(!text&&!artifacts.length)continue;
    if(/^Edge Function returned a non-2xx status code$/i.test(text))continue;
    if(/^Conecta la memoria de Isabella para activar la IA\.?$/i.test(text))continue;
    if(m.role==='assistant'&&text==='Hola. Soy Isabella.'){
      if(greetingSeen)continue;
      greetingSeen=true;
    }
    const prev=out[out.length-1];
    if(prev&&prev.role===m.role&&prev.text===text)continue;
    out.push({...m,text,artifacts});
  }
  return out;
}
let state=load();
function load(){try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
  const x={...base,...raw,assistantPreferences:{...base.assistantPreferences,...(raw.assistantPreferences||{})},feedPreferences:canonicalFeedPreferences(raw.feedPreferences||{})};
  x.assistantPreferences.attention=canonicalAttentionPreferences(raw?.assistantPreferences?.attention||x.assistantPreferences.attention);
  x.assistantPreferences.behaviorRules=Array.isArray(x.assistantPreferences.behaviorRules)?x.assistantPreferences.behaviorRules:[];
  x.assistantPreferences.curiosityEnabled=x.assistantPreferences.curiosityEnabled!==false;
  x.assistantPreferences.curiosityCadenceHours=Math.max(12,Math.min(168,Number(x.assistantPreferences.curiosityCadenceHours||30)));
  x.feedThreads=x.feedThreads&&typeof x.feedThreads==='object'&&!Array.isArray(x.feedThreads)?x.feedThreads:{};
  x.feedSignals=Array.isArray(x.feedSignals)?x.feedSignals:[];
  x.memory=(Array.isArray(x.memory)?x.memory:[]).map((m,i)=>{if(typeof m!=='object')return {id:'memory-'+i,kind:'context',content:String(m),status:'active',confidence:1,source:'local'};return {...m,kind:normalizeMemoryKind(m.kind),status:m.status==='deleted'?'deleted':(m.status||'active')}});
  x.messages=normalizeMessages(x.messages);return x
}catch{return JSON.parse(JSON.stringify(base))}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{} window.ISABELLA_STATE=state;try{window.dispatchEvent(new CustomEvent('isabella:state',{detail:JSON.parse(JSON.stringify(state))}))}catch{} renderToday();}
function pretty(s,opt={weekday:'long',day:'numeric',month:'long'}){return fromIso(s).toLocaleDateString('es-ES',opt)}
function cat(id){return state.categories.find(x=>x.id===id)?.name||''} function project(id){return state.projects.find(x=>x.id===id)?.name||''}
function fallbackColor(seed=''){
  const palette=['#5A9EC1','#6D7278','#8A72C7','#D08A6A','#9A9466','#2F6FB0','#4F8A62','#B678A2'];
  let h=0;for(const ch of String(seed))h=(h*31+ch.charCodeAt(0))>>>0;
  return palette[h%palette.length];
}
function itemColor(item){
  if(item?.projectId){
    const p=state.projects.find(x=>x.id===item.projectId);
    if(p?.color)return p.color;
  }
  if(item?.categoryId){
    const k=state.categories.find(x=>x.id===item.categoryId);
    if(k?.color)return k.color;
  }
  return fallbackColor(item?.projectId||item?.categoryId||item?.id||'item');
}
function dayColors(date){
  const items=[...state.events.filter(x=>x.date===date),...state.tasks.filter(x=>x.date===date&&!x.archivedAt)];
  return [...new Set(items.map(itemColor).filter(Boolean))].slice(0,4);
}
function formatMessageText(text){
  let html=esc(text);
  html=html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a class="message-link" href="$2" target="_blank" rel="noopener">$1</a>');
  html=html.replace(/\*\*([^*\n][\s\S]*?)\*\*/g,'<strong>$1</strong>');
  html=html.replace(/__([^_\n][\s\S]*?)__/g,'<strong>$1</strong>');
  return html;
}
function cleanGeneratedDeliverableText(text,artifacts=[]){
  let out=String(text||'');
  if(!Array.isArray(artifacts)||!artifacts.length)return out;
  out=out.replace(/^\s*[-*]\s*\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)\s*$/gmi,'');
  out=out.replace(/\[[^\]\n]+\]\(sandbox:\/mnt\/data\/[^)]+\)/gi,'');
  out=out.replace(/\(?sandbox:\/mnt\/data\/[^\s)]+\)?/gi,'');
  out=out.replace(/^\s*[-*]\s*$/gm,'');
  out=out.replace(/\n{3,}/g,'\n\n').trim();
  return out;
}
function artifactSurfaceGroups(artifacts=[]){
  const items=(Array.isArray(artifacts)?artifacts:[]).filter(x=>x?.storage_path);
  const hasMaterial=items.some(x=>String(x?.kind||'')!=='image');
  return {
    previews:hasMaterial?items.filter(x=>String(x?.kind||'')==='image'):[],
    deliverables:hasMaterial?items.filter(x=>String(x?.kind||'')!=='image'):items
  };
}
function minutes(t){const[a,b]=t.split(':').map(Number);return a*60+b}
function greet(){const h=new Date().getHours();return h<12?'Buenos días.':h<19?'Buenas tardes.':'Buenas noches.'}
let reviewDeepLinkHandled=false;
function reviewRequestIdFromUrl(){
  try{
    const id=new URL(window.location.href).searchParams.get('review')||'';
    return /^[0-9a-f-]{36}$/i.test(id)?id:'';
  }catch{return ''}
}
function clearReviewDeepLink(){
  try{
    const url=new URL(window.location.href);url.searchParams.delete('review');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }catch{}
}
async function handleReviewDeepLink(){
  if(reviewDeepLinkHandled)return false;
  const requestId=reviewRequestIdFromUrl();if(!requestId)return false;
  const sb=window.MINDS_SUPABASE;if(!sb)return false;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return false;
    const {data:rows,error}=await sb.from('minds_shadow_decisions')
      .select('request_id,candidate,status,created_at')
      .eq('request_id',requestId).eq('status','pending')
      .order('created_at',{ascending:false}).limit(1);
    if(error)return false;
    reviewDeepLinkHandled=true;show('assistant');clearReviewDeepLink();
    const row=rows?.[0]||null;
    if(row?.candidate){
      confirmProposal({...row.candidate,request_id:requestId});
      return true;
    }
    modal('Revisión',`<div class="small">Esta propuesta ya no está pendiente o ya fue resuelta. Puedes volver al chat de Isabella para continuar.</div>`);
    return true;
  }catch{return false}
}
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
  const reviewId=reviewRequestIdFromUrl();
  show(reviewId?'assistant':state.screen);
  if(reviewId)setTimeout(()=>void handleReviewDeepLink(),0);
}
let proactiveCycleBusy=false,proactiveNudgeBusy=false,curiosityBusy=false;
function proactiveTerms(text){
  return new Set(normalizeText(String(text||'')).split(/\s+/).filter(x=>x.length>3&&!['tienes','sobre','para','esta','este','unos','conviene','claro','claros','quieres','quieras','ahora'].includes(x)));
}
function proactiveSimilarity(a,b){
  const A=proactiveTerms(a),B=proactiveTerms(b);if(!A.size||!B.size)return 0;
  let hit=0;for(const x of A)if(B.has(x))hit++;
  return hit/Math.min(A.size,B.size);
}
function recentlyCoveredProactive(reply){
  const recent=(state.messages||[]).filter(m=>m.role==='assistant').slice(-12);
  return recent.some(m=>proactiveSimilarity(reply,m.text)>=0.62);
}
function recentlyCoveredCuriosity(reply){
  const recent=(state.messages||[]).filter(m=>m.role==='assistant'&&String(m.text||'').includes('?')).slice(-80);
  return recent.some(m=>proactiveSimilarity(reply,m.text)>=0.5);
}
async function maybeProactiveNudge(){
  if(proactiveNudgeBusy)return false;
  try{
    if(!window.ISABELLA_AI?.nudge)return false;
    const key='isabella-last-nudge-at',last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(now-last<6*60*60*1000)return false;
    proactiveNudgeBusy=true;
    localStorage.setItem(key,String(now));
    const result=await window.ISABELLA_AI.nudge(state);
    const reply=String(result?.reply||'').trim();
    if(reply&&reply!=='NO_NUDGE'&&!/^NO_NUDGE[.!]?$/i.test(reply)&&!recentlyCoveredProactive(reply)){say('assistant',reply);return true}
  }catch{}
  finally{proactiveNudgeBusy=false}
  return false;
}
async function maybeCuriosityQuestion(){
  if(curiosityBusy)return false;
  try{
    const prefs=state.assistantPreferences||base.assistantPreferences;
    if(prefs.curiosityEnabled===false||!window.ISABELLA_AI?.curiosity)return false;
    const h=new Date().getHours();if(h<9||h>21)return false;
    const key='isabella-last-curiosity-at',last=Number(localStorage.getItem(key)||0),now=Date.now();
    const cadence=Math.max(12,Math.min(168,Number(prefs.curiosityCadenceHours||30)))*60*60*1000;
    if(now-last<cadence)return false;
    curiosityBusy=true;
    localStorage.setItem(key,String(now));
    const result=await window.ISABELLA_AI.curiosity(state),reply=String(result?.reply||'').trim();
    if(reply&&reply!=='NO_QUESTION'&&!/^NO_QUESTION[.!]?$/i.test(reply)&&!recentlyCoveredCuriosity(reply)){say('assistant',reply);return true}
  }catch{}
  finally{curiosityBusy=false}
  return false;
}
async function maybePrewarmFeed(){
  try{
    if(!window.ISABELLA_AI?.startFeedRefresh)return;
    const key='isabella-feed-prewarm-at',last=Number(localStorage.getItem(key)||0),now=Date.now(),dirty=localStorage.getItem('isabella-feed-dirty')==='1';
    if(!dirty&&now-last<3*60*60*1000)return;
    const result=await window.ISABELLA_AI.startFeedRefresh(state,{force:false,currentItems:feedItems||[]});
    if(result?.accepted||result?.skipped){localStorage.setItem(key,String(now));localStorage.removeItem('isabella-feed-dirty')}
  }catch{}
}
async function maybePrewarmResearch(){
  try{
    if(!window.ISABELLA_AI?.startResearch)return;
    const key='isabella-research-prewarm-at',last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(now-last<12*60*60*1000)return;
    const result=await window.ISABELLA_AI.startResearch();
    if(result?.accepted||result?.skipped)localStorage.setItem(key,String(now));
  }catch{}
}
async function maybeReactivateIdeas(){
  const sb=window.MINDS_SUPABASE;if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    const now=new Date().toISOString();
    const {data:rows}=await sb.from('isabella_return_queue').select('id,reference_id,reactivate_after').eq('status','waiting').not('reactivate_after','is',null).lte('reactivate_after',now).limit(10);
    for(const row of rows||[]){
      if(row.reference_id&&/^[0-9a-f-]{36}$/i.test(String(row.reference_id))){
        await sb.from('minds_surface_items').update({status:'active',lifecycle_state:'changed',expires_at:new Date(Date.now()+24*60*60*1000).toISOString()}).eq('id',row.reference_id);
      }
      await sb.from('isabella_return_queue').update({status:'returned',last_trigger_at:now,updated_at:now}).eq('id',row.id);
    }
  }catch{}
}
async function afterSync(){
  if(proactiveCycleBusy)return;
  proactiveCycleBusy=true;
  try{
    const reviewOpened=await handleReviewDeepLink();
    if(reviewOpened)return;
    void maybePrewarmFeed();
    void maybePrewarmResearch();
    void maybeReactivateIdeas();
    void refreshOperatingModel(false);
    const nudged=await maybeProactiveNudge();
    if(!nudged)await maybeCuriosityQuestion();
  }finally{proactiveCycleBusy=false}
}
function show(name){
  const allowed=['assistant','feed','ideas','work','calendar','readings'];
  if(!allowed.includes(name))name='assistant';
  const previous=state.screen;
  if(name==='calendar'&&previous!=='calendar')state.date=today();
  if(name!=='readings'&&$('#readingsScreen')?.classList.contains('sofia-chat-active')){
    $('#readingsFrame')?.contentWindow?.postMessage({type:'minds:sofia-close'},location.origin);
    $('#readingsScreen')?.classList.remove('sofia-chat-active');
    document.body.classList.remove('sofia-chat-open');
  }
  state.screen=name;
  $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name));
  $$('.main-nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===name));
  document.body.dataset.section=name;
  syncOrbCompact();
  save();
  if(name==='assistant'&&previous!=='assistant')setTimeout(()=>scrollAssistantToLatest(true),0);
  if(name==='calendar')renderCalendar();
  if(name==='feed')renderFeed();
  if(name==='ideas')renderIdeas();
  if(name==='work')setTimeout(()=>window.MINDS_WORK?.render?.(),0);
  if(name==='readings')ensureReadings();
}
function surfaceAgentLabel(agent){return agent==='sofia'?'SOFÍA':agent==='minds'?'MINDS':'ISABELLA'}
function feedStoryKey(item){
  const source=String(item?.source_url||item?.metadata?.source_url||'').trim();
  const title=String(item?.title||'').trim().toLowerCase();
  return source||title;
}
function feedEntities(item){
  const raw=Array.isArray(item?.entities)?item.entities:(Array.isArray(item?.metadata?.entities)?item.metadata.entities:[]);
  return raw.map(x=>typeof x==='string'?{name:x,type:'other',focus:''}:x).filter(x=>String(x?.name||'').trim()).slice(0,4);
}
function recordFeedSignal(kind,item,extra={}){
  const signal={id:uid(),kind,at:new Date().toISOString(),title:String(item?.title||''),source_url:String(item?.source_url||item?.metadata?.source_url||''),entities:feedEntities(item).map(x=>x.name),...extra};
  state.feedSignals=[...(state.feedSignals||[]),signal].slice(-80);save();
}
function surfaceCard(item,surface){
  const agent=String(item.agent||'isabella'),prompt=String(item.action_prompt||item.metadata?.action_prompt||'').trim(),icon=String(item.icon||'').trim();
  const kind=String(item.kind||item.metadata?.kind||'').toLowerCase(),improvement=kind==='isabella_improvement',details=Array.isArray(item.details)?item.details:(Array.isArray(item.metadata?.details)?item.metadata.details:[]);
  const weather=kind==='weather',news=kind==='news',rawSource=String(item.source_url||item.metadata?.source_url||'').trim(),sourceUrl=/^https?:\/\//i.test(rawSource)?rawSource:'';
  const sourceTitle=String(item.source_title||item.metadata?.source_title||'Fuente').trim()||'Fuente';
  const why=String(item.why||item.metadata?.why||'').trim();
  const deliverable=String(item.deliverable||item.metadata?.deliverable||'').trim();
  const detailHtml=weather&&details.length?`<div class="weather-week hidden">${details.slice(0,8).map(d=>`<div class="weather-row"><span>${esc(d.label||d.day||'')}</span><b>${esc(d.value||d.summary||'')}</b></div>`).join('')}</div>`:'';
  const storyKey=feedStoryKey(item),itemKey=String(item.id||storyKey||item.title||'');
  const operational=weather||kind==='commitment'||kind==='pending';
  const feedStory=surface==='feed'&&!operational;
  const idea=surface==='idea';
  const feedback=String(item.user_feedback||'');
  const lifecycle=String(item.lifecycle_state||'new');
  return `<article class="surface-card ${weather?'weather-card':''} ${news?'news-card':''} ${feedback==='liked'?'liked':''}" data-agent="${esc(agent)}" data-surface-item="${esc(itemKey)}">
    <div class="surface-card-top"><span class="surface-icon">${esc(icon||(news?'◫':agent==='sofia'?'◌':'○'))}</span><span class="surface-card-agent">${improvement?'ISABELLA · AUTOEVALUACIÓN':surfaceAgentLabel(agent)}</span>${surface==='feed'&&!operational&&lifecycle==='new'?'<span class="surface-state">NUEVO</span>':''}</div>
    <h2>${esc(item.title||'')}</h2><p>${esc(item.body||'')}</p>${detailHtml}${idea&&deliverable?`<div class="idea-deliverable"><span>RESULTADO</span><strong>${esc(deliverable)}</strong></div>`:''}
    ${why?`<div class="surface-why-copy hidden" data-why-copy="${esc(itemKey)}">${esc(why)}</div>`:''}
    <div class="surface-card-actions">
      ${weather&&details.length?'<button class="weather-toggle">Ver semana</button>':''}
      ${feedStory?`<button class="surface-readmore" data-news-key="${esc(storyKey)}">Leer más</button>`:''}
      ${feedStory&&why?`<button class="surface-why" data-why-key="${esc(itemKey)}">¿Por qué esto?</button>`:''}
      ${feedStory&&sourceUrl?`<a class="surface-source" data-feed-source="${esc(storyKey)}" href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceTitle)}</a>`:''}
      ${idea?`<button class="surface-discuss" data-idea-workspace="${esc(itemKey)}">Convertir en trabajo</button>`:(!feedStory&&prompt?`<button class="surface-discuss" data-surface-agent="${esc(agent)}" data-surface-prompt="${esc(prompt)}">${agent==='sofia'?'Hablar con Sofía':'Hablar con Isabella'}</button>`:'')}
    </div>
    ${feedStory?`<div class="surface-feedback"><button class="${feedback==='liked'?'active':''}" data-feed-feedback="liked" data-feed-item="${esc(itemKey)}">Me gusta</button><button data-feed-feedback="not_relevant" data-feed-item="${esc(itemKey)}">No es relevante</button><button class="danger-text" data-feed-feedback="dismissed" data-feed-item="${esc(itemKey)}">Eliminar</button></div>`:''}
    ${idea?`<div class="surface-feedback idea-lifecycle"><button data-idea-sleep="${esc(itemKey)}">Dormir</button><button class="danger-text" data-idea-dismiss="${esc(itemKey)}">Descartar</button></div>`:''}
  </article>`;
}

function surfaceItemByKey(key){
  const all=[...(feedItems||[]),...(ideaItems||[])];
  return all.find(x=>String(x?.id||feedStoryKey(x)||x?.title||'')===String(key))||null;
}
function dbSurfaceId(item){
  if(String(item?.metadata?.source_table||'')==='isabella_research_queue')return null;
  const id=String(item?.id||'');return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:null;
}
async function persistSurfaceFeedback(item,action){
  if(!item)return;
  const sb=window.MINDS_SUPABASE,id=dbSurfaceId(item),storyKey=feedStoryKey(item);
  recordFeedSignal(action,item);
  if(action==='liked')item.user_feedback='liked';
  if(action==='not_relevant')item.user_feedback='not_relevant';
  if(action==='dismissed'||action==='not_relevant'){
    feedItems=(feedItems||[]).filter(x=>String(x?.id||feedStoryKey(x)||'')!==String(item.id||storyKey));
    if(item?.research_id)researchItems=(researchItems||[]).filter(x=>String(x?.research_id||'')!==String(item.research_id));
    renderFeedItems(feedItems);
  }else renderFeedItems(feedItems);
  if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    await sb.from('minds_surface_feedback').insert({
      user_id:session.user.id,item_id:id,surface:'feed',action,title:String(item.title||''),
      metadata:{kind:String(item.kind||item.metadata?.kind||''),section:String(item.section||item.metadata?.section||''),entities:feedEntities(item).map(x=>x.name),source_url:String(item.source_url||item.metadata?.source_url||'')}
    });
    if(id){
      const patch=action==='liked'?{user_feedback:'liked'}:action==='not_relevant'?{user_feedback:'not_relevant',status:'dismissed',lifecycle_state:'dismissed'}:action==='dismissed'?{status:'dismissed',lifecycle_state:'dismissed'}:{};
      if(Object.keys(patch).length)await sb.from('minds_surface_items').update(patch).eq('id',id);
    }
    const researchId=String(item?.research_id||'');
    if(researchId&&(action==='not_relevant'||action==='dismissed'))await sb.from('isabella_research_queue').update({status:'dismissed',updated_at:new Date().toISOString()}).eq('id',researchId);
  }catch{}
}
async function markSurfaceSeen(item){
  const id=dbSurfaceId(item);if(!id||String(item.lifecycle_state||'')==='seen')return;
  item.lifecycle_state='seen';item.seen_at=new Date().toISOString();
  const sb=window.MINDS_SUPABASE;if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    await Promise.all([
      sb.from('minds_surface_items').update({lifecycle_state:'seen',seen_at:item.seen_at}).eq('id',id),
      sb.from('minds_surface_feedback').insert({user_id:session.user.id,item_id:id,surface:'feed',action:'seen',title:String(item.title||''),metadata:{}})
    ]);
  }catch{}
}
async function updateIdeaLifecycle(item,lifecycle,status='active'){
  const id=dbSurfaceId(item),sb=window.MINDS_SUPABASE;if(!id||!sb)return;
  try{await sb.from('minds_surface_items').update({lifecycle_state:lifecycle,status}).eq('id',id)}catch{}
}
function ideaWorkspaceCard(w){
  const artifact=String(w.artifact_content||'').trim(),done=w.status==='done';
  const stateLabel=done?'PRODUCIDO':artifact?'ARTEFACTO EN DESARROLLO':'EN PRODUCCIÓN';
  return `<button class="idea-workspace-card ${done?'done':''}" data-open-idea-workspace="${esc(w.id)}"><span class="idea-workspace-card-state">${stateLabel}</span><strong>${esc(w.title||'Trabajo')}</strong><span>${artifact?'Artefacto disponible':'Trabajo activo'} · ${new Date(w.updated_at||w.created_at||Date.now()).toLocaleDateString('es-ES')}</span></button>`;
}
async function loadIdeaWorkspaces(){
  const sb=window.MINDS_SUPABASE;if(!sb)return [];
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return [];
    const {data,error}=await sb.from('minds_idea_workspaces').select('*').in('status',['active','done']).order('updated_at',{ascending:false}).limit(24);
    if(error)throw error;
    return data||[];
  }catch{return []}
}
function bindIdeaWorkspaceCards(){
  document.querySelectorAll('[data-open-idea-workspace]').forEach(b=>b.onclick=()=>void openIdeaWorkspace(b.dataset.openIdeaWorkspace||''));
}
function renderIdeaItems(items){
  const box=$('#ideasList');if(!box)return;
  ideaItems=(items||[]).filter(Boolean);
  const active=(ideaWorkspaces||[]).filter(w=>w.status==='active'),done=(ideaWorkspaces||[]).filter(w=>w.status==='done').slice(0,6);
  const activeHtml=active.length?`<section class="idea-workspaces-section"><h2 class="feed-section-title">En producción</h2><div class="idea-workspace-cards">${active.map(ideaWorkspaceCard).join('')}</div></section>`:'';
  const proposalsHtml=ideaItems.length?`<section class="idea-suggestions-section"><h2 class="feed-section-title">Propuestas</h2>${ideaItems.map(x=>surfaceCard(x,'idea')).join('')}</section>`:'<div class="surface-empty">Ahora mismo no apareció una propuesta suficientemente fuerte para convertirla en trabajo.</div>';
  const doneHtml=done.length?`<section class="idea-workspaces-section idea-produced-section"><h2 class="feed-section-title">Producido</h2><div class="idea-workspace-cards">${done.map(ideaWorkspaceCard).join('')}</div></section>`:'';
  box.innerHTML=activeHtml+proposalsHtml+doneHtml;
  bindSurfaceActions();bindIdeaWorkspaceCards();
}
async function openIdeaWorkspaceFromIdea(key){
  const item=surfaceItemByKey(key);if(!item)return;
  const sb=window.MINDS_SUPABASE;if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session){say('assistant','Conecta la memoria para abrir un espacio de trabajo persistente.');return}
    const sourceId=dbSurfaceId(item),deliverable=String(item.deliverable||item.metadata?.deliverable||'').trim();
    let workspace=null;
    if(sourceId){
      const {data}=await sb.from('minds_idea_workspaces').select('*').eq('source_item_id',sourceId).maybeSingle();
      workspace=data||null;
    }
    if(!workspace){
      const {data,error}=await sb.from('minds_idea_workspaces').insert({
        user_id:session.user.id,source_item_id:sourceId,title:String(item.title||'Idea'),
        brief:String(item.body||'')+(deliverable?'\n\nResultado esperado: '+deliverable:''),
        why:String(item.why||item.metadata?.why||''),agent:String(item.agent||'minds'),status:'active'
      }).select('*').single();
      if(error)throw error;workspace=data;
      await updateIdeaLifecycle(item,'active','active');
      ideaWorkspaces=[workspace,...ideaWorkspaces.filter(x=>x.id!==workspace.id)];
    }
    await openIdeaWorkspace(workspace.id,{kickoff:true});
  }catch(e){modal('Idea','<div class="small">No pude abrir este espacio de trabajo ahora mismo.</div>')}
}
async function openIdeaWorkspace(id,{kickoff=false}={}){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  try{
    const [{data:workspace,error:werr},{data:messages,error:merr},{data:artifacts,error:aerr}]=await Promise.all([
      sb.from('minds_idea_workspaces').select('*').eq('id',id).single(),
      sb.from('minds_idea_messages').select('id,role,content,sources,created_at').eq('workspace_id',id).order('created_at',{ascending:true}).limit(120),
      sb.from('minds_artifacts').select('id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at').eq('workspace_id',id).order('created_at',{ascending:true}).limit(40)
    ]);
    if(werr||merr||aerr||!workspace)throw werr||merr||aerr||new Error('Workspace not found');
    activeIdeaWorkspace={...workspace,messages:messages||[],artifacts:artifacts||[]};
    $('#ideaWorkspace').classList.remove('hidden');$('#ideaWorkspace').setAttribute('aria-hidden','false');document.body.classList.add('idea-workspace-open');
    renderIdeaWorkspace();
    if(kickoff&&!activeIdeaWorkspace.messages.length){
      await runIdeaWorkspace('Convierte esta propuesta en trabajo real. Produce ahora una primera versión útil del artefacto siempre que el contexto sea suficiente; pregunta solo si falta una decisión que bloquee de verdad el siguiente avance.',{kickoff:true});
    }
  }catch(e){modal('Idea','<div class="small">No pude cargar este espacio de trabajo.</div>')}
}
function closeIdeaWorkspace(){
  $('#ideaWorkspace').classList.add('hidden');$('#ideaWorkspace').setAttribute('aria-hidden','true');document.body.classList.remove('idea-workspace-open');activeIdeaWorkspace=null;
}
function artifactPreviewMarkup(a,compact=false){
  const title=String(a?.title||'Vista previa'),path=String(a?.storage_path||'');if(!path)return '';
  return `<button class="generated-artifact-preview ${compact?'compact':''}" data-artifact-open-image="${esc(path)}" data-artifact-title="${esc(title)}" type="button" aria-label="Abrir vista previa"><img loading="lazy" data-artifact-image="${esc(path)}" alt="Vista previa del documento"></button>`;
}
function artifactMarkup(a,compact=false){
  const kind=String(a?.kind||''),title=String(a?.title||'Artefacto'),path=String(a?.storage_path||'');
  if(!path)return '';
  if(kind==='image'){return `<button class="generated-artifact generated-image ${compact?'compact':''}" data-artifact-open-image="${esc(path)}" data-artifact-title="${esc(title)}" type="button"><img loading="lazy" data-artifact-image="${esc(path)}" alt="${esc(title)}"><span class="generated-image-caption"><span>IMAGEN</span><strong>${esc(title)}</strong><em>Abrir ↗</em></span></button>`}
  const label=({docx:'WORD',pdf:'PDF',xlsx:'EXCEL',pptx:'POWERPOINT',csv:'CSV',zip:'ZIP',html:'HTML',txt:'TXT',json:'JSON'}[kind]||kind.toUpperCase());
  return `<a class="generated-artifact generated-file ${compact?'compact':''}" data-artifact-file="${esc(path)}" href="#" target="_blank" rel="noopener"><span>${esc(label)}</span><strong>${esc(title)}</strong><em>Abrir archivo ↗</em></a>`;
}
async function artifactSignedUrl(path,expires=3600){return signedAssetUrl('minds-artifacts',path,expires)}
async function openArtifactImage(path,title='Imagen'){
  const url=await artifactSignedUrl(path,3600);if(!url)return;
  modal(title,`<div class="artifact-image-viewer"><img src="${esc(url)}" alt="${esc(title)}"></div>`);
  $('#modal')?.classList.add('artifact-image-modal');
}
function bindArtifactActions(root=document){
  root.querySelectorAll?.('[data-artifact-open-image]').forEach(b=>{
    b.onclick=()=>void openArtifactImage(String(b.dataset.artifactOpenImage||''),String(b.dataset.artifactTitle||'Imagen'));
  });
}
let lazyStorageImageObserver=null;
function observeStorageImage(node,bucket,path){
  if(!node||!path||node.dataset.loaded==='1')return;
  if(!('IntersectionObserver' in window)){
    void signedAssetUrl(bucket,path,3600).then(url=>{if(url&&node.isConnected){node.src=url;node.dataset.loaded='1'}});
    return;
  }
  if(!lazyStorageImageObserver)lazyStorageImageObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const img=entry.target,b=img.dataset.storageBucket,p=img.dataset.storagePath;
      lazyStorageImageObserver.unobserve(img);
      if(!b||!p)continue;
      void signedAssetUrl(b,p,3600).then(url=>{if(url&&img.isConnected){img.src=url;img.dataset.loaded='1'}});
    }
  },{root:null,rootMargin:'240px 0px'});
  node.dataset.storageBucket=bucket;node.dataset.storagePath=path;lazyStorageImageObserver.observe(node);
}
async function hydrateArtifactFiles(root=document){
  const images=[...root.querySelectorAll('[data-artifact-image]')].filter(x=>!x.dataset.loaded);
  for(const img of images)observeStorageImage(img,'minds-artifacts',img.dataset.artifactImage||'');
  const files=[...root.querySelectorAll('[data-artifact-file]')].filter(x=>!x.dataset.loaded);
  await Promise.all(files.map(async node=>{
    const path=node.dataset.artifactFile;if(!path)return;
    const signed=await artifactSignedUrl(path,3600);if(!signed)return;
    node.href=signed;node.dataset.loaded='1';
  }));
  bindArtifactActions(root);
}
function renderIdeaWorkspace(){
  const w=activeIdeaWorkspace;if(!w)return;
  $('#ideaWorkspaceTitle').textContent=w.title||'Trabajo';
  $('#ideaWorkspaceBrief').textContent=w.brief||'';
  $('#ideaWorkspaceStatus').textContent=w.status==='done'?'PRODUCIDO':'EN PRODUCCIÓN';
  const artifact=$('#ideaWorkspaceArtifact'),content=String(w.artifact_content||'').trim(),files=Array.isArray(w.artifacts)?w.artifacts:[];
  if(content||files.length){
    artifact.classList.remove('hidden');
    const textActions=content?`<button id="copyIdeaArtifact">Copiar</button><button id="downloadIdeaArtifact">Descargar .md</button>`:'';
    const textArtifact=content?`<div class="idea-markdown-artifact"><div class="idea-artifact-label">BORRADOR DE TRABAJO</div><pre>${esc(content)}</pre></div>`:'';
    artifact.innerHTML=`<div class="idea-artifact-head"><div><span>PRODUCTO</span><strong>${esc(w.artifact_title||files.at(-1)?.title||'Artefacto')}</strong></div><div>${textActions}<button id="toggleIdeaWorkspaceDone">${w.status==='done'?'Reabrir':'Marcar producido'}</button></div></div>${files.length?`<div class="idea-file-artifacts">${files.map(x=>artifactMarkup(x)).join('')}</div>`:''}${textArtifact}`;
    if(content){$('#copyIdeaArtifact').onclick=()=>navigator.clipboard?.writeText(content);$('#downloadIdeaArtifact').onclick=()=>downloadIdeaArtifact(w)}
    $('#toggleIdeaWorkspaceDone').onclick=()=>void toggleIdeaWorkspaceStatus(w.status==='done'?'active':'done');
    void hydrateArtifactFiles();
  }else{artifact.classList.add('hidden');artifact.innerHTML=''}
  const thread=$('#ideaWorkspaceThread');
  thread.innerHTML=(w.messages||[]).map(m=>`<div class="idea-workspace-message ${m.role}"><div>${formatMessageText(m.content||'')}</div>${Array.isArray(m.sources)&&m.sources.length?`<div class="feed-thread-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}</div>`).join('');
  requestAnimationFrame(()=>{const sc=$('#ideaWorkspaceScroll');if(sc)sc.scrollTop=sc.scrollHeight});
}
function downloadIdeaArtifact(w){
  const content=String(w?.artifact_content||'');if(!content)return;
  const blob=new Blob([content],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(String(w.artifact_title||w.title||'entregable').replace(/[^a-z0-9áéíóúüñ_-]+/gi,'-').replace(/^-|-$/g,'')||'entregable')+'.md';
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function toggleIdeaWorkspaceStatus(status){
  const w=activeIdeaWorkspace,sb=window.MINDS_SUPABASE;if(!w||!sb)return;
  try{
    const patch={status,updated_at:new Date().toISOString()};
    const {error}=await sb.from('minds_idea_workspaces').update(patch).eq('id',w.id);if(error)throw error;
    Object.assign(w,patch);ideaWorkspaces=[{...w,messages:undefined},...ideaWorkspaces.filter(x=>x.id!==w.id)];
    renderIdeaWorkspace();
  }catch{}
}
async function runIdeaWorkspace(message,{kickoff=false}={}){
  const w=activeIdeaWorkspace,sb=window.MINDS_SUPABASE;if(!w||!sb||!message)return;
  const form=$('#ideaWorkspaceForm'),input=$('#ideaWorkspaceInput'),send=form?.querySelector('.send');let session=null;
  try{
    form?.classList.add('working');setWorking(send,true);$('#ideaWorkspaceStatus').textContent='PRODUCIENDO…';
    const auth=await sb.auth.getSession();session=auth.data.session;if(!session)throw new Error('Sin sesión');
    if(w.status==='done'){
      await sb.from('minds_idea_workspaces').update({status:'active',updated_at:new Date().toISOString()}).eq('id',w.id);w.status='active';
    }
    if(!kickoff){
      const {data,error}=await sb.from('minds_idea_messages').insert({workspace_id:w.id,user_id:session.user.id,role:'user',content:message,sources:[]}).select('id,role,content,sources,created_at').single();
      if(error)throw error;w.messages.push(data);renderIdeaWorkspace();$('#ideaWorkspaceStatus').textContent='PRODUCIENDO…';
    }
    const result=await window.ISABELLA_AI?.ideaWork?.(w,message,w.messages||[],state);
    if(result?.generated_artifact)w.artifacts=[...(w.artifacts||[]),result.generated_artifact].filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i);
    if(result?.artifact?.content){
      const patch={artifact_title:String(result.artifact.title||w.title||'Artefacto'),artifact_content:String(result.artifact.content),artifact_format:'markdown',updated_at:new Date().toISOString()};
      const {error}=await sb.from('minds_idea_workspaces').update(patch).eq('id',w.id);if(error)throw error;Object.assign(w,patch);
    }else{
      const patch={updated_at:new Date().toISOString()};await sb.from('minds_idea_workspaces').update(patch).eq('id',w.id);Object.assign(w,patch);
    }
    if(result?.reply){
      const {data,error}=await sb.from('minds_idea_messages').insert({workspace_id:w.id,user_id:session.user.id,role:'assistant',content:result.reply,sources:result.sources||[]}).select('id,role,content,sources,created_at').single();
      if(error)throw error;w.messages.push(data);
    }
    ideaWorkspaces=[{...w,messages:undefined},...ideaWorkspaces.filter(x=>x.id!==w.id)];
  }catch(e){
    const content='No pude avanzar este trabajo ahora mismo. Inténtalo otra vez.';
    if(session){try{const {data}=await sb.from('minds_idea_messages').insert({workspace_id:w.id,user_id:session.user.id,role:'assistant',content,sources:[]}).select('id,role,content,sources,created_at').single();if(data)w.messages.push(data)}catch{}}
    else w.messages.push({id:uid(),role:'assistant',content,sources:[],created_at:new Date().toISOString()});
  }finally{
    form?.classList.remove('working');setWorking(send,false);renderIdeaWorkspace();if(input)input.focus()
  }
}
function sleepIdea(key){
  const item=surfaceItemByKey(key);if(!item)return;
  modal('Dormir idea',`<div class="form"><div class="small">La idea sale de la vista activa y puede volver más adelante.</div><button data-sleep-days="7" class="secondary">Una semana</button><button data-sleep-days="30" class="secondary">Un mes</button><button data-sleep-days="" class="secondary">Hasta que haya nueva evidencia</button></div>`);
  document.querySelectorAll('[data-sleep-days]').forEach(b=>b.onclick=async()=>{
    const raw=b.dataset.sleepDays,days=raw?Number(raw):null,reactivate=days?new Date(Date.now()+days*86400000).toISOString():null;
    const sb=window.MINDS_SUPABASE,id=dbSurfaceId(item);
    if(sb){try{
      const {data:{session}}=await sb.auth.getSession();
      if(session){
        await sb.from('isabella_return_queue').insert({user_id:session.user.id,kind:'idea',reference_id:id||String(item.id||''),title:String(item.title||'Idea'),reason:'Idea dormida por el usuario',status:'waiting',reactivate_after:reactivate,metadata:{source:'ideas'}});
        if(id)await sb.from('minds_surface_items').update({lifecycle_state:'pending',status:'dismissed'}).eq('id',id);
      }
    }catch{}}
    ideaItems=ideaItems.filter(x=>String(x.id||x.title)!==String(item.id||item.title));closeModal();renderIdeaItems(ideaItems);
  });
}
async function dismissIdea(key){
  const item=surfaceItemByKey(key);if(!item)return;
  await updateIdeaLifecycle(item,'dismissed','dismissed');
  ideaItems=ideaItems.filter(x=>String(x.id||x.title)!==String(item.id||item.title));
  renderIdeaItems(ideaItems);
}
function bindSurfaceActions(){
  document.querySelectorAll('[data-news-key]').forEach(b=>b.onclick=()=>openFeedStory(b.dataset.newsKey||''));
  document.querySelectorAll('[data-why-key]').forEach(b=>b.onclick=()=>{const key=b.dataset.whyKey||'',copy=document.querySelector('[data-why-copy="'+CSS.escape(key)+'"]');if(!copy)return;const opening=copy.classList.contains('hidden');copy.classList.toggle('hidden',!opening);b.textContent=opening?'Ocultar razón':'¿Por qué esto?'});
  document.querySelectorAll('[data-feed-feedback]').forEach(b=>b.onclick=()=>{const item=surfaceItemByKey(b.dataset.feedItem||'');if(item)void persistSurfaceFeedback(item,b.dataset.feedFeedback||'')});
  document.querySelectorAll('[data-idea-workspace]').forEach(b=>b.onclick=()=>void openIdeaWorkspaceFromIdea(b.dataset.ideaWorkspace||''));
  document.querySelectorAll('[data-idea-sleep]').forEach(b=>b.onclick=()=>sleepIdea(b.dataset.ideaSleep||''));
  document.querySelectorAll('[data-idea-dismiss]').forEach(b=>b.onclick=()=>void dismissIdea(b.dataset.ideaDismiss||''));
  document.querySelectorAll('[data-feed-source]').forEach(a=>a.onclick=()=>{const item=feedItems.find(x=>feedStoryKey(x)===(a.dataset.feedSource||''));if(item)recordFeedSignal('source_opened',item)});
  document.querySelectorAll('[data-surface-prompt]').forEach(b=>b.onclick=()=>{
    const prompt=b.dataset.surfacePrompt||'',agent=b.dataset.surfaceAgent||'isabella';
    if(agent==='sofia'){
      show('readings');
      setTimeout(()=>$('#readingsFrame')?.contentWindow?.postMessage({type:'minds:sofia-prompt',prompt},location.origin),220);
    }else{
      show('assistant');
      setTimeout(()=>handle(prompt),80);
    }
  });
  document.querySelectorAll('.weather-toggle').forEach(b=>b.onclick=()=>{
    const card=b.closest('.weather-card'),week=card?.querySelector('.weather-week');if(!week)return;
    const opening=week.classList.contains('hidden');week.classList.toggle('hidden',!opening);b.textContent=opening?'Ocultar semana':'Ver semana';
  });
}
let feedBusy=false,ideasBusy=false,feedItems=[],ideaItems=[],ideaWorkspaces=[],researchItems=[],activeFeedStory=null,activeIdeaWorkspace=null;
const feedOverviewRequests=new Set(),feedQuestionRequests=new Set();
function dedupeFeedItems(items){
  return (items||[]).filter(Boolean).filter((x,i,arr)=>{
    const key=feedStoryKey(x)||String(x.id||x.title||'');
    return arr.findIndex(y=>(feedStoryKey(y)||String(y.id||y.title||''))===key)===i;
  }).slice(0,24);
}
function fixedTodayFeedItems(){
  const td=today();
  const events=(state.events||[]).filter(x=>x.date===td).sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))).map(x=>({
    id:'today-event-'+x.id,agent:'minds',section:'today',kind:'commitment',title:(x.start?x.start+' · ':'')+x.title,
    body:[x.projectId?project(x.projectId):'',x.categoryId?cat(x.categoryId):'',x.duration?x.duration+' min':''].filter(Boolean).join(' · '),
    icon:'',action_prompt:''
  }));
  const tasks=(state.tasks||[]).filter(x=>x.date===td&&!x.done&&!x.archivedAt).sort(taskOrder).map(x=>({
    id:'today-task-'+x.id,agent:'minds',section:'today',kind:'pending',title:x.title,
    body:[x.projectId?project(x.projectId):'',x.categoryId?cat(x.categoryId):'',x.reminderTime?'Recordatorio '+x.reminderTime:''].filter(Boolean).join(' · '),
    icon:'',action_prompt:''
  }));
  return [...events,...tasks].slice(0,10);
}
function renderFeedItems(items){
  const box=$('#feedList');if(!box)return;
  const all=dedupeFeedItems(items),generation=String(all.find(x=>x?.metadata?.generation_id)?.metadata?.generation_id||'');
  const current=all.filter(x=>!generation||String(x?.metadata?.generation_id||'')===generation);
  const kindOf=x=>String(x?.kind||x?.metadata?.kind||'').toLowerCase(),sectionOf=x=>String(x?.section||x?.metadata?.section||'').toLowerCase();
  const weather=current.find(x=>kindOf(x)==='weather')||all.find(x=>kindOf(x)==='weather');
  const allowed=x=>!['weather','clear','news','commitment','pending','research'].includes(kindOf(x))&&sectionOf(x)!=='news'&&sectionOf(x)!=='work';
  const now=current.filter(allowed).slice(0,5);
  const norm=v=>String(v||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const anchors=x=>{const text=norm((x?.title||'')+' '+(x?.body||'')),out=new Set();for(const e of (x?.entities||x?.metadata?.entities||[])){const n=norm(e?.name||'');if(n)out.add(n)}for(const p of state.projects||[]){const n=norm(p?.name||'');if(n&&text.includes(n))out.add(n)}const first=norm(x?.title||'').match(/[a-z0-9][a-z0-9&/-]{4,}/)?.[0];if(first)out.add(first);return out};
  const overlaps=(a,b)=>{const aa=anchors(a),bb=anchors(b);return [...aa].some(x=>bb.has(x))};
  const ongoing=all.filter(x=>allowed(x)&&(!generation||String(x?.metadata?.generation_id||'')!==generation)&&(String(x.lifecycle_state||'')==='seen'||String(x.user_feedback||'')==='liked')&&!now.some(n=>overlaps(x,n))).slice(0,2);
  feedItems=dedupeFeedItems([...(weather?[weather]:[]),...now,...ongoing]);
  const weatherHtml=weather?surfaceCard(weather,'feed'):`<div class="feed-weather-placeholder"><div><span>CLIMA</span><strong>Sin localidad configurada</strong></div><button data-weather-settings>Ajustar</button></div>`;
  const nowHtml=now.length?now.map(x=>surfaceCard(x,'feed')).join(''):'<div class="surface-empty feed-now-empty">Ahora mismo no hay nada que merezca interrumpirte.</div>';
  const ongoingHtml=ongoing.length?`<section class="feed-section feed-ongoing"><h2 class="feed-section-title">Retomar</h2>${ongoing.map(x=>surfaceCard(x,'feed')).join('')}</section>`:'';
  box.innerHTML=`<section class="feed-weather-section">${weatherHtml}</section><section class="feed-section"><h2 class="feed-section-title">Ahora</h2>${nowHtml}</section>${ongoingHtml}`;
  bindSurfaceActions();
  document.querySelector('[data-weather-settings]')?.addEventListener('click',feedPreferencesPanel);
}
async function renderFeed(force=false){
  const box=$('#feedList'),refresh=$('#refreshFeed'),status=$('#feedRefreshStatus');if(!box||feedBusy)return;feedBusy=true;
  let visible=[...feedItems];if(force&&refresh){refresh.disabled=true;setWorking(refresh,true)}
  try{
    const cached=await (window.ISABELLA_AI?.loadSurface?.('feed','isabella',{allowStale:true})||[]);
    visible=dedupeFeedItems([...(cached||[]),...visible]);
    if(visible.length)renderFeedItems(visible);else box.innerHTML='<div class="surface-loading">Leyendo tu situación…</div>';
    const hasCurrent=(cached||[]).some(x=>Number(x?.metadata?.surface_version||0)>=11);
    if(status&&(force||!hasCurrent))status.textContent='Reevaluando tu situación…';
    const request=await window.ISABELLA_AI?.startFeedRefresh?.(state,{force,currentItems:visible});
    if(!request||request.skipped){try{localStorage.removeItem('isabella-feed-dirty')}catch{}if(status)status.textContent='';return}
    if(status)status.textContent='Reevaluando tu situación…';
    const result=await window.ISABELLA_AI?.waitForFeedRefresh?.(request.generation_id,{timeoutMs:90000,intervalMs:1600});
    if(result?.status==='succeeded'){
      try{localStorage.removeItem('isabella-feed-dirty')}catch{}
      const fresh=result.items||await window.ISABELLA_AI?.loadSurface?.('feed','isabella',{allowStale:true})||[];
      if(fresh.length)renderFeedItems(fresh);
      if(status){status.textContent='Al día';setTimeout(()=>{if(status.textContent==='Al día')status.textContent=''},1800)}
    }else if(result?.status==='pending'){
      if(status)status.textContent='Sigo reevaluando en segundo plano…';
      setTimeout(()=>{if(status.textContent==='Sigo reevaluando en segundo plano…')status.textContent=''},4500);
    }
  }catch(err){
    if(visible.length)renderFeedItems(visible);else box.innerHTML='<div class="surface-empty">No pude reevaluar tu situación ahora mismo.</div>';
    if(status){status.textContent='No pude reevaluar';setTimeout(()=>{if(status.textContent==='No pude reevaluar')status.textContent=''},2600)}
  }finally{
    feedBusy=false;
    if(refresh){refresh.disabled=false;setWorking(refresh,false)}
  }
}
function feedThreadFor(item){
  const key=feedStoryKey(item);if(!key)return null;
  if(!state.feedThreads[key])state.feedThreads[key]={key,title:String(item.title||''),source_url:String(item.source_url||item.metadata?.source_url||''),created:new Date().toISOString(),updated:new Date().toISOString(),overview:'',messages:[]};
  const thread=state.feedThreads[key];
  if(Object.prototype.hasOwnProperty.call(thread,'overviewLoading'))delete thread.overviewLoading;
  if(typeof thread.overview!=='string')thread.overview='';
  if(!thread.overview&&Array.isArray(thread.messages)&&thread.messages.length&&thread.messages[0]?.role==='assistant'){
    const firstUser=thread.messages.findIndex(m=>m.role==='user');
    if(firstUser!==0){thread.overview=String(thread.messages[0].text||'');thread.overviewSources=thread.messages[0].sources||[];thread.messages=thread.messages.slice(1);save()}
  }
  return thread;
}
function renderFeedOverview(item){
  const thread=feedThreadFor(item),article=$('#feedDetailArticle');if(!article||!thread)return;
  const itemDetail=String(item.detail||item.metadata?.detail||'').trim();
  const detail=itemDetail||String(thread.overview||'').trim();
  if(feedOverviewRequests.has(thread.key)&&!detail){article.innerHTML='<div class="feed-detail-loading">Buscando contexto y antecedentes…</div>';return}
  article.innerHTML=detail?`<div class="feed-detail-copy">${formatMessageText(detail)}</div>${Array.isArray(thread.overviewSources)&&thread.overviewSources.length?`<div class="feed-detail-sources">${thread.overviewSources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}`:'';
}
function renderFeedThread(item){
  const thread=feedThreadFor(item),log=$('#feedThreadLog');if(!thread||!log)return;
  const pending=feedQuestionRequests.has(thread.key)?'<div class="feed-thread-message assistant pending"><div class="feed-thread-text">Buscando una respuesta…</div></div>':'';
  log.innerHTML=(thread.messages||[]).map(m=>`<div class="feed-thread-message ${m.role}"><div class="feed-thread-text">${formatMessageText(m.text||'')}</div>${Array.isArray(m.sources)&&m.sources.length?`<div class="feed-thread-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}</div>`).join('')+pending;
  requestAnimationFrame(()=>{const sc=$('#feedDetailScroll');if(sc&&(thread.messages?.length||pending))sc.scrollTop=sc.scrollHeight});
}
async function hydrateFeedStory(item){
  const thread=feedThreadFor(item);if(!thread)return;
  const key=thread.key;if(feedOverviewRequests.has(key))return;
  const existing=String(item.detail||item.metadata?.detail||thread.overview||'').trim();if(existing){renderFeedOverview(item);return}
  feedOverviewRequests.add(key);renderFeedOverview(item);
  try{
    const result=await window.ISABELLA_AI?.feedStory?.(item,state,'',[]);
    if(!result?.reply)throw new Error('La ampliación no devolvió contenido.');
    thread.overview=String(result.reply);thread.overviewSources=result.sources||[];thread.updated=new Date().toISOString();recordFeedSignal('expanded',item);
  }catch(e){
    thread.overview='No pude ampliar esta noticia ahora mismo. Puedes abrir la fuente original o intentarlo de nuevo más tarde.';
  }finally{
    feedOverviewRequests.delete(key);thread.updated=new Date().toISOString();save();renderFeedOverview(item)
  }
}

function feedFollowChip(entity){
  const name=String(entity?.name||'').trim();if(!name)return '';
  const followed=(state.feedPreferences?.followGraph||[]).some(x=>String(x.name||'').toLowerCase()===name.toLowerCase());
  return `<button class="feed-follow-chip ${followed?'following':''}" data-feed-follow-name="${esc(name)}" data-feed-follow-type="${esc(entity.type||'other')}" data-feed-follow-focus="${esc(entity.focus||'')}">${followed?'Siguiendo':'Seguir'} · ${esc(name)}</button>`;
}
function bindFeedFollowChips(){
  $$('#feedDetail [data-feed-follow-name]').forEach(b=>b.onclick=()=>{
    const name=b.dataset.feedFollowName||'',type=b.dataset.feedFollowType||'other',focus=b.dataset.feedFollowFocus||'';if(!name)return;
    const graph=state.feedPreferences.followGraph||[];
    if(!graph.some(x=>String(x.name||'').toLowerCase()===name.toLowerCase())){
      graph.push({id:uid(),name,type,focus,active:true});state.feedPreferences.followGraph=graph;state.feedPreferences.following=graph.map(x=>x.name);recordFeedSignal('followed',activeFeedStory,{entity:name});save();
    }
    b.textContent='Siguiendo · '+name;b.classList.add('following');
  });
}
function openFeedStory(key){
  const item=feedItems.find(x=>feedStoryKey(x)===key);if(!item)return;
  activeFeedStory=item;recordFeedSignal('opened',item);void markSurfaceSeen(item);$('#feedDetailTitle').textContent=item.title||'';$('#feedDetailSummary').textContent=item.body||'';
  const kind=String(item.kind||item.metadata?.kind||'news').toLowerCase(),sourceUrl=String(item.source_url||item.metadata?.source_url||'').trim(),sourceTitle=String(item.source_title||item.metadata?.source_title||'Fuente').trim()||'Fuente';
  const detail=String(item.detail||item.metadata?.detail||'').trim(),imageUrl=String(item.image_url||item.metadata?.image_url||'').trim(),imageAlt=String(item.image_alt||item.metadata?.image_alt||item.title||'').trim();
  $('#feedDetailMeta').innerHTML=`<span>SEÑAL</span>${/^https?:\/\//i.test(sourceUrl)?`<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceTitle)} ↗</a>`:''}`;
  const media=$('#feedDetailMedia');media.innerHTML=/^https?:\/\//i.test(imageUrl)?`<figure><img src="${esc(imageUrl)}" alt="${esc(imageAlt)}"><figcaption>${esc(sourceTitle)}</figcaption></figure>`:'';
  media.querySelector('img')?.addEventListener('error',()=>{media.innerHTML=''});
  $('#feedDetailFollow').innerHTML='';
  $('#feedDetail').classList.remove('hidden');$('#feedDetail').setAttribute('aria-hidden','false');document.body.classList.add('feed-detail-open');renderFeedOverview(item);renderFeedThread(item);
  if(!['weather','commitment','pending'].includes(kind)&&!detail)hydrateFeedStory(item);
}
function closeFeedStory(){$('#feedDetail').classList.add('hidden');$('#feedDetail').setAttribute('aria-hidden','true');document.body.classList.remove('feed-detail-open');activeFeedStory=null}
async function submitFeedStoryQuestion(text){
  const item=activeFeedStory,thread=item?feedThreadFor(item):null;if(!item||!thread)return;
  const key=thread.key;if(feedQuestionRequests.has(key))return;
  const q=String(text||'').trim();if(!q)return;
  const send=$('#feedThreadForm .send');
  thread.messages.push({id:uid(),role:'user',text:q,at:new Date().toISOString()});thread.updated=new Date().toISOString();save();recordFeedSignal('questioned',item);
  feedQuestionRequests.add(key);setWorking(send,true);renderFeedThread(item);
  try{
    const result=await window.ISABELLA_AI?.feedStory?.(item,state,q,thread.messages||[]);
    if(!result?.reply)throw new Error('La respuesta del Feed llegó vacía.');
    thread.messages.push({id:uid(),role:'assistant',text:result.reply,sources:result.sources||[],at:new Date().toISOString()})
  }catch(e){
    thread.messages.push({id:uid(),role:'assistant',text:'No pude profundizar esta señal ahora mismo. Inténtalo de nuevo.',at:new Date().toISOString()})
  }finally{
    feedQuestionRequests.delete(key);setWorking(send,false);thread.updated=new Date().toISOString();save();
    if(activeFeedStory&&feedStoryKey(activeFeedStory)===key)renderFeedThread(item)
  }
}

async function renderIdeas(force=false){
  const box=$('#ideasList'),refresh=$('#refreshIdeas');if(!box||ideasBusy)return;ideasBusy=true;setWorking(refresh,true);
  box.innerHTML='<div class="surface-loading">Buscando una propuesta que pueda convertirse en trabajo…</div>';
  try{
    const [items,workspaces]=await Promise.all([window.ISABELLA_AI?.ideas?.(state,{force})||[],loadIdeaWorkspaces()]);
    ideaWorkspaces=workspaces||[];
    renderIdeaItems((items||[]).slice(0,3));
  }catch(err){box.innerHTML='<div class="surface-empty">No pude actualizar Ideas ahora mismo.</div>'}
  finally{ideasBusy=false;setWorking(refresh,false)}
}
function readingsUrl(){
  return location.pathname.includes('/isabella/')?'../theory/?embedded=1':'./theory/?embedded=1';
}
function ensureReadings(){
  const frame=$('#readingsFrame');if(!frame)return;
  if(!frame.dataset.loaded){frame.src=readingsUrl();frame.dataset.loaded='1'}
}
function openSofia(prompt=''){
  show('readings');ensureReadings();
  setTimeout(()=>$('#readingsFrame')?.contentWindow?.postMessage({type:prompt?'minds:sofia-prompt':'minds:sofia-open',prompt},location.origin),260);
}
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.type!=='minds:sofia-state')return;
  const open=!!e.data.open;
  $('#readingsScreen')?.classList.toggle('sofia-chat-active',open);
  document.body.classList.toggle('sofia-chat-open',open);
});
let pendingReplyTo=null;
function replyAuthor(reply){return reply?.role==='assistant'?'Isabella':'Tú'}
function replySnippet(text){return String(text||'').replace(/\s+/g,' ').trim().slice(0,180)}
function renderReplyPreview(){
  const box=$('#chatReplyPreview');if(!box)return;
  if(!pendingReplyTo){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');
  box.innerHTML=`<div><strong>Respondiendo a ${esc(replyAuthor(pendingReplyTo))}</strong><span>${esc(replySnippet(pendingReplyTo.text))}</span></div><button type="button" data-cancel-reply aria-label="Cancelar respuesta">×</button>`;
  box.querySelector('[data-cancel-reply]')?.addEventListener('click',()=>{pendingReplyTo=null;renderReplyPreview()});
}
function setReplyTarget(id){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  pendingReplyTo={id:String(m.id||''),role:m.role==='assistant'?'assistant':'user',text:String(m.text||'')};
  renderReplyPreview();
  setTimeout(()=>$('#chatInput')?.focus(),0);
}
function clearReplyTarget(){pendingReplyTo=null;renderReplyPreview()}
let liveAssistantStream=null;
function streamAssistantDelta(_delta,fullText){
  const box=$('#messages');if(!box)return;
  if(!liveAssistantStream){
    const el=document.createElement('div');el.className='message assistant message-streaming';el.setAttribute('aria-live','polite');box.appendChild(el);liveAssistantStream=el;
  }
  liveAssistantStream.textContent=String(fullText||'');
  requestAnimationFrame(()=>scrollAssistantToLatest(true));
}
function clearAssistantStream(){
  liveAssistantStream?.remove();liveAssistantStream=null;
}
function say(role,text,meta={}){
  state.messages.push({
    id:uid(),role,text,at:new Date().toISOString(),reaction:null,
    replyTo:meta.replyTo&&meta.replyTo.id?{id:String(meta.replyTo.id),role:meta.replyTo.role==='assistant'?'assistant':'user',text:String(meta.replyTo.text||'')}:null,
    metadata:meta.metadata&&typeof meta.metadata==='object'?meta.metadata:{},
    sources:Array.isArray(meta.sources)?meta.sources:[],
    attachments:Array.isArray(meta.attachments)?meta.attachments.slice(0,3).map(x=>({path:String(x?.path||''),mime:String(x?.mime||''),name:String(x?.name||'Foto')})).filter(x=>x.path):[],
    artifacts:Array.isArray(meta.artifacts)?meta.artifacts.slice(0,8).map(x=>({id:String(x?.id||''),kind:String(x?.kind||''),title:String(x?.title||'Artefacto'),mime_type:String(x?.mime_type||''),storage_path:String(x?.storage_path||'')})).filter(x=>x.storage_path):[],
    quickReplies:Array.isArray(meta.quickReplies)?meta.quickReplies.slice(0,4).map(x=>({label:String(x?.label||'').trim(),value:String(x?.value||x?.label||'').trim()})).filter(x=>x.label&&x.value):[]
  });
  if(state.messages.length>800)state.messages=state.messages.slice(-800);
  save();renderMessages();
}
function syncOrbCompact(force=null){
  const scroller=$('.assistant-scroll'),orb=$('#orbButton'),home=$('#orbHome'),dock=$('#orbDock');if(!scroller||!orb||!home||!dock)return;
  const hasUserConversation=state.messages.some(m=>m.role==='user'&&String(m.text||'').trim());
  const compact=force===null?hasUserConversation:!!force;
  const docked=compact&&state.screen==='assistant';
  scroller.classList.toggle('orb-compact',compact);
  document.body.classList.toggle('isabella-orb-docked',docked);
  const target=docked?dock:home;
  if(orb.parentElement!==target)target.appendChild(orb);
  dock.setAttribute('aria-hidden',docked?'false':'true');
}
function captureAssistantScroll(){
  const scroller=$('.assistant-scroll'),box=$('#messages');if(!scroller||!box)return {nearBottom:true};
  const nearBottom=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<140;
  if(nearBottom)return {nearBottom:true};
  const top=scroller.getBoundingClientRect().top;
  const anchor=[...box.querySelectorAll('.message')].find(el=>el.getBoundingClientRect().bottom>top+8);
  return {nearBottom:false,id:anchor?.dataset.messageId||'',offset:anchor?anchor.getBoundingClientRect().top-top:0,scrollTop:scroller.scrollTop};
}
function restoreAssistantScroll(snapshot,force=false){
  const scroller=$('.assistant-scroll'),box=$('#messages');if(!scroller||!box)return;
  if(force||snapshot?.nearBottom||!scroller.dataset.initialScroll){
    scroller.scrollTop=scroller.scrollHeight;scroller.dataset.initialScroll='1';return;
  }
  const top=scroller.getBoundingClientRect().top;
  const anchor=[...box.querySelectorAll('.message')].find(el=>el.dataset.messageId===snapshot?.id);
  if(anchor){scroller.scrollTop+=anchor.getBoundingClientRect().top-top-Number(snapshot.offset||0)}
  else if(Number.isFinite(snapshot?.scrollTop))scroller.scrollTop=snapshot.scrollTop;
  scroller.dataset.initialScroll='1';
}
function scrollAssistantToLatest(force=false){restoreAssistantScroll({nearBottom:true},force)}
function renderMessages(forceBottom=false){
  const box=$('#messages');
  state.messages=normalizeMessages(state.messages);
  const nextRenderKey=messageRenderKey(state.messages);
  syncOrbCompact();
  if(nextRenderKey===lastMessagesRenderKey){
    if(forceBottom)requestAnimationFrame(()=>scrollAssistantToLatest(true));
    return;
  }
  const snapshot=captureAssistantScroll();
  box.innerHTML=state.messages.map(m=>{
    const reply=m.replyTo?.id?`<div class="message-reply-reference"><strong>${esc(replyAuthor(m.replyTo))}</strong><span>${esc(replySnippet(m.replyTo.text))}</span></div>`:'';
    const artifactSurface=artifactSurfaceGroups(m.artifacts);
    const displayText=cleanGeneratedDeliverableText(m.text,m.artifacts);
    const previews=artifactSurface.previews.length?`<div class="message-artifact-previews">${artifactSurface.previews.slice(0,2).map(a=>artifactPreviewMarkup(a,true)).join('')}</div>`:'';
    const deliverables=artifactSurface.deliverables.length?`<div class="message-artifacts">${artifactSurface.deliverables.slice(0,8).map(a=>artifactMarkup(a,true)).join('')}</div>`:'';
    return `<div class="message ${m.role}" data-message-id="${esc(m.id||'')}">${reply}${Array.isArray(m.attachments)&&m.attachments.length?`<div class="message-images">${m.attachments.map(a=>{const path=String(a.path||'');return `<img loading="lazy" data-chat-image-path="${esc(path)}" alt="${esc(a.name||'Foto')}">`}).join('')}</div>`:''}${displayText?`<span class="message-text">${formatMessageText(displayText)}</span>`:''}${previews}${deliverables}${m.role==='assistant'&&m.reaction?`<button type="button" class="message-reaction-badge" data-message-react="${esc(m.id||'')}" aria-label="Cambiar reacción">${typographicReaction(m.reaction,true)}</button>`:''}${m.role==='assistant'?`<div class="message-actions"><button class="message-react" data-message-react="${esc(m.id||'')}" aria-label="Reaccionar">＋</button><button class="message-reply" data-message-reply="${esc(m.id||'')}" aria-label="Responder a este mensaje">↩︎</button></div>`:''}${Array.isArray(m.sources)&&m.sources.length?`<div class="message-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}${m.role==='assistant'&&Array.isArray(m.quickReplies)&&m.quickReplies.length?`<div class="message-quick-replies">${m.quickReplies.map((q,i)=>`<button data-quick-message="${esc(m.id||'')}" data-quick-index="${i}">${esc(q.label)}</button>`).join('')}</div>`:''}</div>`;
  }).join('');
  lastMessagesRenderKey=nextRenderKey;
  void hydrateChatImages();void hydrateArtifactFiles();
  try{bindMessageReactions()}catch(err){console.warn('reaction binding failed',err)}
  document.querySelectorAll('[data-quick-message]').forEach(b=>b.onclick=()=>{
    const m=state.messages.find(x=>x.id===b.dataset.quickMessage),q=m?.quickReplies?.[Number(b.dataset.quickIndex)];
    if(!m||!q)return;
    m.quickReplies=[];save();renderMessages();
    handle(q.value);
  });
  requestAnimationFrame(()=>{
    restoreAssistantScroll(snapshot,forceBottom);
    if(!forceBottom&&!snapshot?.nearBottom)requestAnimationFrame(()=>restoreAssistantScroll(snapshot,false));
  });
}
function closeReactionPicker(){
  document.querySelector('.reaction-popover')?.remove();
  document.querySelector('.reaction-backdrop')?.remove();
  document.querySelector('.message-action-menu')?.remove();
  $$('.message.reaction-target').forEach(x=>x.classList.remove('reaction-target'));
}
function applyReaction(id,reaction){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  m.reaction=m.reaction===reaction?null:(reaction||null);save();closeReactionPicker();renderMessages();
  const patch={reaction:m.reaction||null};
  if(window.ISABELLA_SYNC_MESSAGE_META)setTimeout(()=>window.ISABELLA_SYNC_MESSAGE_META(id,patch),0);
  else setTimeout(()=>window.ISABELLA_SYNC_NOW?.({pushOnly:true}),0);
}
function positionReactionPopover(pop,menu,el){
  const r=el.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
  const w=Math.min(pop.offsetWidth||350,vw-24),left=Math.max(12,Math.min(vw-w-12,r.left+(r.width-w)/2));
  let top=r.top-(pop.offsetHeight||66)-14;if(top<12)top=Math.min(vh-(pop.offsetHeight||66)-12,r.bottom+12);
  pop.style.left=left+'px';pop.style.top=top+'px';
  if(menu){
    const mw=Math.min(menu.offsetWidth||290,vw-32),mleft=Math.max(16,Math.min(vw-mw-16,el.classList.contains('user')?r.right-mw:r.left));
    let mtop=r.bottom+14;if(mtop+(menu.offsetHeight||110)>vh-16)mtop=Math.max(16,r.top-(menu.offsetHeight||110)-14);
    menu.style.left=mleft+'px';menu.style.top=mtop+'px';
  }
}
const REACTION_QUICK=[
  {value:'❤️',label:'<3',tone:'love',aria:'Me encanta'},
  {value:'👍',label:'YE!',tone:'yes',aria:'Sí / genial'},
  {value:'😂',label:'HA!',tone:'laugh',aria:'Me hizo reír'},
  {value:'👌',label:'OK',tone:'ok',aria:'Perfecto'},
  {value:'👎',label:'NOPE',tone:'nope',aria:'No / no me convence'},
  {value:'😀',label:':)',tone:'smile',aria:'Me alegra'}
];
const REACTION_ART={
  love:{w:79,h:82,color:'#e85780',path:'M 61 70 L 60 71 L 60 74 L 61 75 L 61 77 L 62 78 L 62 79 L 64 81 L 65 81 L 66 80 L 66 77 L 65 76 L 65 74 L 64 73 L 64 72 L 62 70 Z M 11 66 L 10 67 L 9 67 L 7 69 L 7 70 L 4 73 L 4 76 L 7 76 L 10 73 L 10 72 L 12 70 L 12 67 Z M 38 19 L 37 18 L 36 18 L 35 17 L 34 17 L 33 18 L 32 18 L 29 21 L 28 21 L 23 26 L 22 26 L 16 32 L 15 32 L 8 39 L 7 39 L 4 42 L 4 44 L 3 45 L 4 46 L 4 47 L 5 48 L 5 49 L 6 50 L 8 50 L 9 51 L 10 51 L 11 52 L 14 52 L 15 53 L 17 53 L 18 54 L 21 54 L 22 55 L 24 55 L 25 56 L 28 56 L 29 57 L 31 57 L 32 58 L 38 58 L 39 57 L 39 56 L 40 55 L 40 54 L 39 53 L 39 52 L 38 52 L 36 50 L 33 50 L 32 49 L 29 49 L 28 48 L 26 48 L 25 47 L 22 47 L 21 46 L 19 46 L 18 45 L 16 45 L 15 44 L 15 43 L 18 40 L 19 40 L 25 34 L 26 34 L 30 30 L 31 30 L 38 23 Z M 0 14 L 0 17 L 4 21 L 5 21 L 7 23 L 8 23 L 9 22 L 9 20 L 3 14 Z M 71 0 L 67 0 L 66 1 L 63 1 L 62 2 L 60 2 L 59 3 L 56 3 L 53 5 L 51 5 L 50 6 L 45 8 L 43 11 L 44 14 L 45 14 L 46 15 L 48 15 L 53 12 L 55 12 L 56 11 L 58 11 L 59 10 L 61 10 L 62 9 L 63 9 L 64 10 L 59 15 L 59 16 L 48 27 L 48 28 L 47 29 L 47 33 L 49 35 L 52 35 L 53 34 L 55 34 L 58 32 L 60 32 L 61 31 L 64 31 L 65 30 L 69 30 L 70 31 L 70 32 L 68 34 L 68 35 L 66 37 L 66 38 L 61 43 L 61 44 L 49 56 L 48 56 L 45 59 L 44 62 L 45 63 L 45 64 L 48 66 L 51 65 L 54 62 L 55 62 L 61 56 L 61 55 L 68 48 L 68 47 L 72 43 L 72 42 L 74 40 L 74 39 L 76 37 L 76 36 L 77 35 L 77 33 L 78 32 L 78 28 L 77 27 L 77 26 L 74 23 L 71 23 L 70 22 L 65 23 L 64 22 L 64 21 L 65 20 L 66 20 L 66 19 L 73 11 L 73 10 L 75 7 L 75 4 L 74 3 L 74 2 Z'},
  yes:{w:82,h:101,color:'#4485f0',path:'M 31 89 L 29 89 L 29 90 L 28 91 L 28 92 L 27 93 L 27 95 L 26 96 L 26 99 L 27 100 L 29 100 L 29 99 L 30 98 L 30 96 L 31 95 L 31 92 L 32 91 L 32 90 Z M 9 81 L 7 81 L 5 83 L 5 84 L 2 87 L 2 90 L 3 91 L 4 91 L 7 88 L 7 87 L 8 86 L 8 85 L 9 84 Z M 81 72 L 79 74 L 80 75 L 80 76 L 81 77 Z M 64 65 L 62 67 L 62 72 L 64 74 L 68 74 L 69 73 L 69 72 L 70 71 L 70 68 L 69 67 L 69 66 L 68 65 Z M 53 24 L 50 24 L 49 25 L 46 25 L 45 26 L 44 26 L 43 27 L 41 27 L 40 28 L 36 28 L 33 31 L 33 44 L 32 45 L 32 50 L 31 51 L 31 54 L 32 55 L 32 66 L 31 67 L 32 68 L 32 72 L 35 75 L 39 75 L 40 74 L 41 74 L 42 73 L 43 73 L 44 72 L 45 72 L 47 70 L 48 70 L 50 68 L 51 68 L 53 66 L 54 66 L 57 63 L 57 59 L 56 58 L 52 58 L 51 59 L 50 59 L 48 61 L 47 61 L 45 63 L 44 63 L 42 65 L 41 65 L 40 66 L 39 66 L 38 65 L 39 64 L 39 55 L 40 54 L 41 54 L 43 52 L 44 52 L 46 50 L 48 50 L 50 48 L 51 48 L 52 47 L 52 45 L 53 44 L 51 41 L 48 41 L 47 42 L 46 42 L 45 43 L 44 43 L 41 45 L 40 44 L 40 36 L 43 34 L 45 34 L 46 33 L 47 33 L 50 31 L 52 31 L 53 30 L 54 30 L 55 29 L 55 26 Z M 28 22 L 26 22 L 25 23 L 24 23 L 24 24 L 23 25 L 23 28 L 22 29 L 22 33 L 21 34 L 21 40 L 19 42 L 18 41 L 18 40 L 14 36 L 14 35 L 9 30 L 9 29 L 6 26 L 2 26 L 1 27 L 1 28 L 0 29 L 0 30 L 1 31 L 1 32 L 4 35 L 4 36 L 9 41 L 9 42 L 15 48 L 15 49 L 18 52 L 18 56 L 17 57 L 17 61 L 16 62 L 16 69 L 15 70 L 15 78 L 16 79 L 17 79 L 18 80 L 19 80 L 20 79 L 21 79 L 21 78 L 22 77 L 22 73 L 23 72 L 23 67 L 24 66 L 24 61 L 25 60 L 25 55 L 26 54 L 26 48 L 27 47 L 27 43 L 28 42 L 28 36 L 29 35 L 29 31 L 30 30 L 30 24 Z M 70 19 L 69 20 L 68 20 L 66 22 L 66 28 L 65 29 L 65 37 L 64 38 L 64 49 L 63 50 L 63 56 L 66 59 L 67 59 L 70 56 L 70 53 L 71 52 L 71 42 L 72 41 L 72 33 L 73 32 L 73 22 L 72 21 L 72 20 L 71 20 Z M 81 10 L 81 11 L 80 12 L 80 13 L 79 14 L 79 15 L 80 16 L 81 16 Z M 7 1 L 6 2 L 6 5 L 10 9 L 10 10 L 14 14 L 16 14 L 17 13 L 17 11 L 15 9 L 15 8 L 12 5 L 12 4 L 10 2 L 9 2 L 8 1 Z M 65 0 L 64 0 L 63 1 L 63 2 L 62 3 L 62 7 L 61 8 L 61 10 L 62 11 L 63 11 L 65 9 L 65 6 L 66 5 L 66 1 Z'},
  laugh:{w:73,h:71,color:'#eeac4f',path:'M 67 42 L 66 43 L 65 43 L 64 44 L 64 50 L 65 51 L 66 51 L 67 52 L 69 52 L 70 51 L 71 51 L 71 50 L 72 49 L 72 46 L 71 45 L 71 44 L 70 43 L 69 43 L 68 42 Z M 43 10 L 38 10 L 36 12 L 36 28 L 35 29 L 35 31 L 36 32 L 36 41 L 34 44 L 36 48 L 34 52 L 33 51 L 33 48 L 31 44 L 32 35 L 28 32 L 24 18 L 22 16 L 20 16 L 17 18 L 17 23 L 20 30 L 21 36 L 18 39 L 15 40 L 13 42 L 11 41 L 10 35 L 9 34 L 7 27 L 4 25 L 2 25 L 1 26 L 0 30 L 1 31 L 2 37 L 3 38 L 3 41 L 5 45 L 5 47 L 3 48 L 1 51 L 1 54 L 2 55 L 6 55 L 7 54 L 8 55 L 9 62 L 10 63 L 11 68 L 13 70 L 17 70 L 18 69 L 18 63 L 17 62 L 17 59 L 16 58 L 14 51 L 22 45 L 24 46 L 29 62 L 31 63 L 33 63 L 35 61 L 35 57 L 36 56 L 38 58 L 41 58 L 43 56 L 43 50 L 42 49 L 42 47 L 49 43 L 51 46 L 54 56 L 57 58 L 59 58 L 62 54 L 56 39 L 58 36 L 57 34 L 53 31 L 53 29 L 46 15 L 46 13 Z M 35 51 L 36 52 L 36 55 L 35 56 L 34 55 L 34 52 Z M 44 28 L 45 29 L 45 31 L 46 32 L 46 34 L 47 35 L 45 37 L 44 37 L 43 36 L 43 29 Z M 42 26 L 43 25 L 44 26 L 44 27 L 43 28 L 42 27 Z M 61 0 L 61 1 L 60 2 L 61 3 L 61 16 L 62 17 L 62 30 L 63 31 L 63 34 L 66 37 L 67 37 L 69 35 L 69 34 L 70 33 L 70 32 L 69 31 L 69 20 L 68 19 L 68 15 L 69 14 L 68 13 L 68 6 L 67 5 L 67 1 L 66 0 Z'},
  ok:{w:61,h:93,color:'#448c51',path:'M 44 77 L 43 76 L 42 76 L 41 75 L 40 76 L 39 76 L 38 77 L 37 77 L 36 78 L 35 78 L 34 79 L 32 79 L 31 80 L 30 80 L 29 81 L 28 81 L 27 82 L 26 82 L 25 83 L 24 83 L 23 84 L 22 84 L 21 85 L 20 85 L 19 86 L 18 86 L 17 87 L 16 87 L 15 88 L 15 89 L 14 90 L 15 91 L 15 92 L 19 92 L 20 91 L 22 91 L 23 90 L 24 90 L 26 88 L 28 88 L 29 87 L 30 87 L 31 86 L 32 86 L 33 85 L 34 85 L 35 84 L 36 84 L 37 83 L 38 83 L 39 82 L 40 82 L 41 81 L 42 81 L 44 79 Z M 16 27 L 11 27 L 9 29 L 8 29 L 8 30 L 5 33 L 5 34 L 4 35 L 4 38 L 2 40 L 2 42 L 1 43 L 1 48 L 0 49 L 0 57 L 1 58 L 1 61 L 2 62 L 2 64 L 3 65 L 3 66 L 7 70 L 10 70 L 11 71 L 13 71 L 14 70 L 17 70 L 20 67 L 20 66 L 22 64 L 22 63 L 24 61 L 24 59 L 25 58 L 25 56 L 26 55 L 26 40 L 25 39 L 25 38 L 24 37 L 24 36 L 23 35 L 23 34 L 20 31 L 19 31 L 18 30 L 18 29 Z M 15 36 L 17 38 L 17 39 L 18 40 L 18 42 L 19 43 L 19 53 L 18 54 L 18 56 L 17 57 L 17 58 L 15 60 L 15 61 L 13 63 L 11 63 L 9 61 L 9 60 L 8 59 L 8 45 L 9 44 L 9 43 L 10 42 L 10 40 L 14 36 Z M 53 12 L 51 12 L 48 15 L 48 16 L 46 18 L 46 19 L 45 20 L 45 22 L 44 23 L 44 24 L 41 26 L 41 27 L 40 28 L 39 31 L 37 33 L 36 32 L 36 25 L 35 24 L 35 18 L 33 16 L 30 16 L 29 17 L 29 68 L 31 70 L 34 70 L 36 68 L 36 55 L 37 54 L 40 55 L 42 57 L 43 57 L 45 59 L 46 59 L 48 61 L 51 62 L 53 64 L 54 64 L 55 65 L 58 65 L 59 64 L 59 62 L 60 61 L 60 60 L 57 57 L 56 57 L 54 55 L 53 55 L 51 53 L 50 53 L 48 51 L 47 51 L 45 49 L 44 49 L 42 47 L 41 47 L 40 46 L 40 42 L 44 37 L 44 36 L 45 35 L 46 32 L 48 30 L 48 29 L 49 28 L 49 27 L 51 25 L 51 24 L 52 23 L 53 20 L 55 18 L 55 14 Z M 25 1 L 24 1 L 23 0 L 22 0 L 21 1 L 21 2 L 16 7 L 15 7 L 14 6 L 14 5 L 10 1 L 8 1 L 7 2 L 7 4 L 8 5 L 8 6 L 11 9 L 11 10 L 14 13 L 15 13 L 16 14 L 17 13 L 18 13 L 22 9 L 22 8 L 24 6 L 24 4 L 25 3 Z'},
  nope:{w:91,h:97,color:'#7543eb',path:'M 7 88 L 5 88 L 1 92 L 1 93 L 0 94 L 2 96 L 3 96 L 7 92 L 7 91 L 8 90 L 8 89 Z M 71 80 L 70 80 L 69 79 L 67 79 L 66 80 L 65 80 L 64 81 L 62 81 L 61 82 L 58 82 L 57 83 L 55 83 L 54 84 L 50 84 L 50 85 L 49 86 L 48 86 L 47 87 L 45 87 L 44 88 L 43 88 L 42 89 L 41 89 L 41 92 L 42 92 L 43 93 L 44 93 L 45 92 L 47 92 L 48 91 L 50 91 L 51 90 L 53 90 L 54 89 L 56 89 L 57 88 L 60 88 L 61 87 L 62 87 L 63 86 L 65 86 L 66 85 L 68 85 L 69 84 L 70 84 L 71 83 Z M 68 70 L 67 69 L 63 69 L 62 70 L 59 70 L 58 71 L 57 71 L 56 72 L 54 72 L 53 73 L 51 73 L 50 74 L 49 74 L 48 75 L 46 75 L 45 76 L 44 76 L 43 77 L 41 77 L 40 78 L 39 78 L 38 79 L 36 79 L 35 80 L 35 81 L 34 82 L 35 83 L 35 84 L 39 84 L 40 83 L 42 83 L 43 82 L 45 82 L 46 81 L 49 81 L 50 80 L 52 80 L 53 79 L 54 79 L 55 78 L 56 78 L 57 77 L 58 77 L 59 76 L 61 76 L 62 75 L 64 75 L 65 74 L 66 74 L 68 72 Z M 87 19 L 84 18 L 76 22 L 73 22 L 69 28 L 65 25 L 59 25 L 53 28 L 50 32 L 52 37 L 52 44 L 53 45 L 52 48 L 48 38 L 42 33 L 39 33 L 36 36 L 32 45 L 32 59 L 31 60 L 29 52 L 29 41 L 28 40 L 27 28 L 24 26 L 22 27 L 21 30 L 22 31 L 23 49 L 24 50 L 24 54 L 23 55 L 14 39 L 11 37 L 9 37 L 7 39 L 7 49 L 9 56 L 11 74 L 13 76 L 17 75 L 17 68 L 15 59 L 16 55 L 23 67 L 26 70 L 30 70 L 31 68 L 31 60 L 32 59 L 36 65 L 42 66 L 49 59 L 50 52 L 52 49 L 53 50 L 53 62 L 56 65 L 58 64 L 59 62 L 59 51 L 67 43 L 69 39 L 71 44 L 71 56 L 76 59 L 84 55 L 89 51 L 90 48 L 89 46 L 86 46 L 78 51 L 77 50 L 77 43 L 87 36 L 87 34 L 84 32 L 78 36 L 77 35 L 77 28 L 87 23 L 88 21 Z M 42 40 L 44 42 L 44 43 L 45 44 L 45 53 L 44 54 L 44 56 L 42 58 L 42 59 L 41 60 L 40 60 L 38 58 L 38 57 L 37 56 L 37 48 L 38 47 L 38 44 L 39 43 L 39 42 L 40 41 L 41 41 Z M 69 38 L 70 37 L 71 38 L 71 39 L 70 40 L 69 39 Z M 64 31 L 65 32 L 65 34 L 64 35 L 64 36 L 63 37 L 63 38 L 60 41 L 60 42 L 59 43 L 58 42 L 58 34 L 57 33 L 58 32 L 59 32 L 60 31 Z M 69 28 L 70 27 L 72 29 L 72 30 L 71 31 L 69 29 Z M 8 0 L 7 1 L 7 2 L 6 3 L 7 4 L 7 5 L 8 6 L 8 7 L 11 10 L 13 10 L 14 9 L 14 6 L 12 4 L 12 3 L 11 2 L 11 1 L 10 1 L 9 0 Z'},
  smile:{w:65,h:92,color:'#ea8250',path:'M 9 80 L 6 80 L 4 82 L 4 83 L 0 87 L 0 90 L 1 91 L 3 91 L 5 89 L 5 88 L 8 85 L 8 84 L 9 83 Z M 49 79 L 48 80 L 48 83 L 54 89 L 56 89 L 57 88 L 57 87 L 56 86 L 56 85 L 51 80 L 50 80 Z M 15 57 L 12 60 L 12 62 L 11 63 L 11 64 L 12 65 L 12 66 L 13 67 L 13 68 L 15 68 L 16 69 L 18 69 L 19 68 L 20 68 L 22 66 L 22 65 L 23 64 L 23 62 L 22 61 L 22 60 L 19 57 Z M 15 38 L 14 39 L 13 39 L 13 40 L 12 41 L 12 46 L 15 49 L 18 49 L 21 46 L 21 42 L 20 41 L 20 40 L 19 39 L 17 39 L 16 38 Z M 64 26 L 61 26 L 57 30 L 57 31 L 55 33 L 55 34 L 54 35 L 56 37 L 57 37 L 61 33 L 61 32 L 64 29 Z M 32 20 L 28 20 L 27 21 L 27 22 L 26 23 L 26 25 L 28 27 L 29 27 L 35 33 L 35 34 L 37 36 L 37 37 L 38 38 L 38 39 L 39 40 L 39 42 L 40 43 L 40 45 L 41 46 L 41 54 L 40 55 L 40 58 L 39 59 L 39 61 L 38 62 L 38 63 L 37 64 L 37 65 L 35 67 L 35 68 L 33 70 L 33 71 L 27 77 L 26 77 L 25 78 L 25 83 L 26 84 L 27 84 L 28 85 L 29 85 L 30 84 L 31 84 L 32 83 L 33 83 L 40 76 L 40 75 L 43 72 L 43 71 L 44 70 L 44 69 L 45 68 L 45 67 L 46 66 L 46 65 L 47 64 L 47 63 L 48 62 L 48 58 L 49 57 L 49 43 L 48 42 L 48 40 L 47 39 L 47 37 L 46 36 L 46 35 L 45 34 L 45 33 L 43 31 L 43 30 L 41 28 L 41 27 L 40 27 L 39 26 L 39 25 L 38 25 L 34 21 L 33 21 Z M 51 15 L 49 15 L 48 16 L 48 17 L 47 18 L 47 19 L 46 20 L 48 22 L 50 20 L 50 16 Z M 52 10 L 51 11 L 51 12 L 52 13 L 53 12 L 53 11 Z M 14 0 L 13 1 L 13 4 L 15 6 L 15 7 L 17 9 L 17 10 L 20 13 L 21 13 L 23 11 L 23 10 L 22 9 L 22 8 L 21 7 L 21 6 L 19 4 L 19 3 L 17 1 L 17 0 Z'}
};
function typographicReaction(value,compact=false){
  const r=REACTION_QUICK.find(x=>x.value===value);
  if(!r)return `<span class="reaction-native-emoji">${esc(value||'')}</span>`;
  const art=REACTION_ART[r.tone];if(!art)return esc(r.label);
  const scale=compact?.21:.42;
  const width=Math.max(12,Math.round(art.w*scale)),height=Math.max(12,Math.round(art.h*scale));
  return `<svg class="minds-reaction-art tone-${r.tone} ${compact?'is-compact':''}" width="${width}" height="${height}" viewBox="0 0 ${art.w} ${art.h}" aria-hidden="true" focusable="false"><path fill="${art.color}" fill-rule="evenodd" d="${art.path}"></path></svg>`;
}
const REACTION_CATEGORIES=[
  {id:'recent',label:'Recientes',icon:'🕘',items:['👍','❤️','😂','👏','🙏','🔥','✨','✅','👀','💯','🎉','🤝']},
  {id:'faces',label:'Caras',icon:'☺︎',items:['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','😉','😍','🥰','🤩','🥳','😎','🤔','😮','😯','😲','🥹','😢','😭','😤','😡','😱','😴','🫠','🫡']},
  {id:'gestures',label:'Gestos',icon:'👍',items:['👍','👎','👌','🤌','✌️','🤞','🫶','👏','🙌','👐','🤝','🙏','💪','👀','👉','👈','☝️','✋']},
  {id:'hearts',label:'Corazones',icon:'♥︎',items:['❤️','🩷','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘']},
  {id:'symbols',label:'Símbolos',icon:'✨',items:['‼️','❓','❗','❔','✅','❌','💯','⭐','✨','🔥','💡','📌','🎉','🚀','🧠','🏗️','📚','📝','📎','⏰']}
];

function closeEmojiReactionSheet(){
  document.querySelector('.emoji-reaction-sheet')?.remove();
  document.querySelector('.emoji-reaction-sheet-backdrop')?.remove();
  document.body.classList.remove('emoji-reaction-sheet-open');
}
function openEmojiReactionSheet(id){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  closeReactionPicker();closeEmojiReactionSheet();
  const backdrop=document.createElement('div');backdrop.className='emoji-reaction-sheet-backdrop';
  const sheet=document.createElement('section');sheet.className='emoji-reaction-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Reaccionar con un emoji');
  sheet.innerHTML=`<div class="emoji-sheet-grabber"></div>
    <div class="emoji-sheet-head"><strong>Reaccionar</strong><button type="button" data-emoji-close aria-label="Cerrar">×</button></div>
    <div class="emoji-sheet-tabs" role="tablist">${REACTION_CATEGORIES.map((c,i)=>`<button type="button" role="tab" data-emoji-category="${c.id}" class="${i===0?'active':''}" aria-label="${esc(c.label)}">${c.icon}</button>`).join('')}</div>
    <div class="emoji-sheet-body"></div>`;
  document.body.append(backdrop,sheet);document.body.classList.add('emoji-reaction-sheet-open');
  const body=sheet.querySelector('.emoji-sheet-body');
  const paint=cat=>{
    body.innerHTML=`<div class="emoji-category-title">${esc(cat.label)}</div><div class="emoji-grid">${cat.items.map(x=>`<button type="button" data-emoji-reaction="${x}" class="${m.reaction===x?'selected':''}" aria-label="Reaccionar ${x}">${x}</button>`).join('')}</div>`;
    body.querySelectorAll('[data-emoji-reaction]').forEach(b=>b.onclick=()=>{applyReaction(id,b.dataset.emojiReaction||null);closeEmojiReactionSheet()});
  };
  paint(REACTION_CATEGORIES[0]);
  sheet.querySelectorAll('[data-emoji-category]').forEach(b=>b.onclick=()=>{
    sheet.querySelectorAll('[data-emoji-category]').forEach(x=>x.classList.toggle('active',x===b));
    paint(REACTION_CATEGORIES.find(c=>c.id===b.dataset.emojiCategory)||REACTION_CATEGORIES[0]);
  });
  backdrop.onclick=closeEmojiReactionSheet;
  sheet.querySelector('[data-emoji-close]').onclick=closeEmojiReactionSheet;
}
function openReactionPicker(id){
  const m=state.messages.find(x=>x.id===id),el=document.querySelector(`.message[data-message-id="${CSS.escape(String(id))}"]`);if(!m||!el)return;
  closeReactionPicker();closeEmojiReactionSheet();try{navigator.vibrate?.(8)}catch{}el.classList.add('reaction-target');
  const backdrop=document.createElement('div');backdrop.className='reaction-backdrop';
  const pop=document.createElement('div');pop.className='reaction-popover imessage-reactions';
  pop.innerHTML=`<div class="reaction-row reaction-quick-row">${REACTION_QUICK.map(x=>`<button type="button" data-inline-reaction="${x.value}" class="minds-reaction-choice ${m.reaction===x.value?'selected':''}" aria-label="${esc(x.aria)}">${typographicReaction(x.value,false)}</button>`).join('')}<button type="button" class="reaction-more" aria-label="Más emojis">＋</button></div>`;
  document.body.append(backdrop,pop);requestAnimationFrame(()=>positionReactionPopover(pop,null,el));
  backdrop.onclick=closeReactionPicker;
  pop.querySelectorAll('[data-inline-reaction]').forEach(b=>b.onclick=e=>{e.stopPropagation();applyReaction(id,b.dataset.inlineReaction||null)});
  pop.querySelector('.reaction-more')?.addEventListener('click',e=>{e.stopPropagation();openEmojiReactionSheet(id)});
}
function bindMessageReactions(){
  $$('[data-message-react]').forEach(b=>{
    if(b.dataset.reactionBound)return;b.dataset.reactionBound='1';
    b.addEventListener('click',e=>{e.stopPropagation();openReactionPicker(b.dataset.messageReact)});
  });
  $$('[data-message-reply]').forEach(b=>{
    if(b.dataset.replyBound)return;b.dataset.replyBound='1';
    b.addEventListener('click',e=>{e.stopPropagation();setReplyTarget(b.dataset.messageReply)});
  });
}

function renderToday(){const d=today(),ev=state.events.filter(x=>x.date===d).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===d&&activeTask(x));$('#todaySummary').textContent=`${ev.length} ${ev.length===1?'evento':'eventos'} · ${ta.length} ${ta.length===1?'tarea':'tareas'}`;$('#todayNext').textContent=ev[0]?`${ev[0].start} · ${ev[0].title}`:'Sin próxima cita'}
function orb(mode='idle',label=''){const o=$('#orbButton');if(!o)return;o.classList.remove('listening','thinking');if(mode!=='idle')o.classList.add(mode);const s=$('#orbStatus');if(s)s.textContent=label}
function setWorking(el,on){if(el)el.classList.toggle('is-working',!!on)}
function localFallback(text){const n=text.toLowerCase();if(/qué tengo hoy|que tengo hoy|agenda de hoy/.test(n)){const d=today(),e=state.events.filter(x=>x.date===d),t=state.tasks.filter(x=>x.date===d&&activeTask(x));return `Hoy tienes ${e.length} ${e.length===1?'evento':'eventos'} y ${t.length} ${t.length===1?'tarea pendiente':'tareas pendientes'}.`}if(/calendario|agenda/.test(n)){show('calendar');return 'Te abro el calendario.'}return 'Te escucho. Para usar la IA, conecta la memoria desde el menú •••.'}
function rememberCandidates(items){for(const m of items||[]){if(!m?.content)continue;const exists=(state.memory||[]).some(x=>(typeof x==='object'?x.content:String(x))===m.content);if(!exists)state.memory.push({id:uid(),kind:normalizeMemoryKind(m.kind),content:m.content,confidence:Number(m.confidence??.7),status:'active',source:m.source||'ai_derived',metadata:{...(m.metadata||{}),derived:true,accepted_fact:false}})}save()}
function proposalLabel(p){
  if(p.kind==='routine'){
    const days=p.schedule_kind==='weekly'&&Array.isArray(p.weekdays)&&p.weekdays.length?(' · '+p.weekdays.map(d=>['dom','lun','mar','mié','jue','vie','sáb'][Number(d)]||d).join(', ')):'';
    if(p.schedule_kind==='once')return ['Programar recordatorio',p.title,p.date,p.time||'09:00'].filter(Boolean).join(' · ');
    return ['Programar rutina',p.title,p.schedule_kind==='weekly'?'Semanal':'Todos los días',(p.time||'08:00')+days].filter(Boolean).join(' · ');
  }
  if(p.kind==='feed_preferences'){
    const add=(p.add_entities||[]).length,remove=(p.remove_entities||[]).length,topics=(p.add_topics||[]).length+(p.add_custom_topics||[]).length;
    const bits=['Actualizar Feed'];
    if(add)bits.push('seguir '+add+(add===1?' entidad':' entidades'));
    if(remove)bits.push('dejar de seguir '+remove);
    if(topics)bits.push('añadir '+topics+(topics===1?' tema':' temas'));
    if(Object.prototype.hasOwnProperty.call(p,'weather_location'))bits.push('clima: '+(p.weather_location||'sin ubicación'));
    return bits.join(' · ');
  }
  if(p.kind==='assistant_preferences'){
    const add=(p.add_rules||[]).length,remove=(p.remove_rules||[]).length;
    return ['Mejorar Isabella',add?('adoptar '+add+(add===1?' regla':' reglas')):'',remove?('retirar '+remove):''].filter(Boolean).join(' · ');
  }
  if(p.kind==='standing_intent')return ['Recordar cuando',p.trigger_text,p.project||''].filter(Boolean).join(' · ');
  if(p.kind==='expectation')return ['Esperar',p.title,p.due_date,p.due_time||''].filter(Boolean).join(' · ');
  if(p.kind==='commitment')return ['Mantener vivo',p.title,p.project||p.scope||''].filter(Boolean).join(' · ');
  if(p.kind==='work_claim')return ['Guardar conocimiento',p.project,p.claim_type,p.statement].filter(Boolean).join(' · ');
  if(p.kind==='skill_proposal')return ['Crear Skill',p.agent==='sofia'?'Sofía':'Isabella',p.name].filter(Boolean).join(' · ');
  const action=p.action||'create';
  const actionName=action==='update'?'Modificar':action==='delete'?'Eliminar':action==='complete'?'Completar':action==='archive'?'Archivar':'Agregar';
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
  if(p.kind==='standing_intent'){
    modal('Revisar memoria futura',`<div class="form proposal-editor">
      <div class="small">Esto no tiene una hora fija. Isabella lo recordará cuando vuelva a aparecer esta situación, con cooldown y límite de activaciones.</div>
      <label>Cuando ocurra<textarea id="standingTrigger" rows="3">${esc(p.trigger_text||'')}</textarea></label>
      <label>Recordarme<textarea id="standingReminder" rows="3">${esc(p.reminder_text||'')}</textarea></label>
      <label>Proyecto (opcional)<input id="standingProject" value="${esc(p.project||'')}" placeholder="Bernried, Schwarz…"></label>
      <label>Palabras de activación<input id="standingTerms" value="${esc((p.trigger_terms||[]).join(', '))}" placeholder="dachentwässerung, entwässerung"></label>
      <div class="form-grid-3"><label>Cooldown (h)<input id="standingCooldown" type="number" min="0" value="${Number(p.cooldown_hours??24)}"></label><label>Máx. avisos<input id="standingMax" type="number" min="1" max="12" value="${Number(p.max_triggers||3)}"></label><label>Caduca (días)<input id="standingExpiry" type="number" min="1" max="365" value="${Number(p.expires_days||90)}"></label></div>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estos datos</button></div>
    </div>`);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,trigger_text:$('#standingTrigger').value.trim(),reminder_text:$('#standingReminder').value.trim(),project:$('#standingProject').value.trim()||null,trigger_terms:$('#standingTerms').value.split(/[,\n]+/).map(x=>x.trim()).filter(Boolean),cooldown_hours:Number($('#standingCooldown').value === '' ? 24 : $('#standingCooldown').value),max_triggers:Number($('#standingMax').value||3),expires_days:Number($('#standingExpiry').value||90)});
    return;
  }

  if(p.kind==='expectation'){
    const types=[['reply','Respuesta'],['delivery','Entrega'],['decision','Decisión'],['document','Documento'],['external_event','Evento externo'],['other','Otro']];
    modal('Revisar expectativa',`<div class="form proposal-editor">
      <div class="small">Esto no es una tarea. Es algo que esperas que ocurra. Si llega la fecha sin confirmación, Isabella lo marcará como pendiente de comprobar; no asumirá que no ocurrió.</div>
      <label>Nombre<input id="expectationTitle" value="${esc(p.title||'')}" placeholder="Respuesta del consultor"></label>
      <label>Qué esperas que ocurra<textarea id="expectationEvent" rows="4">${esc(p.expected_event||'')}</textarea></label>
      <div class="form-grid-2"><label>Tipo<select id="expectationType">${types.map(([v,l])=>`<option value="${v}" ${v===(p.expectation_type||'other')?'selected':''}>${l}</option>`).join('')}</select></label><label>Proyecto (opcional)<input id="expectationProject" value="${esc(p.project||'')}" placeholder="Bernried, Schwarz…"></label></div>
      <div class="form-grid-2"><label>Fecha esperada<input id="expectationDate" type="date" value="${esc(p.due_date||'')}"></label><label>Hora exacta (opcional)<input id="expectationTime" type="time" value="${esc(p.due_time||'')}"></label></div>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estos datos</button></div>
    </div>`);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>{
      const time=$('#expectationTime').value||null;
      onDone?.({...p,
        title:$('#expectationTitle').value.trim(),
        expected_event:$('#expectationEvent').value.trim(),
        expectation_type:$('#expectationType').value,
        project:$('#expectationProject').value.trim()||null,
        due_date:$('#expectationDate').value,
        due_time:time,
        due_precision:time?'datetime':'date'
      });
    };
    return;
  }

    if(p.kind==='commitment'){
    const sourceNote=p.source_open_loop?'<div class="small">Origen: asunto abierto detectado en un checkpoint. Al confirmar se conservará esa procedencia sin convertirla en hecho.</div><blockquote>'+esc(p.source_open_loop)+'</blockquote>':'';
    modal('Revisar continuidad',`<div class="form proposal-editor">
      <div class="small">${p.persistent_work?'Al confirmar, Isabella mantendrá este objetivo vivo y empezará a trabajarlo en segundo plano. El trabajo interno no obtiene permisos adicionales y cualquier acción externa seguirá su confirmación normal.':'Un Commitment mantiene un objetivo vivo entre conversaciones. No crea tareas, rutinas ni acciones por sí mismo.'}</div>
      ${sourceNote}
      <label>Nombre<input id="commitmentTitle" value="${esc(p.title||'')}" placeholder="Qué mantener vivo"></label>
      <label>Objetivo<textarea id="commitmentObjective" rows="5">${esc(p.objective||'')}</textarea></label>
      <div class="form-grid-2"><label>Ámbito<select id="commitmentScope">${[['global','Global'],['personal','Personal'],['project','Proyecto'],['theory','Theory'],['other','Otro']].map(([v,l])=>`<option value="${v}" ${v===(p.scope||'global')?'selected':''}>${l}</option>`).join('')}</select></label><label>Proyecto (opcional)<input id="commitmentProject" value="${esc(p.project||'')}" placeholder="Bernried, Schwarz…"></label></div>
      <label>Criterio de cierre (opcional)<textarea id="commitmentCriteria" rows="3">${esc(p.completion_criteria||'')}</textarea></label>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">${p.persistent_work?'Encárgate':'Mantener vivo'}</button></div>
    </div>`);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,title:$('#commitmentTitle').value.trim(),objective:$('#commitmentObjective').value.trim(),scope:$('#commitmentScope').value,project:$('#commitmentProject').value.trim()||null,completion_criteria:$('#commitmentCriteria').value.trim()||null});
    return;
  }
  if(p.kind==='work_claim'){
    modal('Revisar conocimiento de proyecto',`<div class="form proposal-editor">
      <div class="small">Una fuente puede afirmar algo sin que MINDS lo trate automáticamente como verdad. Revisa el estado y la procedencia antes de guardarlo.</div>
      <label>Proyecto<input id="claimProject" value="${esc(p.project||'')}"></label>
      <label>Claim<textarea id="claimStatement" rows="4">${esc(p.statement||'')}</textarea></label>
      <div class="form-grid-2"><label>Tipo<select id="claimType">${['fact','decision','requirement','deadline','dependency','open_question','assumption','constraint','other'].map(x=>`<option value="${x}" ${x===p.claim_type?'selected':''}>${x}</option>`).join('')}</select></label><label>Estado<select id="claimStatus">${[["proposed","Propuesto"],["confirmed","Confirmado"],["disputed","En disputa"],["resolved","Resuelto"],["rejected","Descartado"]].map(([v,l])=>`<option value="${v}" ${v===(p.status||"proposed")?"selected":""}>${l}</option>`).join('')}</select></label></div>
      <div class="form-grid-2"><label>Disciplina<input id="claimDiscipline" value="${esc(p.discipline||'')}"></label><label>Tema<input id="claimTopic" value="${esc(p.topic||'')}"></label></div>
      <label>Procedencia<select id="claimProvenance">${['user','project_source','external','inferred'].map(x=>`<option value="${x}" ${x===p.provenance_class?'selected':''}>${x}</option>`).join('')}</select></label>
      <label>Evidencia o comentario de revisión<textarea id="claimEvidence" rows="3">${esc(p.evidence_excerpt||'')}</textarea></label>
      <div class="form-grid-2"><label>Válido hasta<input id="claimValidTo" type="date" value="${esc((p.valid_to||'').slice(0,10))}"></label><label>Relación de la evidencia<select id="claimStance"><option value="supports">Apoya</option><option value="contradicts">Contradice</option><option value="context">Contexto</option></select></label></div>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Guardar claim</button></div>
    </div>`);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,project:$('#claimProject').value.trim(),statement:$('#claimStatement').value.trim(),claim_type:$('#claimType').value,status:$('#claimStatus').value,discipline:$('#claimDiscipline').value.trim()||null,topic:$('#claimTopic').value.trim()||null,provenance_class:$('#claimProvenance').value,evidence_excerpt:$('#claimEvidence')?.value.trim()||null,valid_to:$('#claimValidTo').value?$('#claimValidTo').value+'T23:59:59Z':null,evidence_stance:$('#claimStance').value});
    return;
  }
  if(p.kind==='skill_proposal'){
    modal('Revisar nueva Skill',`<div class="form proposal-editor">
      <div class="small">La Skill será personal y versionable. No se activa hasta que confirmes esta revisión.</div>
      <label>Agente<select id="skillAgent"><option value="isabella" ${p.agent!=='sofia'?'selected':''}>Isabella</option><option value="sofia" ${p.agent==='sofia'?'selected':''}>Sofía</option></select></label>
      <label>Nombre<input id="skillName" value="${esc(p.name||'')}"></label>
      <label>Slug<input id="skillSlug" value="${esc(p.slug||'')}"></label>
      <label>Descripción<textarea id="skillDescription" rows="3">${esc(p.description||'')}</textarea></label>
      <label>Instrucciones<textarea id="skillInstructions" rows="7">${esc(p.instructions||'')}</textarea></label>
      <label>Tools preferidas<input id="skillTools" value="${esc((p.preferred_tools||[]).join(', '))}"></label>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Crear Skill</button></div>
    </div>`);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,agent:$('#skillAgent').value,name:$('#skillName').value.trim(),slug:$('#skillSlug').value.trim(),description:$('#skillDescription').value.trim(),instructions:$('#skillInstructions').value.trim(),preferred_tools:$('#skillTools').value.split(/[,\n]+/).map(x=>x.trim()).filter(Boolean)});
    return;
  }

  if(p.kind==='assistant_preferences'){
    modal('Revisar mejora de Isabella',`<div class="form proposal-editor assistant-rule-editor">
      <div class="small">Estas reglas afectan cómo trabaja Isabella contigo. No modifican código y puedes retirarlas después.</div>
      <label>Reglas a adoptar<textarea id="assistantRulesAdd" rows="5">${esc((p.add_rules||[]).join('\n'))}</textarea></label>
      <label>Reglas a retirar<textarea id="assistantRulesRemove" rows="3">${esc((p.remove_rules||[]).join('\n'))}</textarea></label>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estas reglas</button></div>
    </div>`);
    const lines=v=>String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,add_rules:lines($('#assistantRulesAdd').value),remove_rules:lines($('#assistantRulesRemove').value)});
    return;
  }
  if(p.kind==='feed_preferences'){
    const additions=Array.isArray(p.add_entities)?p.add_entities:[];
    modal('Revisar cambios del Feed',`<div class="form proposal-editor feed-proposal-editor">
      <div class="small">Isabella modificará tu constelación solo después de que confirmes.</div>
      <div class="feed-follow-editor"><div class="feed-follow-editor-title">Añadir a tu constelación</div><div id="proposalFeedRows">${additions.map(x=>feedFollowRow({...x,id:uid()})).join('')||'<div class="small empty-panel">Sin nuevas entidades.</div>'}</div></div>
      <label>Dejar de seguir <span class="small">(separado por comas)</span><input id="proposalFeedRemove" value="${esc((p.remove_entities||[]).join(', '))}"></label>
      <label>Añadir temas base <span class="small">(separado por comas)</span><input id="proposalFeedTopics" value="${esc((p.add_topics||[]).join(', '))}"></label>
      <label>Añadir otros temas <span class="small">(separado por comas)</span><input id="proposalFeedCustom" value="${esc((p.add_custom_topics||[]).join(', '))}"></label>
      <label>Lugar habitual para el clima<input id="proposalWeatherLocation" value="${esc(Object.prototype.hasOwnProperty.call(p,'weather_location')?(p.weather_location||''):(state.feedPreferences?.weatherLocation||''))}" placeholder="Ciudad o localidad"></label>
      <label>Instrucción adicional para el Feed<textarea id="proposalFeedInstructions" rows="3">${esc(p.instructions_append||'')}</textarea></label>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estos cambios</button></div>
    </div>`);
    document.querySelectorAll('#proposalFeedRows [data-follow-remove]').forEach(b=>b.onclick=()=>b.closest('.feed-follow-row')?.remove());
    const split=v=>String(v||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i);
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>{
      const add_entities=$$('#proposalFeedRows .feed-follow-row').map(row=>({name:row.querySelector('[data-follow-name]')?.value.trim()||'',type:row.querySelector('[data-follow-type]')?.value||'other',focus:row.querySelector('[data-follow-focus]')?.value.trim()||''})).filter(x=>x.name);
      const weather=$('#proposalWeatherLocation').value.trim(),currentWeather=String(state.feedPreferences?.weatherLocation||'').trim();
      const next={...p,add_entities,remove_entities:split($('#proposalFeedRemove').value),add_topics:split($('#proposalFeedTopics').value),add_custom_topics:split($('#proposalFeedCustom').value),instructions_append:$('#proposalFeedInstructions').value.trim()};
      if(Object.prototype.hasOwnProperty.call(p,'weather_location')||weather!==currentWeather)next.weather_location=weather;
      onDone?.(next);
    };
    return;
  }
  if(p.kind==='routine'){
    const weekdays=new Set((p.weekdays||[]).map(Number));
    const dayLabels=[['0','Dom'],['1','Lun'],['2','Mar'],['3','Mié'],['4','Jue'],['5','Vie'],['6','Sáb']];
    const isOnce=p.schedule_kind==='once';
    modal(isOnce?'Revisar recordatorio':'Revisar rutina',`<div class="form proposal-editor routine-editor">
      <label>Nombre<input id="routineTitle" value="${esc(p.title||(isOnce?'Recordatorio':'Rutina'))}"></label>
      <label>Qué hará Isabella<textarea id="routineInstruction" rows="4">${esc(p.instruction||'')}</textarea></label>
      <label>Frecuencia<select id="routineKind"><option value="once" ${isOnce?'selected':''}>Una vez</option><option value="daily" ${!isOnce&&p.schedule_kind!=='weekly'?'selected':''}>Todos los días</option><option value="weekly" ${p.schedule_kind==='weekly'?'selected':''}>Semanal</option></select></label>
      <label id="routineDateLabel">Fecha<input id="routineDate" type="date" value="${esc(p.date||today())}"></label>
      <label>Hora<input id="routineTime" type="time" value="${esc(p.time||(isOnce?'09:00':'08:00'))}"></label>
      <div id="routineWeekdays" class="routine-weekdays">${dayLabels.map(([v,l])=>`<label><input type="checkbox" value="${v}" ${weekdays.has(Number(v))?'checked':''}><span>${l}</span></label>`).join('')}</div>
      <label>Zona horaria<input id="routineTimezone" value="${esc(p.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin')}"></label>
      <div class="confirm-actions"><button id="proposalEditCancel" class="secondary">Volver</button><button id="proposalEditSave" class="primary">Usar estos datos</button></div>
    </div>`);
    const syncSchedule=()=>{const kind=$('#routineKind').value;$('#routineWeekdays').classList.toggle('hidden',kind!=='weekly');$('#routineDateLabel').classList.toggle('hidden',kind!=='once')};
    $('#routineKind').onchange=syncSchedule;syncSchedule();
    $('#proposalEditCancel').onclick=()=>onDone?.(null);
    $('#proposalEditSave').onclick=()=>onDone?.({...p,
      title:$('#routineTitle').value.trim()||p.title||(isOnce?'Recordatorio':'Rutina'),
      instruction:$('#routineInstruction').value.trim()||p.instruction||'',
      schedule_kind:$('#routineKind').value,
      date:$('#routineDate').value||p.date||today(),
      time:$('#routineTime').value||'08:00',
      weekdays:$$('#routineWeekdays input:checked').map(x=>Number(x.value)),
      timezone:$('#routineTimezone').value.trim()||Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin'
    });
    return;
  }
  const target=(p.action&&p.action!=='create')?findTarget(p):null;
  const title=(p.title??target?.title??'');
  const date=p.kind==='event'?(p.date??target?.date??today()):(p.date??target?.date??'');
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
    <label>${p.kind==='task'?'Fecha (opcional)':'Fecha'}<input id="proposalDate" type="date" value="${esc(date||'')}"></label>
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
      date:p.kind==='task'?($('#proposalDate').value||null):($('#proposalDate').value||date),
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
function reviewedProposal(original,corrected){
  const keys=Object.keys(corrected).filter(k=>!['request_id','_review'].includes(k)&&JSON.stringify(corrected[k])!==JSON.stringify(original[k]));
  return {...corrected,...(keys.length?{_review:{changed_fields:keys,original:Object.fromEntries(keys.map(k=>[k,original[k]??null]))}}:{})};
}
function proposalDetails(p){
  if(p.kind==='expectation')return `<p>${esc(p.expected_event||'')}</p><div class="small">${esc(p.due_date||'')}${p.due_time?' · '+esc(p.due_time):' · sin hora exacta'} · Si vence sin evidencia, quedará pendiente de comprobar.</div>`;
  if(p.kind==='standing_intent')return `<p>${esc(p.reminder_text||'')}</p><div class="small">Máximo ${Number(p.max_triggers||3)} avisos · Separación: ${Number(p.cooldown_hours??24)} h · Caduca en ${Number(p.expires_days||90)} días</div>`;
  if(p.kind==='commitment')return `<p>${esc(p.objective||'')}</p><div class="small">Ámbito: ${esc(p.project||p.scope||'global')}${p.completion_criteria?' · Cierre: '+esc(p.completion_criteria):''}</div>${p.persistent_work?'<div class="small" style="margin-top:7px">Al confirmar, Isabella empezará a trabajar en esto y podrá continuar aunque cierres MINDS. Te pedirá algo solo si realmente queda bloqueada.</div>':''}${p.source_open_loop?'<div class="small" style="margin-top:7px">Procedencia: open loop derivado, pendiente de esta revisión.</div>':''}`;
  if(p.kind==='work_claim')return `<p class="small">Estado: ${esc(p.status||'proposed')} · Procedencia: ${esc(p.provenance_class||'inferred')}</p>${p.evidence_excerpt?`<blockquote>${esc(p.evidence_excerpt)}</blockquote>`:''}${p.supersedes_id?'<p class="small">Sustituirá una formulación anterior y conservará su historia.</p>':''}`;
  if(p.kind==='skill_proposal')return `<p>${esc(p.description||'')}</p><details open><summary>Instrucciones de la habilidad</summary><p style="white-space:pre-wrap;max-height:35vh;overflow:auto">${esc(p.instructions||'')}</p></details>`;
  return '';
}
window.MINDS_PROPOSALS={review:p=>confirmProposal(p),edit:p=>proposalEditor(p,q=>{if(q)confirmProposal(q);else closeModal()})};
function confirmProposal(p){
  p={...p,request_id:p.request_id||crypto.randomUUID()};
  const reviewHint=p.kind==='routine'?'Puedes confirmar tal cual o corregir el contenido y el horario antes de guardarlo.':p.kind==='standing_intent'?'Se activará por contexto, no por hora.':p.kind==='expectation'?'Esto seguirá un hecho futuro del mundo; una fecha vencida sin evidencia no se tratará como fallo.':p.kind==='commitment'?'Esto mantendrá el objetivo vivo, pero no ejecutará acciones por sí solo.':p.kind==='work_claim'?'Revisa especialmente estado y procedencia: una fuente no equivale automáticamente a un hecho confirmado.':p.kind==='skill_proposal'?'Esta habilidad será personal y solo se activa al confirmar.':p.kind==='feed_preferences'?'Puedes revisar la constelación y los temas antes de modificar tu Feed.':p.kind==='assistant_preferences'?'Puedes revisar esta mejora antes de incorporarla al comportamiento de Isabella.':'Puedes confirmar tal cual o corregir nombre, fecha, hora, categoría o proyecto antes de guardarlo.';
  modal('Confirmar',`<div class="row"><div class="row-main"><b>${esc(proposalLabel(p))}</b><div class="small" style="margin-top:7px">${esc(reviewHint)}</div>${proposalDetails(p)}</div></div><div class="proposal-actions"><button id="proposalCancel" class="secondary">Cancelar</button><button id="proposalEdit" class="secondary">Corregir</button><button id="proposalConfirm" class="primary">Confirmar</button></div>`);
  $('#proposalCancel').onclick=()=>{state.pendingIntent=null;save();proposalFeedback('rejected',p);closeModal();say('assistant','De acuerdo, no hice ningún cambio.')};
  $('#proposalEdit').onclick=()=>proposalEditor(p,q=>{if(q)confirmProposal(reviewedProposal(p,q));else confirmProposal(p)});
  $('#proposalConfirm').onclick=()=>{const b=$('#proposalConfirm');if(b.disabled)return;b.disabled=true;state.pendingIntent=null;save();proposalFeedback('accepted',p);Promise.resolve(applyProposal(p)).catch(e=>say('assistant','No pude aplicar el cambio: '+e.message)).finally(()=>{if(b.isConnected)b.disabled=false})};
}
function confirmProposals(list){
  const items=(list||[]).filter(Boolean).map(p=>({...p,request_id:p.request_id||crypto.randomUUID()}));
  if(!items.length)return;
  if(items.length===1){confirmProposal(items[0]);return}
  modal('Confirmar cambios',`<div class="proposal-list">${items.map((p,i)=>`<div class="proposal-row"><span>${esc(proposalLabel(p))}${proposalDetails(p)}</span><button data-proposal-edit="${i}" class="proposal-inline-edit">Editar</button></div>`).join('')}</div><div class="small" style="margin-top:10px">Puedes revisar cada cambio antes de confirmar todos.</div><div class="confirm-actions" style="margin-top:18px"><button id="proposalBatchCancel" class="secondary">Cancelar</button><button id="proposalBatchConfirm" class="primary">Confirmar todo</button></div>`);
  $$('[data-proposal-edit]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.proposalEdit);proposalEditor(items[i],q=>{if(q)items[i]=reviewedProposal(items[i],q);confirmProposals(items)})});
  $('#proposalBatchCancel').onclick=()=>{state.pendingIntent=null;save();for(const p of items)proposalFeedback('rejected',p);closeModal();say('assistant','De acuerdo, no hice ningún cambio.')};
  $('#proposalBatchConfirm').onclick=async()=>{const b=$('#proposalBatchConfirm');if(b.disabled)return;b.disabled=true;state.pendingIntent=null;save();for(const p of items){proposalFeedback('accepted',p);await applyProposal(p)}closeModal()};
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
async function createRoutineProposal(p){
  const sb=window.MINDS_SUPABASE;
  if(!sb){closeModal();say('assistant','Necesito la memoria conectada para programar una rutina que funcione aunque cierres MINDS.');return}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){closeModal();say('assistant','Conecta la memoria primero y entonces puedo programarla en el servidor.');return}
  const kind=p.schedule_kind==='once'?'once':p.schedule_kind==='weekly'?'weekly':'daily';
  const schedule={kind,time:p.time||'08:00',weekdays:Array.isArray(p.weekdays)?p.weekdays.map(Number):[],...(kind==='once'?{date:p.date||today()}:{})};
  if(schedule.kind==='weekly'&&!schedule.weekdays.length){closeModal();say('assistant','Me faltan los días de la semana para esa rutina.');return}
  if(schedule.kind==='once'&&!schedule.date){closeModal();say('assistant','Me falta la fecha del recordatorio.');return}
  const row={
    user_id:session.user.id,
    title:p.title||'Rutina',
    instruction:p.instruction||p.title||'',
    schedule,
    timezone:p.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin',
    enabled:true,
    metadata:{source:'isabella_chat'}
  };
  const {data,error}=await sb.from('isabella_routines').insert(row).select('id,title,next_run_at').single();
  closeModal();
  if(error){say('assistant','No pude programarla todavía: '+error.message);return}
  const once=schedule.kind==='once';
  say('assistant',`Listo. ${once?'Programé el recordatorio':'Programé la rutina'} “${data.title}”. Isabella escribirá aquí desde el servidor aunque MINDS esté cerrado; la próxima ejecución quedó prevista para ${new Date(data.next_run_at).toLocaleString('es-ES')}. Las notificaciones del sistema son opcionales y solo hacen falta si quieres además un aviso fuera del chat.`);
}
async function dbWorkProjectByName(name){
  const sb=window.MINDS_SUPABASE;if(!sb)return null;
  const key=String(name||'').trim().toLowerCase();if(!key)return null;
  const {data}=await sb.from('isabella_projects').select('id,name,client_key').eq('archived',false);
  return (data||[]).find(x=>String(x.client_key||'').toLowerCase()===key)||(data||[]).find(x=>String(x.name||'').toLowerCase()===key)||null;
}
async function createStandingIntentProposal(p){
  const sb=window.MINDS_SUPABASE;if(!sb){closeModal();say('assistant','Necesito la memoria conectada para guardar esta memoria futura.');return}
  const {data:{session}}=await sb.auth.getSession();if(!session){closeModal();return}
  const proj=p.project?await dbWorkProjectByName(p.project):null;
  if(p.project&&!proj){say('assistant','No pude identificar el proyecto. Corrige su nombre antes de guardar.');return}
  if(!String(p.trigger_text||'').trim()||!String(p.reminder_text||'').trim()){say('assistant','Faltan la situación y el recordatorio.');return}
  const expires=new Date(Date.now()+Math.max(1,Number(p.expires_days||90))*86400000).toISOString();
  const {error}=await sb.from('minds_standing_intents').upsert({user_id:session.user.id,trigger_text:p.trigger_text,reminder_text:p.reminder_text,trigger_terms:p.trigger_terms||[],project_id:proj?.id||null,cooldown_minutes:Math.max(0,Number(p.cooldown_hours??24))*60,max_triggers:Math.max(1,Number(p.max_triggers||3)),expires_at:expires,request_id:p.request_id||crypto.randomUUID(),metadata:{source:'isabella_chat'}},{onConflict:'user_id,request_id',ignoreDuplicates:true});
  closeModal();
  say('assistant',error?'No pude guardar esa memoria futura todavía: '+error.message:'Listo. Lo guardaré como memoria futura y te lo recordaré cuando vuelva a aparecer esa situación.');
}
async function createExpectationProposal(p){
  const sb=window.MINDS_SUPABASE;if(!sb){closeModal();say('assistant','Necesito la memoria conectada para seguir esta expectativa.');return}
  const {data:{session}}=await sb.auth.getSession();if(!session){closeModal();return}
  const proj=p.project?await dbWorkProjectByName(p.project):null;
  if(p.project&&!proj){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No pude identificar el proyecto. Corrige su nombre antes de guardar.');return}
  if(!String(p.title||'').trim()||!String(p.expected_event||'').trim()||!String(p.due_date||'').trim()){
    const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','La expectativa necesita un nombre, qué se espera y una fecha.');return
  }
  const time=String(p.due_time||'').trim()||null;
  const timezone=String(p.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin');
  const payload={
    title:String(p.title).trim(),
    expected_event:String(p.expected_event).trim(),
    expectation_type:String(p.expectation_type||'other'),
    due_date:String(p.due_date),
    due_time:time,
    due_precision:time?'datetime':'date',
    timezone,
    project_id:proj?.id||null,
    source_kind:String(p.source_kind||'conversation'),
    metadata:{source:'isabella_chat'}
  };
  const {data,error}=await sb.rpc('minds_create_expectation',{
    p_expectation:payload,
    p_request_id:p.request_id||crypto.randomUUID(),
    p_confirmed:true
  });
  if(error){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No pude guardar esa expectativa todavía: '+error.message);return}
  closeModal();
  const row=data?.expectation||{};
  const due=row.due_at?new Date(row.due_at).toLocaleString('es-ES',{timeZone:row.timezone||timezone,dateStyle:'medium',...(row.due_precision==='datetime'?{timeStyle:'short'}:{})}):p.due_date;
  say('assistant',`Listo. Mantendré “${row.title||p.title}” pendiente hasta ${due}. Si llega ese momento sin confirmación, te diré que sigue sin comprobar; no asumiré que no ocurrió.`);
}
async function createCommitmentProposal(p){
  const sb=window.MINDS_SUPABASE;if(!sb){closeModal();say('assistant','Necesito la memoria conectada para mantener esto vivo entre conversaciones.');return}
  const {data:{session}}=await sb.auth.getSession();if(!session){closeModal();return}
  const proj=p.project?await dbWorkProjectByName(p.project):null;
  if(p.project&&!proj){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No pude identificar el proyecto. Corrige su nombre antes de guardar.');return}
  if(!String(p.title||'').trim()||!String(p.objective||'').trim()){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','El trabajo necesita un nombre y un objetivo claros.');return}
  const persistent=!!p.persistent_work;
  const skillTrace=Array.isArray(p.skill_trace)?p.skill_trace.slice(0,4).map(x=>({
    slug:String(x?.slug||'').slice(0,80),name:String(x?.name||'').slice(0,180),
    version:Math.max(1,Number(x?.version||1)),source:x?.source==='personal'?'personal':'system'
  })).filter(x=>x.slug&&x.name):[];
  const payload={
    agent:'isabella',
    title:String(p.title).trim(),
    objective:String(p.objective).trim(),
    scope:proj?'project':String(p.scope||'global'),
    project_id:proj?.id||null,
    completion_criteria:String(p.completion_criteria||'').trim()||null,
    source_kind:p.source_flush_id&&p.source_open_loop?'checkpoint':'user',
    source_flush_id:p.source_flush_id||null,
    source_open_loop:p.source_open_loop||null,
    metadata:{
      source:'isabella_chat',
      persistent_work:persistent,
      persistent_work_version:persistent?String(p.persistent_work_version||'persistent-work-v0.1'):null,
      notify_mode:persistent?String(p.notify_mode||'policy'):'policy',
      skill_trace:skillTrace
    }
  };
  const {data,error}=await sb.rpc('minds_create_commitment',{p_commitment:payload,p_request_id:p.request_id||crypto.randomUUID(),p_confirmed:true});
  if(error){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No pude mantener este objetivo vivo todavía: '+error.message);return}
  if(!persistent){
    closeModal();say('assistant',`Listo. Mantendré “${data?.title||p.title}” vivo. No lo convertiré automáticamente en tareas ni acciones.`);return;
  }

  const {data:workspaceResult,error:workspaceError}=await sb.rpc('minds_ensure_commitment_workspace',{p_commitment_id:data?.id});
  const workspace=workspaceResult?.workspace||null;
  if(workspaceError||workspaceResult?.status!=='ok'||!workspace?.id){
    closeModal();
    say('assistant',`Mantendré “${data?.title||p.title}” vivo, pero no pude empezar el trabajo persistente todavía. El objetivo no se perdió; puedo reintentarlo.`);
    return;
  }

  const instruction=String(p.continuation_instruction||p.objective||'').trim().slice(0,6000);
  const checkpoints=Math.max(1,Math.min(32,Number(p.max_checkpoints||24)));
  const missionRequest=String(p.mission_request_id||crypto.randomUUID());
  const {data:missionResult,error:missionError}=await sb.rpc('minds_start_mission_run',{
    p_workspace_id:workspace.id,p_instruction:instruction,p_request_id:missionRequest,p_max_iterations:checkpoints
  });
  if(missionError||!['ok','already_active'].includes(String(missionResult?.status||''))){
    closeModal();
    say('assistant',`Mantendré “${data?.title||p.title}” vivo, pero no pude arrancar el trabajo en segundo plano. El objetivo quedó guardado y puedo retomarlo.`);
    return;
  }
  const run=missionResult?.run||{};
  closeModal();
  say('assistant',`Listo. Me encargo de “${data?.title||p.title}”. Puedes cerrar MINDS; seguiré avanzando y volveré a ti si necesito una decisión o cuando haya algo que realmente merezca tu atención.`);
}
async function createWorkClaimProposal(p){
  const sb=window.MINDS_SUPABASE;if(!sb){closeModal();return}
  const proj=await dbWorkProjectByName(p.project);
  if(!proj){say('assistant','No pude identificar ese proyecto de Work.');return}
  if(!String(p.statement||'').trim()){say('assistant','Escribe el contenido del conocimiento antes de guardarlo.');return}
  const evidence=Array.isArray(p.evidence)?p.evidence:(p.source_file_id||p.evidence_excerpt)?[{source_file_id:p.source_file_id||null,source_message_id:p.source_message_id||null,excerpt:p.evidence_excerpt||null,source_kind:p.source_file_id?'work_file':'conversation',stance:p.evidence_stance||'supports',locator:p.locator||{}}]:[];
  const {data,error}=await sb.rpc('minds_save_work_claim',{p_claim:{...p,project_id:proj.id},p_evidence:evidence,p_request_id:p.request_id||crypto.randomUUID(),p_confirmed:true});
  if(error){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No se guardó el conocimiento ni su evidencia: '+error.message);return}
  closeModal();say('assistant',`Guardé el conocimiento en ${proj.name} como ${data?.status==='confirmed'?'confirmado':'propuesto'}, junto con su evidencia.`);
  window.MINDS_WORK?.refresh?.();
}
async function createSkillProposal(p){
  const sb=window.MINDS_SUPABASE;if(!sb){closeModal();return}
  if(!String(p.instructions||'').trim()||!String(p.name||'').trim()){say('assistant','La habilidad necesita un nombre e instrucciones.');return}
  const {data,error}=await sb.rpc('minds_apply_personal_skill',{p_skill:p,p_request_id:p.request_id||crypto.randomUUID(),p_confirmed:true});
  if(error){const b=$('#proposalConfirm');if(b)b.disabled=false;say('assistant','No pude activar la habilidad: '+error.message);return}
  closeModal();say('assistant',`La habilidad “${data.name}” quedó activa para ${data.agent==='sofia'?'Sofía':'Isabella'} como v${data.version}.`);
}
function applyFeedPreferencesProposal(p){
  const prefs={...base.feedPreferences,...(state.feedPreferences||{})};
  const key=s=>String(s||'').trim().toLocaleLowerCase();
  let graph=Array.isArray(prefs.followGraph)?prefs.followGraph.map(x=>({...x})):[];
  const removals=new Set((p.remove_entities||[]).map(key).filter(Boolean));
  if(removals.size)graph=graph.filter(x=>!removals.has(key(x.name)));
  for(const raw of p.add_entities||[]){
    const name=String(raw?.name||'').trim();if(!name)continue;
    const existing=graph.find(x=>key(x.name)===key(name));
    if(existing){
      existing.name=name;
      if(raw.type&&raw.type!=='other')existing.type=raw.type;
      if(String(raw.focus||'').trim())existing.focus=String(raw.focus).trim();
      existing.active=true;
    }else{
      graph.push({id:uid(),name,type:String(raw.type||'other'),focus:String(raw.focus||'').trim(),active:true});
    }
  }
  const mergeList=(current,adds,removes=[])=>{
    const rm=new Set((removes||[]).map(key));
    const out=(current||[]).filter(x=>!rm.has(key(x)));
    for(const x of adds||[]){const v=String(x||'').trim();if(v&&!out.some(y=>key(y)===key(v)))out.push(v)}
    return out;
  };
  const topics=mergeList(prefs.topics,p.add_topics,p.remove_topics).slice(0,40);
  const customTopics=mergeList(prefs.customTopics,p.add_custom_topics,p.remove_custom_topics).slice(0,40);
  let instructions=String(prefs.instructions||'').trim(),extra=String(p.instructions_append||'').trim();
  if(extra&&!instructions.toLowerCase().includes(extra.toLowerCase()))instructions=[instructions,extra].filter(Boolean).join('\n');
  graph=graph.filter(x=>x.name).slice(0,120);
  const weatherLocation=Object.prototype.hasOwnProperty.call(p,'weather_location')?String(p.weather_location||'').trim():String(prefs.weatherLocation||'');
  state.feedPreferences={...prefs,topics,customTopics,followGraph:graph,following:graph.map(x=>x.name),instructions,weatherLocation};
  save();closeModal();renderFeed(true);
  const added=(p.add_entities||[]).length,removed=(p.remove_entities||[]).length,weatherChanged=Object.prototype.hasOwnProperty.call(p,'weather_location');
  say('assistant',`Listo. Actualicé tu Feed${added?' y añadí '+added+(added===1?' seguimiento':' seguimientos'):''}${removed?'; quité '+removed:''}${weatherChanged?(weatherLocation?'; usaré '+weatherLocation+' como lugar habitual para el clima':'; dejé el clima sin ubicación habitual'):''}. La próxima edición ya usará estos ajustes.`);
}
function applyAssistantPreferencesProposal(p){
  const prefs={...base.assistantPreferences,...(state.assistantPreferences||{})};
  const key=s=>String(s||'').trim().toLocaleLowerCase();
  const remove=new Set((p.remove_rules||[]).map(key).filter(Boolean));
  let rules=(prefs.behaviorRules||[]).filter(x=>!remove.has(key(x)));
  for(const raw of p.add_rules||[]){const rule=String(raw||'').trim();if(rule&&!rules.some(x=>key(x)===key(rule)))rules.push(rule)}
  state.assistantPreferences={...prefs,behaviorRules:rules.slice(0,20)};
  save();closeModal();
  say('assistant','Listo. Adopté esta mejora como una preferencia de comportamiento. Puedes revisarla o quitarla desde Proactividad de Isabella.');
}
function applyProposal(p){
  if(p.kind==='routine')return createRoutineProposal(p)
  if(p.kind==='standing_intent')return createStandingIntentProposal(p)
  if(p.kind==='expectation')return createExpectationProposal(p)
  if(p.kind==='commitment')return createCommitmentProposal(p)
  if(p.kind==='work_claim')return createWorkClaimProposal(p)
  if(p.kind==='skill_proposal')return createSkillProposal(p)
  if(p.kind==='feed_preferences'){applyFeedPreferencesProposal(p);return}
  if(p.kind==='assistant_preferences'){applyAssistantPreferencesProposal(p);return}
  const action=p.action||'create';
  const categoryId=p.category?state.categories.find(c=>c.name.toLowerCase()===String(p.category).toLowerCase())?.id:null;
  const projectId=p.project?state.projects.find(x=>x.name.toLowerCase()===String(p.project).toLowerCase())?.id:null;
  const date=p.kind==='event'?(p.date||today()):(p.date||null);
  if(action==='update'||action==='delete'||action==='complete'||action==='archive'){
    const target=findTarget(p);
    if(!target){closeModal();say('assistant','No pude identificar con seguridad cuál elemento quieres cambiar. Dime cuál y lo intento de nuevo.');return}
    const before=clone(target);
    if(action==='complete'&&p.kind==='task'){
      target.done=true;target.completedAt=new Date().toISOString();
      mutation('task','complete',before,target,'assistant');
      save();renderCalendar();closeModal();say('assistant','Listo. La marqué como completada.');return;
    }
    if(action==='archive'&&p.kind==='task'){
      target.archivedAt=new Date().toISOString();
      mutation('task','archive',before,target,'assistant');
      save();renderCalendar();closeModal();say('assistant','Listo. La archivé.');return;
    }
    if(action==='delete'){
      const list=p.kind==='task'?state.tasks:state.events;
      const idx=list.findIndex(x=>x.id===target.id);
      if(idx>=0)list.splice(idx,1);
      tombstone(p.kind,target.id);
      mutation(p.kind,'delete',before,null,'assistant');
      save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó eliminado.');return;
    }
    if(p.title!=null&&String(p.title).trim())target.title=String(p.title).trim();
    if(p.kind==='task'&&p.clear_date)target.date=null;
    else if(p.date)target.date=p.date;
    if(p.kind==='event'){
      if(p.time)target.start=p.time;
      if(p.duration_minutes!=null)target.duration=Number(p.duration_minutes);
      if(p.all_day!=null)target.allDay=!!p.all_day;
    }else{
      if(Object.prototype.hasOwnProperty.call(p,'reminder_time'))target.reminderTime=target.date?(p.reminder_time||null):null;
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
    const item={id:uid(),title:p.title||'Tarea',date,done:false,completedAt:null,archivedAt:null,sortOrder:nextTaskOrder(date),categoryId:createCategoryId,projectId:projectId||null,recurrence:p.recurrence?{text:p.recurrence}:{},reminderTime:date?(p.reminder_time||null):null,notes:p.notes||'',metadata:{source:'isabella'}};
    state.tasks.push(item);mutation('task','create',null,item,'assistant');
  }
  save();renderCalendar();closeModal();say('assistant','Listo. Ya quedó agregado.');
}
async function acknowledgeIntentDelivery(delivery){
  const sb=window.MINDS_SUPABASE;if(!sb)return;
  const {error}=await sb.rpc('minds_ack_standing_intents',{p_ids:delivery.ids,p_run_key:delivery.run_key});
  if(error)console.warn('No se pudo confirmar la entrega del recordatorio:',error.message);
}
async function handle(text,attachments=[],replyTo=null){
  const copy=(attachments||[]).map(x=>({path:x.path,mime:x.mime,name:x.name}));
  clearAssistantStream();say('user',text||'📷 Foto',{attachments:copy,replyTo});clearReplyTarget();orb('thinking','Pensando…');setWorking($('#sendButton'),true);
  try{
    if(window.ISABELLA_AI?.ask){
      const result=await window.ISABELLA_AI.ask(text||'Te envío esta imagen.',state,{attachments:copy,replyTo,onProgress:event=>{if(event?.label)orb('thinking',event.label)},onTextDelta:(delta,full)=>streamAssistantDelta(delta,full),onTextReset:()=>clearAssistantStream()});
      state.pendingIntent=null;
      clearAssistantStream();
      if(result?.reply||result?.artifacts?.length)say('assistant',result.reply||'Listo.',{sources:result.sources||[],quickReplies:result.quick_replies||[],artifacts:result.artifacts||[]});
      if(result?.reply&&result?.standing_intent_delivery)void acknowledgeIntentDelivery(result.standing_intent_delivery);
      if(result?.question&&result.question!==result.reply)say('assistant',result.question,{quickReplies:result?.reply?[]:(result.quick_replies||[])});
      if(result?.memory_candidates?.length)rememberCandidates(result.memory_candidates);
      if(result?.autonomy_execution)await window.ISABELLA_SYNC_PULL_NOW?.();
      if(Array.isArray(result?.proposals)&&result.proposals.length){state.pendingIntent=null;save();confirmProposals(result.proposals)}
      else if(result?.proposal){state.pendingIntent=null;save();confirmProposal(result.proposal)}
      else save();
    }else say('assistant',localFallback(text));
  }catch(e){clearAssistantStream();say('assistant',e?.message||localFallback(text))}
  finally{clearAssistantStream();orb();setWorking($('#sendButton'),false)}
}
let pendingChatFiles=[];
const pendingChatUrls=new Map();
function renderPendingChatFiles(){
  const box=$('#chatAttachmentPreview');if(!box)return;
  if(!pendingChatFiles.length){box.innerHTML='';box.classList.add('hidden');return}
  box.classList.remove('hidden');
  box.innerHTML=pendingChatFiles.map((file,i)=>{
    let url=pendingChatUrls.get(file);
    if(!url){url=URL.createObjectURL(file);pendingChatUrls.set(file,url)}
    return `<div class="pending-photo"><img src="${esc(url)}" alt=""><button data-remove-chat-file="${i}" aria-label="Quitar foto">×</button></div>`;
  }).join('');
  document.querySelectorAll('[data-remove-chat-file]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.removeChatFile),file=pendingChatFiles[i],url=pendingChatUrls.get(file);
    if(url)URL.revokeObjectURL(url);pendingChatUrls.delete(file);pendingChatFiles.splice(i,1);renderPendingChatFiles();
  });
}
async function normalizeUploadImage(file){
  const supported=['image/jpeg','image/png','image/webp'];
  if(supported.includes(String(file.type||'').toLowerCase())&&file.size<=8*1024*1024)return {blob:file,mime:file.type||'image/jpeg'};
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const max=2200,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve({blob,mime:'image/jpeg'}):reject(new Error('No pude preparar la foto.'))},'image/jpeg',.88);
      }catch(e){URL.revokeObjectURL(url);reject(e)}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No pude leer esta imagen.'))};
    img.src=url;
  });
}
async function uploadChatImages(files){
  const sb=window.MINDS_SUPABASE;if(!sb)throw new Error('Necesito la memoria conectada para enviar fotos.');
  const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Conecta la memoria antes de enviar fotos.');
  const out=[];
  for(const file of (files||[]).slice(0,3)){
    const prepared=await normalizeUploadImage(file);
    const ext=prepared.mime==='image/png'?'png':prepared.mime==='image/webp'?'webp':'jpg';
    const id=globalThis.crypto?.randomUUID?.()||uid();
    const path=`${session.user.id}/chat/${today()}/${id}.${ext}`;
    const {error}=await sb.storage.from('isabella-uploads').upload(path,prepared.blob,{contentType:prepared.mime,upsert:false});
    if(error)throw error;
    out.push({path,mime:prepared.mime,name:file.name||('Foto.'+ext)});
  }
  return out;
}
async function hydrateChatImages(){
  const imgs=[...document.querySelectorAll('img[data-chat-image-path]')].filter(x=>!x.dataset.loaded);
  for(const img of imgs)observeStorageImage(img,'isabella-uploads',img.dataset.chatImagePath||'');
}

function bind(){
 const assistantScroll=$('.assistant-scroll');
 const updateOrbCompact=()=>syncOrbCompact(state.messages.some(m=>m.role==='user'&&String(m.text||'').trim())||Number(assistantScroll?.scrollTop||0)>48);
 assistantScroll?.addEventListener('scroll',updateOrbCompact,{passive:true});
 updateOrbCompact();
 const i=$('#chatInput'),imageInput=$('#chatImageInput'),attachButton=$('#attachButton');
 i.addEventListener('focus',()=>syncOrbCompact(true));
 const autosize=()=>{i.style.height='auto';i.style.height=Math.min(i.scrollHeight,156)+'px'};
 attachButton.onclick=()=>imageInput.click();
 imageInput.onchange=()=>{const next=[...imageInput.files||[]].filter(f=>String(f.type||'').startsWith('image/'));pendingChatFiles=[...pendingChatFiles,...next].slice(0,3);imageInput.value='';renderPendingChatFiles()};
 const send=async()=>{
   const t=i.value.trim();if(!t&&!pendingChatFiles.length)return;
   const replyTo=pendingReplyTo?{...pendingReplyTo}:null;
   const files=[...pendingChatFiles];pendingChatFiles=[];renderPendingChatFiles();i.value='';autosize();$('#sendButton').disabled=true;attachButton.disabled=true;
   try{const attachments=files.length?await uploadChatImages(files):[];await handle(t,attachments,replyTo)}
   catch(e){say('assistant',e?.message||'No pude enviar la foto.')}
   finally{$('#sendButton').disabled=false;attachButton.disabled=false}
 };
 $('#sendButton').onclick=send;i.addEventListener('input',autosize);i.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send()}});autosize();
 $$('.main-nav-item').forEach(b=>b.onclick=()=>show(b.dataset.nav));
 $('#refreshFeed').onclick=()=>renderFeed(true);
 $('#feedSettings').onclick=()=>feedPreferencesPanel();
 $('#refreshIdeas').onclick=()=>renderIdeas(true);
 $('#closeFeedDetail').onclick=closeFeedStory;
 const feedThreadInput=$('#feedThreadInput'),feedThreadForm=$('#feedThreadForm');
 const autosizeFeedThread=()=>{feedThreadInput.style.height='auto';feedThreadInput.style.height=Math.min(feedThreadInput.scrollHeight,132)+'px'};
 feedThreadInput.addEventListener('input',autosizeFeedThread);autosizeFeedThread();
 feedThreadInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();feedThreadForm.requestSubmit()}});
 feedThreadForm.onsubmit=e=>{e.preventDefault();const q=feedThreadInput.value.trim();if(!q)return;feedThreadInput.value='';autosizeFeedThread();submitFeedStoryQuestion(q)};
 $('#openSofiaButton').onclick=()=>openSofia();
 $('#closeIdeaWorkspace').onclick=closeIdeaWorkspace;
 const ideaWorkspaceInput=$('#ideaWorkspaceInput'),ideaWorkspaceForm=$('#ideaWorkspaceForm');
 const autosizeIdeaWorkspace=()=>{ideaWorkspaceInput.style.height='auto';ideaWorkspaceInput.style.height=Math.min(ideaWorkspaceInput.scrollHeight,132)+'px'};
 ideaWorkspaceInput.addEventListener('input',autosizeIdeaWorkspace);autosizeIdeaWorkspace();
 ideaWorkspaceInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();ideaWorkspaceForm.requestSubmit()}});
 ideaWorkspaceForm.onsubmit=e=>{e.preventDefault();const q=ideaWorkspaceInput.value.trim();if(!q)return;ideaWorkspaceInput.value='';autosizeIdeaWorkspace();void runIdeaWorkspace(q)};
 $('#todayCard').onclick=()=>{state.date=today();state.view='month';show('calendar')};$('#backButton').onclick=()=>show('assistant');$('#todayButton').onclick=()=>{state.date=today();save();renderCalendar()};$('#prevButton').onclick=()=>move(-1);$('#nextButton').onclick=()=>move(1);$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;save();renderCalendar()});$('#menuButton').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=closeModal;$$('[data-action]').forEach(b=>b.onclick=()=>{closeDrawer();action(b.dataset.action)});initVoice(); }
function initSwipe(){const a=$('#swipeArea');let sx=0,sy=0,on=false;a.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;if(e.target.closest?.('.message,.message-actions,.composer-wrap,.generated-artifact,a,button,input,textarea')){on=false;return}const t=e.touches[0];sx=t.clientX;sy=t.clientY;on=true},{passive:true});a.addEventListener('touchend',e=>{if(!on)return;on=false;const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(dy)*1.05){if(dx<0&&state.screen==='assistant')show('calendar');else if(dx>0&&state.screen==='calendar')show('assistant')}},{passive:true})}
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
  const color=itemColor(item),done=kind==='task'&&!!item.done;
  return `<div class="agenda-item ${kind}-item ${kind==='task'?'task-item':''} ${done?'task-done':''}" data-kind="${kind}" data-id="${item.id}" data-date="${item.date}" tabindex="0" style="--item-color:${color}">
    ${kind==='task'?`<button class="task-check ${done?'checked':''}" data-task-toggle="${item.id}" aria-label="${done?'Marcar pendiente':'Marcar hecha'}">${done?'✓':''}</button>`:'<span class="adot"></span>'}
    <div class="agenda-main"><strong>${esc(item.title)}</strong><div class="meta">${esc(category)}${esc(proj)}</div></div>
    <div class="agenda-tail"><div class="atime">${esc(time)}</div>${kind==='task'?'<button class="drag-handle" aria-label="Mantén y arrastra para reordenar">⋮⋮</button>':''}</div>
  </div>`;
}
function month(){
  const f=fromIso(state.date),first=new Date(f.getFullYear(),f.getMonth(),1),start=startWeek(first),wd=['L','M','X','J','V','S','D'];
  let h=`<div class="month-year">${f.getFullYear()}</div><div class="month-weekdays"><div></div>${wd.map(x=>`<div>${x}</div>`).join('')}</div><div class="month-grid">`;
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
  const ta=state.tasks.filter(x=>x.date===state.date&&!x.archivedAt).sort((a,b)=>Number(a.done)-Number(b.done)||taskOrder(a,b));
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
    const d=addDays(s,i),di=iso(d),ev=state.events.filter(x=>x.date===di).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===di&&!x.archivedAt).sort((a,b)=>Number(a.done)-Number(b.done)||taskOrder(a,b));
    h+=`<div class="wday" data-week-date="${di}"><div class="whead">${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>${ev.map(e=>`<button class="witem calendar-entry event-item" data-kind="event" data-id="${e.id}" data-date="${e.date}" style="--item-color:${itemColor(e)}"><b>${esc(e.start)}</b><br>${esc(e.title)}</button>`).join('')}${ta.map(t=>`<button class="witem calendar-entry task-item ${t.done?'task-done':''}" draggable="true" data-kind="task" data-id="${t.id}" data-date="${t.date}" style="--item-color:${itemColor(t)}">${t.done?'✓':'○'} ${esc(t.title)}</button>`).join('')}${!ev.length&&!ta.length?'<div class="meta week-free">Libre</div>':''}</div>`;
  }
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function day(){
  const ev=state.events.filter(x=>x.date===state.date),ta=state.tasks.filter(x=>x.date===state.date&&!x.archivedAt).sort((a,b)=>Number(a.done)-Number(b.done)||taskOrder(a,b));
  let h=`<div class="day-all"><b>Todo el día</b><div>${ta.length?ta.map(t=>`<button class="pill calendar-entry task-item ${t.done?'task-done':''}" data-kind="task" data-id="${t.id}" data-date="${t.date}" style="--item-color:${itemColor(t)}">${t.done?'✓ ':'○ '}${esc(t.title)}</button>`).join(''):'<span class="meta">Sin tareas</span>'}</div></div><div class="hours">`;
  for(let hr=7;hr<=22;hr++)h+=`<div class="hrow"><div class="hlabel">${pad(hr)}:00</div><div></div></div>`;
  for(const e of ev){const top=((minutes(e.start)-420)/60)*60,height=Math.max(34,(e.duration||60)-3);if(top>=0&&top<960)h+=`<button class="event calendar-entry event-item" data-kind="event" data-id="${e.id}" data-date="${e.date}" style="top:${top}px;height:${height}px;--item-color:${itemColor(e)}"><b>${esc(e.start)} ${esc(e.title)}</b><div class="meta">${esc(cat(e.categoryId))}${e.projectId?' · '+esc(project(e.projectId)):''}</div></button>`}
  h+='</div>';$('#calendarContent').innerHTML=h;bindCalendarItems();
}
function bindCalendarItems(){
  document.querySelectorAll('[data-task-toggle]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleTaskDone(b.dataset.taskToggle)});
  document.querySelectorAll('.calendar-entry,.agenda-item[data-kind]').forEach(el=>{
    if(el.dataset.bound)return;el.dataset.bound='1';
    let sx=0,sy=0,moved=false;
    el.addEventListener('touchstart',e=>{if(e.target.closest('.task-check'))return;if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;e.stopPropagation()},{passive:true});
    el.addEventListener('touchmove',e=>{const t=e.touches[0];if(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12)moved=true;e.stopPropagation()},{passive:true});
    el.addEventListener('touchend',e=>{if(e.target.closest('.task-check'))return;const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;e.stopPropagation();if(el.dataset.dragActive==='1'||el.dataset.justDragged==='1'){el.dataset.justDragged='0';return}if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx>0&&el.dataset.kind==='task')toggleTaskDone(el.dataset.id);else if(dx<0)itemActions(el.dataset.kind,el.dataset.id);return}if(!moved&&!el.closest('.drag-handle'))editItem(el.dataset.kind,el.dataset.id)},{passive:true});
    el.addEventListener('click',e=>{if(e.detail===0||'ontouchstart' in window)return;if(el.dataset.justDragged==='1'){el.dataset.justDragged='0';return}if(e.target.closest('.drag-handle,.task-check'))return;editItem(el.dataset.kind,el.dataset.id)});
  });
  initWeekDateDrag();
  initTaskDrag();
  initEventDrag();
}
function initWeekDateDrag(){
  if(state.view!=='week')return;
  $$('.week .task-item[draggable="true"]').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      card.dataset.justDragged='1';card.classList.add('dragging');
      try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.id||'')}catch{}
    });
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');setTimeout(()=>{card.dataset.justDragged='0'},120)});
  });
  $$('.week .wday[data-week-date]').forEach(day=>{
    day.addEventListener('dragover',e=>{if(!e.dataTransfer)return;e.preventDefault();e.dataTransfer.dropEffect='move';day.classList.add('week-drop-target')});
    day.addEventListener('dragleave',e=>{if(!day.contains(e.relatedTarget))day.classList.remove('week-drop-target')});
    day.addEventListener('drop',e=>{
      e.preventDefault();day.classList.remove('week-drop-target');
      const id=e.dataTransfer?.getData('text/plain'),t=state.tasks.find(x=>x.id===id),date=day.dataset.weekDate;
      if(!t||!date||t.date===date)return;
      const before=clone(t);t.date=date;t.sortOrder=nextTaskOrder(date);mutation('task','move_date',before,t,'manual');save();renderCalendar();
    });
  });
}
function itemBy(kind,id){return (kind==='task'?state.tasks:state.events).find(x=>x.id===id)}
function itemActions(kind,id){
  const item=itemBy(kind,id);if(!item)return;
  const archive=kind==='task'?'<button id="quickArchive" class="sheet-action">Archivar</button>':'';
  const complete=kind==='task'?'<button id="quickComplete" class="sheet-action">'+(item.done?'Marcar como pendiente':'Marcar como hecha')+'</button>':'';
  modal(item.title,`<div class="sheet-actions">${complete}<button id="quickEdit" class="sheet-action">Editar / mover</button><button id="quickDuplicate" class="sheet-action">Duplicar</button>${archive}<button id="quickDelete" class="sheet-action danger">Eliminar</button></div>`);
  $('#quickEdit').onclick=()=>editItem(kind,id);
  $('#quickDuplicate').onclick=()=>duplicateItem(kind,id);
  if(kind==='task'){
    $('#quickComplete').onclick=()=>toggleTaskDone(id);
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
    <label>${kind==='task'?'Fecha (opcional)':'Fecha'}<input id="editDate" type="date" value="${esc(item.date||'')}"></label>
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
    item.date=kind==='task'?($('#editDate').value||null):($('#editDate').value||item.date);
    item.categoryId=$('#editCategory').value||'personal';
    item.projectId=$('#editProject').value||null;
    item.notes=$('#editNotes').value||'';
    if(kind==='event'){item.start=$('#editTime').value||item.start;item.duration=Math.max(5,Number($('#editDuration').value||item.duration||60))}
    else {item.reminderTime=item.date?($('#editReminder').value||null):null;if((before.date||null)!==(item.date||null)||item.sortOrder==null)item.sortOrder=nextTaskOrder(item.date)}
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
function toggleTaskDone(id){
  const t=state.tasks.find(x=>x.id===id);if(!t)return;const before=clone(t);
  t.done=!t.done;t.completedAt=t.done?new Date().toISOString():null;
  mutation('task',t.done?'complete':'reopen',before,t,'manual');save();renderCalendar();
  if(!$('#modal')?.classList.contains('hidden'))closeModal();
}
function completeTask(id){
  const t=state.tasks.find(x=>x.id===id);if(!t||t.done)return;toggleTaskDone(id);
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
function openDrawer(){const d=$('#drawer');d.classList.remove('hidden');d.scrollTop=0;$('#drawerBackdrop').classList.remove('hidden');document.body.classList.add('drawer-open')}function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawerBackdrop').classList.add('hidden');document.body.classList.remove('drawer-open')}function modal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').classList.remove('artifact-image-modal');$('#modal').classList.remove('hidden');$('#modalBackdrop').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden');$('#modal').classList.remove('artifact-image-modal');$('#modalBackdrop').classList.add('hidden')}
function action(a){if(a==='tasks')tasksPanel();if(a==='new')newPanel();if(a==='memory')memoryPanel();if(a==='assistantprefs')assistantPreferencesPanel();if(a==='push')void pushNotificationsPanel();if(a==='permissions')void contextualAutonomyPanel();if(a==='routines')routinesPanel();if(a==='intents')void standingIntentsPanel();if(a==='continuity')void continuityPanel();if(a==='skills')skillsPanel();if(a==='doctor')void doctorPanel();if(a==='feedprefs')feedPreferencesPanel();if(a==='artifacts')void artifactsPanel();if(a==='aiusage')void aiUsagePanel();if(a==='categories')categoriesPanel()}
function commitmentStatusLabel(status){return humanSurface()?.commitment?.(status)?.headline||String(status||'')}
async function continuityPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Continuidad','<div class="small">Conecta la memoria para ver qué mantiene vivo MINDS.</div>');return}
  modal('Continuidad','<div class="surface-loading">Leyendo lo que sigue vivo…</div>');
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sin sesión');
    const [commitQ,eventQ,workspaceQ,itemQ]=await Promise.all([
      sb.from('minds_commitments').select('id,title,objective,scope,status,completion_criteria,source_kind,source_open_loop,metadata,created_at,updated_at,project_id,isabella_projects(name)').order('updated_at',{ascending:false}).limit(100),
      sb.from('minds_commitment_events').select('commitment_id,event_type,body,from_status,to_status,source_kind,source,metadata,created_at').order('created_at',{ascending:false}).limit(300),
      sb.from('minds_commitment_workspaces').select('id,commitment_id,status,summary,updated_at').order('updated_at',{ascending:false}).limit(100),
      sb.from('minds_commitment_workspace_items').select('workspace_id,kind,status,created_at').order('created_at',{ascending:false}).limit(500)
    ]);
    if(commitQ.error)throw commitQ.error;if(eventQ.error)throw eventQ.error;if(workspaceQ.error)throw workspaceQ.error;if(itemQ.error)throw itemQ.error;
    const rows=commitQ.data||[],events=eventQ.data||[],workspaces=workspaceQ.data||[],workspaceItems=itemQ.data||[],latest=new Map(),workspaceByCommitment=new Map(workspaces.map(w=>[w.commitment_id,w]));
    for(const e of events)if(!latest.has(e.commitment_id))latest.set(e.commitment_id,e);
    const rank={active:0,waiting:1,paused:2,completed:3,cancelled:4};
    rows.sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime());
    const cards=rows.map(x=>{
      const e=latest.get(x.id),last=x?.metadata?.last_continuity||null,projectName=x.isabella_projects?.name||null,workspace=workspaceByCommitment.get(x.id);
      const missionCount=workspace?workspaceItems.filter(i=>i.workspace_id===workspace.id).length:0;
      const workspaceState=workspace?humanSurface()?.workspace?.(workspace.status):null;
      const workspaceTechnical=workspace?`<div class="human-tech-grid"><span>Mission Workspace</span><b>${esc(workspace.status)}</b><span>Entradas</span><b>${missionCount}</b><span>Actualizado</span><b>${new Date(workspace.updated_at).toLocaleString('es-ES')}</b></div>`:'';
      const mission=workspace?`<div class="continuity-cause human-work-card">${humanStateHTML(workspaceState,workspaceTechnical)}${workspace.summary?`<p class="human-work-summary">${esc(workspace.summary)}</p>`:''}<button class="secondary" data-mission-workspace="${esc(workspace.id)}">Ver trabajo</button></div>`:'';
      const why=last?.signal_title?`<div class="continuity-cause"><span>ÚLTIMO CAMBIO RELEVANTE</span><b>${esc(last.signal_title)}</b>${last.signal_body?`<p>${esc(last.signal_body)}</p>`:''}<small>${esc(last.reason||'')} · ${new Date(last.linked_at||last.occurred_at||x.updated_at).toLocaleString('es-ES')}</small></div>`:(e&&['reactivated','signal_linked'].includes(e.event_type)?`<div class="continuity-cause"><span>ÚLTIMO CAMBIO</span><b>${esc(e.body||e.event_type)}</b><small>${new Date(e.created_at).toLocaleString('es-ES')}</small></div>`:'');
      return `<article class="commitment-card ${esc(x.status)}"><div class="commitment-card-head"><span class="commitment-status">${esc(commitmentStatusLabel(x.status))}</span><span class="commitment-project">${esc(projectName||x.scope||'global')}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.objective)}</p>${x.completion_criteria?`<div class="commitment-criteria"><span>CIERRE</span>${esc(x.completion_criteria)}</div>`:''}${x.source_open_loop?'<div class="small">Nació de un open loop que tú decidiste elevar.</div>':''}${mission}${why}</article>`;
    }).join('');
    modal('Continuidad',`<div class="continuity-intro">Aquí puedes ver lo que Isabella mantiene vivo para que no tengas que recordar cada asunto abierto por tu cuenta. Nada entra en esta lista sin tu revisión y algo que hayas pausado no se reactiva por sí solo.</div><div class="commitment-list">${cards||'<div class="empty-panel">Todavía no has decidido mantener ningún asunto vivo. Puedes decirle a Isabella “esto no quiero perderlo” cuando algo merezca continuidad.</div>'}</div>`);
    document.querySelectorAll('[data-mission-workspace]').forEach(b=>b.onclick=()=>void missionWorkspacePanel(b.dataset.missionWorkspace));
  }catch(e){modal('Continuidad','<div class="small">No pude cargar la continuidad ahora mismo.</div>')}
}
function missionRunStatusLabel(status){return humanSurface()?.mission?.({status})?.headline||String(status||'')}
async function missionRunControlUI(runId,action,workspaceId){
  const sb=window.MINDS_SUPABASE;if(!sb||!runId)return;
  try{
    const rpc=action==='pause'?'minds_pause_mission_run':action==='resume'?'minds_resume_mission_run':'minds_cancel_mission_run';
    const params=action==='resume'?{p_run_id:runId,p_instruction:null}:{p_run_id:runId};
    const {data,error}=await sb.rpc(rpc,params);if(error)throw error;
    if(data?.status!=='ok')throw new Error(data?.status||'No disponible');
    await missionWorkspacePanel(workspaceId);
  }catch(e){say('assistant','No pude cambiar ese trabajo ahora mismo: '+(e?.message||String(e)))}
}
async function missionWorkspacePanel(id){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  modal('Trabajo de Isabella','<div class="surface-loading">Leyendo lo que sigue en marcha…</div>');
  try{
    const [wQ,iQ,rQ]=await Promise.all([
      sb.from('minds_commitment_workspaces').select('id,commitment_id,title,objective_snapshot,completion_criteria_snapshot,status,summary,updated_at').eq('id',id).single(),
      sb.from('minds_commitment_workspace_items').select('id,kind,status,content,provenance_class,source_kind,source_ref,created_at').eq('workspace_id',id).order('created_at',{ascending:true}).limit(200),
      sb.from('minds_mission_runs').select('id,status,phase,iteration,max_iterations,retry_count,result_summary,blocker_question,last_error,wait_kind,wait_ref,wake_at,metadata,started_at,completed_at,updated_at').eq('workspace_id',id).order('created_at',{ascending:false}).limit(12)
    ]);
    if(wQ.error)throw wQ.error;if(iQ.error)throw iQ.error;if(rQ.error)throw rQ.error;
    const w=wQ.data,items=iQ.data||[],runs=rQ.data||[],current=runs.find(x=>['queued','running','waiting','waiting_for_user','paused'].includes(x.status))||runs[0]||null;
    const labels={plan:'Plan',finding:'Hallazgo',source:'Fuente',question:'Pregunta',decision:'Decisión propuesta',note:'Nota'};
    const itemRows=items.map(x=>`<div class="doctor-log"><b>${esc(labels[x.kind]||x.kind)}</b><span>${esc(x.content)}</span><time>${new Date(x.created_at).toLocaleString('es-ES')}</time><details class="human-tech"><summary>Procedencia</summary><div class="small">${esc(x.status)} · ${esc(x.provenance_class)} · ${esc(x.source_kind)}</div></details></div>`).join('');
    const runControls=current&&['queued','running','waiting'].includes(current.status)?`<button class="secondary" data-mission-run-action="pause" data-run-id="${esc(current.id)}">Pausar</button><button class="secondary" data-mission-run-action="cancel" data-run-id="${esc(current.id)}">Cancelar</button>`:current?.status==='paused'?`<button class="secondary" data-mission-run-action="resume" data-run-id="${esc(current.id)}">Reanudar</button><button class="secondary" data-mission-run-action="cancel" data-run-id="${esc(current.id)}">Cancelar</button>`:current?.status==='waiting_for_user'?`<button class="secondary" data-mission-run-action="cancel" data-run-id="${esc(current.id)}">Cancelar</button>`:'';
    const workspaceState=humanSurface()?.workspace?.(w.status);
    const workspaceTechnical=`<div class="human-tech-grid"><span>Mission Workspace</span><b>${esc(w.status)}</b><span>Actualizado</span><b>${new Date(w.updated_at).toLocaleString('es-ES')}</b></div>`;
    const runState=current?humanSurface()?.mission?.(current,w.title):null;
    const waitTechnical=current?.status==='waiting'?`<span>Espera</span><b>${esc(current.wait_kind||'—')}</b>${current.wake_at?`<span>Retoma</span><b>${new Date(current.wake_at).toLocaleString('es-ES')}</b>`:''}`:'';
    const runTechnical=current?`<div class="human-tech-grid"><span>Mission Run</span><b>${esc(current.status)}</b><span>Fase</span><b>${esc(current.phase||'—')}</b><span>Checkpoint</span><b>${Number(current.iteration||0)} / ${Number(current.max_iterations||0)}</b><span>Reintentos</span><b>${Number(current.retry_count||0)}</b>${waitTechnical}<span>Actualizado</span><b>${new Date(current.updated_at).toLocaleString('es-ES')}</b></div>`:'';
    const runPanel=current?`<div class="mission-run-card">${humanStateHTML(runState,runTechnical)}${current.last_error&&current.status==='failed'?`<div class="human-inline-error">${esc(current.last_error)}</div>`:''}${runControls?`<div class="confirm-actions">${runControls}</div>`:''}</div>`:'';
    modal('Trabajo de Isabella',`<div class="continuity-intro"><b>${esc(w.title)}</b><p>${esc(w.objective_snapshot)}</p>${w.completion_criteria_snapshot?`<div class="commitment-criteria"><span>Cuándo estará resuelto</span>${esc(w.completion_criteria_snapshot)}</div>`:''}${humanStateHTML(workspaceState,workspaceTechnical)}${w.summary?`<div class="continuity-cause"><span>Lo que sé hasta ahora</span><p>${esc(w.summary)}</p></div>`:''}${runPanel}<div class="small">Aquí conservo el trabajo intermedio para poder continuar entre conversaciones. Los hallazgos siguen siendo evidencia de trabajo, no memoria personal ni hechos confirmados; tampoco puedo ejecutar acciones externas o confirmar una decisión por mi cuenta.</div></div><div class="small section-label">Lo que he ido reuniendo</div>${itemRows||'<div class="empty-panel">Todavía no he registrado avances en este trabajo.</div>'}`);
    document.querySelectorAll('[data-mission-run-action]').forEach(b=>b.onclick=()=>void missionRunControlUI(b.dataset.runId,b.dataset.missionRunAction,id));
  }catch{modal('Trabajo de Isabella','<div class="small">No pude leer este trabajo ahora mismo.</div>')}
}
async function previewArtifactIntake(id){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  const status=$('#artifactIntakeStatus');if(status)status.textContent='Preparando vista previa…';
  try{
    const {data,error}=await sb.functions.invoke('isabella-artifact-intake',{body:{action:'preview',intake_id:id}});
    if(error||data?.error)throw new Error(data?.detail||data?.error||error?.message||'No pude abrir la vista previa.');
    if(!data?.url)throw new Error('No recibí una vista previa válida.');
    window.open(data.url,'_blank','noopener');
    if(status)status.textContent='';
  }catch(e){if(status)status.textContent=e?.message||'No pude abrir la vista previa.'}
}
async function reviewArtifactIntake(id,decision){
  const sb=window.MINDS_SUPABASE;if(!sb||!id||!['accepted','rejected'].includes(decision))return;
  const status=$('#artifactIntakeStatus');if(status)status.textContent=decision==='accepted'?'Conservando…':'Rechazando…';
  try{
    const {data,error}=await sb.rpc('minds_review_artifact_intake',{p_intake_id:id,p_decision:decision,p_note:null});
    if(error||data?.error)throw new Error(data?.error||error?.message||'No pude registrar tu decisión.');
    if(decision==='accepted'){
      const promoted=await sb.functions.invoke('isabella-artifact-intake',{body:{action:'promote',intake_id:id}});
      if(promoted.error||promoted.data?.error)throw new Error(promoted.data?.detail||promoted.data?.error||promoted.error?.message||'El archivo quedó aceptado, pero todavía no pude conservarlo definitivamente.');
    }
    await artifactsPanel();
  }catch(e){if(status)status.textContent=e?.message||'No pude completar esta acción.'}
}
async function promoteAcceptedArtifactIntake(id){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  const status=$('#artifactIntakeStatus');if(status)status.textContent='Terminando de conservar…';
  try{
    const {data,error}=await sb.functions.invoke('isabella-artifact-intake',{body:{action:'promote',intake_id:id}});
    if(error||data?.error)throw new Error(data?.detail||data?.error||error?.message||'No pude terminar de conservar el archivo.');
    await artifactsPanel();
  }catch(e){if(status)status.textContent=e?.message||'No pude terminar de conservar el archivo.'}
}
async function artifactsPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Artefactos','<div class=\"small\">Conecta la memoria para ver tus artefactos.</div>');return}
  modal('Artefactos','<div class=\"surface-loading\">Cargando artefactos…</div>');
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sin sesión');
    const [intakeQ,artifactQ]=await Promise.all([
      sb.from('minds_artifact_intake')
        .select('id,status,title,kind,mime_type,size_bytes,sha256,accepted_artifact_id,expires_at,created_at,metadata')
        .in('status',['pending','accepted'])
        .order('created_at',{ascending:false})
        .limit(50),
      sb.from('minds_artifacts')
        .select('id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at')
        .order('created_at',{ascending:false})
        .limit(100)
    ]);
    if(intakeQ.error)throw intakeQ.error;if(artifactQ.error)throw artifactQ.error;
    const pending=intakeQ.data||[],rows=artifactQ.data||[];
    const pendingHtml=pending.length?`<div class=\"small section-label\">Por revisar</div><div class=\"artifact-library\">${pending.map(a=>{
      const accepted=a.status==='accepted';
      const meta=[String(a.kind||'').toUpperCase(),Math.max(1,Math.round(Number(a.size_bytes||0)/1024))+' KB',new Date(a.created_at).toLocaleString('es-ES')].join(' · ');
      return `<div class=\"artifact-library-item\"><div class=\"continuity-cause\"><span>${accepted?'ACEPTADO · PENDIENTE DE PROMOCIÓN':'ISABELLA HA PRODUCIDO UN ARCHIVO'}</span><b>${esc(a.title||'Artefacto')}</b><p class=\"small\">${esc(meta)}</p><details class=\"human-tech\"><summary>Ver procedencia técnica</summary><div class=\"small\">SHA-256 · ${esc(String(a.sha256||''))}</div></details><div class=\"confirm-actions\"><button class=\"secondary\" data-intake-preview=\"${esc(a.id)}\">Vista previa</button>${accepted?`<button class=\"primary\" data-intake-promote=\"${esc(a.id)}\">Terminar de conservar</button>`:`<button class=\"primary\" data-intake-accept=\"${esc(a.id)}\">Conservar</button><button class=\"secondary\" data-intake-reject=\"${esc(a.id)}\">Rechazar</button>`}</div></div></div>`;
    }).join('')}</div><div id=\"artifactIntakeStatus\" class=\"small\" aria-live=\"polite\"></div>`:'';
    const permanentHtml=rows.length?`<div class=\"small section-label\">Conservados</div><div class=\"artifact-library\">${rows.map(a=>`<div class=\"artifact-library-item\"><div class=\"artifact-library-meta\"><span>${esc(a.source_kind==='idea'?'TRABAJO':a.source_kind==='mission_runtime'?'MISSION':'CHAT')}</span><time>${new Date(a.created_at).toLocaleDateString('es-ES')}</time></div>${artifactMarkup(a)}</div>`).join('')}</div>`:'<div class=\"small\">Todavía no hay artefactos conservados.</div>';
    $('#modalBody').innerHTML=pendingHtml+permanentHtml;
    document.querySelectorAll('[data-intake-preview]').forEach(b=>b.onclick=()=>void previewArtifactIntake(b.dataset.intakePreview));
    document.querySelectorAll('[data-intake-accept]').forEach(b=>b.onclick=()=>void reviewArtifactIntake(b.dataset.intakeAccept,'accepted'));
    document.querySelectorAll('[data-intake-reject]').forEach(b=>b.onclick=()=>void reviewArtifactIntake(b.dataset.intakeReject,'rejected'));
    document.querySelectorAll('[data-intake-promote]').forEach(b=>b.onclick=()=>void promoteAcceptedArtifactIntake(b.dataset.intakePromote));
    await hydrateArtifactFiles($('#modalBody'));
  }catch{$('#modalBody').innerHTML='<div class=\"small\">No pude cargar los artefactos ahora mismo.</div>'}
}
async function aiUsagePanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Uso IA','<div class="small">Conecta la memoria para medir el uso de MINDS.</div>');return}
  modal('Uso IA','<div class="surface-loading">Leyendo consumo…</div>');
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sin sesión');
    const from=new Date(Date.now()-7*86400000).toISOString();
    const {data,error}=await sb.from('minds_ai_usage').select('feature,model,input_tokens,cached_input_tokens,output_tokens,total_tokens,created_at').gte('created_at',from).order('created_at',{ascending:false}).limit(1000);if(error)throw error;
    const rows=data||[],fmt=n=>new Intl.NumberFormat('es-ES',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n||0);
    const totals=rows.reduce((a,x)=>{a.input+=Number(x.input_tokens||0);a.cached+=Number(x.cached_input_tokens||0);a.output+=Number(x.output_tokens||0);a.total+=Number(x.total_tokens||0);return a},{input:0,cached:0,output:0,total:0}),groups={};
    for(const x of rows){const k=String(x.feature||'otro');groups[k]=groups[k]||{calls:0,tokens:0};groups[k].calls++;groups[k].tokens+=Number(x.total_tokens||0)}
    const labels={isabella_chat:'Chat Isabella',isabella_background:'Procesos de Isabella',isabella_embedding:'Memoria semántica',decision_router:'Router adaptativo',memory_flush:'Checkpoint de memoria',work_file_read:'Lectura Work',situational_feed:'Feed',feed_detail:'Detalle del Feed',ideas_generation:'Ideas',idea_worker:'Trabajos de Ideas',artifact_image:'Imágenes',sofia_chat:'Chat Sofía',sofia_background:'Procesos de Sofía',research:'Investigación',routine:'Rutinas'};
    const breakdown=Object.entries(groups).sort((a,b)=>b[1].tokens-a[1].tokens).map(([k,v])=>`<div class="usage-row"><span>${esc(labels[k]||k)}</span><strong>${fmt(v.tokens)} tok.</strong><em>${v.calls} llamada${v.calls===1?'':'s'}</em></div>`).join(''),hit=totals.input?Math.round(totals.cached/totals.input*100):0;
    modal('Uso IA',`<div class="usage-panel"><div class="usage-summary"><div><span>TOKENS · 7 DÍAS</span><strong>${fmt(totals.total)}</strong></div><div><span>CACHÉ DE INPUT</span><strong>${hit}%</strong></div></div><div class="small">Medición interna disponible desde Build 42. El gasto exacto sigue estando en OpenAI; aquí vemos qué parte de MINDS consume los tokens.</div><div class="usage-breakdown">${breakdown||'<div class="small">Todavía no hay llamadas medidas.</div>'}</div></div>`);
  }catch{modal('Uso IA','<div class="small">No pude leer el consumo ahora mismo.</div>')}
}
function tasksPanel(){
  const pending=state.tasks.filter(t=>!t.archivedAt&&!t.done);
  const undated=pending.filter(t=>!t.date).length;
  const groups=state.categories.map(c=>({id:'category:'+c.id,name:c.name,color:c.color||fallbackColor(c.id),count:pending.filter(t=>t.categoryId===c.id).length}));
  let body='<div class="task-groups">';
  body+=`<button class="task-group-card smart" data-task-group="undated"><span><strong>Sin fecha</strong><small>Backlog sin programar</small></span><b>${undated}</b></button>`;
  body+=groups.map(g=>`<button class="task-group-card" data-task-group="${esc(g.id)}" style="--group-color:${esc(g.color)}"><span><strong>${esc(g.name)}</strong><small>Lista</small></span><b>${g.count}</b></button>`).join('');
  body+='</div>';
  modal('Tareas',body);
  document.querySelectorAll('[data-task-group]').forEach(b=>b.onclick=()=>taskGroupPanel(b.dataset.taskGroup||''));
}
function taskGroupPanel(group){
  const all=state.tasks.filter(t=>!t.archivedAt);
  const isUndated=group==='undated',categoryId=group.startsWith('category:')?group.slice(9):null;
  const title=isUndated?'Sin fecha':(state.categories.find(c=>c.id===categoryId)?.name||'Tareas');
  const filtered=all.filter(t=>isUndated?!t.date:t.categoryId===categoryId);
  const pending=filtered.filter(t=>!t.done).sort((a,b)=>(a.date?0:1)-(b.date?0:1)||String(a.date||'').localeCompare(String(b.date||''))||taskOrder(a,b));
  const done=filtered.filter(t=>t.done).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')));
  const row=t=>`<div class="task-list-row ${t.done?'done':''}"><button class="task-list-check ${t.done?'checked':''}" data-list-task-toggle="${t.id}" aria-label="${t.done?'Marcar pendiente':'Marcar hecha'}">${t.done?'✓':''}</button><button class="task-list-main" data-edit-task="${t.id}"><span>${esc(t.title)}</span><small>${t.date?esc(t.date):'Sin fecha'}${t.projectId?' · '+esc(project(t.projectId)):''}</small></button></div>`;
  let body='<button class="task-list-back" id="taskListBack">‹ Listas</button>';
  body+='<div class="small section-label">Pendientes</div>';
  body+=pending.length?pending.map(row).join(''):'<div class="small empty-panel">No hay tareas pendientes en esta lista.</div>';
  if(done.length){body+='<div class="small section-label task-done-label">Hechas</div>'+done.map(row).join('')}
  modal(title,body);
  $('#taskListBack').onclick=tasksPanel;
  document.querySelectorAll('[data-edit-task]').forEach(x=>x.onclick=()=>editItem('task',x.dataset.editTask));
  document.querySelectorAll('[data-list-task-toggle]').forEach(x=>x.onclick=e=>{e.stopPropagation();const id=x.dataset.listTaskToggle;const t=state.tasks.find(y=>y.id===id);if(!t)return;const before=clone(t);t.done=!t.done;t.completedAt=t.done?new Date().toISOString():null;mutation('task',t.done?'complete':'reopen',before,t,'manual');save();taskGroupPanel(group)});
}
function newPanel(){
  modal('Agregar manualmente',`<div class="form">
    <select id="newType"><option value="task">Tarea</option><option value="event">Evento</option></select>
    <input id="newTitle" placeholder="Nombre">
    <label>Fecha <span class="small">(opcional para tareas)</span><input id="newDate" type="date"></label>
    <select id="newCat">${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <input id="newTime" type="time" value="09:00">
    <button id="newSave" class="primary">Guardar</button>
  </div>`);
  const type=$('#newType'),dateInput=$('#newDate'),timeInput=$('#newTime');
  const syncType=()=>{const event=type.value==='event';if(event&&!dateInput.value)dateInput.value=today();timeInput.classList.toggle('hidden',!event)};
  type.onchange=syncType;syncType();
  $('#newSave').onclick=()=>{
    const title=$('#newTitle').value.trim();if(!title)return;
    const kind=type.value,date=dateInput.value||null,categoryId=$('#newCat').value;
    if(kind==='task'){
      const item={id:uid(),title,date,categoryId,done:false,completedAt:null,archivedAt:null,sortOrder:nextTaskOrder(date)};
      state.tasks.push(item);mutation('task','create',null,item,'manual');
    }else{
      if(!date)return;
      const item={id:uid(),title,date,categoryId,start:timeInput.value||'09:00',duration:60};
      state.events.push(item);mutation('event','create',null,item,'manual');
    }
    save();closeModal();renderCalendar();
  };
}
function autonomyContextLabel(key){
  return ({fast_task_dated_v1:'Tarea sencilla con fecha · petición directa',fast_task_undated_v1:'Tarea sencilla sin fecha · petición directa',fast_unverified:'Ruta rápida · contexto sin verificar',interactive_review:'Conversación con revisión',source_derived:'Con fuentes de proyecto o externas',background:'Trabajo en segundo plano',unknown_context:'Contexto no verificado'})[key]||key;
}
function autonomyEvidenceHTML(e){
  const fields=Object.entries(e.changed_fields||{}).map(([k,n])=>`${({date:'fecha',title:'título',category:'categoría',project:'proyecto',notes:'notas'})[k]||k}: ${n}`).join(' · ');
  const outcomeCorrections=Number(e.outcome_corrections||0);
  const human=humanSurface()?.autonomy?.(e);
  const technical=`<div class="human-tech-grid"><span>Contexto</span><b>${esc(autonomyContextLabel(e.context_key))}</b><span>Sin cambios</span><b>${Number(e.accepted_unchanged)||0}</b><span>Editadas</span><b>${Number(e.edited)||0}</b><span>Rechazadas</span><b>${Number(e.rejected)||0}</b><span>Días revisados</span><b>${Number(e.review_days)||0}</b>${outcomeCorrections?`<span>Correcciones posteriores confirmadas</span><b>${outcomeCorrections}</b>`:''}${fields?`<span>Campos corregidos</span><b>${esc(fields)}</b>`:''}${e.last_review_at?`<span>Última revisión</span><b>${new Date(e.last_review_at).toLocaleString('es-ES')}</b>`:''}</div>`;
  return `<div class="human-permission-case"><div class="human-case-title">${esc(e.action==='create_task'?'Crear tarea':e.action)} · ${esc(e.scope_label)}</div>${humanStateHTML(human,technical)}</div>`;
}
function counterfactualSupported(unit){
  return unit?.action==='create_task'
    && unit?.eligible_class===true
    && ['fast_task_undated_v1','fast_task_dated_v1'].includes(unit?.context_key);
}
function counterfactualEffectCopy(row){
  const effect=row?.counterfactual_effect;
  if(effect==='same_result_without_confirmation')return 'Habría hecho exactamente lo que terminaste aprobando, sin volver a preguntarte.';
  if(effect==='would_act_before_correction')return 'Habría actuado antes de que hicieras tu corrección.';
  if(effect==='would_act_despite_rejection')return 'Habría actuado aunque después rechazaste esta propuesta.';
  if(effect==='already_autonomous')return 'Este caso ya se ejecutó bajo un permiso real; no es contrafactual.';
  return 'No sé qué habrías decidido en este caso y no lo cuento a favor ni en contra.';
}
function counterfactualCaseHTML(row){
  const candidate=row?.candidate||{},reviewed=row?.reviewed||{};
  const fields=(row?.changed_fields||[]).map(postActionFieldLabel).join(', ');
  const when=row?.created_at?new Date(row.created_at).toLocaleString('es-ES'):'';
  const finalChanged=row?.actual_outcome==='edited'&&reviewed
    ? '<p class="small">Resultado revisado: '+esc(reviewed.title||candidate.title||'Tarea')+(reviewed.date?' · '+esc(reviewed.date):'')+'</p>'
    :'';
  return '<div class="human-permission-case counterfactual-case"><div class="human-case-title">'
    +esc(candidate.title||'Tarea')
    +(candidate.date?' · '+esc(candidate.date):'')
    +'</div><div class="human-state"><b>'+esc(counterfactualEffectCopy(row))+'</b>'
    +(fields?'<p>Cambiaste: '+esc(fields)+'.</p>':'')
    +finalChanged
    +'<div class="human-state-meta"><span>'+esc(candidate.category||'')+'</span><span>'+esc(when)+'</span></div></div></div>';
}
async function contextualCounterfactualPanel(unit){
  const sb=window.MINDS_SUPABASE;
  if(!sb||!counterfactualSupported(unit)){
    modal('Qué habría pasado','<div class="small">Esta clase no admite simulación contrafactual.</div>');
    return;
  }
  modal('Qué habría pasado','<div class="surface-loading">Reconstruyendo tus casos reales…</div>');
  try{
    const {data,error}=await sb.rpc('minds_preview_contextual_counterfactual',{
      p_action:unit.action,
      p_context_key:unit.context_key,
      p_scope_key:unit.scope_key
    });
    if(error)throw error;
    const s=data?.summary||{},cases=data?.cases||[];
    const reviewed=Number(s.historical_reviews||0);
    const same=Number(s.would_have_matched_final||0);
    const corrected=Number(s.would_have_preceded_correction||0);
    const rejected=Number(s.would_have_preceded_rejection||0);
    const unknown=Number(s.unknown_outcome||0);
    const parts=[];
    if(reviewed>0)parts.push('Hay '+reviewed+' revisiones humanas comparables.');
    if(same>0)parts.push('En '+same+' habría hecho exactamente lo que terminaste aprobando.');
    if(corrected>0)parts.push('En '+corrected+' habría actuado antes de una corrección tuya.');
    if(rejected>0)parts.push('En '+rejected+' habría actuado en algo que terminaste rechazando.');
    if(unknown>0)parts.push('En '+unknown+' no hay una decisión humana final y no infiero qué habría pasado.');
    if(!parts.length)parts.push('Todavía no hay historia comparable suficiente para esta clase.');
    const consequential=cases.filter(x=>['would_act_before_correction','would_act_despite_rejection'].includes(x.counterfactual_effect));
    const unknownCases=cases.filter(x=>x.counterfactual_effect==='unknown');
    const sameCases=cases.filter(x=>x.counterfactual_effect==='same_result_without_confirmation');
    const detail=[...consequential,...unknownCases,...sameCases].slice(0,12).map(counterfactualCaseHTML).join('');
    modal('Qué habría pasado',`<div class="continuity-intro"><p><b>Simulación, no permiso.</b></p><p>${esc(parts.join(' '))}</p><p>La simulación supone únicamente que este permiso exacto hubiera estado activo en cada petición compatible de los últimos 30 días. No ejecuta nada ni cambia tus permisos.</p><details class="human-tech"><summary>Cómo se calcula</summary><p>Comparo el candidato original de cada request con lo que terminaste aceptando, corrigiendo o rechazando. No uso un score ni un modelo para adivinar tu intención. Los casos pendientes o caducados quedan como desconocidos. Tampoco reconstruyo versiones históricas de políticas globales que no estén registradas.</p></details></div>${detail||'<div class="empty-panel">No hay casos cerrados que mostrar.</div>'}<div class="proposal-actions"><button id="counterfactualBack" class="secondary">Volver a Permisos</button></div>`);
    $('#counterfactualBack').onclick=()=>void contextualAutonomyPanel();
  }catch{
    modal('Qué habría pasado','<div class="small">No pude reconstruir esta simulación. No se ha cambiado ningún permiso ni se ha ejecutado ninguna acción.</div><div class="proposal-actions"><button id="counterfactualBack" class="secondary">Volver a Permisos</button></div>');
    $('#counterfactualBack').onclick=()=>void contextualAutonomyPanel();
  }
}
function reviewContextualPermission(unit,permission,mode){
  const grant=mode==='allow',scope=unit||permission;
  modal(grant?'Autorizar este permiso':'Volver a confirmar',`<div class="continuity-intro"><p>${grant?'Isabella podrá guardar tareas sencillas en esta categoría, sin proyecto, cuando tu petición directa incluya la categoría y el texto de la tarea.':'Isabella volverá a pedirte confirmación para esta clase de tarea.'}</p><p><b>${esc(scope.scope_label)}</b><br>${esc(autonomyContextLabel(scope.context_key))}</p><p>${grant?'El permiso dura 30 días. Puedes revocarlo aquí en cualquier momento. Eventos, tareas de proyecto, recurrencias y recordatorios quedan fuera. Ante dudas o nuevas correcciones, Isabella vuelve a pedir confirmación.':'Las tareas ya guardadas se conservan. Este cambio afecta a las peticiones siguientes.'}</p></div>${grant?autonomyEvidenceHTML(unit):''}<div class="proposal-actions"><button id="permissionCancel" class="secondary">Cancelar</button><button id="permissionConfirm" class="primary">${grant?'Autorizar durante 30 días':'Revocar permiso'}</button></div><div id="permissionError" class="small" role="status"></div>`);
  const requestId=crypto.randomUUID();
  $('#permissionCancel').onclick=()=>void contextualAutonomyPanel();
  $('#permissionConfirm').onclick=async()=>{
    const button=$('#permissionConfirm');if(button.disabled)return;button.disabled=true;
    try{
      const {error}=await window.MINDS_SUPABASE.rpc('minds_review_contextual_permission',{
        p_action:scope.action,p_context_key:scope.context_key,p_scope_key:scope.scope_key,p_mode:mode,
        p_evidence_version:unit?.evidence_version||null,p_expected_revision:permission?.revision||0,p_request_id:requestId,p_confirmed:true
      });
      if(error)throw error;
      await contextualAutonomyPanel();
    }catch(e){const box=$('#permissionError');if(box)box.textContent='No se confirmó el cambio. Vuelve a abrir Permisos de Isabella para revisar el estado actual.';}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
function postActionFieldLabel(field){
  return ({date:'fecha',title:'título',categoryId:'categoría',notes:'notas',deleted:'eliminación'})[field]||field;
}
function postActionCandidateTitle(candidate){
  return String(candidate?.before_state?.title||candidate?.after_state?.title||'Tarea');
}
function postActionCandidateHTML(candidate){
  const fields=(candidate.changed_fields||[]).map(postActionFieldLabel).join(', ');
  const deleted=(candidate.changed_fields||[]).includes('deleted');
  return `<div class="human-permission-case post-action-review-case"><div class="human-case-title">${esc(postActionCandidateTitle(candidate))}</div><div class="human-state tone-waiting"><b>${deleted?'Después de crearla, eliminaste esta tarea.':'Después de crearla, cambiaste esta tarea.'}</b><p>Detecté una relación temporal con una acción que hice bajo un permiso tuyo, pero no sé si fue una corrección a Isabella o simplemente un cambio posterior. ${fields?`Cambió: ${esc(fields)}.`:''}</p><div class="human-state-meta"><span>${esc(candidate.scope_label||'')}</span><span>Solo tú decides si esto cuenta como corrección</span></div></div><p class="small">Si confirmas que fue una corrección, volveré a pedirte confirmación en esta clase de tarea. Si fue un cambio posterior, no lo usaré como aprendizaje causal.</p><div class="confirm-actions"><button class="primary" data-post-action-correction="${esc(candidate.id)}">Sí, fue una corrección</button><button class="secondary" data-post-action-later="${esc(candidate.id)}">Fue un cambio posterior</button></div></div>`;
}
async function reviewPostActionFeedback(id,outcome){
  const sb=window.MINDS_SUPABASE;if(!sb||!id||!['correction','later_change'].includes(outcome))return;
  const buttons=[...document.querySelectorAll('[data-post-action-correction],[data-post-action-later]')];
  buttons.forEach(b=>b.disabled=true);
  try{
    const {data,error}=await sb.rpc('minds_review_post_action_feedback',{
      p_candidate_id:id,p_outcome:outcome,p_note:null,p_confirmed:true
    });
    if(error)throw error;
    if(data?.status==='expired')throw new Error('Esta revisión ya había caducado.');
    await contextualAutonomyPanel();
  }catch(e){
    const box=$('#postActionFeedbackError');
    if(box)box.textContent=e instanceof Error?e.message:'No pude guardar esta revisión. No he aprendido nada de este cambio.';
    buttons.forEach(b=>{if(b.isConnected)b.disabled=false});
  }
}
async function contextualAutonomyPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Permisos de Isabella','<div class="small">Conecta la memoria para consultar tus permisos.</div>');return}
  modal('Permisos de Isabella','<div class="surface-loading">Leyendo evidencia y permisos…</div>');
  try{
    const {data,error}=await sb.rpc('minds_get_contextual_autonomy');if(error)throw error;
    const units=data?.units||[],permissions=data?.permissions||[];
    const candidates=data?.post_action_candidates||[],outcomeFeedback=data?.outcome_feedback||[];
    const pendingCorrections=candidates.filter(x=>x.status==='pending');
    const reviewedCorrections=candidates.filter(x=>['confirmed_correction','not_causal'].includes(x.status));
    const findPermission=e=>permissions.find(p=>p.action===e.action&&p.context_key===e.context_key&&p.scope_key===e.scope_key);
    const grants=permissions.filter(p=>p.mode==='allow');
    const active=grants.map((p,i)=>`<div class="human-permission-case"><div class="human-case-title">${esc(p.scope_label)}</div><div class="human-state tone-complete"><b>Puedo hacerlo sin volver a preguntarte.</b><p>Este permiso dura hasta el ${new Date(p.expires_at).toLocaleDateString('es-ES')} y solo vale para este caso concreto.</p><div class="human-state-meta"><span>Tú lo autorizaste</span><span>${esc(autonomyContextLabel(p.context_key))}</span></div></div><button data-permission-revoke="${i}" class="secondary">Volver a preguntarme siempre</button></div>`).join('');
    const evidence=units.map((e,i)=>{const p=findPermission(e);const enabled=p?.mode==='allow'&&p.expires_at&&new Date(p.expires_at)>new Date();const preview=counterfactualSupported(e)?`<button data-permission-counterfactual="${i}" class="secondary">Ver qué habría pasado</button>`:'';const review=e.eligibility==='eligible'&&!enabled?`<button data-permission-review="${i}" class="secondary">Revisar propuesta de permiso</button>`:'';return autonomyEvidenceHTML(e)+preview+review}).join('');
    const history=(data?.reviews||[]).map(r=>{const p=permissions.find(p=>p.id===r.permission_id);return `<div class="doctor-log"><b>${r.decision==='allow'?'Autorizado por ti':'Revocado por ti'} · ${esc(p?.scope_label||'Permiso')}</b><time>${new Date(r.created_at).toLocaleString('es-ES')}</time></div>`}).join('');
    const executions=(data?.executions||[]).map(r=>`<div class="doctor-log"><b>${esc(r.candidate?.title||'Tarea')}</b><span>Guardada bajo un permiso tuyo · no cuenta como aprobación nueva</span><time>${new Date(r.created_at).toLocaleString('es-ES')}</time></div>`).join('');
    const correctionHistory=reviewedCorrections.slice(0,12).map(r=>{
      const causal=r.status==='confirmed_correction';
      const feedback=outcomeFeedback.find(x=>x.candidate_id===r.id);
      return `<div class="doctor-log"><b>${causal?'Corrección confirmada':'Cambio posterior'} · ${esc(postActionCandidateTitle(r))}</b><span>${causal?'Volví a pedir confirmación para ese permiso.':'No lo utilicé como aprendizaje causal.'}${feedback?.changed_fields?.length?' · '+esc(feedback.changed_fields.map(postActionFieldLabel).join(', ')):''}</span><time>${new Date(r.reviewed_at||r.created_at).toLocaleString('es-ES')}</time></div>`;
    }).join('');
    const pendingHtml=pendingCorrections.map(postActionCandidateHTML).join('');
    modal('Permisos de Isabella',`<div class="continuity-intro"><p>Isabella aprende de cómo revisas sus propuestas y, ahora, también puede preguntarte por una corrección después de una acción autónoma. Una edición posterior nunca se interpreta sola como feedback: primero solo crea una duda y tú decides si existe relación causal. Antes de autorizar una clase, puedes simular con tu historial qué habría ocurrido si ese permiso hubiera estado activo.</p><details class="human-tech"><summary>Cómo decide cuándo proponértelo</summary><p>Para permisos nuevos se exige evidencia por acción, contexto y alcance: al menos 12 revisiones sin cambios en 3 días distintos durante los últimos 30 días, ninguna corrección o rechazo y una revisión en los últimos 7 días. Después de una acción autónoma solo considero como posible corrección la primera edición manual relevante dentro de 48 horas. Confirmar causalidad reduce el permiso a “volver a preguntar”; nunca amplía autonomía.</p></details></div>${pendingHtml?`<div class="small section-label">Correcciones por revisar</div>${pendingHtml}<div id="postActionFeedbackError" class="small" role="status"></div>`:''}<div class="small section-label">Lo que ya me permitiste hacer</div>${active||'<div class="empty-panel">Todavía no me has dado ningún permiso para actuar sin volver a preguntarte.</div>'}<div class="small section-label">Dónde sigo aprendiendo cómo prefieres trabajar</div>${evidence||'<div class="empty-panel">Todavía no tengo suficiente experiencia en estos casos. Seguiré preguntándote antes de actuar.</div>'}${correctionHistory?'<div class="small section-label">Revisiones posteriores a una acción</div>'+correctionHistory:''}${history?'<div class="small section-label">Tus decisiones de permiso</div>'+history:''}${executions?'<div class="small section-label">Últimas ejecuciones autorizadas</div>'+executions:''}`);
    document.querySelectorAll('[data-permission-counterfactual]').forEach(b=>b.onclick=()=>{const e=units[Number(b.dataset.permissionCounterfactual)];void contextualCounterfactualPanel(e)});
    document.querySelectorAll('[data-permission-review]').forEach(b=>b.onclick=()=>{const e=units[Number(b.dataset.permissionReview)];reviewContextualPermission(e,findPermission(e),'allow')});
    $$('[data-permission-revoke]').forEach(b=>b.onclick=()=>reviewContextualPermission(null,grants[Number(b.dataset.permissionRevoke)],'confirm'));
    $$('[data-post-action-correction]').forEach(b=>b.onclick=()=>void reviewPostActionFeedback(b.dataset.postActionCorrection,'correction'));
    $$('[data-post-action-later]').forEach(b=>b.onclick=()=>void reviewPostActionFeedback(b.dataset.postActionLater,'later_change'));
  }catch{modal('Permisos de Isabella','<div class="small">No pude leer los permisos. No se ha autorizado ningún cambio desde esta pantalla.</div>')}
}

function pushEnvironment(){
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
  const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  return {supported,standalone,ios};
}
function pushKeyBytes(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const raw=atob(padded),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}
function pushDeviceMeta(env){
  return {
    user_agent:navigator.userAgent||'',
    platform:navigator.userAgentData?.platform||navigator.platform||'',
    display_mode:env.standalone?'standalone':'browser'
  };
}
async function enablePushNotifications(){
  const env=pushEnvironment(),sb=window.MINDS_SUPABASE;
  if(!env.supported){throw new Error('Este navegador no permite avisos push.')}
  if(env.ios&&!env.standalone){throw new Error('En iPhone o iPad, añade Isabella a la pantalla de inicio y ábrela desde allí antes de activar los avisos.')}
  if(!sb)throw new Error('Conecta la memoria antes de activar los avisos.');

  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error(permission==='denied'?'Los avisos están bloqueados en los ajustes del dispositivo.':'No se concedió permiso para avisos.');

  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('Conecta la memoria antes de activar los avisos.');

  const {data:config,error:configError}=await sb.functions.invoke('isabella-push',{body:{action:'config'}});
  if(configError||!config?.public_key)throw new Error('No pude preparar los avisos de Isabella.');

  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:pushKeyBytes(config.public_key)
    });
  }
  const serialized=subscription.toJSON();
  const {error}=await sb.rpc('minds_register_push_subscription',{
    p_subscription:serialized,
    p_device:pushDeviceMeta(env)
  });
  if(error){
    try{await subscription.unsubscribe()}catch{}
    throw new Error('No pude guardar este dispositivo para los avisos.');
  }
  try{await navigator.clearAppBadge?.()}catch{}
  return subscription;
}
async function disablePushNotifications(){
  const sb=window.MINDS_SUPABASE;
  if(!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager?.getSubscription?.();
  if(!subscription)return;
  if(sb){
    const {error}=await sb.rpc('minds_remove_push_subscription',{p_endpoint:subscription.endpoint});
    if(error)throw new Error('No pude desactivar este dispositivo en MINDS.');
  }
  await subscription.unsubscribe();
  try{await navigator.clearAppBadge?.()}catch{}
}
function pushStatusCopy(env,permission,subscribed){
  if(!env.supported)return 'Este navegador no admite avisos push.';
  if(env.ios&&!env.standalone)return 'En iPhone o iPad, primero añade Isabella a la pantalla de inicio y ábrela desde allí.';
  if(permission==='denied')return 'Los avisos están bloqueados por el dispositivo. Puedes volver a permitirlos desde los ajustes del sistema.';
  if(subscribed)return 'Isabella puede avisarte en este dispositivo aunque MINDS no esté abierto.';
  return 'Isabella todavía no puede avisarte fuera de MINDS en este dispositivo.';
}
async function pushNotificationsPanel(){
  const env=pushEnvironment(),sb=window.MINDS_SUPABASE;
  modal('Avisos de Isabella','<div class="surface-loading">Comprobando este dispositivo…</div>');
  let subscription=null,permission=typeof Notification!=='undefined'?Notification.permission:'unsupported',history=[];
  try{
    if(env.supported){
      const registration=await navigator.serviceWorker.ready;
      subscription=await registration.pushManager.getSubscription();
    }
    if(sb){
      const {data:{session}}=await sb.auth.getSession();
      if(session){
        const {data}=await sb.from('minds_delivery_intents')
          .select('status,sent_at,created_at,last_error')
          .order('created_at',{ascending:false}).limit(5);
        history=data||[];
      }
    }
  }catch{}
  const active=!!subscription&&permission==='granted';
  const recent=history.map(row=>{
    const label=row.status==='sent'?'Aviso enviado':row.status==='retry'?'Volveré a intentarlo':row.status==='failed'?'No se pudo entregar':row.status==='skipped'?'Ya no era necesario':'Preparando aviso';
    return '<div class="doctor-log"><b>'+esc(label)+'</b><time>'+new Date(row.sent_at||row.created_at).toLocaleString('es-ES')+'</time></div>';
  }).join('');
  const iosHelp=env.ios&&!env.standalone?'<div class="continuity-intro"><p>En iPhone, abre esta página en Safari, usa <b>Compartir → Añadir a pantalla de inicio</b> y después abre Isabella desde su icono. Apple solo permite solicitar avisos desde una web app instalada.</p></div>':'';
  const actionButton=env.supported&&!(env.ios&&!env.standalone)
    ?'<div class="proposal-actions"><button id="pushToggle" class="'+(active?'secondary':'primary')+'">'+(active?'Desactivar avisos en este dispositivo':'Permitir avisos en este dispositivo')+'</button></div>'
    :'';
  modal('Avisos de Isabella',
    '<div class="continuity-intro"><p><b>'+esc(active?'Avisos activados':'Avisos no activados')+'</b></p><p>'+esc(pushStatusCopy(env,permission,active))+'</p><p>Activarlos no cambia cuándo decido avisarte; solo permite que el aviso pueda llegar hasta este dispositivo cuando realmente haga falta.</p><details class="human-tech"><summary>Ver detalle técnico</summary><p>Internamente, Attention Economy sigue decidiendo si una señal debe interrumpir, esperar al briefing, aparecer en Feed o permanecer silenciosa. Delivery Layer solo transporta los interrupts ya decididos.</p></details></div>'+
    iosHelp+actionButton+
    (recent?'<div class="small section-label">Entregas recientes</div>'+recent:'')+
    '<div id="pushError" class="small" role="status"></div>'
  );
  const button=$('#pushToggle');
  if(button)button.onclick=async()=>{
    if(button.disabled)return;button.disabled=true;
    const box=$('#pushError');if(box)box.textContent='';
    try{
      if(active)await disablePushNotifications();else await enablePushNotifications();
      await pushNotificationsPanel();
    }catch(e){
      if(box)box.textContent=e instanceof Error?e.message:'No pude cambiar los avisos.';
      if(button.isConnected)button.disabled=false;
    }
  };
}

function attentionRouteOptions(selected){
  return [
    ['interrupt','Avisarme en cuanto ocurra'],
    ['briefing','Guardarlo para el próximo resumen'],
    ['ambient','Dejarlo discretamente en Feed'],
    ['silent','No avisarme automáticamente']
  ].map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
}
async function attentionHistoryPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Cómo decide Isabella avisarte','<div class="small">Conecta la memoria para ver cómo Isabella ha distribuido tu atención.</div>');return}
  modal('Cómo decide Isabella avisarte','<div class="surface-loading">Leyendo decisiones recientes…</div>');
  try{
    const {data,error}=await sb.from('minds_attention_events')
      .select('id,title,event_type,route,reason,status,source_type,created_at,delivered_at')
      .order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const labels={interrupt:'Te avisé en el momento',briefing:'Lo guardé para el resumen',ambient:'Lo dejé en Feed',silent:'No te interrumpí'};
    const rows=(data||[]).map(x=>`<div class="human-permission-case"><div class="human-case-title">${esc(labels[x.route]||x.route)} · ${esc(x.title)}</div><p class="small">${esc(x.reason)}</p><details class="human-tech"><summary>Ver detalle técnico</summary><div class="human-tech-grid"><span>Ruta</span><b>${esc(x.route)}</b><span>Fuente</span><b>${esc(x.source_type)}</b><span>Estado</span><b>${esc(x.status)}</b><span>Fecha</span><b>${new Date(x.created_at).toLocaleString('es-ES')}</b></div></details></div>`).join('');
    modal('Cómo decide Isabella avisarte',`<div class="continuity-intro">Aquí puedes ver por qué te avisé en el momento, guardé algo para más tarde, lo dejé en Feed o decidí no interrumpirte. Cada decisión conserva una razón concreta; no uso un score oculto de importancia.</div>${rows||'<div class="empty-panel">Todavía no he tenido que decidir cómo ocupar tu atención.</div>'}`);
  }catch{modal('Cómo decide Isabella avisarte','<div class="small">No pude leer las decisiones de atención ahora mismo.</div>')}
}
function assistantPreferencesPanel(){
  const prefs={...base.assistantPreferences,...(state.assistantPreferences||{})};
  const attention=canonicalAttentionPreferences(prefs.attention);
  const rules=[...(prefs.behaviorRules||[])];
  modal('Proactividad de Isabella',`<div class="form assistant-preferences">
    <label class="settings-check"><input id="curiosityEnabled" type="checkbox" ${prefs.curiosityEnabled!==false?'checked':''}><span>Hacerme preguntas ocasionales para conocerme mejor</span></label>
    <label>Frecuencia máxima<select id="curiosityCadence"><option value="24" ${Number(prefs.curiosityCadenceHours)<=24?'selected':''}>Aproximadamente una al día</option><option value="30" ${Number(prefs.curiosityCadenceHours)>24&&Number(prefs.curiosityCadenceHours)<48?'selected':''}>Cada 1–2 días</option><option value="72" ${Number(prefs.curiosityCadenceHours)>=48?'selected':''}>Unas dos por semana</option></select></label>
    <div class="small section-label">Cuándo quieres que te avise</div>
    <div class="small">Puedo mantener cosas vivas y trabajar en segundo plano sin interrumpirte cada vez. Si me dices explícitamente “avísame cuando termines”, esa petición tiene prioridad sobre estas reglas.</div>
    <label>Cuando termino un trabajo en segundo plano<select id="attentionMissionCompleted">${attentionRouteOptions(attention.missionCompleted)}</select></label>
    <label>Cuando no puedo terminar un trabajo en segundo plano<select id="attentionMissionFailed">${attentionRouteOptions(attention.missionFailed)}</select></label>
    <label>Evento próximo<select id="attentionImminentEvent">${attentionRouteOptions(attention.imminentEvent)}</select></label>
    <label>Tareas vencidas<select id="attentionOverdueTasks">${attentionRouteOptions(attention.overdueTasks)}</select></label>
    <label>Fallo de una rutina<select id="attentionRoutineFailure">${attentionRouteOptions(attention.routineFailure)}</select></label>
    <label>Máximo de avisos no urgentes por hora<select id="attentionMaxInterruptions">${[0,1,2,3,4,6].map(n=>`<option value="${n}" ${Number(attention.maxInterruptionsPerHour)===n?'selected':''}>${n===0?'Ninguna':n}</option>`).join('')}</select></label>
    <label class="settings-check"><input id="attentionQuietEnabled" type="checkbox" ${attention.quietHoursEnabled?'checked':''}><span>Usar horas silenciosas para avisos que pueden esperar</span></label>
    <div class="two-col"><label>Desde<input id="attentionQuietStart" type="time" value="${esc(attention.quietStart)}"></label><label>Hasta<input id="attentionQuietEnd" type="time" value="${esc(attention.quietEnd)}"></label></div>
    <button id="attentionHistory" class="secondary" type="button">Ver por qué te avisé o no te avisé</button>
    <div><div class="small section-label">Mejoras de comportamiento adoptadas</div><div id="assistantRuleRows">${rules.length?rules.map((r,i)=>`<div class="assistant-rule-row"><span>${esc(r)}</span><button data-rule-remove="${i}" aria-label="Eliminar">×</button></div>`).join(''):'<div class="small empty-panel">Todavía no has adoptado reglas adicionales.</div>'}</div></div>
    <button id="saveAssistantPreferences" class="primary">Guardar</button>
  </div>`);
  document.querySelectorAll('[data-rule-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.ruleRemove);state.assistantPreferences={...prefs,attention,behaviorRules:rules.filter((_,idx)=>idx!==i)};save();assistantPreferencesPanel()});
  $('#attentionHistory').onclick=()=>void attentionHistoryPanel();
  $('#saveAssistantPreferences').onclick=()=>{
    const nextAttention=canonicalAttentionPreferences({
      missionCompleted:$('#attentionMissionCompleted').value,
      missionFailed:$('#attentionMissionFailed').value,
      imminentEvent:$('#attentionImminentEvent').value,
      overdueTasks:$('#attentionOverdueTasks').value,
      routineFailure:$('#attentionRoutineFailure').value,
      maxInterruptionsPerHour:Number($('#attentionMaxInterruptions').value||3),
      quietHoursEnabled:$('#attentionQuietEnabled').checked,
      quietStart:$('#attentionQuietStart').value,
      quietEnd:$('#attentionQuietEnd').value
    });
    state.assistantPreferences={...prefs,attention:nextAttention,curiosityEnabled:$('#curiosityEnabled').checked,curiosityCadenceHours:Number($('#curiosityCadence').value||30),behaviorRules:state.assistantPreferences?.behaviorRules||rules};
    save();closeModal();
  };
}
async function routinesPanel(){
  modal('Rutinas','<div class="small">Cargando rutinas…</div>');
  try{
    const sb=window.MINDS_SUPABASE;if(!sb)throw new Error('Supabase no disponible');
    const {data:{session}}=await sb.auth.getSession();if(!session){modal('Rutinas','<div class="small">Conecta la memoria para gestionar rutinas.</div>');return}
    const {data,error}=await sb.from('isabella_routines').select('id,title,instruction,schedule,timezone,enabled,next_run_at,last_run_at,last_error').order('created_at',{ascending:false});
    if(error)throw error;
    const rows=data||[];
    const body=rows.length?rows.map(r=>{
      const sch=r.schedule||{},days=sch.kind==='weekly'&&Array.isArray(sch.weekdays)?' · '+sch.weekdays.map(d=>['dom','lun','mar','mié','jue','vie','sáb'][Number(d)]||d).join(', '):'';
      const next=r.next_run_at?new Date(r.next_run_at).toLocaleString('es-ES'):'Sin próxima ejecución';
      const scheduleLabel=sch.kind==='once'?('Una vez · '+String(sch.date||'')+' · '+String(sch.time||'09:00')):(sch.kind==='weekly'?'Semanal':'Todos los días')+' · '+String(sch.time||'08:00')+days;
      return `<div class="routine-row"><div class="row-main"><b>${esc(r.title)}</b><div class="small routine-schedule">${esc(scheduleLabel)} · ${esc(r.timezone||'')}</div><div class="small">${esc(r.instruction||'')}</div><div class="small routine-next">Próxima: ${esc(next)}</div>${r.last_error?`<div class="small danger-text">${esc(r.last_error)}</div>`:''}</div><label class="routine-toggle"><input type="checkbox" data-routine-enabled="${r.id}" ${r.enabled?'checked':''}><span></span></label><button data-routine-delete="${r.id}" aria-label="Eliminar">×</button></div>`;
    }).join(''):'<div class="small">Todavía no has programado ninguna rutina.</div>';
    modal('Rutinas',body);
    document.querySelectorAll('[data-routine-enabled]').forEach(x=>x.onchange=async()=>{await sb.from('isabella_routines').update({enabled:x.checked}).eq('id',x.dataset.routineEnabled);routinesPanel()});
    document.querySelectorAll('[data-routine-delete]').forEach(x=>x.onclick=async()=>{await sb.from('isabella_routines').delete().eq('id',x.dataset.routineDelete);routinesPanel()});
  }catch(e){modal('Rutinas','<div class="small">No pude cargar las rutinas ahora mismo.</div>')}
}
function expectationLocalParts(row){
  const tz=String(row?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin');
  const d=new Date(row.due_at);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const get=t=>parts.find(x=>x.type===t)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`,timezone:tz};
}
function expectationDueLabel(row){
  const p=expectationLocalParts(row),d=new Date(row.due_at);
  return row.due_precision==='datetime'
    ?d.toLocaleString('es-ES',{timeZone:p.timezone,dateStyle:'medium',timeStyle:'short'})
    :d.toLocaleDateString('es-ES',{timeZone:p.timezone,dateStyle:'medium'});
}
function expectationStateLabel(status){
  return status==='active'?'En espera':status==='due_unconfirmed'?'Pendiente de comprobar':status==='fulfilled'?'Ocurrió':status==='not_occurred'?'No ocurrió':'Cancelada';
}
async function reviewExpectation(id,decision){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  try{
    const {data,error}=await sb.rpc('minds_review_expectation',{
      p_expectation_id:id,
      p_decision:decision,
      p_note:null,
      p_occurred_at:decision==='fulfilled'?new Date().toISOString():null,
      p_next_date:null,
      p_next_time:null,
      p_next_precision:null,
      p_timezone:null,
      p_request_id:crypto.randomUUID(),
      p_confirmed:true
    });
    if(error)throw error;
    await standingIntentsPanel();
  }catch(e){say('assistant','No pude actualizar esa expectativa: '+(e?.message||String(e)))}
}
function rescheduleExpectation(row){
  const local=expectationLocalParts(row);
  modal('Nueva fecha esperada',`<div class="form">
    <div class="small">Cambiar la fecha no afirma nada sobre lo que ocurrió antes; solo mueve la expectativa hacia adelante.</div>
    <label>Fecha<input id="expectationNextDate" type="date" value="${esc(local.date)}"></label>
    <label>Hora exacta (opcional)<input id="expectationNextTime" type="time" value="${row.due_precision==='datetime'?esc(local.time):''}"></label>
    <div class="confirm-actions"><button id="expectationRescheduleCancel" class="secondary">Volver</button><button id="expectationRescheduleSave" class="primary">Cambiar fecha</button></div>
  </div>`);
  $('#expectationRescheduleCancel').onclick=()=>void standingIntentsPanel();
  $('#expectationRescheduleSave').onclick=async()=>{
    const date=$('#expectationNextDate').value,time=$('#expectationNextTime').value||null;
    if(!date)return;
    const sb=window.MINDS_SUPABASE;
    try{
      const {error}=await sb.rpc('minds_review_expectation',{
        p_expectation_id:row.id,
        p_decision:'reschedule',
        p_note:null,
        p_occurred_at:null,
        p_next_date:date,
        p_next_time:time,
        p_next_precision:time?'datetime':'date',
        p_timezone:local.timezone,
        p_request_id:crypto.randomUUID(),
        p_confirmed:true
      });
      if(error)throw error;
      await standingIntentsPanel();
    }catch(e){say('assistant','No pude cambiar la fecha: '+(e?.message||String(e)))}
  };
}
async function standingIntentsPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Memoria futura','<div class="small">Conecta la memoria para verla.</div>');return}
  modal('Memoria futura','<div class="small">Cargando…</div>');
  try{
    const [expectQ,intentQ]=await Promise.all([
      sb.from('minds_expectations')
        .select('id,title,expected_event,expectation_type,due_at,due_precision,timezone,status,fulfilled_at,not_occurred_at,cancelled_at,project_id,created_at,isabella_projects(name)')
        .order('due_at',{ascending:true})
        .limit(100),
      sb.from('minds_standing_intents')
        .select('id,trigger_text,reminder_text,status,cooldown_minutes,max_triggers,trigger_count,last_trigger_at,expires_at,project_id,isabella_projects(name)')
        .order('created_at',{ascending:false})
    ]);
    if(expectQ.error)throw expectQ.error;if(intentQ.error)throw intentQ.error;
    const expectations=expectQ.data||[],intents=intentQ.data||[];
    const open=expectations.filter(x=>['active','due_unconfirmed'].includes(x.status));
    const closed=expectations.filter(x=>!['active','due_unconfirmed'].includes(x.status)).sort((a,b)=>new Date(b.due_at)-new Date(a.due_at));

    const expectationCard=x=>{
      const due=expectationDueLabel(x),project=x.isabella_projects?.name?esc(x.isabella_projects.name)+' · ':'';
      const actions=x.status==='due_unconfirmed'
        ?`<div class="confirm-actions"><button class="primary" data-expectation-review="${x.id}" data-expectation-decision="fulfilled">Sí, ocurrió</button><button class="secondary" data-expectation-review="${x.id}" data-expectation-decision="not_occurred">No ocurrió</button><button class="secondary" data-expectation-reschedule="${x.id}">Nueva fecha</button><button class="secondary" data-expectation-review="${x.id}" data-expectation-decision="cancel">Cancelar</button></div>`
        :`<div class="confirm-actions"><button class="secondary" data-expectation-review="${x.id}" data-expectation-decision="fulfilled">Ya ocurrió</button><button class="secondary" data-expectation-reschedule="${x.id}">Cambiar fecha</button><button class="secondary" data-expectation-review="${x.id}" data-expectation-decision="cancel">Cancelar</button></div>`;
      return `<div class="intent-row expectation-row ${esc(x.status)}"><div class="row-main"><b>${esc(x.title)}</b><div>${esc(x.expected_event)}</div><div class="small">${project}${esc(expectationStateLabel(x.status))} · ${esc(due)}</div>${x.status==='due_unconfirmed'?'<div class="small">La fecha ya llegó, pero MINDS no sabe todavía si ocurrió.</div>':''}${actions}</div></div>`;
    };

    const openHtml=open.length?open.map(expectationCard).join(''):'<div class="small">No hay expectativas abiertas.</div>';
    const historyHtml=closed.length?`<details class="human-tech"><summary>Historial de expectativas (${closed.length})</summary>${closed.slice(0,40).map(x=>`<div class="intent-row ${esc(x.status)}"><div class="row-main"><b>${esc(x.title)}</b><div>${esc(x.expected_event)}</div><div class="small">${esc(expectationStateLabel(x.status))} · ${esc(expectationDueLabel(x))}</div></div></div>`).join('')}</details>`:'';

    const intentHtml=intents.length?intents.map(x=>`<div class="intent-row ${esc(x.status)}"><div class="row-main"><b>Cuando: ${esc(x.trigger_text)}</b><div>${esc(x.reminder_text)}</div><div class="small">${x.isabella_projects?.name?esc(x.isabella_projects.name)+' · ':''}${x.trigger_count||0}/${x.max_triggers||3} activaciones · cooldown ${Math.round(Number(x.cooldown_minutes||0)/60)} h${x.expires_at?' · caduca '+new Date(x.expires_at).toLocaleDateString('es-ES'):''}</div></div><button data-intent-toggle="${x.id}" data-intent-status="${x.status}">${x.status==='active'?'Pausar':'Activar'}</button><button data-intent-delete="${x.id}" aria-label="Eliminar">×</button></div>`).join(''):'<div class="small">No hay recordatorios contextuales.</div>';

    modal('Memoria futura',`<div class="small section-label">Expectativas con fecha</div><div class="small" style="margin-bottom:12px">Cosas del mundo que esperas que ocurran. Una fecha vencida sin evidencia queda pendiente de comprobar, no se considera un fallo.</div>${openHtml}${historyHtml}<div class="small section-label" style="margin-top:22px">Recordatorios por situación</div><div class="small" style="margin-bottom:12px">Se activan cuando reaparece una situación, no por una hora.</div>${intentHtml}`);

    document.querySelectorAll('[data-expectation-review]').forEach(b=>b.onclick=()=>void reviewExpectation(b.dataset.expectationReview,b.dataset.expectationDecision));
    document.querySelectorAll('[data-expectation-reschedule]').forEach(b=>b.onclick=()=>{const row=expectations.find(x=>x.id===b.dataset.expectationReschedule);if(row)rescheduleExpectation(row)});
    document.querySelectorAll('[data-intent-toggle]').forEach(b=>b.onclick=async()=>{const status=b.dataset.intentStatus==='active'?'snoozed':'active';await sb.from('minds_standing_intents').update({status,updated_at:new Date().toISOString()}).eq('id',b.dataset.intentToggle);standingIntentsPanel()});
    document.querySelectorAll('[data-intent-delete]').forEach(b=>b.onclick=async()=>{await sb.from('minds_standing_intents').delete().eq('id',b.dataset.intentDelete);standingIntentsPanel()});
  }catch{modal('Memoria futura','<div class="small">No pude cargarla ahora mismo.</div>')}
}
function healthDot(status){return status==='ok'?'<span class="health-dot ok"></span>':status==='warn'?'<span class="health-dot warn"></span>':status==='idle'?'<span class="health-dot idle"></span>':'<span class="health-dot error"></span>'}
function doctorCards(q,now=Date.now()){
  const usage=q.usageQ?.data||[];
  const rows=k=>q[k]?.data||[],error=(...keys)=>keys.map(k=>q[k]?.error?.message).filter(Boolean).join(' · ');
  const latest=f=>rows('runsQ').find(r=>r.feature===f),chat=latest('isabella_chat'),hb=latest('heartbeat');
  const stale=r=>r?.status==='running'&&now-new Date(r.started_at).getTime()>10*60000;
  const routines=rows('routinesQ'),bad=routines.filter(r=>r.last_error),late=routines.filter(r=>r.next_run_at&&new Date(r.next_run_at).getTime()<now-10*60000);
  const shadow=rows('shadowQ'),shadowExact=shadow.filter(x=>x.status==='accepted').length,shadowEdited=shadow.filter(x=>x.status==='edited').length,shadowRejected=shadow.filter(x=>x.status==='rejected').length;
  const missions=rows('missionsQ'),missionItems=rows('missionItemsQ'),durableRuns=rows('missionRunsQ'),attentionRows=rows('attentionQ');
  const durableActive=durableRuns.filter(x=>['queued','running'].includes(x.status)).length,durableWaiting=durableRuns.filter(x=>x.status==='waiting_for_user').length,durableFailed=durableRuns.filter(x=>x.status==='failed').length;
  const attentionInterrupts=attentionRows.filter(x=>x.route==='interrupt'&&x.status==='delivered').length,attentionBriefing=attentionRows.filter(x=>x.route==='briefing'&&x.status==='pending').length,attentionAmbient=attentionRows.filter(x=>x.route==='ambient'&&x.status==='delivered').length;
  const specialistRuns=rows('runsQ').filter(r=>String(r.feature||'').startsWith('specialist_'));
  const orchestrationRuns=rows('runsQ').filter(r=>r.feature==='isabella_specialist_orchestration');
  const specialistErrors=[...specialistRuns,...orchestrationRuns].filter(r=>r.status==='error'||stale(r));
  const specialistCounts=specialistRuns.reduce((acc,r)=>{const key=String(r.feature||'').replace(/^specialist_/,'');acc[key]=(acc[key]||0)+1;return acc},{});
  const specialistDetail=Object.entries(specialistCounts).map(([k,v])=>k+' '+v).join(' · ');
  const card=(name,keys,status,detail)=>[name,error(...keys)?'error':status,error(...keys)||detail];
  const checkpointError=chat?.metadata?.checkpoint_error;
  return [
    card('Isabella Chat',['runsQ'],chat?.status==='error'||stale(chat)?'error':chat?.status==='running'?'warn':chat?'ok':'idle',stale(chat)?'Ejecución sin terminar en más de 10 min':chat?chat.status==='running'?'En curso':'Última ejecución '+new Date(chat.started_at).toLocaleTimeString('es-ES'):'Sin actividad en 24 h'),
    card('Rutinas',['routinesQ','runsQ'],bad.length||late.length?'error':routines.length?'ok':'idle',bad.length?bad.length+' con error':late.length?late.length+' retrasadas más de 10 min':routines.length+' activas'),
    card('Heartbeat',['runsQ','heartQ'],hb?.status==='error'||stale(hb)?'error':hb?.status==='success'&&now-new Date(hb.started_at).getTime()<45*60000?'ok':'warn',hb?'Último chequeo: '+new Date(hb.started_at).toLocaleTimeString('es-ES'):'Sin chequeo registrado'),
    card('Active Memory',['embedQ','flushQ'],checkpointError?'error':rows('embedQ').length?'ok':'idle',checkpointError||rows('embedQ').length+' fragmentos · '+rows('flushQ').length+' checkpoints recientes'),
    card('Sofía',['runsQ','usageQ'],stale(latest('sofia_chat'))||latest('sofia_chat')?.status==='error'?'error':usage.some(x=>String(x.feature).startsWith('sofia_'))?'ok':'idle',usage.some(x=>String(x.feature).startsWith('sofia_'))?'Con actividad reciente':'Sin llamadas recientes; normal si no hizo falta'),
    card('Work',['filesQ','claimsQ'],'ok',rows('filesQ').length+' archivos · '+rows('claimsQ').length+' afirmaciones'),
    card('Skills personales',['skillsQ'],'ok',rows('skillsQ').length+' activas'),
    card('Especialistas internos',['runsQ'],specialistErrors.length?'error':specialistRuns.length||orchestrationRuns.length?'ok':'idle',specialistRuns.length||orchestrationRuns.length?(specialistRuns.length+' delegaciones · '+orchestrationRuns.length+' orquestaciones'+(specialistDetail?' · '+specialistDetail:'')):'Aún sin delegaciones; normal si no hicieron falta'),
    card('Mission Workspaces',['missionsQ','missionItemsQ'],missions.length?'ok':'idle',missions.length?missions.length+' activos/pausados · '+missionItems.length+' entradas':'Aún sin workspaces; se abren al avanzar Commitments aprobados'),
    card('Durable Missions',['missionRunsQ'],durableFailed?'error':durableWaiting?'warn':durableActive?'ok':'idle',durableRuns.length?(durableActive+' trabajando/en cola · '+durableWaiting+' esperando · '+durableFailed+' con error'):'Aún sin ejecuciones durables'),
    card('Attention Economy',['attentionQ'],attentionBriefing?'warn':attentionRows.length?'ok':'idle',attentionRows.length?(attentionInterrupts+' interrupciones · '+attentionBriefing+' esperando briefing · '+attentionAmbient+' en Feed'):'Aún sin decisiones de atención'),
    card('Shadow Agency',['shadowQ'],shadow.length?'ok':'idle',shadow.length?shadow.length+' observaciones · '+shadowExact+' tal cual · '+shadowEdited+' corregidas · '+shadowRejected+' rechazadas':'Aún sin observaciones')
  ];
}
async function doctorPanel(){
  const sb=window.MINDS_SUPABASE;if(!sb){modal('Estado de MINDS','<div class="small">Conecta la memoria para diagnosticar MINDS.</div>');return}
  modal('Estado de MINDS','<div class="surface-loading">Comprobando sistemas…</div>');
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sin sesión');
    const since=new Date(Date.now()-24*3600000).toISOString();
    const [runsQ,routinesQ,heartQ,flushQ,skillsQ,claimsQ,filesQ,embedQ,usageQ,shadowQ,missionsQ,missionItemsQ,missionRunsQ,attentionQ]=await Promise.all([
      sb.from('minds_agent_runs').select('feature,status,error,started_at,completed_at,latency_ms,route,metadata').gte('started_at',since).order('started_at',{ascending:false}).limit(120),
      sb.from('isabella_routines').select('title,enabled,last_run_at,next_run_at,last_error').eq('enabled',true),
      sb.from('minds_heartbeat_events').select('event_type,severity,title,status,last_seen_at').order('last_seen_at',{ascending:false}).limit(20),
      sb.from('minds_memory_flushes').select('agent,created_at').order('created_at',{ascending:false}).limit(5),
      sb.from('minds_user_skills').select('id,agent,enabled').eq('enabled',true),
      sb.from('minds_work_claims').select('id,status').limit(500),
      sb.from('minds_work_files').select('id,index_status').limit(500),
      sb.from('isabella_embeddings').select('source_id').limit(1000),
      sb.from('minds_ai_usage').select('feature,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(300),
      sb.from('minds_shadow_decisions').select('action,status,created_at').gte('created_at',new Date(Date.now()-30*86400000).toISOString()).order('created_at',{ascending:false}).limit(500),
      sb.from('minds_commitment_workspaces').select('id,status,updated_at').in('status',['active','paused']).limit(100),
      sb.from('minds_commitment_workspace_items').select('id,workspace_id,kind,status,created_at').limit(1000),
      sb.from('minds_mission_runs').select('id,status,phase,iteration,max_iterations,last_error,updated_at').order('updated_at',{ascending:false}).limit(100),
      sb.from('minds_attention_events').select('id,route,status,reason_code,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(200)
    ]);
    const runs=runsQ.data||[],routines=routinesQ.data||[],heart=heartQ.data||[],usage=usageQ.data||[];
    const cards=doctorCards({runsQ,routinesQ,heartQ,flushQ,skillsQ,claimsQ,filesQ,embedQ,usageQ,shadowQ,missionsQ,missionItemsQ,missionRunsQ,attentionQ});
    const errors=runs.filter(x=>x.status==='error').slice(0,8);
    const hbEvents=heart.filter(x=>x.status==='new').slice(0,6);
    const durableRuns=missionRunsQ.data||[];
    const summary=humanSurface()?.systemSummary?.({
      errors:cards.filter(([,status])=>status==='error').length,
      waiting:durableRuns.filter(x=>x.status==='waiting_for_user').length,
      working:durableRuns.filter(x=>['queued','running'].includes(x.status)).length,
      briefing:(attentionQ.data||[]).filter(x=>x.route==='briefing'&&x.status==='pending').length
    });
    const technical=`<div class="doctor-grid">${cards.map(([name,status,detail])=>`<div class="doctor-card">${healthDot(status)}<div><b>${esc(name)}</b><div class="small">${esc(detail)}</div></div></div>`).join('')}</div>${errors.length?`<div class="small section-label">Errores recientes</div>${errors.map(x=>`<div class="doctor-log"><b>${esc(x.feature)}</b><span>${esc(x.error||'Error')}</span><time>${new Date(x.started_at).toLocaleString('es-ES')}</time></div>`).join('')}`:''}${hbEvents.length?`<div class="small section-label">Señales del heartbeat</div>${hbEvents.map(x=>`<div class="doctor-log"><b>${esc(x.title)}</b><span>${esc(x.event_type)}</span><time>${new Date(x.last_seen_at).toLocaleString('es-ES')}</time></div>`).join('')}`:''}`;
    modal('Estado de MINDS',`<div class="doctor-panel">${humanStateHTML(summary)}<details class="human-tech doctor-tech"><summary>Ver estado técnico de MINDS</summary>${technical}</details></div>`);
  }catch(e){modal('Estado de MINDS','<div class="small">No pude completar el diagnóstico ahora mismo.</div>')}
}
async function skillsPanel(){
  modal('Habilidades','<div class="small">Cargando habilidades…</div>');
  try{
    const list=await window.ISABELLA_AI.listSkills();
    modal('Habilidades',`<button id="newPersonalSkill" class="secondary">＋ Crear habilidad personal</button>${list.map((s,i)=>`<div class="skill-row"><div class="row-main"><div class="skill-agent-label">${s.agent==='sofia'?'SOFÍA':'ISABELLA'}${s.source==='personal'?' · PERSONAL':''}</div><b>${esc(s.name)}</b><div class="small">${esc(s.description)}</div><div class="skill-meta">v${Number(s.version||1)} · ${s.enabled===false?'Pausada':'Activa'}</div>${s.source==='personal'?`<div class="skill-controls"><button data-skill-edit="${i}">Editar y revisar</button><button data-skill-toggle="${i}">${s.enabled===false?'Activar':'Pausar'}</button><button data-skill-history="${i}">Versiones</button></div>`:''}</div></div>`).join('')}`);
    $('#newPersonalSkill').onclick=()=>window.MINDS_PROPOSALS.edit({kind:'skill_proposal',agent:'isabella',preferred_tools:[]});
    $$('[data-skill-edit]').forEach(b=>b.onclick=()=>window.MINDS_PROPOSALS.edit({...list[Number(b.dataset.skillEdit)],kind:'skill_proposal',request_id:crypto.randomUUID()}));
    $$('[data-skill-toggle]').forEach(b=>b.onclick=async()=>{b.disabled=true;const x=list[Number(b.dataset.skillToggle)];const {error}=await window.MINDS_SUPABASE.from('minds_user_skills').update({enabled:x.enabled===false,updated_at:new Date().toISOString()}).eq('id',x.id);if(error){b.disabled=false;say('assistant','No pude cambiar la habilidad: '+error.message)}else void skillsPanel()});
    $$('[data-skill-history]').forEach(b=>b.onclick=async()=>{
      const x=list[Number(b.dataset.skillHistory)];
      const {data,error}=await window.MINDS_SUPABASE.from('minds_user_skill_versions').select('version,snapshot,created_at').eq('skill_id',x.id).order('version',{ascending:false});
      if(error){say('assistant','No pude leer las versiones: '+error.message);return}
      modal('Versiones de '+x.name,`<div class="skill-history">${(data||[]).map((v,i)=>`<details><summary>v${v.version} · ${new Date(v.created_at).toLocaleString('es-ES')}</summary><pre>${esc(v.snapshot.instructions)}</pre><button data-restore-skill="${i}" class="secondary">Revisar como nueva versión</button></details>`).join('')||'<p>Aún no hay versiones registradas.</p>'}</div>`);
      $$('[data-restore-skill]').forEach(b=>b.onclick=()=>window.MINDS_PROPOSALS.edit({...data[Number(b.dataset.restoreSkill)].snapshot,kind:'skill_proposal',request_id:crypto.randomUUID()}));
    });
  }catch(e){modal('Habilidades','<p>No pude cargar las habilidades: '+esc(e.message)+'</p>')}
}
const operatingDimensionLabels={time_planning:'Planificación del tiempo',scheduling:'Planificación del tiempo',task_management:'Tareas',focus:'Concentración',work_rhythm:'Ritmo de trabajo',interruption:'Interrupciones',interruptions:'Interrupciones',decision_making:'Decisiones',decision_style:'Decisiones',autonomy:'Autonomía',planning:'Planificación',interaction:'Cómo colaboramos',communication:'Cómo colaboramos',tooling:'Herramientas',review:'Revisión'};
function emptyOperatingModel(){return {accepted:[],proposed:[],recent_reviews:[],observation_count:0}}
async function loadOperatingModel(){
  const sb=window.MINDS_SUPABASE;if(!sb){window.ISABELLA_OPERATING_RULES=[];return emptyOperatingModel()}
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session){window.ISABELLA_OPERATING_RULES=[];return emptyOperatingModel()}
    const {data,error}=await sb.rpc('minds_get_personal_operating_model');if(error)throw error;
    const model=data||emptyOperatingModel(),accepted=Array.isArray(model.accepted)?model.accepted:[];
    window.ISABELLA_OPERATING_RULES=accepted.map(x=>({dimension:String(x.dimension||''),statement:String(x.accepted_statement||x.statement||'').trim()})).filter(x=>x.statement).slice(0,12);
    return {...emptyOperatingModel(),...model,accepted,proposed:Array.isArray(model.proposed)?model.proposed:[],recent_reviews:Array.isArray(model.recent_reviews)?model.recent_reviews:[]};
  }catch{window.ISABELLA_OPERATING_RULES=[];return emptyOperatingModel()}
}
async function refreshOperatingModel(force=false){
  const sb=window.MINDS_SUPABASE;if(!sb)return loadOperatingModel();
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return loadOperatingModel();
    const key='isabella-operating-model-refresh:'+session.user.id,last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(force||now-last>=24*60*60*1000){
      const {data,error}=await sb.functions.invoke('isabella-operating-model',{body:{action:'refresh'}});
      if(!error&&!data?.error)localStorage.setItem(key,String(now));
    }
  }catch{}
  return loadOperatingModel();
}
async function reviewOperatingHypothesis(id,decision,finalStatement=null){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  try{
    const {data,error}=await sb.rpc('minds_review_operating_hypothesis',{p_hypothesis_id:id,p_decision:decision,p_final_statement:finalStatement,p_request_id:crypto.randomUUID(),p_confirmed:true});
    if(error||data?.error)throw new Error(data?.error||error?.message||'No pude registrar la revisión.');
    await loadOperatingModel();await memoryPanel();
  }catch(e){say('assistant','No pude actualizar esa regla ahora mismo: '+(e?.message||String(e)))}
}
function correctOperatingHypothesis(id,current){
  modal('Corregir regla de trabajo',`<div class="form"><div class="small">La corrección se guardará como la regla aceptada. La formulación original y tu revisión quedan en el historial.</div><label>Formulación correcta<textarea id="operatingCorrection" rows="5">${esc(current||'')}</textarea></label><button id="saveOperatingCorrection" class="primary">Usar esta regla</button></div>`);
  $('#saveOperatingCorrection').onclick=async()=>{const text=$('#operatingCorrection').value.trim();if(!text)return;await reviewOperatingHypothesis(id,'correct',text)};
}
async function memoryPanel(){
  const items=(state.memory||[]).filter(m=>typeof m!=='object'||m.status!=='deleted');
  let claims=[],operating=emptyOperatingModel();
  try{
    const sb=window.MINDS_SUPABASE,{data:{session}}=await sb.auth.getSession();
    if(session){
      const [{data:claimRows},model]=await Promise.all([sb.from('isabella_model_claims').select('id,claim_type,claim,status,confidence,source_type,last_seen_at').in('status',['confirmed','hypothesis']).order('status',{ascending:true}).order('confidence',{ascending:false}).limit(60),loadOperatingModel()]);
      claims=claimRows||[];operating=model||emptyOperatingModel();
    }
  }catch{}
  const modelHtml=claims.length?claims.map(c=>`<div class="model-claim-row ${esc(c.status)}"><div class="row-main"><div>${esc(c.claim)}</div><div class="small">${c.status==='confirmed'?'Confirmado':'Hipótesis'} · ${esc(c.claim_type)} · ${Math.round(Number(c.confidence||0)*100)}%</div></div><div class="model-claim-actions">${c.status==='hypothesis'?`<button data-model-confirm="${esc(c.id)}">Confirmar</button><button data-model-reject="${esc(c.id)}">No</button>`:''}<button data-model-correct="${esc(c.id)}" data-model-text="${esc(c.claim)}">Corregir</button></div></div>`).join(''):'<div class="small">Todavía no hay hipótesis estructuradas sobre ti.</div>';
  const accepted=operating.accepted||[],proposed=operating.proposed||[];
  const acceptedHtml=accepted.length?accepted.map(x=>`<div class="model-claim-row confirmed"><div class="row-main"><div>${esc(x.accepted_statement||x.statement||'')}</div><div class="small">Confirmado · ${esc(operatingDimensionLabels[x.dimension]||x.dimension)}</div></div><div class="model-claim-actions"><button data-operating-retire="${esc(x.id)}">Retirar</button></div></div>`).join(''):'<div class="small">Todavía no hay reglas de trabajo confirmadas.</div>';
  const proposedHtml=proposed.length?proposed.map(x=>{const evidence=Array.isArray(x.evidence)?x.evidence:[];return `<div class="model-claim-row hypothesis"><div class="row-main"><div>${esc(x.statement||'')}</div><div class="small">Propuesta · ${esc(operatingDimensionLabels[x.dimension]||x.dimension)}</div>${x.rationale?`<p class="small">${esc(x.rationale)}</p>`:''}${evidence.length?`<details class="human-tech"><summary>Por qué lo propongo</summary>${evidence.map(e=>`<div class="small">${esc(e.summary||'')} · ${esc(e.provenance_class||'')}</div>`).join('')}</details>`:''}</div><div class="model-claim-actions"><button data-operating-accept="${esc(x.id)}">Sí, úsalo</button><button data-operating-correct="${esc(x.id)}" data-operating-text="${esc(x.statement||'')}">Corregir</button><button data-operating-reject="${esc(x.id)}">No</button></div></div>`}).join(''):'<div class="small">No hay nuevas reglas por revisar.</div>';
  const operatingHtml=`<div class="small">Isabella puede observar patrones operativos, pero ninguna inferencia cambia cómo trabaja contigo hasta que la confirmes.</div><div class="small section-label">Reglas confirmadas</div>${acceptedHtml}<div class="small section-label memory-section-title">Por revisar</div>${proposedHtml}<div class="small">Observaciones disponibles: ${Number(operating.observation_count||0)}</div>`;
  const memoryHtml=items.length?items.map((m,i)=>{const text=typeof m==='object'?m.content:String(m),kind=typeof m==='object'?(m.kind||'context'):'context';const id=typeof m==='object'?(m.id||String(i)):String(i);return `<div class="memory-row"><div class="row-main"><div>${esc(text)}</div><div class="small">${esc(kind)}</div></div><button data-memory-edit="${esc(id)}">Editar</button><button data-memory-delete="${esc(id)}">×</button></div>`}).join(''):'<div class="small">Todavía no he guardado memoria personal.</div>';
  modal('Lo que Isabella sabe de mí',`<div class="small section-label">Modelo personal</div><div class="personal-model-list">${modelHtml}</div><div class="small section-label memory-section-title">Cómo trabajo</div><div class="personal-model-list">${operatingHtml}</div><div class="small section-label memory-section-title">Memoria explícita</div>${memoryHtml}`);
  document.querySelectorAll('[data-model-confirm]').forEach(b=>b.onclick=()=>void setModelClaimStatus(b.dataset.modelConfirm,'confirmed'));
  document.querySelectorAll('[data-model-reject]').forEach(b=>b.onclick=()=>void setModelClaimStatus(b.dataset.modelReject,'contradicted'));
  document.querySelectorAll('[data-model-correct]').forEach(b=>b.onclick=()=>correctModelClaim(b.dataset.modelCorrect,b.dataset.modelText||''));
  document.querySelectorAll('[data-operating-accept]').forEach(b=>b.onclick=()=>void reviewOperatingHypothesis(b.dataset.operatingAccept,'accept',null));
  document.querySelectorAll('[data-operating-reject]').forEach(b=>b.onclick=()=>void reviewOperatingHypothesis(b.dataset.operatingReject,'reject',null));
  document.querySelectorAll('[data-operating-correct]').forEach(b=>b.onclick=()=>correctOperatingHypothesis(b.dataset.operatingCorrect,b.dataset.operatingText||''));
  document.querySelectorAll('[data-operating-retire]').forEach(b=>b.onclick=()=>{if(confirm('¿Retirar esta regla de trabajo? Isabella dejará de usarla.'))void reviewOperatingHypothesis(b.dataset.operatingRetire,'retire',null)});
  $$('[data-memory-edit]').forEach(b=>b.onclick=()=>editMemory(b.dataset.memoryEdit));
  $$('[data-memory-delete]').forEach(b=>b.onclick=()=>deleteMemory(b.dataset.memoryDelete));
}
async function setModelClaimStatus(id,status){
  const sb=window.MINDS_SUPABASE;if(!sb||!id)return;
  try{
    const patch={status,last_seen_at:new Date().toISOString()};
    if(status==='confirmed'){patch.confidence=1;patch.confirmed_at=new Date().toISOString();patch.source_type='explicit'}
    await sb.from('isabella_model_claims').update(patch).eq('id',id);
  }catch{}
  memoryPanel();
}
function correctModelClaim(id,current){
  modal('Corregir lo que Isabella cree',`<div class="form"><label>Formulación correcta<textarea id="modelClaimCorrection" rows="4">${esc(current)}</textarea></label><button id="saveModelClaimCorrection" class="primary">Guardar corrección</button></div>`);
  $('#saveModelClaimCorrection').onclick=async()=>{
    const claim=$('#modelClaimCorrection').value.trim();if(!claim)return;
    const sb=window.MINDS_SUPABASE;
    try{
      const {data:{session}}=await sb.auth.getSession();if(!session)return;
      await sb.from('isabella_model_claims').update({status:'contradicted',last_seen_at:new Date().toISOString()}).eq('id',id);
      await sb.from('isabella_model_claims').insert({user_id:session.user.id,claim_type:'other',claim,status:'confirmed',confidence:1,source_type:'explicit',evidence:[{source:'user_correction',at:new Date().toISOString()}],confirmed_at:new Date().toISOString()});
    }catch{}
    memoryPanel();
  };
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
function feedFollowRow(node={}){
  const types=[['architecture_studio','Estudio de arquitectura'],['artist','Artista'],['architect','Arquitecto/a'],['institution','Museo / institución'],['publication','Revista / publicación'],['gallery','Galería'],['person','Persona'],['topic','Tema'],['other','Otro']];
  return `<div class="feed-follow-row" data-follow-id="${esc(node.id||uid())}">
    <input data-follow-name value="${esc(node.name||'')}" placeholder="Nombre">
    <select data-follow-type>${types.map(([v,l])=>`<option value="${v}" ${String(node.type||'other')===v?'selected':''}>${l}</option>`).join('')}</select>
    <input data-follow-focus value="${esc(node.focus||'')}" placeholder="Qué te interesa: proyectos, exposiciones, textos…">
    <button type="button" data-follow-remove aria-label="Eliminar">×</button>
  </div>`;
}
function feedPreferencesPanel(){
  const prefs=canonicalFeedPreferences(state.feedPreferences||base.feedPreferences);
  modal('Ajustar Feed',`<div class="form feed-preferences">
    <div class="small">El Feed ya no se cura por temas ni noticias. Isabella reevalúa tu situación y solo muestra señales que merecen atención ahora.</div>
    <label>Lugar habitual para el clima <span class="small">(opcional; no se inferirá una localidad que no hayas confirmado)</span><input id="weatherLocation" value="${esc(prefs.weatherLocation||'')}" placeholder="Ciudad o localidad"></label>
    <label>Qué merece emerger<textarea id="feedInstructions" rows="5" placeholder="Ej. señala conflictos y concentraciones entre proyectos; evita consejos genéricos; no me interrumpas por cosas obvias.">${esc(prefs.instructions||'')}</textarea></label>
    <button id="saveFeedPreferences" class="primary">Guardar</button>
  </div>`);
  $('#saveFeedPreferences').onclick=()=>{
    state.feedPreferences=canonicalFeedPreferences({...prefs,instructions:$('#feedInstructions').value.trim(),weatherLocation:$('#weatherLocation').value.trim()});
    save();closeModal();renderFeed(true);
  };
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
window.addEventListener('isabella:synced',()=>{void afterSync()});
window.ISABELLA_APP={
  getState:()=>JSON.parse(JSON.stringify(state)),
  replaceState:(next)=>{
    const visibleScreen=state.screen||'assistant';
    state={...base,...next,screen:visibleScreen,assistantPreferences:{...base.assistantPreferences,...(next?.assistantPreferences||{})},feedPreferences:canonicalFeedPreferences(next?.feedPreferences||{})};
    state.assistantPreferences.attention=canonicalAttentionPreferences(next?.assistantPreferences?.attention||state.assistantPreferences.attention);
    state.messages=normalizeMessages(state.messages);
    save();renderMessages(false);renderToday();renderCalendar();
  },
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
