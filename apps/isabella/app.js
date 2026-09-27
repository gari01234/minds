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
const MEMORY_KINDS=new Set(['fact','person','routine','episodic','preference','context']);
const MEMORY_KIND_ALIASES={schedule:'routine',habit:'routine',working_style:'preference',interaction:'preference',constraint:'context',goal:'context',priority:'context',value:'preference',project:'context',relation:'context',relationship:'person',work:'context',identity:'fact',note:'context',other:'context'};
function normalizeMemoryKind(kind){const k=String(kind||'context').trim().toLowerCase();return MEMORY_KINDS.has(k)?k:(MEMORY_KIND_ALIASES[k]||'context')}
const taskOrder=(a,b)=>(Number(a.sortOrder||0)-Number(b.sortOrder||0))||String(a.title||'').localeCompare(String(b.title||''),'es');
function nextTaskOrder(date){const key=date||null,xs=state.tasks.filter(t=>(t.date||null)===key&&!t.archivedAt);return xs.length?Math.max(...xs.map(t=>Number(t.sortOrder||0)))+10:10}
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
],tasks:[],events:[],memory:[],pendingIntent:null,deletedTaskIds:[],deletedEventIds:[],feedThreads:{},feedSignals:[],assistantPreferences:{
  curiosityEnabled:true,
  curiosityCadenceHours:30,
  behaviorRules:[]
},feedPreferences:{
  instructions:'',
  topics:['Clima','Noticias','Arquitectura','Arte','Inteligencia artificial','Proyectos','Familia'],
  customTopics:[],
  following:[],
  followGraph:[],
  weatherLocation:''
}};
function normalizeMessages(items){
  const out=[];
  let greetingSeen=false;
  for(const m of items||[]){
    const text=String(m?.text||'').trim();
    if(!text)continue;
    if(/^Edge Function returned a non-2xx status code$/i.test(text))continue;
    if(/^Conecta la memoria de Isabella para activar la IA\.?$/i.test(text))continue;
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
function load(){try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
  const x={...base,...raw,assistantPreferences:{...base.assistantPreferences,...(raw.assistantPreferences||{})},feedPreferences:{...base.feedPreferences,...(raw.feedPreferences||{})}};
  x.assistantPreferences.behaviorRules=Array.isArray(x.assistantPreferences.behaviorRules)?x.assistantPreferences.behaviorRules:[];
  x.assistantPreferences.curiosityEnabled=x.assistantPreferences.curiosityEnabled!==false;
  x.assistantPreferences.curiosityCadenceHours=Math.max(12,Math.min(168,Number(x.assistantPreferences.curiosityCadenceHours||30)));
  x.feedPreferences.topics=Array.isArray(x.feedPreferences.topics)?x.feedPreferences.topics:[...base.feedPreferences.topics];
  x.feedPreferences.customTopics=Array.isArray(x.feedPreferences.customTopics)?x.feedPreferences.customTopics:[];
  x.feedPreferences.following=Array.isArray(x.feedPreferences.following)?x.feedPreferences.following:[];
  x.feedPreferences.followGraph=Array.isArray(x.feedPreferences.followGraph)?x.feedPreferences.followGraph:[];
  if(!x.feedPreferences.followGraph.length&&x.feedPreferences.following.length){
    x.feedPreferences.followGraph=x.feedPreferences.following.map(name=>({id:uid(),name:String(name),type:'other',focus:'',active:true}));
  }
  x.feedThreads=x.feedThreads&&typeof x.feedThreads==='object'&&!Array.isArray(x.feedThreads)?x.feedThreads:{};
  x.feedSignals=Array.isArray(x.feedSignals)?x.feedSignals:[];
  x.memory=(Array.isArray(x.memory)?x.memory:[]).map((m,i)=>{if(typeof m!=='object')return {id:'memory-'+i,kind:'context',content:String(m),status:'active',confidence:1,source:'local'};return {...m,kind:normalizeMemoryKind(m.kind),status:m.status==='deleted'?'deleted':(m.status||'active')}});
  if(x.feedPreferences.topics.includes('Noticias que sigo')&&!x.feedPreferences.topics.includes('Noticias')){
    x.feedPreferences.topics=x.feedPreferences.topics.map(t=>t==='Noticias que sigo'?'Noticias':t);
  }
  if(localStorage.getItem('isabella-feed-news-v1')!=='1'){
    if(!x.feedPreferences.topics.includes('Noticias'))x.feedPreferences.topics.push('Noticias');
    localStorage.setItem('isabella-feed-news-v1','1');
  }
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
    if(!window.ISABELLA_AI?.nudge)return false;
    const key='isabella-last-nudge-at';
    const last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(now-last<6*60*60*1000)return false;
    const result=await window.ISABELLA_AI.nudge(state);
    const reply=String(result?.reply||'').trim();
    localStorage.setItem(key,String(now));
    if(reply&&reply!=='NO_NUDGE'&&!/^NO_NUDGE[.!]?$/i.test(reply)){say('assistant',reply);return true}
  }catch{}
  return false;
}
async function maybeCuriosityQuestion(){
  try{
    const prefs=state.assistantPreferences||base.assistantPreferences;
    if(prefs.curiosityEnabled===false||!window.ISABELLA_AI?.curiosity)return false;
    const h=new Date().getHours();if(h<9||h>21)return false;
    const key='isabella-last-curiosity-at',last=Number(localStorage.getItem(key)||0),now=Date.now();
    const cadence=Math.max(12,Math.min(168,Number(prefs.curiosityCadenceHours||30)))*60*60*1000;
    if(now-last<cadence)return false;
    const result=await window.ISABELLA_AI.curiosity(state),reply=String(result?.reply||'').trim();
    localStorage.setItem(key,String(now));
    if(reply&&reply!=='NO_QUESTION'&&!/^NO_QUESTION[.!]?$/i.test(reply)){say('assistant',reply);return true}
  }catch{}
  return false;
}
async function maybePrewarmFeed(){
  try{
    if(!window.ISABELLA_AI?.startFeedRefresh)return;
    const key='isabella-feed-prewarm-at',last=Number(localStorage.getItem(key)||0),now=Date.now();
    if(now-last<3*60*60*1000)return;
    const result=await window.ISABELLA_AI.startFeedRefresh(state,{force:false,currentItems:feedItems||[]});
    if(result?.accepted||result?.skipped)localStorage.setItem(key,String(now));
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
  void maybePrewarmFeed();
  void maybePrewarmResearch();
  void maybeReactivateIdeas();
  const nudged=await maybeProactiveNudge();
  if(!nudged)await maybeCuriosityQuestion();
}
function show(name){
  const allowed=['assistant','feed','ideas','calendar','readings'];
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
  if(name==='assistant')setTimeout(()=>scrollAssistantToLatest(true),0);
  if(name==='calendar')renderCalendar();
  if(name==='feed')renderFeed();
  if(name==='ideas')renderIdeas();
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
  const detailHtml=weather&&details.length?`<div class="weather-week hidden">${details.slice(0,8).map(d=>`<div class="weather-row"><span>${esc(d.label||d.day||'')}</span><b>${esc(d.value||d.summary||'')}</b></div>`).join('')}</div>`:'';
  const storyKey=feedStoryKey(item),itemKey=String(item.id||storyKey||item.title||'');
  const operational=weather||kind==='commitment'||kind==='pending';
  const feedStory=surface==='feed'&&!operational;
  const idea=surface==='idea';
  const feedback=String(item.user_feedback||'');
  const lifecycle=String(item.lifecycle_state||'new');
  return `<article class="surface-card ${weather?'weather-card':''} ${news?'news-card':''} ${feedback==='liked'?'liked':''}" data-agent="${esc(agent)}" data-surface-item="${esc(itemKey)}">
    <div class="surface-card-top"><span class="surface-icon">${esc(icon||(news?'◫':agent==='sofia'?'◌':'○'))}</span><span class="surface-card-agent">${improvement?'ISABELLA · AUTOEVALUACIÓN':surfaceAgentLabel(agent)}</span>${surface==='feed'&&!operational&&lifecycle==='new'?'<span class="surface-state">NUEVO</span>':''}</div>
    <h2>${esc(item.title||'')}</h2><p>${esc(item.body||'')}</p>${detailHtml}
    ${why?`<div class="surface-why-copy hidden" data-why-copy="${esc(itemKey)}">${esc(why)}</div>`:''}
    <div class="surface-card-actions">
      ${weather&&details.length?'<button class="weather-toggle">Ver semana</button>':''}
      ${feedStory?`<button class="surface-readmore" data-news-key="${esc(storyKey)}">Leer más</button>`:''}
      ${feedStory&&why?`<button class="surface-why" data-why-key="${esc(itemKey)}">¿Por qué esto?</button>`:''}
      ${feedStory&&sourceUrl?`<a class="surface-source" data-feed-source="${esc(storyKey)}" href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceTitle)}</a>`:''}
      ${!feedStory&&prompt?`<button class="surface-discuss" data-surface-agent="${esc(agent)}" data-surface-prompt="${esc(prompt)}" ${idea?`data-idea-open="${esc(itemKey)}"`:''}>${agent==='sofia'?'Hablar con Sofía':improvement?'Revisar mejora':'Hablar con Isabella'}</button>`:''}
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
function renderIdeaItems(items){
  const box=$('#ideasList');if(!box)return;
  ideaItems=(items||[]).filter(Boolean);
  box.innerHTML=ideaItems.length?ideaItems.map(x=>surfaceCard(x,'idea')).join(''):'<div class="surface-empty">Todavía no apareció una idea suficientemente buena para mostrarte.</div>';
  bindSurfaceActions();
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
  document.querySelectorAll('[data-idea-sleep]').forEach(b=>b.onclick=()=>sleepIdea(b.dataset.ideaSleep||''));
  document.querySelectorAll('[data-idea-dismiss]').forEach(b=>b.onclick=()=>void dismissIdea(b.dataset.ideaDismiss||''));
  document.querySelectorAll('[data-feed-source]').forEach(a=>a.onclick=()=>{const item=feedItems.find(x=>feedStoryKey(x)===(a.dataset.feedSource||''));if(item)recordFeedSignal('source_opened',item)});
  document.querySelectorAll('[data-surface-prompt]').forEach(b=>b.onclick=()=>{
    const prompt=b.dataset.surfacePrompt||'',agent=b.dataset.surfaceAgent||'isabella',ideaKey=b.dataset.ideaOpen||'';
    if(ideaKey){const item=surfaceItemByKey(ideaKey);if(item)void updateIdeaLifecycle(item,'pending','active')}
    if(agent==='sofia'){
      show('readings');
      setTimeout(()=>$('#readingsFrame')?.contentWindow?.postMessage({type:'minds:sofia-prompt',prompt},location.origin),220);
    }else{
      show('assistant');
      setTimeout(()=>handle(prompt),80);
    }
  });
  $$('.weather-toggle').forEach(b=>b.onclick=()=>{
    const card=b.closest('.weather-card'),week=card?.querySelector('.weather-week');if(!week)return;
    const opening=week.classList.contains('hidden');week.classList.toggle('hidden',!opening);b.textContent=opening?'Ocultar semana':'Ver semana';
  });
}
let feedBusy=false,ideasBusy=false,feedItems=[],ideaItems=[],researchItems=[],activeFeedStory=null;
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
  const sectionOf=x=>{const s=String(x?.section||x?.metadata?.section||'for_me').toLowerCase();return s==='today'?'today':s==='news'?'news':s==='work'?'work':'for_me'};
  const generated=dedupeFeedItems(items).filter(x=>sectionOf(x)!=='today'&&sectionOf(x)!=='work');
  const work=dedupeFeedItems(researchItems||[]).filter(x=>sectionOf(x)==='work');
  const todayItems=fixedTodayFeedItems();
  feedItems=dedupeFeedItems([...todayItems,...generated,...work]);
  const newsItems=generated.filter(x=>sectionOf(x)==='news').slice(0,10),forMeItems=generated.filter(x=>sectionOf(x)==='for_me');
  const todayHtml=todayItems.length?todayItems.map(x=>surfaceCard(x,'feed')).join(''):'<div class="surface-empty surface-day-clear">No tienes eventos ni tareas pendientes para hoy.</div>';
  box.innerHTML='<section class="feed-section"><h2 class="feed-section-title">Hoy</h2>'+todayHtml+'</section>'+
    (newsItems.length?'<section class="feed-section"><h2 class="feed-section-title">Noticias</h2>'+newsItems.map(x=>surfaceCard(x,'feed')).join('')+'</section>':'')+
    (forMeItems.length?'<section class="feed-section"><h2 class="feed-section-title">Para mí</h2>'+forMeItems.map(x=>surfaceCard(x,'feed')).join('')+'</section>':'')+
    (work.length?'<section class="feed-section"><h2 class="feed-section-title">Avances de Isabella</h2>'+work.map(x=>surfaceCard(x,'feed')).join('')+'</section>':'');
  bindSurfaceActions();
}
async function renderFeed(force=false){
  const box=$('#feedList'),refresh=$('#refreshFeed'),status=$('#feedRefreshStatus');if(!box||feedBusy)return;feedBusy=true;
  let visible=[...feedItems];
  if(force&&refresh){refresh.disabled=true;refresh.classList.add('refreshing');refresh.textContent='…'}
  try{
    const [cachedA,cachedB,cachedResearch]=await Promise.all([
      window.ISABELLA_AI?.loadSurface?.('feed','isabella',{allowStale:true})||[],
      window.ISABELLA_AI?.loadSurface?.('feed','sofia',{allowStale:true})||[],
      window.ISABELLA_AI?.loadResearchReady?.()||[]
    ]);
    researchItems=cachedResearch||[];
    visible=dedupeFeedItems([...(cachedA||[]),...(cachedB||[]),...visible]);
    if(visible.length)renderFeedItems(visible);
    else box.innerHTML='<div class="surface-loading">Abriendo tu Feed…</div>';

    const hasCurrentIsabella=(cachedA||[]).some(x=>Number(x?.metadata?.surface_version||0)>=9);
    if(status&&(force||!hasCurrentIsabella))status.textContent=force?'Actualizando…':'Completando en segundo plano…';

    const request=await window.ISABELLA_AI?.startFeedRefresh?.(state,{force,currentItems:visible});
    if(!request||request.skipped){
      if(status)status.textContent='';
      return;
    }

    if(status)status.textContent='Actualizando en segundo plano…';
    const result=await window.ISABELLA_AI?.waitForFeedRefresh?.(request.generation_id,{timeoutMs:90000,intervalMs:1600});
    if(result?.status==='succeeded'){
      const latestA=result.items||await window.ISABELLA_AI?.loadSurface?.('feed','isabella',{allowStale:true})||[];
      const [latestB,latestResearch]=await Promise.all([
        window.ISABELLA_AI?.loadSurface?.('feed','sofia',{allowStale:true})||[],
        window.ISABELLA_AI?.loadResearchReady?.()||[]
      ]);
      researchItems=latestResearch||[];
      const fresh=dedupeFeedItems([...(latestA||[]),...(latestB||[])]);
      if(fresh.length||researchItems.length)renderFeedItems(fresh);
      if(status){status.textContent='Actualizado ahora';setTimeout(()=>{if(status.textContent==='Actualizado ahora')status.textContent=''},1800)}
    }else if(result?.status==='pending'){
      if(status)status.textContent='Se terminará de actualizar en segundo plano';
      setTimeout(()=>{if(status.textContent==='Se terminará de actualizar en segundo plano')status.textContent=''},4500);
    }
  }catch(err){
    if(visible.length)renderFeedItems(visible);else box.innerHTML='<div class="surface-empty">No pude completar el Feed ahora mismo.</div>';
    if(status){status.textContent='No pude actualizar';setTimeout(()=>{if(status.textContent==='No pude actualizar')status.textContent=''},2600)}
  }finally{
    feedBusy=false;
    if(refresh){refresh.disabled=false;refresh.classList.remove('refreshing');refresh.textContent='↻'}
  }
}
function feedThreadFor(item){
  const key=feedStoryKey(item);if(!key)return null;
  if(!state.feedThreads[key])state.feedThreads[key]={key,title:String(item.title||''),source_url:String(item.source_url||item.metadata?.source_url||''),created:new Date().toISOString(),updated:new Date().toISOString(),overview:'',messages:[]};
  const thread=state.feedThreads[key];
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
  if(thread.overviewLoading&&!detail){article.innerHTML='<div class="feed-detail-loading">Buscando contexto y antecedentes…</div>';return}
  article.innerHTML=detail?`<div class="feed-detail-copy">${formatMessageText(detail)}</div>${Array.isArray(thread.overviewSources)&&thread.overviewSources.length?`<div class="feed-detail-sources">${thread.overviewSources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}`:'';
}
function renderFeedThread(item){
  const thread=feedThreadFor(item),log=$('#feedThreadLog');if(!thread||!log)return;
  log.innerHTML=(thread.messages||[]).map(m=>`<div class="feed-thread-message ${m.role}"><div class="feed-thread-text">${formatMessageText(m.text||'')}</div>${Array.isArray(m.sources)&&m.sources.length?`<div class="feed-thread-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}</div>`).join('');
  requestAnimationFrame(()=>{const sc=$('#feedDetailScroll');if(sc&&thread.messages?.length)sc.scrollTop=sc.scrollHeight});
}
async function hydrateFeedStory(item){
  const thread=feedThreadFor(item);if(!thread||thread.overviewLoading)return;
  const existing=String(item.detail||item.metadata?.detail||thread.overview||'').trim();if(existing){renderFeedOverview(item);return}
  thread.overviewLoading=true;renderFeedOverview(item);
  try{
    const result=await window.ISABELLA_AI?.feedStory?.(item,state,'',[]);
    if(result?.reply){thread.overview=String(result.reply);thread.overviewSources=result.sources||[];thread.updated=new Date().toISOString();recordFeedSignal('expanded',item);save()}
  }catch(e){
    thread.overview='No pude ampliar esta noticia ahora mismo. Puedes abrir la fuente original o intentarlo de nuevo más tarde.';
  }finally{thread.overviewLoading=false;renderFeedOverview(item)}
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
  $('#feedDetailMeta').innerHTML=`<span>${kind==='news'?'NOTICIA':'FEED'}</span>${/^https?:\/\//i.test(sourceUrl)?`<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(sourceTitle)} ↗</a>`:''}`;
  const media=$('#feedDetailMedia');media.innerHTML=/^https?:\/\//i.test(imageUrl)?`<figure><img src="${esc(imageUrl)}" alt="${esc(imageAlt)}"><figcaption>${esc(sourceTitle)}</figcaption></figure>`:'';
  media.querySelector('img')?.addEventListener('error',()=>{media.innerHTML=''});
  const entities=feedEntities(item);$('#feedDetailFollow').innerHTML=entities.length?entities.map(feedFollowChip).join(''):'';
  $('#feedDetail').classList.remove('hidden');$('#feedDetail').setAttribute('aria-hidden','false');document.body.classList.add('feed-detail-open');renderFeedOverview(item);renderFeedThread(item);bindFeedFollowChips();
  if(!['weather','commitment','pending'].includes(kind)&&!detail)hydrateFeedStory(item);
}
function closeFeedStory(){$('#feedDetail').classList.add('hidden');$('#feedDetail').setAttribute('aria-hidden','true');document.body.classList.remove('feed-detail-open');activeFeedStory=null}
async function submitFeedStoryQuestion(text){
  const item=activeFeedStory,thread=item?feedThreadFor(item):null;if(!item||!thread)return;
  const q=String(text||'').trim();if(!q)return;thread.messages.push({id:uid(),role:'user',text:q,at:new Date().toISOString()});thread.updated=new Date().toISOString();save();renderFeedThread(item);recordFeedSignal('questioned',item);
  try{const result=await window.ISABELLA_AI?.feedStory?.(item,state,q,thread.messages||[]);if(result?.reply)thread.messages.push({id:uid(),role:'assistant',text:result.reply,sources:result.sources||[],at:new Date().toISOString()})}
  catch(e){thread.messages.push({id:uid(),role:'assistant',text:'No pude responder sobre esta noticia ahora mismo.',at:new Date().toISOString()})}
  thread.updated=new Date().toISOString();save();renderFeedThread(item);
}

async function renderIdeas(force=false){
  const box=$('#ideasList');if(!box||ideasBusy)return;ideasBusy=true;
  box.innerHTML='<div class="surface-loading">Buscando conexiones útiles…</div>';
  try{
    const [a,b]=await Promise.all([
      window.ISABELLA_AI?.ideas?.(state,{force})||[],
      window.ISABELLA_AI?.sofiaSurface?.('idea',{force})||[]
    ]);
    const items=[...(a||[]),...(b||[])].filter((x,i,arr)=>arr.findIndex(y=>String(y.id||y.title)===String(x.id||x.title))===i).slice(0,6);
    renderIdeaItems(items);
  }catch(err){box.innerHTML='<div class="surface-empty">No pude actualizar Ideas ahora mismo.</div>'}
  finally{ideasBusy=false}
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
function say(role,text,meta={}){
  state.messages.push({
    id:uid(),role,text,at:new Date().toISOString(),reaction:null,
    sources:Array.isArray(meta.sources)?meta.sources:[],
    attachments:Array.isArray(meta.attachments)?meta.attachments.slice(0,3).map(x=>({path:String(x?.path||''),mime:String(x?.mime||''),name:String(x?.name||'Foto')})).filter(x=>x.path):[],
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
function scrollAssistantToLatest(force=false,wasNearBottom=null){
  const scroller=$('.assistant-scroll');if(!scroller)return;
  const near=wasNearBottom===null?(scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<140):wasNearBottom;
  if(force||near||!scroller.dataset.initialScroll){
    scroller.scrollTop=scroller.scrollHeight;
    scroller.dataset.initialScroll='1';
  }
}
function renderMessages(forceBottom=false){
  const box=$('#messages'),scroller=$('.assistant-scroll');
  state.messages=normalizeMessages(state.messages);
  syncOrbCompact();
  const nearBottom=scroller?scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<140:true;
  box.innerHTML=state.messages.map(m=>`<div class="message ${m.role}" data-message-id="${esc(m.id||'')}">${Array.isArray(m.attachments)&&m.attachments.length?`<div class="message-images">${m.attachments.map(a=>`<img data-chat-image-path="${esc(a.path||'')}" alt="${esc(a.name||'Foto')}">`).join('')}</div>`:''}<span class="message-text">${formatMessageText(m.text)}</span>${m.reaction?`<span class="reaction-chip">${esc(m.reaction)}</span>`:''}${Array.isArray(m.sources)&&m.sources.length?`<div class="message-sources">${m.sources.map(s=>`<a href="${/^https?:\/\//i.test(String(s.url||''))?esc(s.url):'#'}" target="_blank" rel="noopener">${esc(s.title||'Fuente')}</a>`).join('')}</div>`:''}${m.role==='assistant'&&Array.isArray(m.quickReplies)&&m.quickReplies.length?`<div class="message-quick-replies">${m.quickReplies.map((q,i)=>`<button data-quick-message="${esc(m.id||'')}" data-quick-index="${i}">${esc(q.label)}</button>`).join('')}</div>`:''}</div>`).join('');
  void hydrateChatImages();
  try{bindMessageReactions()}catch(err){console.warn('reaction binding failed',err)}
  document.querySelectorAll('[data-quick-message]').forEach(b=>b.onclick=()=>{
    const m=state.messages.find(x=>x.id===b.dataset.quickMessage),q=m?.quickReplies?.[Number(b.dataset.quickIndex)];
    if(!m||!q)return;
    m.quickReplies=[];save();renderMessages();
    handle(q.value);
  });
  setTimeout(()=>scrollAssistantToLatest(forceBottom,nearBottom),20);
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
}
function closeTextPicker(){
  document.querySelector('.message-text-picker-backdrop')?.remove();
  document.querySelector('.message-text-picker')?.remove();
  document.body.classList.remove('message-text-picker-open');
}
function segmentMessageText(text){
  const value=String(text||'');
  try{
    if(Intl?.Segmenter){
      const seg=new Intl.Segmenter(undefined,{granularity:'word'});
      return [...seg.segment(value)].map(x=>({text:x.segment,index:x.index,selectable:/\S/u.test(x.segment)}));
    }
  }catch{}
  const out=[];let m;
  const re=/\s+|[\p{L}\p{N}_]+|[^\s]/gu;
  while((m=re.exec(value)))out.push({text:m[0],index:m.index,selectable:/\S/u.test(m[0])});
  return out;
}
function openMessageTextPicker(id){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  closeReactionPicker();closeTextPicker();
  const text=String(m.text||''),segments=segmentMessageText(text);
  const backdrop=document.createElement('div');backdrop.className='message-text-picker-backdrop';
  const sheet=document.createElement('section');sheet.className='message-text-picker';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
  sheet.innerHTML=`<div class="message-text-picker-head"><div><div class="eyebrow">ISABELLA</div><div class="message-text-picker-title">Seleccionar</div></div><button class="round" data-picker-close aria-label="Cerrar">×</button></div>
    <div class="message-text-picker-help">Toca una palabra o emoji y arrastra para ampliar la selección.</div>
    <div class="message-token-area">${segments.map((s,i)=>s.selectable?`<span class="message-token" data-token-index="${i}">${esc(s.text)}</span>`:esc(s.text)).join('')}</div>
    <div class="message-text-picker-actions"><button class="secondary" data-picker-all>Todo</button><button class="primary" data-picker-copy disabled>Copiar selección</button></div>`;
  document.body.append(backdrop,sheet);document.body.classList.add('message-text-picker-open');
  let anchor=null,end=null,dragging=false;
  const tokens=[...sheet.querySelectorAll('[data-token-index]')],copy=sheet.querySelector('[data-picker-copy]');
  const selectedRange=()=>anchor===null||end===null?null:[Math.min(anchor,end),Math.max(anchor,end)];
  const update=()=>{
    const range=selectedRange();
    tokens.forEach(t=>{const i=Number(t.dataset.tokenIndex);t.classList.toggle('selected',!!range&&i>=range[0]&&i<=range[1])});
    copy.disabled=!range;
  };
  const tokenAtPoint=(x,y)=>document.elementFromPoint(x,y)?.closest?.('[data-token-index]');
  const area=sheet.querySelector('.message-token-area');
  area.addEventListener('pointerdown',e=>{
    const t=e.target.closest?.('[data-token-index]');if(!t)return;
    e.preventDefault();dragging=true;anchor=Number(t.dataset.tokenIndex);end=anchor;update();
    try{area.setPointerCapture?.(e.pointerId)}catch{}
  });
  area.addEventListener('pointermove',e=>{
    if(!dragging)return;e.preventDefault();
    const t=tokenAtPoint(e.clientX,e.clientY);if(t){end=Number(t.dataset.tokenIndex);update()}
  });
  const stop=()=>{dragging=false};
  area.addEventListener('pointerup',stop);area.addEventListener('pointercancel',stop);
  backdrop.onclick=closeTextPicker;sheet.querySelector('[data-picker-close]').onclick=closeTextPicker;
  sheet.querySelector('[data-picker-all]').onclick=()=>{const selectable=segments.map((s,i)=>s.selectable?i:null).filter(i=>i!==null);if(!selectable.length)return;anchor=selectable[0];end=selectable[selectable.length-1];update()};
  copy.onclick=async()=>{
    const range=selectedRange();if(!range)return;
    const start=segments[range[0]].index,last=segments[range[1]],selected=text.slice(start,last.index+last.text.length);
    try{await navigator.clipboard.writeText(selected)}
    catch{
      const ta=document.createElement('textarea');ta.value=selected;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch{}ta.remove();
    }
    copy.textContent='Copiado';setTimeout(closeTextPicker,260);
  };
}
function selectMessageText(id){openMessageTextPicker(id)}

async function copyMessageText(id){
  const m=state.messages.find(x=>x.id===id);if(!m)return;
  try{await navigator.clipboard.writeText(String(m.text||''))}
  catch{
    const ta=document.createElement('textarea');ta.value=String(m.text||'');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch{}ta.remove();
  }
  closeReactionPicker();
}
function positionReactionPopover(pop,menu,el){
  const r=el.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
  const w=Math.min(pop.offsetWidth||350,vw-24),left=Math.max(12,Math.min(vw-w-12,r.left+(r.width-w)/2));
  let top=r.top-(pop.offsetHeight||66)-14;if(top<12)top=Math.min(vh-(pop.offsetHeight||66)-12,r.bottom+12);
  pop.style.left=left+'px';pop.style.top=top+'px';
  const mw=Math.min(menu.offsetWidth||290,vw-32),mleft=Math.max(16,Math.min(vw-mw-16,el.classList.contains('user')?r.right-mw:r.left));
  let mtop=r.bottom+14;if(mtop+(menu.offsetHeight||110)>vh-16)mtop=Math.max(16,r.top-(menu.offsetHeight||110)-14);
  menu.style.left=mleft+'px';menu.style.top=mtop+'px';
}
function openReactionPicker(id){
  const m=state.messages.find(x=>x.id===id),el=document.querySelector(`.message[data-message-id="${CSS.escape(String(id))}"]`);if(!m||!el)return;
  closeReactionPicker();try{navigator.vibrate?.(10)}catch{}el.classList.add('reaction-target');
  const quick=['❤️','👍','👎','😂','‼️','❓'],more=['😮','😢','👏','🙌','😊','🥰','😍','🤩','🥳','🙂','😉','🤔','🫡','🙏','💡','🔥','✨','💯','✅','❌','👀','🤝','💪','🎉','⭐','🚀','📌','🧠','🏗️','📚'];
  const backdrop=document.createElement('div');backdrop.className='reaction-backdrop';
  const pop=document.createElement('div');pop.className='reaction-popover imessage-reactions';
  pop.innerHTML=`<div class="reaction-row">${quick.map(x=>`<button data-inline-reaction="${x}" class="${m.reaction===x?'selected':''}">${x}</button>`).join('')}<button class="reaction-more" aria-label="Más reacciones">＋</button></div><div class="reaction-row reaction-row-more is-hidden">${more.map(x=>`<button data-inline-reaction="${x}" class="${m.reaction===x?'selected':''}">${x}</button>`).join('')}</div>`;
  const menu=document.createElement('div');menu.className='message-action-menu';
  menu.innerHTML=`<button data-message-action="copy">Copiar</button><button data-message-action="select">Seleccionar texto</button>${m.reaction?'<button data-message-action="remove">Quitar reacción</button>':''}`;
  document.body.append(backdrop,pop,menu);requestAnimationFrame(()=>positionReactionPopover(pop,menu,el));
  backdrop.onclick=closeReactionPicker;
  pop.querySelectorAll('[data-inline-reaction]').forEach(b=>b.onclick=e=>{e.stopPropagation();applyReaction(id,b.dataset.inlineReaction||null)});
  pop.querySelector('.reaction-more')?.addEventListener('click',e=>{e.stopPropagation();const row=pop.querySelector('.reaction-row-more'),opening=row.classList.contains('is-hidden');row.classList.toggle('is-hidden',!opening);pop.classList.toggle('expanded',opening);requestAnimationFrame(()=>positionReactionPopover(pop,menu,el))});
  menu.querySelector('[data-message-action="copy"]')?.addEventListener('click',()=>copyMessageText(id));
  menu.querySelector('[data-message-action="select"]')?.addEventListener('click',()=>selectMessageText(id));
  menu.querySelector('[data-message-action="remove"]')?.addEventListener('click',()=>applyReaction(id,null));
}
function bindMessageReactions(){
  $$('#messages .message[data-message-id]').forEach(el=>{
    if(el.dataset.reactionBound)return;el.dataset.reactionBound='1';
    let timer=null,sx=0,sy=0,moved=false;
    const cancel=()=>{if(timer){clearTimeout(timer);timer=null}};
    el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;cancel();timer=setTimeout(()=>{timer=null;if(!moved)openReactionPicker(el.dataset.messageId)},430)},{passive:true});
    el.addEventListener('touchmove',e=>{if(e.touches.length!==1)return;const t=e.touches[0];if(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10){moved=true;cancel()}},{passive:true});
    el.addEventListener('touchend',cancel,{passive:true});
    el.addEventListener('touchcancel',cancel,{passive:true});
    el.addEventListener('contextmenu',e=>{e.preventDefault();openReactionPicker(el.dataset.messageId)});
    el.addEventListener('selectstart',e=>e.preventDefault());
    el.addEventListener('dblclick',e=>{if(getSelection()?.toString())return;e.preventDefault();openReactionPicker(el.dataset.messageId)});
    el.querySelector('.reaction-chip')?.addEventListener('click',e=>{e.stopPropagation();openReactionPicker(el.dataset.messageId)});
  });
}

function renderToday(){const d=today(),ev=state.events.filter(x=>x.date===d).sort((a,b)=>a.start.localeCompare(b.start)),ta=state.tasks.filter(x=>x.date===d&&activeTask(x));$('#todaySummary').textContent=`${ev.length} ${ev.length===1?'evento':'eventos'} · ${ta.length} ${ta.length===1?'tarea':'tareas'}`;$('#todayNext').textContent=ev[0]?`${ev[0].start} · ${ev[0].title}`:'Sin próxima cita'}
function orb(mode='idle',label=''){const o=$('#orbButton');if(!o)return;o.classList.remove('listening','thinking');if(mode!=='idle')o.classList.add(mode);const s=$('#orbStatus');if(s)s.textContent=label}
function localFallback(text){const n=text.toLowerCase();if(/qué tengo hoy|que tengo hoy|agenda de hoy/.test(n)){const d=today(),e=state.events.filter(x=>x.date===d),t=state.tasks.filter(x=>x.date===d&&activeTask(x));return `Hoy tienes ${e.length} ${e.length===1?'evento':'eventos'} y ${t.length} ${t.length===1?'tarea pendiente':'tareas pendientes'}.`}if(/calendario|agenda/.test(n)){show('calendar');return 'Te abro el calendario.'}return 'Te escucho. Para usar la IA, conecta la memoria desde el menú •••.'}
function rememberCandidates(items){for(const m of items||[]){if(!m?.content)continue;const exists=(state.memory||[]).some(x=>(typeof x==='object'?x.content:String(x))===m.content);if(!exists)state.memory.push({id:uid(),kind:normalizeMemoryKind(m.kind),content:m.content,confidence:Number(m.confidence??.7),status:'active',source:'ai',metadata:{}})}save()}
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
      const add_entities=$('#proposalFeedRows .feed-follow-row').map(row=>({name:row.querySelector('[data-follow-name]')?.value.trim()||'',type:row.querySelector('[data-follow-type]')?.value||'other',focus:row.querySelector('[data-follow-focus]')?.value.trim()||''})).filter(x=>x.name);
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
function confirmProposal(p){
  const reviewHint=p.kind==='routine'?'Puedes confirmar tal cual o corregir el contenido y el horario antes de guardarlo.':p.kind==='feed_preferences'?'Puedes revisar la constelación y los temas antes de modificar tu Feed.':p.kind==='assistant_preferences'?'Puedes revisar esta mejora antes de incorporarla al comportamiento de Isabella.':'Puedes confirmar tal cual o corregir nombre, fecha, hora, categoría o proyecto antes de guardarlo.';
  modal('Confirmar',`<div class="row"><div class="row-main"><b>${esc(proposalLabel(p))}</b><div class="small" style="margin-top:7px">${esc(reviewHint)}</div></div></div><div class="proposal-actions"><button id="proposalCancel" class="secondary">Cancelar</button><button id="proposalEdit" class="secondary">Corregir</button><button id="proposalConfirm" class="primary">Confirmar</button></div>`);
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
  if(p.kind==='routine'){createRoutineProposal(p);return}
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
async function handle(text,attachments=[]){
  const copy=(attachments||[]).map(x=>({path:x.path,mime:x.mime,name:x.name}));
  say('user',text||'📷 Foto',{attachments:copy});orb('thinking','Pensando…');
  try{
    if(window.ISABELLA_AI?.ask){
      const result=await window.ISABELLA_AI.ask(text||'Te envío esta imagen.',state,{attachments:copy});
      state.pendingIntent=null;
      if(result?.reply)say('assistant',result.reply,{sources:result.sources||[],quickReplies:result.quick_replies||[]});
      if(result?.question&&result.question!==result.reply)say('assistant',result.question,{quickReplies:result?.reply?[]:(result.quick_replies||[])});
      if(result?.memory_candidates?.length)rememberCandidates(result.memory_candidates);
      if(Array.isArray(result?.proposals)&&result.proposals.length){state.pendingIntent=null;save();confirmProposals(result.proposals)}
      else if(result?.proposal){state.pendingIntent=null;save();confirmProposal(result.proposal)}
      else save();
    }else say('assistant',localFallback(text));
  }catch(e){say('assistant',e?.message||localFallback(text))}
  finally{orb()}
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
  if(!imgs.length)return;
  const sb=window.MINDS_SUPABASE;if(!sb)return;
  try{
    const {data:{session}}=await sb.auth.getSession();if(!session)return;
    await Promise.all(imgs.map(async img=>{
      const path=img.dataset.chatImagePath;if(!path)return;
      const {data}=await sb.storage.from('isabella-uploads').createSignedUrl(path,3600);
      if(data?.signedUrl){img.src=data.signedUrl;img.dataset.loaded='1'}
    }));
  }catch{}
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
   const files=[...pendingChatFiles];pendingChatFiles=[];renderPendingChatFiles();i.value='';autosize();$('#sendButton').disabled=true;attachButton.disabled=true;
   try{const attachments=files.length?await uploadChatImages(files):[];await handle(t,attachments)}
   catch(e){say('assistant',e?.message||'No pude enviar la foto.')}
   finally{$('#sendButton').disabled=false;attachButton.disabled=false}
 };
 $('#sendButton').onclick=send;i.addEventListener('input',autosize);i.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});autosize();
 $$('.main-nav-item').forEach(b=>b.onclick=()=>show(b.dataset.nav));
 $('#refreshFeed').onclick=()=>renderFeed(true);
 $('#feedSettings').onclick=()=>feedPreferencesPanel();
 $('#refreshIdeas').onclick=()=>renderIdeas(true);
 $('#closeFeedDetail').onclick=closeFeedStory;
 const feedThreadInput=$('#feedThreadInput'),feedThreadForm=$('#feedThreadForm');
 const autosizeFeedThread=()=>{feedThreadInput.style.height='auto';feedThreadInput.style.height=Math.min(feedThreadInput.scrollHeight,132)+'px'};
 feedThreadInput.addEventListener('input',autosizeFeedThread);autosizeFeedThread();
 feedThreadInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();feedThreadForm.requestSubmit()}});
 feedThreadForm.onsubmit=e=>{e.preventDefault();const q=feedThreadInput.value.trim();if(!q)return;feedThreadInput.value='';autosizeFeedThread();submitFeedStoryQuestion(q)};
 $('#openSofiaButton').onclick=()=>openSofia();
 $('#todayCard').onclick=()=>{state.date=today();state.view='month';show('calendar')};$('#backButton').onclick=()=>show('assistant');$('#todayButton').onclick=()=>{state.date=today();save();renderCalendar()};$('#prevButton').onclick=()=>move(-1);$('#nextButton').onclick=()=>move(1);$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;save();renderCalendar()});$('#menuButton').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=closeModal;$$('[data-action]').forEach(b=>b.onclick=()=>{closeDrawer();action(b.dataset.action)});initVoice(); }
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
    h+=`<div class="wday"><div class="whead">${d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'})}</div>${ev.map(e=>`<button class="witem calendar-entry event-item" data-kind="event" data-id="${e.id}" data-date="${e.date}" style="--item-color:${itemColor(e)}"><b>${esc(e.start)}</b><br>${esc(e.title)}</button>`).join('')}${ta.map(t=>`<button class="witem calendar-entry task-item ${t.done?'task-done':''}" data-kind="task" data-id="${t.id}" data-date="${t.date}" style="--item-color:${itemColor(t)}">${t.done?'✓':'○'} ${esc(t.title)}</button>`).join('')}${!ev.length&&!ta.length?'<div class="meta week-free">Libre</div>':''}</div>`;
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
  $('.calendar-entry,.agenda-item[data-kind]').forEach(el=>{
    if(el.dataset.bound)return;el.dataset.bound='1';
    let sx=0,sy=0,moved=false;
    el.addEventListener('touchstart',e=>{if(e.target.closest('.task-check'))return;if(e.touches.length!==1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;moved=false;e.stopPropagation()},{passive:true});
    el.addEventListener('touchmove',e=>{const t=e.touches[0];if(Math.abs(t.clientX-sx)>12||Math.abs(t.clientY-sy)>12)moved=true;e.stopPropagation()},{passive:true});
    el.addEventListener('touchend',e=>{if(e.target.closest('.task-check'))return;const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;e.stopPropagation();if(el.dataset.dragActive==='1'||el.dataset.justDragged==='1'){el.dataset.justDragged='0';return}if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx>0&&el.dataset.kind==='task')toggleTaskDone(el.dataset.id);else if(dx<0)itemActions(el.dataset.kind,el.dataset.id);return}if(!moved&&!el.closest('.drag-handle'))editItem(el.dataset.kind,el.dataset.id)},{passive:true});
    el.addEventListener('click',e=>{if(e.detail===0||'ontouchstart' in window)return;if(e.target.closest('.drag-handle,.task-check'))return;editItem(el.dataset.kind,el.dataset.id)});
  });
  initTaskDrag();
  initEventDrag();
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
    else {item.reminderTime=item.date?($('#editReminder').value||null):null;if(item.sortOrder==null)item.sortOrder=nextTaskOrder(item.date)}
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
function openDrawer(){$('#drawer').classList.remove('hidden');$('#drawerBackdrop').classList.remove('hidden')}function closeDrawer(){$('#drawer').classList.add('hidden');$('#drawerBackdrop').classList.add('hidden')}function modal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modal').classList.remove('hidden');$('#modalBackdrop').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden');$('#modalBackdrop').classList.add('hidden')}
function action(a){if(a==='tasks')tasksPanel();if(a==='new')newPanel();if(a==='memory')memoryPanel();if(a==='assistantprefs')assistantPreferencesPanel();if(a==='routines')routinesPanel();if(a==='skills')skillsPanel();if(a==='feedprefs')feedPreferencesPanel();if(a==='categories')categoriesPanel()}
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
function assistantPreferencesPanel(){
  const prefs={...base.assistantPreferences,...(state.assistantPreferences||{})};
  const rules=[...(prefs.behaviorRules||[])];
  modal('Proactividad de Isabella',`<div class="form assistant-preferences">
    <label class="settings-check"><input id="curiosityEnabled" type="checkbox" ${prefs.curiosityEnabled!==false?'checked':''}><span>Hacerme preguntas ocasionales para conocerme mejor</span></label>
    <label>Frecuencia máxima<select id="curiosityCadence"><option value="24" ${Number(prefs.curiosityCadenceHours)<=24?'selected':''}>Aproximadamente una al día</option><option value="30" ${Number(prefs.curiosityCadenceHours)>24&&Number(prefs.curiosityCadenceHours)<48?'selected':''}>Cada 1–2 días</option><option value="72" ${Number(prefs.curiosityCadenceHours)>=48?'selected':''}>Unas dos por semana</option></select></label>
    <div><div class="small section-label">Mejoras de comportamiento adoptadas</div><div id="assistantRuleRows">${rules.length?rules.map((r,i)=>`<div class="assistant-rule-row"><span>${esc(r)}</span><button data-rule-remove="${i}" aria-label="Eliminar">×</button></div>`).join(''):'<div class="small empty-panel">Todavía no has adoptado reglas adicionales.</div>'}</div></div>
    <button id="saveAssistantPreferences" class="primary">Guardar</button>
  </div>`);
  document.querySelectorAll('[data-rule-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.ruleRemove);state.assistantPreferences={...prefs,behaviorRules:rules.filter((_,idx)=>idx!==i)};save();assistantPreferencesPanel()});
  $('#saveAssistantPreferences').onclick=()=>{state.assistantPreferences={...prefs,curiosityEnabled:$('#curiosityEnabled').checked,curiosityCadenceHours:Number($('#curiosityCadence').value||30),behaviorRules:state.assistantPreferences?.behaviorRules||rules};save();closeModal()};
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
async function skillsPanel(){
  modal('Habilidades','<div class="small">Cargando habilidades…</div>');
  try{
    const items=await window.ISABELLA_AI?.listSkills?.();
    const list=Array.isArray(items)?items:[];
    const body=list.length?list.map(s=>`<div class="skill-row"><div class="row-main"><b>${esc(s.name)}</b><div class="small" style="margin-top:5px">${esc(s.description)}</div><div class="skill-meta">v${Number(s.version||1)} · ${esc((s.preferred_tools||[]).join(' · '))}</div></div></div>`).join(''):'<div class="small">Todavía no hay habilidades activas.</div>';
    modal('Habilidades',body);
  }catch{
    modal('Habilidades','<div class="small">No pude cargar las habilidades ahora mismo.</div>');
  }
}
async function memoryPanel(){
  const items=(state.memory||[]).filter(m=>typeof m!=='object'||m.status!=='deleted');
  let claims=[];
  try{
    const sb=window.MINDS_SUPABASE,{data:{session}}=await sb.auth.getSession();
    if(session){
      const {data}=await sb.from('isabella_model_claims').select('id,claim_type,claim,status,confidence,source_type,last_seen_at').in('status',['confirmed','hypothesis']).order('status',{ascending:true}).order('confidence',{ascending:false}).limit(60);
      claims=data||[];
    }
  }catch{}
  const modelHtml=claims.length?claims.map(c=>`<div class="model-claim-row ${esc(c.status)}"><div class="row-main"><div>${esc(c.claim)}</div><div class="small">${c.status==='confirmed'?'Confirmado':'Hipótesis'} · ${esc(c.claim_type)} · ${Math.round(Number(c.confidence||0)*100)}%</div></div><div class="model-claim-actions">${c.status==='hypothesis'?`<button data-model-confirm="${esc(c.id)}">Confirmar</button><button data-model-reject="${esc(c.id)}">No</button>`:''}<button data-model-correct="${esc(c.id)}" data-model-text="${esc(c.claim)}">Corregir</button></div></div>`).join(''):'<div class="small">Todavía no hay hipótesis estructuradas sobre ti.</div>';
  const memoryHtml=items.length?items.map((m,i)=>{
    const text=typeof m==='object'?m.content:String(m),kind=typeof m==='object'?(m.kind||'context'):'context';
    const id=typeof m==='object'?(m.id||String(i)):String(i);
    return `<div class="memory-row"><div class="row-main"><div>${esc(text)}</div><div class="small">${esc(kind)}</div></div><button data-memory-edit="${esc(id)}">Editar</button><button data-memory-delete="${esc(id)}">×</button></div>`;
  }).join(''):'<div class="small">Todavía no he guardado memoria personal.</div>';
  modal('Lo que Isabella sabe de mí',`<div class="small section-label">Modelo personal</div><div class="personal-model-list">${modelHtml}</div><div class="small section-label memory-section-title">Memoria explícita</div>${memoryHtml}`);
  document.querySelectorAll('[data-model-confirm]').forEach(b=>b.onclick=()=>void setModelClaimStatus(b.dataset.modelConfirm,'confirmed'));
  document.querySelectorAll('[data-model-reject]').forEach(b=>b.onclick=()=>void setModelClaimStatus(b.dataset.modelReject,'contradicted'));
  document.querySelectorAll('[data-model-correct]').forEach(b=>b.onclick=()=>correctModelClaim(b.dataset.modelCorrect,b.dataset.modelText||''));
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
  const prefs=state.feedPreferences||base.feedPreferences;
  const standard=['Clima','Noticias','Arquitectura','Arte','Diseño','Cultura','Inteligencia artificial','Ciencia','Tecnología','Mundo','Alemania','Proyectos','Familia','Readings'];
  const selected=new Set(prefs.topics||[]),graph=Array.isArray(prefs.followGraph)?prefs.followGraph:[];
  modal('Curar mi Feed',`<div class="form feed-preferences">
    <label>Temas base<div class="topic-grid">${standard.map(t=>`<label class="topic-choice"><input type="checkbox" value="${esc(t)}" ${selected.has(t)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div></label>
    <label>Otros temas que quieres seguir<input id="feedCustomTopics" value="${esc((prefs.customTopics||[]).join(', '))}" placeholder="Ej. vivienda colectiva, fotografía, literatura japonesa"></label>
    <div class="feed-follow-editor"><div class="feed-follow-editor-title">Tu constelación</div><div class="small">No solo a quién sigues, sino qué te interesa de cada uno.</div><div id="feedFollowRows">${graph.map(feedFollowRow).join('')}</div><button id="addFeedFollow" type="button" class="secondary">+ Seguir algo</button></div>
    <label>Instrucciones para tu Feed<textarea id="feedInstructions" rows="4" placeholder="Ej. prioriza arquitectura y arte; evita noticias repetidas; dame contexto, no titulares.">${esc(prefs.instructions||'')}</textarea></label>
    <label>Lugar habitual para el clima <span class="small">(opcional; si queda vacío Isabella usa solo contexto que ya conozca)</span><input id="weatherLocation" value="${esc(prefs.weatherLocation||'')}" placeholder="Ciudad o localidad"></label>
    <button id="saveFeedPreferences" class="primary">Guardar</button>
  </div>`);
  const bindRemove=()=>$$('#feedFollowRows [data-follow-remove]').forEach(b=>b.onclick=()=>b.closest('.feed-follow-row')?.remove());bindRemove();
  $('#addFeedFollow').onclick=()=>{$('#feedFollowRows').insertAdjacentHTML('beforeend',feedFollowRow({}));bindRemove()};
  $('#saveFeedPreferences').onclick=()=>{
    const split=v=>String(v||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,40);
    const followGraph=$$('#feedFollowRows .feed-follow-row').map(row=>({id:row.dataset.followId||uid(),name:row.querySelector('[data-follow-name]')?.value.trim()||'',type:row.querySelector('[data-follow-type]')?.value||'other',focus:row.querySelector('[data-follow-focus]')?.value.trim()||'',active:true})).filter(x=>x.name).slice(0,60);
    state.feedPreferences={instructions:$('#feedInstructions').value.trim(),weatherLocation:$('#weatherLocation').value.trim(),topics:$$('.topic-choice input:checked').map(x=>x.value),customTopics:split($('#feedCustomTopics').value),followGraph,following:followGraph.map(x=>x.name)};
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