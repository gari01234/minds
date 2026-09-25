/* MINDS - Theory v0.10 — Supabase-backed autobiographical memory.
   Supabase is the source of truth once authenticated; localStorage remains a cache/offline bridge. */
(() => {
  const sb = window.MINDS_SUPABASE;
  const APP_SCOPE = 'theory';
  const convScope = window.MINDS_CONVERSATION_SCOPE;
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const sameJSON = (a,b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };
  const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||''));
  const remoteUuid = id => isUuid(id) ? id : crypto.randomUUID();
  const now = () => new Date().toISOString();
  const KEYS = {
    readingAnnotations:'theorylab_v05_annotations',
    mindAnnotations:'minds_theory_v08_mind_annotations',
    conversations:convScope.theoryKey,
    threadState:'minds_theory_v09_thread_state',
    readingReturns:'minds_theory_v08_reading_returns'
  };
  const WATCHED = new Set(Object.values(KEYS));

  document.title = 'MINDS - Readings · v0.10.1';
  const sub = document.querySelector('.sub');
  if (sub) sub.textContent = '';

  const state = {
    session:null,
    user:null,
    ready:false,
    syncing:false,
    hydrating:false,
    migrationPending:false,
    bootstrapping:false,
    lastError:null,
    dirty:new Set(),
    syncTimer:null,
    docsByKey:new Map(),
    docKeyById:new Map(),
    threadsBySlug:new Map(),
    threadSlugById:new Map()
  };

  // ---------- auth / status UI ----------
  const header = document.querySelector('header');
  const globalActions = document.querySelector('.v09-global-actions');
  const authButton = document.createElement('button');
  authButton.className = 'v10-auth-button';
  authButton.innerHTML = '<span class="v10-dot"></span><span>Conectar memoria</span>';
  (globalActions || header)?.appendChild(authButton);

  const dialog = document.createElement('dialog');
  dialog.className = 'v10-auth-dialog';
  dialog.innerHTML = '<div class="v10-auth-card"></div>';
  document.body.appendChild(dialog);
  const card = $('.v10-auth-card', dialog);

  function setAuthButton(mode, label){
    authButton.classList.remove('synced','pending','error');
    if(mode) authButton.classList.add(mode);
    const labelEl = authButton.querySelector('span:last-child');
    if(labelEl) labelEl.textContent = label;
  }

  function message(text, kind=''){
    const el = $('.v10-auth-message', dialog);
    if(!el) return;
    el.className = 'v10-auth-message' + (kind ? ' '+kind : '');
    el.textContent = text;
  }

  function renderAuthDialog(){
    if(!card) return;
    if(!sb){
      card.innerHTML = '<div class="v10-auth-head"><div><div class="v09-overline">MEMORIA</div><h2>Supabase no está disponible.</h2></div><button class="v10-auth-close">×</button></div><p>MINDS sigue funcionando en modo local. Revisa la conexión a internet o la carga del cliente de Supabase.</p>';
      $('.v10-auth-close',card).onclick=()=>dialog.close();
      return;
    }
    if(!state.user){
      card.innerHTML = '<div class="v10-auth-head"><div><div class="v09-overline">MEMORIA PERSISTENTE</div><h2>Conectar este cerebro.</h2></div><button class="v10-auth-close">×</button></div><p>Inicia sesión por correo para que subrayados, notas, conversaciones y estado de MINDS puedan seguirte entre ordenador y móvil.</p><form class="v10-auth-form"><input type="email" autocomplete="email" required placeholder="tu@email.com"><button>Enviar enlace</button></form><div class="v10-auth-message">Recibirás un enlace seguro de acceso. No usamos contraseña en esta versión.</div>';
      $('.v10-auth-close',card).onclick=()=>dialog.close();
      $('.v10-auth-form',card).onsubmit = async e => {
        e.preventDefault();
        const email = $('input', e.currentTarget).value.trim();
        if(!email) return;
        message('Enviando enlace…');
        const redirectTo = location.origin + location.pathname;
        const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:redirectTo } });
        if(error){ message(error.message || 'No se pudo enviar el enlace.', 'error'); return; }
        message('Enlace enviado. Abre el correo en este dispositivo y vuelve a MINDS.', 'ok');
      };
      return;
    }
    const migration = state.migrationPending ? '<div class="v10-migration"><h3>Memoria local encontrada</h3><p>Este navegador contiene subrayados, notas, conversaciones o elementos guardados que todavía no existen en Supabase.</p><button class="v10-auth-primary" data-migrate>Migrar a MINDS</button></div>' : '';
    card.innerHTML = '<div class="v10-auth-head"><div><div class="v09-overline">MEMORIA PERSISTENTE</div><h2>MINDS está conectado.</h2></div><button class="v10-auth-close">×</button></div><div class="v10-auth-state"><b>'+esc(state.user.email||'Usuario')+'</b><span>'+ (state.ready ? 'Supabase es la fuente de verdad; este navegador mantiene una copia local.' : 'Preparando la memoria…') +'</span></div>'+migration+'<div class="v10-auth-actions"><button class="v10-auth-primary" data-sync>Sincronizar ahora</button><button class="v10-auth-secondary" data-signout>Cerrar sesión</button></div><div class="v10-auth-message '+(state.lastError?'error':state.ready?'ok':'')+'">'+esc(state.lastError || (state.ready ? 'Memoria sincronizada.' : 'Conectando…'))+'</div>';
    $('.v10-auth-close',card).onclick=()=>dialog.close();
    $('[data-sync]',card).onclick=()=>fullSync({manual:true});
    $('[data-signout]',card).onclick=()=>sb.auth.signOut();
    $('[data-migrate]',card)?.addEventListener('click', async () => {
      message('Migrando memoria local…');
      try{
        await pushAllLocal({mergeOnly:false});
        await recordMigrationEvent();
        state.migrationPending=false;
        state.ready=true;
        await pullAllRemote({reloadIfChanged:false});
        updateStatus('synced');
        renderAuthDialog();
      }catch(err){
        setError(err);
        renderAuthDialog();
      }
    });
  }

  authButton.onclick = () => { renderAuthDialog(); dialog.showModal(); };
  dialog.addEventListener('click', e => { if(e.target===dialog) dialog.close(); });

  function updateStatus(mode=''){
    if(!sb){ setAuthButton('error','Memoria local'); return; }
    if(!state.user){ setAuthButton('', 'Conectar memoria'); return; }
    if(mode==='syncing' || state.syncing){ setAuthButton('pending','Sincronizando…'); return; }
    if(state.lastError){ setAuthButton('error','Revisar memoria'); return; }
    if(state.migrationPending){ setAuthButton('pending','Migrar memoria'); return; }
    if(state.ready){ setAuthButton('synced','Memoria sincronizada'); return; }
    setAuthButton('pending','Conectando…');
  }
  function setError(err){
    state.lastError = err?.message || String(err || 'Error de sincronización');
    console.error('[MINDS persistence]', err);
    updateStatus('error');
  }

  // ---------- static corpus / identity maps ----------
  function readingDefinitions(){
    try { return (typeof readings !== 'undefined' && Array.isArray(readings)) ? readings : []; }
    catch { return []; }
  }
  function readingInfoByDoc(){
    const out = new Map();
    const defs = readingDefinitions();
    const corpus = window.CORPUS;
    if(!corpus?.readings) return out;
    Object.entries(corpus.readings).forEach(([readingId,docIds])=>{
      const def = defs.find(r=>r.id===readingId);
      (docIds||[]).forEach(docId=>out.set(docId,{readingId,author:def?.author||null,title:def?.title||null}));
    });
    return out;
  }
  function firstDocForReading(readingId){
    return window.CORPUS?.readings?.[readingId]?.[0] || null;
  }

  async function seedDocuments(){
    const corpus = window.CORPUS;
    if(!corpus?.docs || !state.user) return;
    const info = readingInfoByDoc();
    const rows = Object.values(corpus.docs).map(d=>{
      const ri = info.get(d.id);
      const isUser = String(d.role||'').toLowerCase().includes('tus palabras');
      return {
        user_id:state.user.id,
        external_key:d.id,
        kind:isUser?'user_feedback':'reading',
        title:d.label || d.id,
        author:ri?.author || null,
        language:'es',
        source_class:isUser?'user_feedback':'assistant_analysis_recovered',
        source_date:/^\d{4}-\d{2}-\d{2}$/.test(d.date||'')?d.date:null,
        content:d.text || '',
        partial:!!d.partial,
        metadata:{turn:d.turn||null,role:d.role||null,reading_id:ri?.readingId||null}
      };
    });
    if(rows.length){
      const {error}=await sb.from('documents').upsert(rows,{onConflict:'user_id,external_key'});
      if(error) throw error;
    }
    const {data,error}=await sb.from('documents').select('id,external_key');
    if(error) throw error;
    state.docsByKey.clear(); state.docKeyById.clear();
    (data||[]).forEach(r=>{ if(r.external_key){state.docsByKey.set(r.external_key,r.id);state.docKeyById.set(r.id,r.external_key);} });
  }

  async function seedThreads(){
    if(!state.user) return;
    const snapshot = window.MINDS_V09?.snapshot?.() || [];
    if(!snapshot.length) return;
    const rows = snapshot.map(t=>({
      user_id:state.user.id,
      slug:t.slug,
      title:t.title,
      description:t.description||null,
      metadata:{sources:t.sources||[],connections:t.connections||[],prototype:'v0.9.1'}
    }));
    const {error:upErr}=await sb.from('mind_threads').upsert(rows,{onConflict:'user_id,slug'});
    if(upErr) throw upErr;
    const {data:threads,error}=await sb.from('mind_threads').select('id,slug');
    if(error) throw error;
    state.threadsBySlug.clear(); state.threadSlugById.clear();
    (threads||[]).forEach(r=>{state.threadsBySlug.set(r.slug,r.id);state.threadSlugById.set(r.id,r.slug);});

    const {data:versions,error:vErr}=await sb.from('mind_thread_versions').select('thread_id,version_number');
    if(vErr) throw vErr;
    const versioned = new Set((versions||[]).map(v=>v.thread_id));
    const versionRows=[];
    for(const t of snapshot){
      const threadId=state.threadsBySlug.get(t.slug);
      if(!threadId || versioned.has(threadId)) continue;
      const evo=Array.isArray(t.evolution)?t.evolution:[];
      if(evo.length){
        evo.forEach((e,i)=>{
          const isLast=i===evo.length-1;
          versionRows.push({
            user_id:state.user.id,
            thread_id:threadId,
            version_number:i+1,
            body:isLast && t.body ? t.body : (e.text||t.body||''),
            change_summary:e.label||null,
            epistemic_status:isLast?(t.epistemicStatus||'provisional'):'provisional',
            origin_kind:'import',
            provenance:[{source:'prototype_v09',original_date:e.date||null}]
          });
        });
      }else{
        versionRows.push({
          user_id:state.user.id,thread_id:threadId,version_number:1,
          body:t.body||t.description||'',epistemic_status:t.epistemicStatus||'provisional',
          origin_kind:'import',provenance:[{source:'prototype_v09'}]
        });
      }
    }
    if(versionRows.length){
      const {error}=await sb.from('mind_thread_versions').insert(versionRows);
      if(error) throw error;
    }

    const {data:events,error:eErr}=await sb.from('mind_thread_events').select('thread_id,event_type');
    if(eErr) throw eErr;
    const evented=new Set((events||[]).map(e=>e.thread_id));
    const eventRows=[];
    snapshot.forEach(t=>{
      const threadId=state.threadsBySlug.get(t.slug);
      if(!threadId || evented.has(threadId)) return;
      eventRows.push({user_id:state.user.id,thread_id:threadId,event_type:'created',reason:'Importado desde MINDS v0.9.1',source_refs:[{kind:'prototype',id:'v0.9.1'}]});
      eventRows.push({user_id:state.user.id,thread_id:threadId,event_type:t.active?'activated':'deactivated',reason:t.active?'Cerca al iniciar la memoria persistente':'Importado como memoria latente',source_refs:[]});
      if(t.pinned) eventRows.push({user_id:state.user.id,thread_id:threadId,event_type:'pinned',reason:'Fijado en la memoria local',source_refs:[]});
    });
    if(eventRows.length){
      const {error}=await sb.from('mind_thread_events').insert(eventRows);
      if(error) throw error;
    }
  }

  async function ensureStaticMemory(){
    await seedDocuments();
    await seedThreads();
  }

  // ---------- local memory detection ----------
  function localMemorySummary(){
    const reading = readJSON(KEYS.readingAnnotations,[]);
    const mind = readJSON(KEYS.mindAnnotations,[]);
    const conv = readJSON(KEYS.conversations,[]).filter(c=>(c?.messages||[]).length);
    const returns = readJSON(KEYS.readingReturns,[]);
    const pins = readJSON(KEYS.threadState,{pins:[]})?.pins||[];
    return {reading:reading.length,mind:mind.length,conversations:conv.length,returns:returns.length,pins:pins.length};
  }
  function hasLocalMemory(){
    const s=localMemorySummary();
    return Object.values(s).some(n=>n>0);
  }
  async function hasRemoteMemory(){
    const checks = await Promise.all([
      sb.from('annotations').select('id',{count:'exact',head:true}),
      sb.from('mind_annotations').select('id',{count:'exact',head:true}),
      sb.from('conversations').select('id',{count:'exact',head:true}).eq('app_scope',APP_SCOPE),
      sb.from('reading_state').select('document_id',{count:'exact',head:true})
    ]);
    const err=checks.find(x=>x.error)?.error;if(err) throw err;
    return checks.some(x=>(x.count||0)>0);
  }

  // ---------- reading annotations ----------
  async function pushReadingAnnotations({mirrorDeletes=true}={}){
    const local=readJSON(KEYS.readingAnnotations,[]);
    const valid=local.filter(a=>a?.segments?.[0]?.doc && state.docsByKey.has(a.segments[0].doc));
    const rows=valid.map(a=>({
      id:remoteUuid(a.id),user_id:state.user.id,document_id:state.docsByKey.get(a.segments[0].doc),
      kind:(a.note||'').trim()?'note':'highlight',quote:a.quote||'',note:a.note||'',
      selectors:{segments:a.segments||[]},
      metadata:{reading_id:a.reading||null,origin:a.origin||null,local_id:a.id},
      created_at:a.created||now(),updated_at:a.updated||a.created||now()
    }));
    if(rows.length){const {error}=await sb.from('annotations').upsert(rows);if(error)throw error;}
    if(mirrorDeletes){
      const {data,error}=await sb.from('annotations').select('id');if(error)throw error;
      const keep=new Set(rows.map(r=>r.id)),remove=(data||[]).map(r=>r.id).filter(id=>!keep.has(id));
      if(remove.length){const {error:dErr}=await sb.from('annotations').delete().in('id',remove);if(dErr)throw dErr;}
    }
  }
  async function pullReadingAnnotations(){
    const {data,error}=await sb.from('annotations').select('*').order('created_at',{ascending:true});if(error)throw error;
    return (data||[]).map(a=>({
      id:a.id,
      segments:a.selectors?.segments||[],
      quote:a.quote||'',note:a.note||'',created:a.created_at,updated:a.updated_at,
      reading:a.metadata?.reading_id||null,origin:a.metadata?.origin||null
    })).filter(a=>a.segments.length);
  }

  // ---------- MINDS annotations ----------
  async function pushMindAnnotations({mirrorDeletes=true}={}){
    const local=readJSON(KEYS.mindAnnotations,[]);
    const valid=local.filter(a=>state.threadsBySlug.has(a.threadId));
    const rows=valid.map(a=>({
      id:remoteUuid(a.id),user_id:state.user.id,thread_id:state.threadsBySlug.get(a.threadId),
      quote:a.quote||'',note:a.note||'',selectors:{segments:a.segments||[]},
      metadata:{local_id:a.id,thread_slug:a.threadId},
      created_at:a.created||now(),updated_at:a.updated||a.created||now()
    }));
    if(rows.length){const {error}=await sb.from('mind_annotations').upsert(rows);if(error)throw error;}
    if(mirrorDeletes){
      const {data,error}=await sb.from('mind_annotations').select('id');if(error)throw error;
      const keep=new Set(rows.map(r=>r.id)),remove=(data||[]).map(r=>r.id).filter(id=>!keep.has(id));
      if(remove.length){const {error:dErr}=await sb.from('mind_annotations').delete().in('id',remove);if(dErr)throw dErr;}
    }
  }
  async function pullMindAnnotations(){
    const {data,error}=await sb.from('mind_annotations').select('*').order('created_at',{ascending:true});if(error)throw error;
    return (data||[]).map(a=>({
      id:a.id,
      threadId:a.metadata?.thread_slug||state.threadSlugById.get(a.thread_id),
      segments:a.selectors?.segments||[],quote:a.quote||'',note:a.note||'',
      created:a.created_at,updated:a.updated_at
    })).filter(a=>a.threadId);
  }

  // ---------- conversations ----------
  function resolveOriginDocument(origin){
    if(!origin || origin.type!=='reading') return null;
    const anchorDoc=origin.anchor?.doc;
    if(anchorDoc && state.docsByKey.has(anchorDoc)) return state.docsByKey.get(anchorDoc);
    const readingId=origin.readingId||origin.id;
    const first=firstDocForReading(readingId);
    return first?state.docsByKey.get(first)||null:null;
  }
  async function pushConversations(){
    const local=convScope.readTheoryCache().filter(convScope.isTheory);
    for(const c of local){
      const remoteId=remoteUuid(c.id);
      const origin=c.origin||{type:'global',id:'global',label:'Pregunta global'};
      let originKind=origin.type==='mind'?'mind':origin.type==='reading'?'reading':'global';
      let originThreadId=originKind==='mind'?state.threadsBySlug.get(origin.id)||null:null;
      let originDocumentId=originKind==='reading'?resolveOriginDocument(origin):null;
      // Older local conversations may not have a resolvable reading/thread id.
      // Preserve them as global conversations while retaining the full original
      // context in origin_anchor instead of dropping autobiographical memory.
      if(originKind==='reading'&&!originDocumentId) originKind='global';
      if(originKind==='mind'&&!originThreadId) originKind='global';
      if(originKind==='global'){originThreadId=null;originDocumentId=null;}
      const row={
        id:remoteId,user_id:state.user.id,app_scope:APP_SCOPE,origin_kind:originKind,
        origin_thread_id:originThreadId,
        origin_document_id:originDocumentId,
        origin_anchor:origin,title:c.title||'Nueva conversación',mode:c.mode==='outside'?'outside':'memory',
        metadata:{app:APP_SCOPE,local_id:c.id||null},created_at:c.created||now(),updated_at:c.updated||c.created||now()
      };
      const {error}=await sb.from('conversations').upsert(row);if(error)throw error;
      const messages=(c.messages||[]).map((m,i)=>({
        user_id:state.user.id,conversation_id:remoteId,
        client_key:String(i).padStart(6,'0')+':'+String(m.at||''),
        role:m.role==='assistant'?'assistant':m.role==='system'?'system':'user',
        content:m.text||'',model:m.model||null,provisional:!!m.provisional,
        citations:m.citations||[],metadata:{quote:m.quote||null},
        created_at:m.at||now()
      }));
      if(messages.length){
        const {error:mErr}=await sb.from('conversation_messages').upsert(messages,{onConflict:'user_id,conversation_id,client_key',ignoreDuplicates:true});
        if(mErr)throw mErr;
      }
    }
  }
  async function pullConversations(){
    const [{data:convs,error:cErr},{data:msgs,error:mErr}] = await Promise.all([
      sb.from('conversations').select('*').eq('app_scope',APP_SCOPE).order('updated_at',{ascending:false}),
      sb.from('conversation_messages').select('*,conversations!inner(app_scope)').eq('conversations.app_scope',APP_SCOPE).order('created_at',{ascending:true})
    ]);
    if(cErr)throw cErr;if(mErr)throw mErr;
    const byConv=new Map();
    (msgs||[]).forEach(m=>{if(!byConv.has(m.conversation_id))byConv.set(m.conversation_id,[]);byConv.get(m.conversation_id).push({
      role:m.role,text:m.content,at:m.created_at,provisional:!!m.provisional,quote:m.metadata?.quote||'',model:m.model||undefined,citations:m.citations||[]
    });});
    return (convs||[]).map(c=>({
      id:c.id,
      origin:c.origin_anchor&&Object.keys(c.origin_anchor).length?c.origin_anchor:{
        type:c.origin_kind,id:c.origin_kind==='mind'?state.threadSlugById.get(c.origin_thread_id):'global',
        label:c.origin_kind==='global'?'Pregunta global':c.origin_kind==='mind'?'MINDS':'Lectura'
      },
      mode:c.mode,title:c.title,created:c.created_at,updated:c.updated_at,messages:byConv.get(c.id)||[]
    }));
  }

  // ---------- reading return state ----------
  async function pushReadingReturns(){
    const returns=new Set(readJSON(KEYS.readingReturns,[]));
    const corpus=window.CORPUS;
    const rows=[];
    Object.keys(corpus?.readings||{}).forEach(readingId=>{
      const docKey=firstDocForReading(readingId),docId=state.docsByKey.get(docKey);
      if(!docId)return;
      rows.push({user_id:state.user.id,document_id:docId,return_later:returns.has(readingId),metadata:{reading_id:readingId}});
    });
    if(rows.length){const {error}=await sb.from('reading_state').upsert(rows,{onConflict:'user_id,document_id'});if(error)throw error;}
  }
  async function pullReadingReturns(){
    const {data,error}=await sb.from('reading_state').select('document_id,return_later,metadata');if(error)throw error;
    return (data||[]).filter(r=>r.return_later).map(r=>r.metadata?.reading_id).filter(Boolean).sort();
  }

  // ---------- pinned / live thread state ----------
  async function pushThreadPins(){
    const local=readJSON(KEYS.threadState,{pins:[]});
    const desired=new Set(local?.pins||[]);
    const {data,error}=await sb.from('mind_thread_current_state').select('id,slug,is_pinned');if(error)throw error;
    const rows=[];
    (data||[]).forEach(r=>{
      const want=desired.has(r.slug);
      if(!!r.is_pinned===want)return;
      rows.push({user_id:state.user.id,thread_id:r.id,event_type:want?'pinned':'unpinned',reason:'Sincronizado desde la interfaz v0.10'});
    });
    if(rows.length){const {error:iErr}=await sb.from('mind_thread_events').insert(rows);if(iErr)throw iErr;}
  }
  async function pullThreadPins(){
    const {data,error}=await sb.from('mind_thread_current_state').select('slug,is_pinned');if(error)throw error;
    return (data||[]).filter(r=>r.is_pinned).map(r=>r.slug).sort();
  }

  // ---------- push / pull orchestration ----------
  async function pushAllLocal({mergeOnly=false}={}){
    await ensureStaticMemory();
    await pushReadingAnnotations({mirrorDeletes:!mergeOnly});
    await pushMindAnnotations({mirrorDeletes:!mergeOnly});
    await pushConversations();
    if(!mergeOnly){
      await pushReadingReturns();
      await pushThreadPins();
    }
  }

  function writeLocal(key,value){
    const current=readJSON(key,null);
    if(sameJSON(current,value))return false;
    state.hydrating=true;
    try{localStorage.setItem(key,JSON.stringify(value));}
    finally{state.hydrating=false;}
    return true;
  }

  async function pullAllRemote({reloadIfChanged=true}={}){
    await ensureStaticMemory();
    const [readingAnns,mindAnns,convs,returns,pins]=await Promise.all([
      pullReadingAnnotations(),pullMindAnnotations(),pullConversations(),pullReadingReturns(),pullThreadPins()
    ]);
    let changed=false;
    changed=writeLocal(KEYS.readingAnnotations,readingAnns)||changed;
    changed=writeLocal(KEYS.mindAnnotations,mindAnns)||changed;
    changed=writeLocal(KEYS.conversations,convs)||changed;
    changed=writeLocal(KEYS.readingReturns,returns)||changed;
    const threadState=readJSON(KEYS.threadState,{pins:[],lastOpened:{}});
    changed=writeLocal(KEYS.threadState,{...threadState,pins})||changed;
    if(changed&&reloadIfChanged){
      sessionStorage.setItem('minds_v10_hydrated_user',state.user.id);
      setTimeout(()=>location.reload(),120);
    }
    return changed;
  }

  async function recordMigrationEvent(){
    const {data,error}=await sb.from('memory_events').select('id').eq('event_type','local_storage_migrated').limit(1);
    if(error)throw error;
    if(data?.length)return;
    const summary=localMemorySummary();
    const {error:iErr}=await sb.from('memory_events').insert({
      user_id:state.user.id,event_type:'local_storage_migrated',subject_kind:'system',subject_id:'browser_local_storage',
      title:'Migración inicial de memoria local',body:'La memoria acumulada en el navegador se incorporó a Supabase.',
      metadata:{summary,app_version:'v0.10'}
    });
    if(iErr)throw iErr;
  }

  async function fullSync({manual=false}={}){
    if(!state.user||state.syncing)return;
    state.syncing=true;state.lastError=null;updateStatus('syncing');if(dialog.open)renderAuthDialog();
    try{
      await pushAllLocal({mergeOnly:false});
      await pullAllRemote({reloadIfChanged:false});
      state.ready=true;
      state.dirty.clear();
      updateStatus('synced');
      if(manual&&dialog.open){renderAuthDialog();message('Memoria sincronizada.', 'ok');}
    }catch(err){setError(err);if(dialog.open)renderAuthDialog();}
    finally{state.syncing=false;updateStatus();}
  }

  async function syncKey(key){
    if(!state.user||!state.ready||state.syncing)return;
    state.syncing=true;updateStatus('syncing');
    try{
      await ensureStaticMemory();
      if(key===KEYS.readingAnnotations)await pushReadingAnnotations({mirrorDeletes:true});
      else if(key===KEYS.mindAnnotations)await pushMindAnnotations({mirrorDeletes:true});
      else if(key===KEYS.conversations)await pushConversations();
      else if(key===KEYS.readingReturns)await pushReadingReturns();
      else if(key===KEYS.threadState)await pushThreadPins();
      state.dirty.delete(key);state.lastError=null;
    }catch(err){state.dirty.add(key);setError(err);}
    finally{state.syncing=false;updateStatus();}
  }
  function scheduleSync(key){
    if(!WATCHED.has(key)||state.hydrating)return;
    state.dirty.add(key);
    if(!state.user||!state.ready)return;
    clearTimeout(state.syncTimer);
    state.syncTimer=setTimeout(async()=>{
      const keys=[...state.dirty];
      for(const k of keys)await syncKey(k);
    },500);
  }

  // Observe writes made by the existing v0.5/v0.9 interfaces.
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key,value){
    originalSetItem.call(this,key,value);
    try{if(this===localStorage)scheduleSync(key);}catch{}
  };

  // ---------- session bootstrap ----------
  async function bootstrapUser(user){
    if(state.bootstrapping)return;
    state.bootstrapping=true;
    state.user=user;state.lastError=null;state.ready=false;state.migrationPending=false;updateStatus('syncing');
    try{
      await ensureStaticMemory();
      const remote=await hasRemoteMemory();
      const local=hasLocalMemory();
      const hydratedFor=sessionStorage.getItem('minds_v10_hydrated_user')===user.id;
      if(remote){
        // Preserve possible local additions before accepting the remote copy as authoritative.
        if(local&&!hydratedFor)await pushAllLocal({mergeOnly:true});
        const changed=await pullAllRemote({reloadIfChanged:true});
        if(changed)return;
        state.ready=true;
      }else if(local){
        state.migrationPending=true;
        state.ready=false;
        renderAuthDialog();
        if(!dialog.open)dialog.showModal();
      }else{
        state.ready=true;
      }
      updateStatus();
      renderAuthDialog();
    }catch(err){setError(err);renderAuthDialog();}
    finally{state.bootstrapping=false;}
  }

  async function handleSession(session){
    state.session=session||null;
    const user=session?.user||null;
    if(!user){
      state.user=null;state.ready=false;state.migrationPending=false;state.lastError=null;updateStatus();if(dialog.open)renderAuthDialog();return;
    }
    if(state.user?.id===user.id&&state.ready)return;
    await bootstrapUser(user);
  }

  async function boot(){
    updateStatus();
    if(!sb)return;
    const {data,error}=await sb.auth.getSession();
    if(error)setError(error);
    await handleSession(data?.session||null);
    sb.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0);});
  }

  // Pull changes made on another device when returning to this tab.
  document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState!=='visible'||!state.user||!state.ready||state.syncing)return;
    try{
      if(state.dirty.size){
        const keys=[...state.dirty];for(const k of keys)await syncKey(k);
      }
      await pullAllRemote({reloadIfChanged:true});
    }catch(err){setError(err);}
  });

  window.MINDS_V10 = {
    get user(){return state.user;},
    get ready(){return state.ready;},
    sync:()=>fullSync({manual:true}),
    pull:()=>pullAllRemote({reloadIfChanged:false})
  };

  boot();
})();