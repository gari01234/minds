/* MINDS - Theory v0.9 — active field, live archive, universal questioning, persistent conversation history */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeJSON=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
  const saveJSON=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v));return true}catch{return false}};
  const uid=()=>globalThis.crypto?.randomUUID?.()||('id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const now=()=>new Date().toISOString();
  const short=(s,n=74)=>String(s||'').trim().replace(/\s+/g,' ').slice(0,n)+(String(s||'').trim().replace(/\s+/g,' ').length>n?'…':'');
  const fmtDate=iso=>{try{return new Intl.DateTimeFormat('es',{day:'numeric',month:'short',year:'numeric'}).format(new Date(iso))}catch{return ''}};

  document.title='MINDS - Readings · Sofía';
  if(new URLSearchParams(location.search).get('embedded')==='1')document.documentElement.classList.add('embedded');
  document.querySelector('.brand')?.replaceChildren(document.createTextNode('MINDS - Readings'));
  if(document.querySelector('.sub')) document.querySelector('.sub').textContent='';

  // ---------- architecture: two places, one universal faculty ----------
  document.querySelectorAll('#topnav button').forEach(b=>{
    if(['memory','graph','ask'].includes(b.dataset.view)) b.remove();
    if(b.dataset.view==='mind') b.textContent='MINDS';
    if(b.dataset.view==='readings') b.textContent='LECTURAS';
  });
  $('#view-ask')?.classList.remove('active');
  if($('#view-ask')) $('#view-ask').style.display='none';

  const header=document.querySelector('header');
  let globalActions=document.querySelector('.v09-global-actions');
  if(!globalActions&&header){
    globalActions=document.createElement('div');
    globalActions.className='v09-global-actions';
    globalActions.innerHTML='<button class="v09-ask-button" data-v09-ask><span>Sofía</span></button><button class="v09-history-button" data-v09-history aria-label="Historial y búsqueda" title="Historial y búsqueda">⌕</button>';
    header.appendChild(globalActions);
  }

  // Remove v0.8 transient UI; its data remain available for migration.
  document.querySelectorAll('.selection-actions,.mind-sheet,.connections-sheet,.mind-annotation-dialog').forEach(el=>el.remove());

  // ---------- thread model ----------
  const dispatches=window.THEORYLAB_MIND?.dispatches||[];
  const dispatchMap=Object.fromEntries(dispatches.map(d=>[d.id,d]));
  const legacyThoughts=(typeof thoughts!=='undefined'&&Array.isArray(thoughts))?thoughts:[];
  const thoughtMap=Object.fromEntries(legacyThoughts.map(t=>[t.id,t]));
  const threadMeta={
    teleology:{short:'Reducción como medio',status:'activo',why:'Sigue cerca porque organiza la pregunta central: qué permite una operación reductiva y qué ocurre después de la intensificación.',last:'24 Sep 2026',sources:['Silvestrin','Pawson','Reinhardt','feedback metodológico'],connections:['interferencia','intensificación','criterio de relevancia','calma / tranquilidad','finalidad humana']},
    sensitivity:{short:'Intensificación y sensibilidad',status:'activo',why:'Sigue cerca porque Reinhardt y Martin abrieron una distinción que todavía puede cambiar la teoría: intensificar el fenómeno no es lo mismo que intensificar la sensibilidad hacia él.',last:'24 Sep 2026',sources:['Reinhardt','Agnes Martin','Silvestrin'],connections:['latencia perceptiva','atención','diferencia débil','percepción','tiempo']},
    'human-end':{short:'¿Para qué?',status:'activo',why:'Sigue cerca porque la finalidad humana permanece abierta y concentra una deuda epistemológica importante alrededor de calma, tranquilidad y vida contemporánea.',last:'24 Sep 2026',sources:['Silvestrin','feedback del usuario','cadena de investigación'],connections:['calma','tranquilidad','aceleración','retiro','temporalidad','finalidad']},
    presence:{short:'«Presencia» no basta',status:'latente',why:'La corrección ya cumplió una función metodológica fuerte. Permanece recuperable y puede reactivarse si una lectura vuelve a hacer demasiado abstracta la noción de presencia.',last:'23 Sep 2026',sources:['feedback 23 Sep'],connections:['presencia','intensificación','finalidad']},
    criteria:{short:'Toda reducción implica un criterio',status:'latente',why:'No domina el campo actual, pero protege la teoría de tratar “interferencia”, “ruido” o “exceso” como categorías neutrales.',last:'23 Sep 2026',sources:['Reinhardt','Twelve Rules for a New Academy'],connections:['interferencia','relevancia','normatividad']},
    latency:{short:'Lo que permanece latente',status:'latente',why:'La idea sigue disponible, pero todavía no sabemos si tiene suficiente poder explicativo fuera del caso Reinhardt.',last:'21 Sep 2026',sources:['Reinhardt','Black Paintings'],connections:['umbral','tiempo perceptivo','color','forma']},
    morris:{short:'Morris como contraste',status:'latente',why:'Fue explícitamente depriorizado, pero conserva una función crítica puntual: recordar que una forma simple no implica una experiencia simple.',last:'20 Sep 2026',sources:['Robert Morris','feedback del usuario'],connections:['relaciones','complejidad','cuerpo','espacio']}
  };
  const evolution={
    teleology:[
      {date:'19 Sep 2026',label:'Primera formulación fértil',text:'Reducir es retirar interferencias para aumentar la presencia de aquello que permanece.'},
      {date:'23 Sep 2026',label:'Corrección metodológica',text:'La reducción es un medio, no un fin. Hay que seguir la cadena hacia qué se intensifica, qué experiencia puede favorecer y para qué podría ser valiosa.'},
      {date:'24 Sep 2026',label:'Formulación actual',text:'La reducción se entiende como una operación situada dentro de una secuencia causal; cada flecha debe demostrarse por separado.'}
    ],
    sensitivity:[
      {date:'21 Sep 2026',label:'Reinhardt',text:'La reducción puede llevar cualidades hacia un umbral de aparición en vez de eliminarlas.'},
      {date:'24 Sep 2026',label:'Reinhardt + Martin',text:'Intensificar el fenómeno no es lo mismo que intensificar nuestra sensibilidad hacia el fenómeno.'}
    ],
    'human-end':[
      {date:'19 Sep 2026',label:'Silvestrin',text:'Calma, retiro, silencio y clarificación aparecen como posibles estados favorecidos, no como efectos garantizados.'},
      {date:'23 Sep 2026',label:'Cadena abierta',text:'Reducción / operación → qué se intensifica → posible experiencia → posible finalidad humana.'},
      {date:'24 Sep 2026',label:'Frontera actual',text:'La pregunta de fondo puede ser qué condiciones de la vida contemporánea debería la arquitectura poder suspender, contradecir o transformar temporalmente.'}
    ]
  };

  const threadStateKey='minds_theory_v09_thread_state';
  let threadState=safeJSON(threadStateKey,{pins:[],lastOpened:{}});
  const pins=new Set(threadState.pins||[]);
  const defaultActive=new Set(['teleology','sensitivity','human-end']);
  let activeThread='teleology';
  let archiveQuery='';

  function allThreadIds(){return ['teleology','sensitivity','human-end','presence','criteria','latency','morris'].filter(id=>dispatchMap[id]||thoughtMap[id]||threadMeta[id]);}
  function isThreadActive(id){return defaultActive.has(id)||pins.has(id);}
  function threadTitle(id){return threadMeta[id]?.short||dispatchMap[id]?.title||thoughtMap[id]?.title||id;}
  function threadLongTitle(id){return dispatchMap[id]?.title||thoughtMap[id]?.title||threadTitle(id);}
  function threadBody(id){
    if(dispatchMap[id]){
      const tmp=document.createElement('div');tmp.innerHTML=dispatchMap[id].html||'';
      return [...tmp.children].filter(el=>el.tagName==='P').map((el,i)=>({id:i,html:el.innerHTML,text:el.textContent||'',cls:el.className||''}));
    }
    const t=thoughtMap[id]; if(!t)return[];
    return [
      {id:0,html:esc(t.summary||''),text:t.summary||'',cls:''},
      {id:1,html:esc(t.current||''),text:t.current||'',cls:'turn'},
      {id:2,html:esc(t.why||''),text:t.why||'',cls:'caution'}
    ].filter(x=>x.text);
  }
  function saveThreadState(){threadState={...threadState,pins:[...pins]};saveJSON(threadStateKey,threadState);}

  // ---------- annotations in MINDS ----------
  const mindAnnKey='minds_theory_v08_mind_annotations';
  let mindAnnotations=safeJSON(mindAnnKey,[]);
  function saveMindAnnotations(){saveJSON(mindAnnKey,mindAnnotations);}
  function markMindBlocks(threadId){
    if(!globalThis.CSS?.highlights||typeof Highlight==='undefined')return;
    const ranges=[];
    const blocks=threadBody(threadId);
    mindAnnotations.filter(a=>a.threadId===threadId).forEach(a=>(a.segments||[]).forEach(seg=>{
      const p=document.querySelector(`.v09-thread-body [data-mind-block="${seg.block}"]`);if(!p)return;
      const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let nodes=[],n,total=0;
      while(n=walker.nextNode()){nodes.push({node:n,start:total,end:total+n.data.length});total+=n.data.length;}
      const sr=nodes.find(x=>seg.start>=x.start&&seg.start<=x.end),er=nodes.find(x=>seg.end>=x.start&&seg.end<=x.end)||nodes.at(-1);if(!sr||!er)return;
      try{const r=document.createRange();r.setStart(sr.node,Math.max(0,seg.start-sr.start));r.setEnd(er.node,Math.max(0,Math.min(er.node.data.length,seg.end-er.start)));ranges.push(r);}catch{}
    }));
    CSS.highlights.delete('minds-user-marks');if(ranges.length)CSS.highlights.set('minds-user-marks',new Highlight(...ranges));
    document.querySelectorAll('.v09-thread-body [data-mind-block]').forEach(el=>el.classList.toggle('has-mind-mark',mindAnnotations.some(a=>a.threadId===threadId&&a.segments?.some(s=>String(s.block)===el.dataset.mindBlock))));
  }

  // ---------- unified conversation memory ----------
  const APP_SCOPE='theory';
  const convScope=window.MINDS_CONVERSATION_SCOPE;
  const convKey=convScope.theoryKey;
  const migrationKey='minds_theory_v09_migrated';
  let conversations=convScope.readTheoryCache();
  function normalizeOrigin(o){return o||{type:'global',id:'global',label:'Pregunta global'};}
  function migrateConversations(){
    if(safeJSON(migrationKey,false))return;
    const migrated=[];
    const oldMind=safeJSON('minds_theory_v08_thread_chats',{});
    Object.entries(oldMind||{}).forEach(([threadId,msgs])=>{
      if(!Array.isArray(msgs)||!msgs.length)return;
      migrated.push({id:uid(),origin:{type:'mind',id:threadId,label:'MINDS · '+threadTitle(threadId)},mode:'memory',title:short(msgs.find(m=>m.role==='user')?.text||threadTitle(threadId),72),created:msgs[0]?.at||now(),updated:msgs.at(-1)?.at||now(),messages:msgs.map(m=>({...m,at:m.at||now()}))});
    });
    const oldAsk=safeJSON('minds_theory_v08_ask_chat',[]);
    for(let i=0;i<oldAsk.length;i++){
      const m=oldAsk[i];if(m?.role!=='user')continue;
      const next=oldAsk[i+1]?.role==='assistant'?oldAsk[i+1]:null;
      const ctx=m.context||null;
      const origin=ctx?{type:'reading',id:'unknown',label:ctx.label||'Lectura',quote:ctx.quote||''}:{type:'global',id:'global',label:'Pregunta global'};
      migrated.push({id:uid(),origin,mode:m.mode||'memory',title:short(m.text,72),created:m.at||now(),updated:next?.at||m.at||now(),messages:[{role:'user',text:m.text,at:m.at||now(),quote:ctx?.quote||''},...(next?[{role:'assistant',text:next.text,at:next.at||now(),provisional:true}]:[])]});
      if(next)i++;
    }
    if(!conversations.length&&migrated.length)conversations=migrated;
    saveJSON(convKey,conversations);saveJSON(migrationKey,true);
  }
  migrateConversations();
  function saveConversations(){conversations=conversations.filter(convScope.isTheory).map(c=>({...c,app_scope:APP_SCOPE}));saveJSON(convKey,conversations);}
  function originMatches(c,type,id){return c.origin?.type===type&&String(c.origin?.id||'')===String(id||'');}
  function convCount(type,id){return conversations.filter(c=>originMatches(c,type,id)).length;}
  function findGeneralConversation(type,id){return conversations.filter(c=>originMatches(c,type,id)&&!c.origin?.quote).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)))[0]||null;}
  function newConversation(origin,mode='memory',reuseGeneral=false){
    origin=normalizeOrigin(origin);
    if(reuseGeneral&&!origin.quote){const existing=findGeneralConversation(origin.type,origin.id);if(existing)return existing;}
    const c={id:uid(),app_scope:APP_SCOPE,origin,mode,title:'Nueva conversación',created:now(),updated:now(),messages:[]};conversations.push(c);saveConversations();return c;
  }
  function localReply(conv,q){
    let r=null;
    try{
      if(conv.mode==='outside'&&typeof outsideAnswer==='function')r=outsideAnswer(q);
      else if(typeof memoryAnswer==='function')r=memoryAnswer(q+' '+(conv.origin?.quote||''));
    }catch{}
    const body=r?.body||(conv.mode==='outside'?'La exploración externa real se activará al conectar el motor seguro.':'El corpus local no ofrece todavía una coincidencia suficientemente fuerte para responder con rigor.');
    return body+'\n\n[Respuesta local provisional · sin modelo conectado.]';
  }

  // ---------- sheets ----------
  const sheet=document.createElement('aside');
  sheet.className='v09-sheet';
  sheet.innerHTML='<div class="v09-sheet-head"><div><div class="v09-sheet-kicker"></div><h2></h2></div><button class="v09-sheet-close" aria-label="Cerrar">×</button></div><div class="v09-sheet-body"></div>';
  document.body.appendChild(sheet);
  const sheetK=sheet.querySelector('.v09-sheet-kicker'),sheetTitle=sheet.querySelector('h2'),sheetBody=sheet.querySelector('.v09-sheet-body');
  sheet.querySelector('.v09-sheet-close').onclick=()=>{
    const wasChat=sheet.dataset.kind==='chat';
    closeSofiaReactionPicker();
    sheet.classList.remove('open');
    sheet.dataset.kind='default';
    document.documentElement.classList.remove('sofia-chat-open');
    if(wasChat&&new URLSearchParams(location.search).get('embedded')==='1')parent.postMessage({type:'minds:sofia-state',open:false},location.origin);
  };
  function openSheet(kicker,title,html,kind='default'){
    sheetK.textContent=kicker;
    sheetTitle.textContent=title;
    sheetBody.innerHTML=html;
    sheet.dataset.kind=kind;
    sheet.classList.add('open');
  }

  // ---------- conversation UI ----------
  let openConvId=null;
  function conversationHeader(c){
    const typeLabel=c.origin?.type==='mind'?'MINDS':c.origin?.type==='reading'?'LECTURA':'GLOBAL';
    return `${typeLabel} · ${c.origin?.label||'Conversación'}`;
  }
  function formatSofiaText(text){
    let html=esc(String(text||''));
    html=html.replace(/\*\*([^*\n][\s\S]*?)\*\*/g,'<strong>$1</strong>');
    html=html.replace(/__([^_\n][\s\S]*?)__/g,'<strong>$1</strong>');
    return html;
  }
  async function askSofia(conv,q){
    const sb=window.MINDS_SUPABASE;
    if(!sb?.functions?.invoke)throw new Error('Supabase no está disponible.');
    const recent=(conv.messages||[]).filter(m=>!m.pending).slice(-12);
    const originBits=[];
    if(conv.origin?.label)originBits.push('Origen: '+conv.origin.label);
    if(conv.origin?.quote)originBits.push('Fragmento de origen: “'+conv.origin.quote+'”');
    const transcript=recent.map(m=>(m.role==='assistant'?'Sofía':'Gari')+': '+String(m.text||'')).join('\n\n');
    const request=[
      ...originBits,
      'Modo: '+(conv.mode==='outside'?'Explorar fuera':'Mi memoria'),
      transcript||('Gari: '+q)
    ].filter(Boolean).join('\n\n');
    const {data,error}=await sb.functions.invoke('sofia-chat',{body:{message:request}});
    if(error)throw error;
    const reply=String(data?.reply||'').trim();
    if(!reply)throw new Error('Sofía no devolvió una respuesta.');
    return {reply,sources:Array.isArray(data?.sources)?data.sources:[]};
  }
  async function transcribeSofia(blob){
    const sb=window.MINDS_SUPABASE;
    if(!sb)throw new Error('Supabase no está disponible.');
    const {data:{session}}=await sb.auth.getSession();
    if(!session)throw new Error('Conecta la memoria para usar voz multilingüe.');
    const cfg=window.MINDS_SUPABASE_CONFIG;
    if(!cfg?.url||!cfg?.publishableKey)throw new Error('Falta la configuración de Supabase.');
    const form=new FormData();
    const type=blob?.type||'audio/webm';
    const ext=type.includes('mp4')||type.includes('m4a')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':'webm';
    form.append('file',blob,'sofia-voice.'+ext);
    const response=await fetch(cfg.url+'/functions/v1/isabella-transcribe',{
      method:'POST',
      headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token},
      body:form
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.detail||data?.error||'No pude transcribir el audio.');
    return String(data?.text||'').trim();
  }
  function bindSofiaVoice(form,ta,autosize){
    const mic=form.querySelector('.v09-chat-mic');if(!mic)return;
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;
    let recorder=null,stream=null,chunks=[],fallback=null,recording=false;
    const reset=()=>{recording=false;mic.classList.remove('recording','working');mic.textContent='⌁';mic.setAttribute('aria-label','Hablar');try{stream?.getTracks().forEach(t=>t.stop())}catch{}stream=null};
    const fill=text=>{if(!text)return;ta.value=text;autosize();ta.focus();try{ta.setSelectionRange(ta.value.length,ta.value.length)}catch{}};
    const useBrowser=()=>{
      if(!R){reset();return}
      try{
        fallback=new R();fallback.lang='es-ES';fallback.interimResults=true;let finalText='';
        recording=true;mic.classList.add('recording');mic.textContent='■';mic.setAttribute('aria-label','Detener');
        fallback.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const part=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=part;else interim+=part}fill((finalText+' '+interim).trim())};
        fallback.onend=()=>reset();fallback.onerror=()=>reset();fallback.start();
      }catch{reset()}
    };
    mic.onclick=async()=>{
      if(recording){
        try{fallback?.stop()}catch{}
        try{if(recorder&&recorder.state!=='inactive')recorder.stop()}catch{}
        return;
      }
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){useBrowser();return}
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        const candidates=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
        const mime=candidates.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
        recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);chunks=[];
        recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
        recorder.onstop=async()=>{
          const blob=new Blob(chunks,{type:recorder?.mimeType||mime||'audio/webm'});chunks=[];
          reset();if(!blob.size)return;
          mic.classList.add('working');mic.textContent='…';
          try{fill(await transcribeSofia(blob))}catch{}
          finally{mic.classList.remove('working');mic.textContent='⌁'}
        };
        recording=true;mic.classList.add('recording');mic.textContent='■';mic.setAttribute('aria-label','Detener');recorder.start(250);
      }catch{reset();useBrowser()}
    };
  }
  function closeSofiaReactionPicker(){
    document.querySelector('.v09-reaction-popover')?.remove();
    document.querySelectorAll('.v09-msg.reaction-target').forEach(x=>x.classList.remove('reaction-target'));
  }
  function openSofiaReactionPicker(conv,id){
    const m=conv.messages.find(x=>String(x.id)===String(id));
    const el=document.querySelector(`.v09-msg[data-sofia-msg="${CSS.escape(String(id))}"]`);
    if(!m||!el)return;
    closeSofiaReactionPicker();try{navigator.vibrate?.(8)}catch{}
    el.classList.add('reaction-target');
    const quick=['❤️','👍','😂','😮','😢','👏'],more=['🙌','😊','🥰','😍','🤩','🥳','🙂','😉','🤔','🫡','🙏','💡','🔥','✨','💯','✅','❌','👀','🙈','🤝','💪','🎉','⭐','🌟','🚀','📌','🧠','☀️','🌧️','⚽','🏗️','📚'];
    const pop=document.createElement('div');pop.className='v09-reaction-popover';
    pop.innerHTML=`<div class="v09-reaction-row">${quick.map(x=>`<button data-sofia-reaction="${x}" class="${m.reaction===x?'selected':''}">${x}</button>`).join('')}<button class="v09-reaction-more">＋</button></div><div class="v09-reaction-row more is-hidden">${more.map(x=>`<button data-sofia-reaction="${x}" class="${m.reaction===x?'selected':''}">${x}</button>`).join('')}<button data-sofia-reaction="" class="remove">×</button></div>`;
    document.body.appendChild(pop);
    const position=()=>{
      const r=el.getBoundingClientRect(),w=Math.min(pop.offsetWidth||330,innerWidth-20);
      pop.style.left=Math.max(10,Math.min(innerWidth-w-10,el.classList.contains('user')?r.right-w:r.left))+'px';
      let top=r.top-(pop.offsetHeight||58)-10;if(top<8)top=Math.min(innerHeight-(pop.offsetHeight||58)-8,r.bottom+10);pop.style.top=top+'px';
    };
    requestAnimationFrame(position);
    pop.querySelectorAll('[data-sofia-reaction]').forEach(b=>b.onclick=e=>{e.stopPropagation();const v=b.dataset.sofiaReaction||null;m.reaction=m.reaction===v?null:v;saveConversations();closeSofiaReactionPicker();openConversation(conv.id)});
    pop.querySelector('.v09-reaction-more')?.addEventListener('click',e=>{
      e.stopPropagation();
      const row=pop.querySelector('.v09-reaction-row.more'),opening=row.classList.contains('is-hidden');
      row.classList.toggle('is-hidden',!opening);pop.classList.toggle('expanded',opening);requestAnimationFrame(position);
    });
    setTimeout(()=>document.addEventListener('pointerdown',function outside(e){if(pop.contains(e.target)||el.contains(e.target)){document.addEventListener('pointerdown',outside,{capture:true,once:true});return}closeSofiaReactionPicker()},{capture:true,once:true}),0);
  }
  function bindSofiaReactions(conv){
    sheetBody.querySelectorAll('.v09-msg[data-sofia-msg]').forEach(el=>{
      let timer=null,sx=0,sy=0,lastTap=0;
      const cancel=()=>{clearTimeout(timer);timer=null};
      el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0],now=Date.now();sx=t.clientX;sy=t.clientY;if(now-lastTap<330){cancel();openSofiaReactionPicker(conv,el.dataset.sofiaMsg);lastTap=0;return}lastTap=now;timer=setTimeout(()=>openSofiaReactionPicker(conv,el.dataset.sofiaMsg),470)},{passive:true});
      el.addEventListener('touchmove',e=>{if(!timer||e.touches.length!==1)return;const t=e.touches[0];if(Math.abs(t.clientX-sx)>9||Math.abs(t.clientY-sy)>9)cancel()},{passive:true});
      el.addEventListener('touchend',cancel,{passive:true});el.addEventListener('touchcancel',cancel,{passive:true});
      el.addEventListener('dblclick',e=>{e.preventDefault();openSofiaReactionPicker(conv,el.dataset.sofiaMsg)});
      el.addEventListener('contextmenu',e=>{e.preventDefault();openSofiaReactionPicker(conv,el.dataset.sofiaMsg)});
      el.querySelector('.v09-reaction-chip')?.addEventListener('click',e=>{e.stopPropagation();openSofiaReactionPicker(conv,el.dataset.sofiaMsg)});
    });
  }
  function openConversation(cOrId){
    const c=typeof cOrId==='string'?conversations.find(x=>x.id===cOrId):cOrId;if(!c)return;openConvId=c.id;
    let idsChanged=false;c.messages.forEach(m=>{if(!m.id){m.id=uid();idsChanged=true}});if(idsChanged)saveConversations();
    const context=c.origin?.quote?`<div class="v09-conv-context"><b>Fragmento de origen</b><div>“${esc(c.origin.quote)}”</div>${c.origin?.type==='reading'&&c.origin?.readingId?'<button data-open-origin-reading>Abrir lectura</button>':''}</div>`:'';
    const msgs=c.messages.length
      ?c.messages.map(m=>`<div class="v09-msg ${m.role}" data-sofia-msg="${esc(m.id)}"><span class="v09-msg-label">${m.role==='user'?'TÚ':m.pending?'SOFÍA · PENSANDO':m.provisional?'SOFÍA · PROVISIONAL':'SOFÍA'}</span><span class="v09-msg-text">${formatSofiaText(m.text)}</span>${m.reaction?`<button class="v09-reaction-chip">${esc(m.reaction)}</button>`:''}</div>`).join('')
      :'<div class="v09-msg assistant sofia-empty"><span class="v09-msg-label">SOFÍA</span><span class="v09-msg-text">Hola. Soy Sofía. Podemos hablar de una lectura aunque todavía no hayas subrayado nada. Pregúntame por su argumento, compárala con otra lectura o empieza a marcar pasajes y trabajaré sobre aquello que vaya quedando vivo.</span></div>';
    openSheet('MINDS · SOFÍA','',`${context}<div class="v09-conv-mode"><button data-mode="memory" class="${c.mode!=='outside'?'active':''}">Mi memoria</button><button data-mode="outside" class="${c.mode==='outside'?'active':''}">Explorar fuera</button></div><div class="v09-chat-log">${msgs}</div><form class="v09-chat-form"><button type="button" class="v09-chat-mic" aria-label="Hablar">⌁</button><textarea rows="1" placeholder="Escríbele a Sofía..."></textarea><button class="v09-chat-send" aria-label="Enviar">↑</button></form>`,'chat');
    document.documentElement.classList.add('sofia-chat-open');
    if(new URLSearchParams(location.search).get('embedded')==='1')parent.postMessage({type:'minds:sofia-state',open:true},location.origin);
    sheetBody.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{c.mode=b.dataset.mode;saveConversations();openConversation(c.id);});
    sheetBody.querySelector('[data-open-origin-reading]')?.addEventListener('click',()=>{sheet.classList.remove('open');sheet.dataset.kind='default';document.documentElement.classList.remove('sofia-chat-open');if(new URLSearchParams(location.search).get('embedded')==='1')parent.postMessage({type:'minds:sofia-state',open:false},location.origin);openReading?.(c.origin.readingId);setTimeout(enhanceReaderV09,80);});
    bindSofiaReactions(c);
    const form=sheetBody.querySelector('.v09-chat-form'),ta=form.querySelector('textarea');
    const autosize=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,156)+'px'};ta.addEventListener('input',autosize);autosize();bindSofiaVoice(form,ta,autosize);
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
    form.onsubmit=async e=>{
      e.preventDefault();
      const q=ta.value.trim();if(!q)return;
      c.messages.push({id:uid(),role:'user',text:q,at:now(),quote:c.origin?.quote||''});
      if(c.title==='Nueva conversación')c.title=short(q,72);
      const pending={id:uid(),role:'assistant',text:'Pensando…',at:now(),pending:true};
      c.messages.push(pending);c.updated=now();saveConversations();openConversation(c.id);
      try{
        const result=await askSofia(c,q);
        pending.text=String(result?.reply||'').trim()||'No encontré una respuesta suficiente.';
        pending.pending=false;pending.provisional=false;pending.sources=result?.sources||[];
      }catch(err){
        pending.text=localReply(c,q);
        pending.pending=false;pending.provisional=true;
      }
      c.updated=now();saveConversations();openConversation(c.id);
      setTimeout(()=>{const log=sheetBody.querySelector('.v09-chat-log');if(log)log.scrollTop=log.scrollHeight;},0);
    };
    setTimeout(()=>{const log=sheetBody.querySelector('.v09-chat-log');if(log)log.scrollTop=log.scrollHeight;},0);
  }
  function askFromOrigin(origin,opts={}){const c=newConversation(origin,opts.mode||'memory',!!opts.reuseGeneral);openConversation(c);setTimeout(()=>sheetBody.querySelector('.v09-chat-form textarea')?.focus(),80);}
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin)return;
    const type=e.data?.type;
    if(type==='minds:sofia-close'){closeSofiaReactionPicker();sheet.classList.remove('open');sheet.dataset.kind='default';document.documentElement.classList.remove('sofia-chat-open');return}
    if(type!=='minds:sofia-open'&&type!=='minds:sofia-prompt')return;
    const conv=newConversation({type:'global',id:'sofia',label:'Sofía'},'memory',true);
    openConversation(conv);
    setTimeout(()=>{
      const ta=sheetBody.querySelector('.v09-chat-form textarea');
      if(!ta)return;
      if(type==='minds:sofia-prompt'&&e.data?.prompt)ta.value=String(e.data.prompt);
      ta.focus();
      try{ta.setSelectionRange(ta.value.length,ta.value.length)}catch{}
    },100);
  });

  // ---------- history / search ----------
  let historyFilter='all';
  function openHistory(filter='all',id=null){historyFilter=filter;renderHistory(id);}
  function renderHistory(id=null,query=''){
    const q=query.trim().toLowerCase();
    let list=[...conversations].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
    if(historyFilter==='mind')list=list.filter(c=>c.origin?.type==='mind');
    if(historyFilter==='reading')list=list.filter(c=>c.origin?.type==='reading');
    if(historyFilter==='global')list=list.filter(c=>c.origin?.type==='global');
    if(id)list=list.filter(c=>String(c.origin?.id||'')===String(id));
    if(q)list=list.filter(c=>((c.title||'')+' '+(c.origin?.label||'')+' '+c.messages.map(m=>m.text).join(' ')).toLowerCase().includes(q));
    openSheet('HISTORIAL','Conversaciones',`<div class="v09-history-search"><input type="search" placeholder="Buscar en preguntas y respuestas..." value="${esc(query)}"></div><div class="v09-history-filters"><button data-hf="all" class="${historyFilter==='all'?'active':''}">Todo</button><button data-hf="mind" class="${historyFilter==='mind'?'active':''}">MINDS</button><button data-hf="reading" class="${historyFilter==='reading'?'active':''}">Lecturas</button><button data-hf="global" class="${historyFilter==='global'?'active':''}">Global</button></div><div class="v09-history-list">${list.length?list.map(c=>`<article data-open-conv="${esc(c.id)}"><div class="v09-history-meta">${esc(c.origin?.type==='mind'?'MINDS':c.origin?.type==='reading'?'LECTURA':'GLOBAL')} · ${esc(fmtDate(c.updated))}</div><h3>${esc(c.title||'Conversación')}</h3><p>${esc(c.origin?.label||'')}</p>${c.origin?.quote?`<blockquote>“${esc(short(c.origin.quote,150))}”</blockquote>`:''}<span>${c.messages.filter(m=>m.role==='user').length} preguntas · ${c.messages.length} mensajes</span></article>`).join(''):'<div class="v09-empty">Todavía no hay conversaciones en este filtro.</div>'}</div>`);
    const input=sheetBody.querySelector('input');input?.addEventListener('input',e=>renderHistory(id,e.target.value));
    sheetBody.querySelectorAll('[data-hf]').forEach(b=>b.onclick=()=>{historyFilter=b.dataset.hf;renderHistory(id,input?.value||'');});
    sheetBody.querySelectorAll('[data-open-conv]').forEach(a=>a.onclick=()=>openConversation(a.dataset.openConv));
  }

  // ---------- archive ----------
  function openArchive(query=''){archiveQuery=query;const q=query.toLowerCase().trim();const ids=allThreadIds().filter(id=>!q||((threadTitle(id)+' '+(threadMeta[id]?.why||'')+' '+(threadMeta[id]?.sources||[]).join(' ')).toLowerCase().includes(q)));
    openSheet('ARCHIVO VIVO','Todos los hilos',`<div class="v09-history-search"><input type="search" placeholder="Buscar un pensamiento..." value="${esc(query)}"></div><p class="v09-archive-intro">Nada se borra. “Activo” y “latente” son vistas de proximidad, no destinos irreversibles.</p><div class="v09-archive-list">${ids.map(id=>`<article data-archive-thread="${esc(id)}"><div class="v09-archive-state ${isThreadActive(id)?'active':'latent'}">${isThreadActive(id)?'CERCA AHORA':'MEMORIA LATENTE'}${pins.has(id)?' · FIJADO':''}</div><h3>${esc(threadTitle(id))}</h3><p>${esc(threadMeta[id]?.why||'')}</p><span>Última activación: ${esc(threadMeta[id]?.last||'—')}</span></article>`).join('')}</div>`);
    sheetBody.querySelector('input')?.addEventListener('input',e=>openArchive(e.target.value));
    sheetBody.querySelectorAll('[data-archive-thread]').forEach(a=>a.onclick=()=>{activeThread=a.dataset.archiveThread;threadState.lastOpened[activeThread]=now();saveThreadState();sheet.classList.remove('open');renderMindsV09();});
  }

  // ---------- thread details ----------
  function openThreadHistory(id){const evo=evolution[id]||[];const meta=threadMeta[id]||{};openSheet('BIOGRAFÍA DEL HILO',threadTitle(id),`<div class="v09-thread-biography"><p>${esc(meta.why||'')}</p><div class="v09-biography-list">${evo.length?evo.map(x=>`<article><time>${esc(x.date)}</time><h3>${esc(x.label)}</h3><p>${esc(x.text)}</p></article>`).join(''):'<div class="v09-empty">Este hilo conserva su estado actual, pero todavía no tiene varias versiones registradas en el prototipo.</div>'}</div><div class="v09-source-block"><h3>Fuentes y procedencia</h3>${(meta.sources||[]).map(s=>`<span>${esc(s)}</span>`).join('')}</div><div class="v09-source-block"><h3>Conexiones contextuales</h3>${(meta.connections||[]).map(s=>`<span>${esc(s)}</span>`).join('')}</div></div>`);}
  function openMindMarks(id){const list=mindAnnotations.filter(a=>a.threadId===id);openSheet('MARCAS','Anotaciones · '+threadTitle(id),`<div class="v09-mark-list">${list.length?list.map(a=>`<article><blockquote>${esc(a.quote)}</blockquote>${a.note?`<p>${esc(a.note)}</p>`:'<p class="muted">Subrayado sin nota.</p>'}<div><button data-mark-ask="${esc(a.id)}">Preguntar</button><button data-mark-delete="${esc(a.id)}">Eliminar</button></div></article>`).join(''):'<div class="v09-empty">Todavía no hay marcas en este hilo.</div>'}</div>`);
    sheetBody.querySelectorAll('[data-mark-ask]').forEach(b=>b.onclick=()=>{const a=mindAnnotations.find(x=>x.id===b.dataset.markAsk);askFromOrigin({type:'mind',id,label:'MINDS · '+threadTitle(id),quote:a?.quote||''});});
    sheetBody.querySelectorAll('[data-mark-delete]').forEach(b=>b.onclick=()=>{mindAnnotations=mindAnnotations.filter(x=>x.id!==b.dataset.markDelete);saveMindAnnotations();openMindMarks(id);renderMindsV09();});
  }

  // ---------- MINDS render ----------
  function renderMindsV09(){
    const view=$('view-mind');if(!view)return;
    const ids=allThreadIds(),activeIds=ids.filter(isThreadActive);
    if(!ids.includes(activeThread))activeThread=activeIds[0]||ids[0];
    const meta=threadMeta[activeThread]||{};const body=threadBody(activeThread);const active=isThreadActive(activeThread);const annCount=mindAnnotations.filter(a=>a.threadId===activeThread).length;const chatCount=convCount('mind',activeThread);
    view.innerHTML=`<div class="v09-minds-shell"><div class="v09-minds-workspace"><nav class="v09-thread-nav"><div class="v09-nav-label">CERCA AHORA</div>${activeIds.map(id=>`<button data-thread="${esc(id)}" class="${id===activeThread?'active':''}" title="${esc(threadMeta[id]?.why||'')}"><b>${esc(threadTitle(id))}</b></button>`).join('')}<button class="archive-link" data-open-archive>Archivo vivo · ${ids.length}</button></nav><article class="v09-thread" data-thread-id="${esc(activeThread)}"><header class="v09-thread-head"><div class="v09-thread-status"><span class="${active?'active':'latent'}">${active?'CERCA AHORA':'MEMORIA LATENTE'}</span><button data-pin-thread>${pins.has(activeThread)?'Dejar de fijar':'Mantener cerca'}</button></div><h2>${esc(threadLongTitle(activeThread))}</h2></header><div class="v09-thread-body">${body.map(b=>`<p data-mind-block="${b.id}" class="${esc(b.cls)}">${b.html}</p>`).join('')}</div><footer class="v09-thread-footer"><button class="primary" data-thread-talk>Conversar${chatCount?` · ${chatCount}`:''}</button><button data-thread-history>Historia</button><button data-thread-marks>Marcas${annCount?` · ${annCount}`:''}</button><button data-thread-convs>Conversaciones${chatCount?` · ${chatCount}`:''}</button></footer><div class="v09-thread-trace">Procedencia: ${(meta.sources||dispatchMap[activeThread]?.trace||[]).map(esc).join(' · ')}</div></article></div></div>`;
    view.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>{activeThread=b.dataset.thread;threadState.lastOpened[activeThread]=now();saveThreadState();renderMindsV09();});
    view.querySelectorAll('[data-open-archive]').forEach(b=>b.onclick=()=>openArchive());
    view.querySelector('[data-pin-thread]')?.addEventListener('click',()=>{pins.has(activeThread)?pins.delete(activeThread):pins.add(activeThread);saveThreadState();renderMindsV09();});
    view.querySelector('[data-thread-talk]')?.addEventListener('click',()=>askFromOrigin({type:'mind',id:activeThread,label:'MINDS · '+threadTitle(activeThread)}, {reuseGeneral:true}));
    view.querySelector('[data-thread-history]')?.addEventListener('click',()=>openThreadHistory(activeThread));
    view.querySelector('[data-thread-marks]')?.addEventListener('click',()=>openMindMarks(activeThread));
    view.querySelector('[data-thread-convs]')?.addEventListener('click',()=>openHistory('mind',activeThread));
    setTimeout(()=>markMindBlocks(activeThread),0);
  }

  // ---------- readings ----------
  let readingFilter='all';
  const returnKey='minds_theory_v08_reading_returns';let readingReturns=new Set(safeJSON(returnKey,[]));
  function readingAnnotations(){return safeJSON('theorylab_v05_annotations',[]).filter(a=>a&&a.reading);}
  function readingStats(id){const anns=readingAnnotations().filter(a=>a.reading===id);return{marks:anns.length,notes:anns.filter(a=>(a.note||'').trim()).length,convs:convCount('reading',id)};}
  function renderReadingsV09(){
    const view=$('view-readings');if(!view)return;const allAnns=readingAnnotations(),totalNotes=allAnns.filter(a=>(a.note||'').trim()).length,totalConvs=conversations.filter(c=>c.origin?.type==='reading').length;
    view.innerHTML=`<div class="v09-readings-head"><div class="v09-overline">LECTURAS</div><h1>Leer, marcar, preguntar, volver.</h1><p>La memoria de lectura vive aquí: texto completo disponible, subrayados, notas, conversaciones y una relectura construida por tus propias decisiones.</p></div><div class="v09-reading-filters">${[['all','Todo'],['highlighted','Subrayados'],['notes','Con notas'],['conversations','Conversaciones'],['return','Por volver'],['reread','Relectura']].map(([id,l])=>`<button data-rf="${id}" class="${readingFilter===id?'active':''}">${l}</button>`).join('')}<span>${allAnns.length} subrayados · ${totalNotes} notas · ${totalConvs} conversaciones</span></div><div id="v09ReadingBody"></div>`;
    view.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>{readingFilter=b.dataset.rf;renderReadingsV09();});
    const root=$('v09ReadingBody');
    if(readingFilter==='reread'){renderRereadV09(root,allAnns);return;}
    const visible=readings.filter(r=>{const s=readingStats(r.id);if(readingFilter==='highlighted')return s.marks>0;if(readingFilter==='notes')return s.notes>0;if(readingFilter==='conversations')return s.convs>0;if(readingFilter==='return')return readingReturns.has(r.id);return true;});
    root.innerHTML=`<div class="v09-reading-list">${visible.length?visible.map(r=>{const s=readingStats(r.id),docs=corpus.readings[r.id]||[],words=docs.reduce((n,id)=>n+(corpus.docs[id]?.text||'').split(/\s+/).filter(Boolean).length,0);return `<article data-reading="${esc(r.id)}"><div class="v09-reading-author"><b>${esc(r.author)}</b><span>${words.toLocaleString('es')} palabras</span></div><div class="v09-reading-main"><h2>${esc(corpus.docs[docs[0]]?.label||r.title)}</h2><p>${r.id==='rei'?'Lectura revisada parcial y primera entrega completa.':r.id==='paw'?'Entrega breve original completa.':'Desarrollo disponible en el corpus.'}</p><div class="v09-reading-stats"><span>${s.marks} subrayados</span><span>${s.notes} notas</span><span>${s.convs} conversaciones</span></div></div><div class="v09-reading-actions"><button data-open-reading="${esc(r.id)}">Leer</button><button data-reading-convs="${esc(r.id)}">Conversaciones</button><button data-return-reading="${esc(r.id)}" class="${readingReturns.has(r.id)?'on':''}">${readingReturns.has(r.id)?'Guardado':'Por volver'}</button></div></article>`;}).join(''):'<div class="v09-empty">Todavía no hay lecturas en este filtro.</div>'}</div>`;
    root.querySelectorAll('[data-open-reading]').forEach(b=>b.onclick=e=>{e.stopPropagation();openReading?.(b.dataset.openReading);setTimeout(enhanceReaderV09,80);});
    root.querySelectorAll('[data-reading-convs]').forEach(b=>b.onclick=e=>{e.stopPropagation();openHistory('reading',b.dataset.readingConvs);});
    root.querySelectorAll('[data-return-reading]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.returnReading;readingReturns.has(id)?readingReturns.delete(id):readingReturns.add(id);saveJSON(returnKey,[...readingReturns]);renderReadingsV09();});
    root.querySelectorAll('[data-reading]').forEach(a=>a.onclick=()=>{openReading?.(a.dataset.reading);setTimeout(enhanceReaderV09,80);});
  }
  function renderRereadV09(root,anns){
    if(!anns.length){root.innerHTML='<div class="v09-empty v09-reread-empty">Todavía no hay subrayados. Cuando marques una lectura, aquí aparecerá tu propia versión de relectura: pasajes conservados, tus notas y acceso directo al contexto original.</div>';return;}
    root.innerHTML=`<div class="v09-reread-list">${[...anns].sort((a,b)=>String(b.created).localeCompare(String(a.created))).map(a=>{const r=readings.find(x=>x.id===a.reading),c=convCount('reading',a.reading);return `<article><div class="v09-reread-meta">${esc(r?.author||'Lectura')} · ${esc(fmtDate(a.created))}</div><blockquote>${esc(a.quote)}</blockquote>${a.note?`<div class="v09-user-note">${esc(a.note)}</div>`:''}<div class="v09-reread-actions"><button data-reread-jump="${esc(a.id)}">Abrir contexto</button><button data-reread-ask="${esc(a.id)}">Preguntar</button>${c?`<button data-reread-convs="${esc(a.reading)}">Conversaciones · ${c}</button>`:''}</div></article>`;}).join('')}</div>`;
    root.querySelectorAll('[data-reread-jump]').forEach(b=>b.onclick=()=>jumpTo?.(b.dataset.rereadJump));
    root.querySelectorAll('[data-reread-ask]').forEach(b=>b.onclick=()=>{const a=anns.find(x=>x.id===b.dataset.rereadAsk),r=readings.find(x=>x.id===a?.reading);askFromOrigin({type:'reading',id:a?.reading||'unknown',readingId:a?.reading||'',label:'Lectura · '+(r?.author||''),quote:a?.quote||''});});
    root.querySelectorAll('[data-reread-convs]').forEach(b=>b.onclick=()=>openHistory('reading',b.dataset.rereadConvs));
  }

  // ---------- reader integration ----------
  function enhanceReaderV09(){
    const drawer=$('drawer');if(!drawer?.classList.contains('open'))return;
    drawer.querySelector('.reader-quiet-tools')?.remove();
    const tools=document.createElement('div');tools.className='v09-reader-tools';const id=(typeof activeReading!=='undefined'&&activeReading)||'';const s=id?readingStats(id):{marks:0,convs:0};
    tools.innerHTML=`<button data-reader-notes>Anotaciones · ${s.marks}</button><button data-reader-convs>Conversaciones · ${s.convs}</button><span></span><button data-font="down">A−</button><button data-font="up">A+</button>`;
    drawer.querySelector('.reader-grid')?.before(tools);
    tools.querySelector('[data-reader-notes]').onclick=()=>drawer.querySelector('.reader-tools')?.classList.add('mobile-open');
    tools.querySelector('[data-reader-convs]').onclick=()=>openHistory('reading',id);
    tools.querySelector('[data-font="down"]').onclick=()=>changeReadingSize(-.05);tools.querySelector('[data-font="up"]').onclick=()=>changeReadingSize(.05);
  }
  function changeReadingSize(delta){const root=document.documentElement,cur=parseFloat(getComputedStyle(root).getPropertyValue('--reading-size'))||1.08,neu=Math.max(.94,Math.min(1.36,cur+delta));root.style.setProperty('--reading-size',neu+'rem');}
  const previousOpenReading=typeof openReading==='function'?openReading:null;if(previousOpenReading){openReading=function(id){previousOpenReading(id);setTimeout(enhanceReaderV09,80);};}

  // ---------- selection toolbar ----------
  const selectBar=document.createElement('div');selectBar.className='v09-selection-bar';selectBar.innerHTML='<button data-action="highlight">Subrayar</button><button data-action="note">Nota</button><button data-action="ask">Preguntar</button>';document.body.appendChild(selectBar);
  let selectionCtx=null;
  function selectionRangeRect(){const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;const r=s.getRangeAt(0).getBoundingClientRect();return r.width||r.height?r:null;}
  function hideSelectBar(){selectBar.classList.remove('open');selectionCtx=null;}
  function positionSelectBar(rect){if(!rect)return;if(matchMedia('(max-width:900px)').matches)return;const w=selectBar.offsetWidth||250;let x=Math.max(12,Math.min(innerWidth-w-12,rect.left+rect.width/2-w/2)),y=rect.top-54;if(y<72)y=rect.bottom+10;selectBar.style.left=x+'px';selectBar.style.top=y+'px';}
  function captureMindSelection(){
    const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;const r=s.getRangeAt(0),thread=document.querySelector('.v09-thread');if(!thread||!thread.contains(r.commonAncestorContainer))return null;const segments=[];const blocks=threadBody(activeThread);
    thread.querySelectorAll('[data-mind-block]').forEach(p=>{if(!r.intersectsNode(p))return;const part=document.createRange();part.selectNodeContents(p);if(p.contains(r.startContainer))part.setStart(r.startContainer,r.startOffset);if(p.contains(r.endContainer))part.setEnd(r.endContainer,r.endOffset);if(part.collapsed)return;const pre=document.createRange();pre.selectNodeContents(p);pre.setEnd(part.startContainer,part.startOffset);const start=pre.toString().length,end=start+part.toString().length;if(end>start)segments.push({block:+p.dataset.mindBlock,start,end});});
    if(!segments.length)return null;return{surface:'mind',threadId:activeThread,segments,quote:segments.map(seg=>(blocks[seg.block]?.text||'').slice(seg.start,seg.end)).join('\n\n')};
  }
  function captureReadingSelection(){
    const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;const r=s.getRangeAt(0),reader=$('readerBody');if(!reader||!reader.contains(r.commonAncestorContainer))return null;const quote=s.toString().trim();if(!quote)return null;let anchor=null;for(const p of reader.querySelectorAll('[data-block]')){if(r.intersectsNode(p)){anchor={doc:p.dataset.doc,block:p.dataset.block};break;}}
    const rid=(typeof activeReading!=='undefined'&&activeReading)||'unknown';const rr=readings.find(x=>x.id===rid);return{surface:'reading',readingId:rid,quote,anchor,label:'Lectura · '+(rr?.author||rid)};
  }
  function detectSelection(){const s=getSelection();if(!s||s.isCollapsed){hideSelectBar();return;}selectionCtx=captureMindSelection()||captureReadingSelection();if(!selectionCtx){hideSelectBar();return;}selectBar.classList.add('open');requestAnimationFrame(()=>positionSelectBar(selectionRangeRect()));}
  ['pointerup','touchend','keyup'].forEach(ev=>document.addEventListener(ev,e=>{if(selectBar.contains(e.target))return;setTimeout(detectSelection,ev==='touchend'?170:20);},true));
  document.addEventListener('selectionchange',()=>{const s=getSelection();if(!s||s.isCollapsed)setTimeout(hideSelectBar,100);});

  const noteDialog=document.createElement('dialog');noteDialog.className='v09-note-dialog';noteDialog.innerHTML='<form method="dialog"><h2>Nota sobre este fragmento</h2><blockquote></blockquote><textarea placeholder="¿Qué te hace pensar este fragmento?"></textarea><div><button type="submit" class="primary">Guardar</button><button type="button" data-cancel>Cancelar</button></div></form>';document.body.appendChild(noteDialog);let pendingMindSelection=null;
  noteDialog.querySelector('[data-cancel]').onclick=()=>noteDialog.close();
  noteDialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(!pendingMindSelection)return;mindAnnotations.push({id:uid(),threadId:pendingMindSelection.threadId,segments:pendingMindSelection.segments,quote:pendingMindSelection.quote,note:noteDialog.querySelector('textarea').value,created:now()});saveMindAnnotations();noteDialog.close();pendingMindSelection=null;getSelection()?.removeAllRanges();hideSelectBar();renderMindsV09();};
  selectBar.querySelector('[data-action="highlight"]').onclick=()=>{if(!selectionCtx)return;if(selectionCtx.surface==='mind'){mindAnnotations.push({id:uid(),threadId:selectionCtx.threadId,segments:selectionCtx.segments,quote:selectionCtx.quote,note:'',created:now()});saveMindAnnotations();getSelection()?.removeAllRanges();hideSelectBar();renderMindsV09();}else{beginAnnotation?.(false);hideSelectBar();setTimeout(()=>{renderReadingsV09();enhanceReaderV09();},80);}};
  selectBar.querySelector('[data-action="note"]').onclick=()=>{if(!selectionCtx)return;if(selectionCtx.surface==='mind'){pendingMindSelection=selectionCtx;noteDialog.querySelector('blockquote').textContent=selectionCtx.quote;noteDialog.querySelector('textarea').value='';noteDialog.showModal();setTimeout(()=>noteDialog.querySelector('textarea').focus(),20);}else{beginAnnotation?.(true);hideSelectBar();}};
  selectBar.querySelector('[data-action="ask"]').onclick=()=>{if(!selectionCtx)return;const ctx=selectionCtx;getSelection()?.removeAllRanges();hideSelectBar();if(ctx.surface==='mind')askFromOrigin({type:'mind',id:ctx.threadId,label:'MINDS · '+threadTitle(ctx.threadId),quote:ctx.quote});else askFromOrigin({type:'reading',id:ctx.readingId,readingId:ctx.readingId,label:ctx.label,quote:ctx.quote,anchor:ctx.anchor});};

  // ---------- global ask/history actions ----------
  globalActions?.querySelector('[data-v09-ask]')?.addEventListener('click',()=>askFromOrigin({type:'global',id:'global',label:'Pregunta global'}));
  globalActions?.querySelector('[data-v09-history]')?.addEventListener('click',()=>openHistory('all'));

  // ---------- navigation ----------
  function setViewV091(v){
    if(!['mind','readings'].includes(v)) v='mind';

    document.querySelectorAll('.view').forEach(el=>{
      el.classList.remove('active');
    });

    const target=document.getElementById('view-'+v);
    if(target) target.classList.add('active');

    document.querySelectorAll('#topnav button').forEach(button=>{
      button.classList.toggle('active',button.dataset.view===v);
    });

    document.body.classList.toggle('mind-mode',v==='mind');

    if(v==='mind'){
      renderMindsV09();
    }else{
      renderReadingsV09();
    }
  }

  window.setView=setViewV091;
  document.querySelectorAll('#topnav button').forEach(button=>{
    button.onclick=()=>setViewV091(button.dataset.view);
  });

  // Boot.
  setViewV091(new URLSearchParams(location.search).get('embedded')==='1'?'readings':'mind');

  window.MINDS_V09={
    get conversations(){return conversations},
    get annotations(){return mindAnnotations},
    get pins(){return [...pins]},
    snapshot(){
      return allThreadIds().map(id=>({
        slug:id,
        title:threadLongTitle(id),
        description:threadMeta[id]?.why||'',
        body:threadBody(id).map(b=>b.text).filter(Boolean).join('\n\n'),
        active:isThreadActive(id),
        pinned:pins.has(id),
        epistemicStatus:id==='morris'?'deprioritized':id==='human-end'?'open':'provisional',
        sources:[...(threadMeta[id]?.sources||[])],
        connections:[...(threadMeta[id]?.connections||[])],
        evolution:[...(evolution[id]||[])]
      }));
    },
    renderMinds:renderMindsV09,
    renderReadings:renderReadingsV09,
    openHistory,
    askFromOrigin,
    openArchive
  };
})();
