/* MINDS - Theory v0.8 — MINDS as living threads, contextual annotation, unified lived memory */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeJSON=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback}};
  const saveJSON=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v));return true}catch{return false}};

  document.title='MINDS - Theory';
  document.querySelector('.brand')?.replaceChildren(document.createTextNode('MINDS - Theory'));
  if(document.querySelector('.sub')) document.querySelector('.sub').textContent='tercer cerebro · v0.8 · pensamiento vivo';

  // Primary navigation is intentionally reduced. Memory remains infrastructure; topology returns contextually.
  document.querySelectorAll('#topnav button').forEach(b=>{
    if(['memory','graph'].includes(b.dataset.view)) b.remove();
    if(b.dataset.view==='mind') b.textContent='MINDS';
    if(b.dataset.view==='readings') b.textContent='LECTURAS';
    if(b.dataset.view==='ask') b.textContent='PREGUNTAR';
  });

  // ---------- shared selection action bubble ----------
  const selectionBubble=document.createElement('div');
  selectionBubble.className='selection-actions';
  selectionBubble.setAttribute('role','toolbar');
  selectionBubble.innerHTML='<button data-sel="highlight">Subrayar</button><button data-sel="note">Nota</button><button data-sel="ask">Preguntar</button>';
  document.body.appendChild(selectionBubble);
  let selectionContext=null;

  function selectionRect(){
    const s=getSelection(); if(!s||!s.rangeCount||s.isCollapsed)return null;
    const r=s.getRangeAt(0).getBoundingClientRect();
    return r.width||r.height?r:null;
  }
  function positionSelectionBubble(rect){
    if(!rect)return;
    if(matchMedia('(max-width:900px)').matches){selectionBubble.style.left='10px';selectionBubble.style.top='auto';return;}
    const w=Math.min(300,selectionBubble.offsetWidth||260),x=Math.max(10,Math.min(innerWidth-w-10,rect.left+rect.width/2-w/2));
    let y=rect.top-54;if(y<76)y=Math.min(innerHeight-60,rect.bottom+10);
    selectionBubble.style.left=x+'px';selectionBubble.style.top=y+'px';selectionBubble.style.right='auto';selectionBubble.style.bottom='auto';
  }
  function hideSelectionBubble(){selectionBubble.classList.remove('open');}

  // ---------- MINDS: living threads ----------
  const rawDispatches=window.THEORYLAB_MIND?.dispatches||[];
  const threadMeta={
    teleology:{short:'Reducción como medio',state:'Hilo central · abierto',intro:'Este hilo intenta seguir la reducción más allá de la operación: qué permite, qué experiencia puede favorecer y por qué esa experiencia podría importar.'},
    sensitivity:{short:'Intensificación y sensibilidad',state:'Hipótesis · en observación',intro:'Aquí MINDS distingue entre hacer más fuerte un fenómeno y volvernos más capaces de percibir diferencias débiles.'},
    'human-end':{short:'¿Para qué?',state:'Frontera · no resuelta',intro:'Este hilo mantiene abierta la pregunta humana sin convertir todavía calma o tranquilidad en una conclusión.'}
  };
  const threadBlocks={};
  rawDispatches.forEach(d=>{
    const box=document.createElement('div');box.innerHTML=d.html;
    threadBlocks[d.id]=[...box.children].filter(el=>el.tagName==='P').map((el,i)=>({id:i,text:el.textContent||'',html:el.innerHTML,cls:el.className||''}));
  });
  const mindAnnKey='minds_theory_v08_mind_annotations';
  let mindAnnotations=safeJSON(mindAnnKey,[]);
  const mindChatKey='minds_theory_v08_thread_chats';
  let mindChats=safeJSON(mindChatKey,{});
  let activeThread=rawDispatches[0]?.id||'teleology';

  function mindAnnotationRanges(threadId,block){return mindAnnotations.filter(a=>a.threadId===threadId&&a.segments?.some(s=>s.block===block));}
  function markMindBlocks(threadId){
    document.querySelectorAll('.mind-thread-body [data-mind-block]').forEach(el=>el.classList.toggle('has-mind-mark',mindAnnotationRanges(threadId,+el.dataset.mindBlock).length>0));
    if(!globalThis.CSS?.highlights||typeof Highlight==='undefined')return;
    const ranges=[];
    mindAnnotations.filter(a=>a.threadId===threadId).forEach(a=>a.segments.forEach(seg=>{
      const p=document.querySelector(`.mind-thread-body [data-mind-block="${seg.block}"]`); if(!p)return;
      const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let nodes=[],n,total=0;while(n=walker.nextNode()){nodes.push({node:n,start:total,end:total+n.data.length});total+=n.data.length;}
      const startRec=nodes.find(x=>seg.start>=x.start&&seg.start<=x.end),endRec=nodes.find(x=>seg.end>=x.start&&seg.end<=x.end)||nodes.at(-1);if(!startRec||!endRec)return;
      try{const r=document.createRange();r.setStart(startRec.node,Math.max(0,seg.start-startRec.start));r.setEnd(endRec.node,Math.max(0,Math.min(endRec.node.data.length,seg.end-endRec.start)));ranges.push(r);}catch{}
    }));
    CSS.highlights.delete('minds-user-marks'); if(ranges.length)CSS.highlights.set('minds-user-marks',new Highlight(...ranges));
  }

  function renderMinds(){
    const view=$('view-mind');if(!view)return;
    const current=rawDispatches.find(d=>d.id===activeThread)||rawDispatches[0]; if(!current)return;
    const meta=threadMeta[current.id]||{short:current.title,state:'Hilo vivo',intro:''};
    const blocks=threadBlocks[current.id]||[];
    const annCount=mindAnnotations.filter(a=>a.threadId===current.id).length;
    const chatCount=(mindChats[current.id]||[]).filter(m=>m.role==='user').length;
    view.innerHTML=`<div class="minds-shell">
      <header class="minds-intro"><div><div class="overline">MINDS · TERCER CEREBRO</div><h1>El pensamiento no se archiva: permanece abierto a conversación, corrección y regreso.</h1></div><p>MINDS trabaja sobre lecturas, subrayados, notas, feedback y memoria dormida. Aquí no ves “entradas”: ves hilos que pueden transformarse con el tiempo.</p></header>
      <div class="minds-workspace">
        <nav class="minds-thread-nav" aria-label="Hilos vivos"><div class="label">HILOS VIVOS</div>${rawDispatches.map(d=>`<button data-thread="${esc(d.id)}" class="${d.id===current.id?'active':''}">${esc(threadMeta[d.id]?.short||d.title)}<span class="nav-small">${esc(threadMeta[d.id]?.state||'Hilo vivo')}</span></button>`).join('')}</nav>
        <article class="minds-thread" data-annotatable-surface="mind" data-thread-id="${esc(current.id)}">
          <header class="minds-thread-head"><div class="minds-thread-meta">${esc(meta.state)}</div><h2>${esc(current.title)}</h2><p>${esc(meta.intro)}</p></header>
          <div class="mind-thread-body">${blocks.map(b=>`<p data-mind-block="${b.id}" class="${esc(b.cls)}">${b.html}</p>`).join('')}</div>
          <footer class="minds-thread-footer"><button class="primary" data-thread-chat>Conversar sobre este pensamiento${chatCount?` · ${chatCount}`:''}</button><button data-thread-marks>Mis marcas${annCount?` · ${annCount}`:''}</button><button data-thread-connections>Ver conexiones</button></footer>
          <div class="minds-trace">Procedencia activa: ${current.trace.map(esc).join(' · ')}</div>
          <div class="minds-local-status">En v0.8 la conversación se conserva localmente. El motor generativo real se conectará después; esta interfaz ya está preparada para que las respuestas futuras queden vinculadas al hilo y a los fragmentos que las originaron.</div>
        </article>
      </div>
    </div>`;
    view.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>{activeThread=b.dataset.thread;renderMinds();});
    view.querySelector('[data-thread-chat]')?.addEventListener('click',()=>openMindConversation(current.id));
    view.querySelector('[data-thread-marks]')?.addEventListener('click',()=>openMindMarks(current.id));
    view.querySelector('[data-thread-connections]')?.addEventListener('click',()=>openConnections(current.id));
    setTimeout(()=>markMindBlocks(current.id),0);
  }

  function captureMindSelection(){
    const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;const r=s.getRangeAt(0),thread=document.querySelector('.minds-thread[data-annotatable-surface="mind"]');if(!thread||!thread.contains(r.commonAncestorContainer))return null;
    const segments=[];thread.querySelectorAll('[data-mind-block]').forEach(p=>{if(!r.intersectsNode(p))return;const part=document.createRange();part.selectNodeContents(p);if(p.contains(r.startContainer))part.setStart(r.startContainer,r.startOffset);if(p.contains(r.endContainer))part.setEnd(r.endContainer,r.endOffset);if(part.collapsed)return;const pre=document.createRange();pre.selectNodeContents(p);pre.setEnd(part.startContainer,part.startOffset);const start=pre.toString().length,end=start+part.toString().length;if(end>start)segments.push({block:+p.dataset.mindBlock,start,end});});
    if(!segments.length)return null;const quote=segments.map(seg=>(threadBlocks[activeThread]?.[seg.block]?.text||'').slice(seg.start,seg.end)).join('\n\n');return{surface:'mind',threadId:activeThread,segments,quote};
  }
  function addMindAnnotation(ctx,note=''){
    const a={id:crypto.randomUUID?.()||('m'+Date.now()),threadId:ctx.threadId,segments:ctx.segments,quote:ctx.quote,note,created:new Date().toISOString()};mindAnnotations=[...mindAnnotations,a];saveJSON(mindAnnKey,mindAnnotations);getSelection()?.removeAllRanges();hideSelectionBubble();renderMinds();return a;
  }

  const noteDialog=document.createElement('dialog');noteDialog.className='mind-annotation-dialog';noteDialog.innerHTML='<form method="dialog"><h2>Nota sobre este fragmento</h2><blockquote></blockquote><textarea placeholder="¿Qué te hace pensar este fragmento?"></textarea><div class="reader-actions"><button type="submit" class="vbtn primary">Guardar nota</button><button type="button" class="vbtn" data-cancel>Cancelar</button></div></form>';
  document.body.appendChild(noteDialog);let pendingMindNote=null;
  noteDialog.querySelector('[data-cancel]').onclick=()=>noteDialog.close();
  noteDialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(pendingMindNote)addMindAnnotation(pendingMindNote,noteDialog.querySelector('textarea').value.trim());noteDialog.close();pendingMindNote=null;};
  function openMindNote(ctx){pendingMindNote=ctx;noteDialog.querySelector('blockquote').textContent=ctx.quote;noteDialog.querySelector('textarea').value='';noteDialog.showModal();setTimeout(()=>noteDialog.querySelector('textarea').focus(),0);}

  // ---------- conversation sheet for MINDS ----------
  const mindSheet=document.createElement('aside');mindSheet.className='mind-sheet';mindSheet.innerHTML='<div class="mind-sheet-head"><div class="copy"><div class="mind-chat-kicker">CONVERSACIÓN VINCULADA</div><h2></h2></div><button class="sheet-close" aria-label="Cerrar">×</button></div><div class="mind-chat-context" hidden></div><div class="mind-chat-log"></div><form class="mind-chat-composer"><textarea placeholder="Comenta, cuestiona o continúa este pensamiento..."></textarea><button>Enviar</button></form>';
  document.body.appendChild(mindSheet);let chatThread=null,chatQuote='';
  mindSheet.querySelector('.sheet-close').onclick=()=>mindSheet.classList.remove('open');
  function localMindReply(threadId,q,quote){
    const d=rawDispatches.find(x=>x.id===threadId),m=threadMeta[threadId];
    let body='Este hilo todavía está siendo respondido por el motor local del prototipo. ';
    if(typeof memoryAnswer==='function'){const r=memoryAnswer(q+' '+(quote||''));body+=r.body;}
    else body+=`Tu pregunta queda vinculada a “${m?.short||d?.title}”. Cuando conectemos el motor de IA, MINDS podrá responder usando este hilo, tus lecturas, marcas y memoria histórica.`;
    return body+'\n\n[Respuesta local provisional · el razonamiento generativo se activará al conectar el backend.]';
  }
  function renderMindChat(){
    const d=rawDispatches.find(x=>x.id===chatThread);mindSheet.querySelector('h2').textContent=threadMeta[chatThread]?.short||d?.title||'Conversación';const ctx=mindSheet.querySelector('.mind-chat-context');ctx.hidden=!chatQuote;ctx.textContent=chatQuote?`Fragmento: “${chatQuote}”`:'';
    const msgs=mindChats[chatThread]||[];mindSheet.querySelector('.mind-chat-log').innerHTML=msgs.length?msgs.map(m=>`<div class="chat-msg ${m.role}"><span class="msg-label">${m.role==='user'?'TÚ':'MINDS · PROVISIONAL'}</span>${esc(m.text)}</div>`).join(''):'<div class="chat-msg assistant"><span class="msg-label">MINDS</span>Este hilo está abierto. Puedes cuestionarlo, pedir una aclaración o continuar el razonamiento. Las preguntas quedan guardadas junto al pensamiento.</div>';
    setTimeout(()=>{const log=mindSheet.querySelector('.mind-chat-log');log.scrollTop=log.scrollHeight;},0);
  }
  function openMindConversation(threadId,quote=''){chatThread=threadId;chatQuote=quote||'';renderMindChat();mindSheet.classList.add('open');setTimeout(()=>mindSheet.querySelector('textarea').focus(),200);}
  mindSheet.querySelector('form').onsubmit=e=>{e.preventDefault();const ta=mindSheet.querySelector('textarea'),q=ta.value.trim();if(!q)return;const arr=mindChats[chatThread]||[];arr.push({role:'user',text:q,quote:chatQuote,at:new Date().toISOString()});arr.push({role:'assistant',text:localMindReply(chatThread,q,chatQuote),at:new Date().toISOString(),provisional:true});mindChats[chatThread]=arr;saveJSON(mindChatKey,mindChats);ta.value='';chatQuote='';renderMindChat();renderMinds();};

  function openMindMarks(threadId){
    chatThread=threadId;chatQuote='';const d=rawDispatches.find(x=>x.id===threadId);mindSheet.querySelector('h2').textContent='Marcas · '+(threadMeta[threadId]?.short||d?.title||'MINDS');mindSheet.querySelector('.mind-chat-context').hidden=true;const list=mindAnnotations.filter(a=>a.threadId===threadId);mindSheet.querySelector('.mind-chat-log').innerHTML=`<div class="mind-marks">${list.length?list.map(a=>`<div class="mind-mark-card"><blockquote>${esc(a.quote)}</blockquote>${a.note?`<p>${esc(a.note)}</p>`:'<p>Subrayado sin nota.</p>'}<button data-mark-ask="${esc(a.id)}">Preguntar</button><button data-mark-delete="${esc(a.id)}">Eliminar</button></div>`).join(''):'<p>Todavía no has marcado nada en este hilo.</p>'}</div>`;mindSheet.classList.add('open');mindSheet.querySelectorAll('[data-mark-ask]').forEach(b=>b.onclick=()=>{const a=mindAnnotations.find(x=>x.id===b.dataset.markAsk);openMindConversation(threadId,a?.quote||'');});mindSheet.querySelectorAll('[data-mark-delete]').forEach(b=>b.onclick=()=>{mindAnnotations=mindAnnotations.filter(x=>x.id!==b.dataset.markDelete);saveJSON(mindAnnKey,mindAnnotations);openMindMarks(threadId);renderMinds();});
  }

  // ---------- contextual topology ----------
  const connectionsSheet=document.createElement('aside');connectionsSheet.className='connections-sheet';connectionsSheet.innerHTML='<div class="connections-head"><div class="copy"><div class="mind-chat-kicker">CONEXIONES CONTEXTUALES</div><h2></h2></div><button class="sheet-close" aria-label="Cerrar">×</button></div><div class="connections-body"></div>';
  document.body.appendChild(connectionsSheet);connectionsSheet.querySelector('.sheet-close').onclick=()=>connectionsSheet.classList.remove('open');
  function openConnections(threadId){
    const d=rawDispatches.find(x=>x.id===threadId);if(!d)return;connectionsSheet.querySelector('h2').textContent=threadMeta[threadId]?.short||d.title;const items=d.trace.slice(0,6),cx=210,cy=180,rad=125;const pts=items.map((x,i)=>({label:x,x:cx+Math.cos((i/items.length)*Math.PI*2-Math.PI/2)*rad,y:cy+Math.sin((i/items.length)*Math.PI*2-Math.PI/2)*rad}));connectionsSheet.querySelector('.connections-body').innerHTML=`<svg class="context-map" viewBox="0 0 420 360" aria-label="Conexiones de este pensamiento">${pts.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"></line>`).join('')}<circle class="center-node" cx="${cx}" cy="${cy}" r="11"></circle><text x="${cx+17}" y="${cy+4}">${esc(threadMeta[threadId]?.short||'MINDS')}</text>${pts.map(p=>`<circle class="source-node" cx="${p.x}" cy="${p.y}" r="7"></circle><text x="${p.x+12}" y="${p.y+4}">${esc(p.label.length>31?p.label.slice(0,30)+'…':p.label)}</text>`).join('')}</svg><p class="connections-note">Esta vista no intenta mostrar todo el grafo. Solo enseña qué lecturas, feedback y conceptos están sosteniendo el pensamiento que tienes abierto. La topología global permanece fuera de la navegación hasta que pueda ser realmente legible.</p>`;connectionsSheet.classList.add('open');
  }

  // ---------- READINGS: annotation is the memory interface ----------
  let readingFilter='all';
  const returnKey='minds_theory_v08_reading_returns';let readingReturns=new Set(safeJSON(returnKey,[]));
  function readReadingAnnotations(){return safeJSON('theorylab_v05_annotations',[]).filter(a=>a&&a.reading);}
  function readingStats(id){const list=readReadingAnnotations().filter(a=>a.reading===id);return{all:list,high:list.length,notes:list.filter(a=>(a.note||'').trim()).length};}
  function renderReadingsV08(){
    const view=$('view-readings');if(!view)return;const allAnns=readReadingAnnotations(),totalNotes=allAnns.filter(a=>(a.note||'').trim()).length;
    const hero=view.querySelector('.hero-main');if(hero){hero.innerHTML='<div class="kicker">LECTURAS · MEMORIA VIVIDA</div><h1>Leer, marcar, volver.</h1><p>El texto completo permanece intacto. Tu memoria aparece encima de él: subrayados, notas, preguntas y fragmentos a los que decides regresar.</p>';}
    let inbox=view.querySelector('.reading-inbox');if(!inbox){inbox=document.createElement('div');inbox.className='reading-inbox';hero?.after(inbox);}inbox.innerHTML='<div class="reading-inbox-inner"><strong>Entrega directa</strong><span>Cuando conectemos el motor, las nuevas lecturas llegarán aquí directamente. Ya no tendrán que pasar primero por otro chat.</span></div>';
    let filters=view.querySelector('.reading-filters');if(!filters){filters=document.createElement('div');filters.className='reading-filters';inbox.after(filters);}const opts=[['all','Todo'],['highlighted','Subrayados'],['notes','Con notas'],['return','Por volver'],['reread','Relectura']];filters.innerHTML=opts.map(([id,l])=>`<button data-reading-filter="${id}" class="${readingFilter===id?'active':''}">${l}</button>`).join('')+`<span class="reading-filter-summary">${allAnns.length} subrayados · ${totalNotes} notas</span>`;filters.querySelectorAll('[data-reading-filter]').forEach(b=>b.onclick=()=>{readingFilter=b.dataset.readingFilter;renderReadingsV08();});
    const list=$('readinglist');if(readingFilter==='reread'){list.style.display='none';let rr=view.querySelector('.reread-list');if(!rr){rr=document.createElement('div');rr.className='reread-list';list.after(rr);}renderReread(rr,allAnns);return;}view.querySelector('.reread-list')?.remove();list.style.display='block';
    const visible=readings.filter(r=>{const s=readingStats(r.id);if(readingFilter==='highlighted')return s.high>0;if(readingFilter==='notes')return s.notes>0;if(readingFilter==='return')return readingReturns.has(r.id);return true;});
    list.innerHTML=visible.length?visible.map(r=>{const s=readingStats(r.id),ds=corpus.readings[r.id]||[],words=ds.reduce((n,id)=>n+(corpus.docs[id]?.text||'').split(/\s+/).filter(Boolean).length,0);return `<article class="reading" data-full-reading="${esc(r.id)}"><div><div class="who">${esc(r.author)}</div><div class="date">${words.toLocaleString('es')} palabras</div></div><div><h4>${esc(corpus.docs[ds[0]]?.label||r.title)}</h4><p>${r.id==='rei'?'Lectura revisada parcial y primera entrega completa.':r.id==='paw'?'Entrega breve original completa.':'Desarrollo disponible en el corpus.'}</p><div class="reading-stats"><span class="reading-stat">${s.high} subrayados</span><span class="reading-stat">${s.notes} notas</span></div></div><div class="reading-side-actions"><button data-open-reading="${esc(r.id)}">Leer</button><button data-return-reading="${esc(r.id)}" class="${readingReturns.has(r.id)?'on':''}">${readingReturns.has(r.id)?'Guardado':'Volver'}</button></div></article>`;}).join(''):'<div class="reread-empty">Todavía no hay lecturas en este filtro.</div>';
    list.querySelectorAll('[data-open-reading]').forEach(b=>b.onclick=e=>{e.stopPropagation();openReading?.(b.dataset.openReading);setTimeout(enhanceReaderV08,0);});list.querySelectorAll('[data-return-reading]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.returnReading;readingReturns.has(id)?readingReturns.delete(id):readingReturns.add(id);saveJSON(returnKey,[...readingReturns]);renderReadingsV08();});list.querySelectorAll('article[data-full-reading]').forEach(a=>a.onclick=()=>{openReading?.(a.dataset.fullReading);setTimeout(enhanceReaderV08,0);});
  }
  function renderReread(root,anns){
    if(!anns.length){root.innerHTML='<div class="reread-empty">Todavía no hay subrayados. Cuando marques una lectura, aquí aparecerá tu propia versión de relectura: solo los pasajes que decidiste conservar y tus notas.</div>';return;}
    root.innerHTML=anns.sort((a,b)=>String(b.created).localeCompare(String(a.created))).map(a=>{const d=corpus.docs[a.segments?.[0]?.doc],r=readings.find(x=>x.id===a.reading);return `<article class="reread-card"><div class="reread-meta">${esc(r?.author||'Lectura')} · ${esc(d?.label||'Pasaje')}</div><blockquote>${esc(a.quote)}</blockquote>${a.note?`<div class="user-note">${esc(a.note)}</div>`:''}<div class="reread-actions"><button data-reread-jump="${esc(a.id)}">Abrir en contexto</button><button data-reread-ask="${esc(a.id)}">Preguntar sobre este pasaje</button></div></article>`;}).join('');root.querySelectorAll('[data-reread-jump]').forEach(b=>b.onclick=()=>jumpTo?.(b.dataset.rereadJump));root.querySelectorAll('[data-reread-ask]').forEach(b=>b.onclick=()=>{const a=anns.find(x=>x.id===b.dataset.rereadAsk);openAskWithContext(a?.quote||'',`Lectura · ${readings.find(x=>x.id===a?.reading)?.author||''}`);});
  }
  renderReadings=renderReadingsV08;

  function enhanceReaderV08(){
    const drawer=$('drawer');if(!drawer?.classList.contains('open'))return;drawer.querySelector('.mobile-reader-actions')?.remove();drawer.querySelector('.reader-progress')?.remove();const close=$('drawerClose');if(close){close.textContent='Cerrar';close.setAttribute('aria-label','Cerrar lectura');}
    if(!drawer.querySelector('.reader-quiet-tools')){const tools=document.createElement('div');tools.className='reader-quiet-tools';const activeCount=readReadingAnnotations().filter(a=>activeReading&&a.reading===activeReading).length;tools.innerHTML=`<button data-v08-reader-notes>Anotaciones</button><span class="count">${activeCount} marcas</span><span class="spacer"></span><button data-v08-font="down">A−</button><button data-v08-font="up">A+</button>`;drawer.querySelector('.reader-grid')?.before(tools);tools.querySelector('[data-v08-reader-notes]').onclick=()=>drawer.querySelector('.reader-tools')?.classList.add('mobile-open');tools.querySelector('[data-v08-font="down"]').onclick=()=>changeReadingSize(-.05);tools.querySelector('[data-v08-font="up"]').onclick=()=>changeReadingSize(.05);}
    const notes=drawer.querySelector('.reader-tools');if(notes&&!notes.querySelector('.mobile-notes-close')){const b=document.createElement('button');b.className='vbtn mobile-notes-close';b.textContent='Cerrar anotaciones';b.onclick=()=>notes.classList.remove('mobile-open');notes.prepend(b);}else notes?.querySelector('.mobile-notes-close')?.addEventListener('click',()=>notes.classList.remove('mobile-open'),{once:true});
  }
  function changeReadingSize(delta){const root=document.documentElement,cur=parseFloat(getComputedStyle(root).getPropertyValue('--reading-size'))||1.12,neu=Math.max(.92,Math.min(1.42,cur+delta));root.style.setProperty('--reading-size',neu+'rem');}
  const oldOpenReading=typeof openReading==='function'?openReading:null;if(oldOpenReading){openReading=function(id){oldOpenReading(id);setTimeout(enhanceReaderV08,0);};}

  // ---------- PREGUNTAR: chat-shaped interface ----------
  const askChatKey='minds_theory_v08_ask_chat';let askMessages=safeJSON(askChatKey,[]),askContext=null,askMode='memory';
  function renderAskV08(){
    const view=$('view-ask');if(!view)return;view.innerHTML=`<header class="ask-v08-head"><div class="minds-thread-meta">PREGUNTAR</div><h1>Habla con el tercer cerebro.</h1><p>Esta será la interfaz general para preguntar por tu trayectoria intelectual o explorar material que todavía no forma parte de tu memoria. En v0.8 usa el motor local del prototipo; la IA real llegará con la conexión segura al backend.</p></header><div class="ask-v08-modes"><button data-ask-v08="memory" class="${askMode==='memory'?'active':''}">Mi memoria</button><button data-ask-v08="outside" class="${askMode==='outside'?'active':''}">Explorar fuera</button></div><div class="ask-context-chip ${askContext?'open':''}" id="askContextChip">${askContext?esc(askContext.label+': “'+askContext.quote+'”'):''}</div><div class="ask-chat-log" id="askChatLog">${askMessages.length?askMessages.map(m=>`<div class="chat-msg ${m.role}"><span class="msg-label">${m.role==='user'?'TÚ':m.mode==='outside'?'MINDS · FUERA DE TU MEMORIA':'MINDS · TU MEMORIA'}</span>${esc(m.text)}</div>`).join(''):'<div class="chat-msg assistant"><span class="msg-label">MINDS</span>Puedes preguntar por algo que hayas leído, por una idea que cambió con el tiempo o por algo que todavía no conozcas. El sistema debe mantener esas dos capas separadas.</div>'}</div><form class="ask-chat-composer" id="askChatForm"><textarea id="askChatInput" placeholder="Escribe una pregunta..."></textarea><button>Enviar</button></form>`;view.querySelectorAll('[data-ask-v08]').forEach(b=>b.onclick=()=>{askMode=b.dataset.askV08;renderAskV08();});$('askChatForm').onsubmit=e=>{e.preventDefault();const ta=$('askChatInput'),q=ta.value.trim();if(!q)return;askMessages.push({role:'user',text:q,mode:askMode,context:askContext,at:new Date().toISOString()});let r;if(askMode==='outside'&&typeof outsideAnswer==='function')r=outsideAnswer(q);else if(typeof memoryAnswer==='function')r=memoryAnswer(q+' '+(askContext?.quote||''));const text=r?.body||(askMode==='outside'?'La exploración externa se activará con el motor conectado.':'No encuentro una coincidencia fuerte en el corpus local.');askMessages.push({role:'assistant',text:text+'\n\n[Respuesta local provisional · sin modelo conectado.]',mode:askMode,at:new Date().toISOString()});saveJSON(askChatKey,askMessages);askContext=null;renderAskV08();setTimeout(()=>{const log=$('askChatLog');log.scrollTop=log.scrollHeight;},0);};
  }
  function openAskWithContext(quote,label='Fragmento seleccionado'){askContext={quote,label};window.setView?.('ask');renderAskV08();setTimeout(()=>$('askChatInput')?.focus(),100);}

  // ---------- selection dispatch across READINGS and MINDS ----------
  function detectSelectionContext(){
    const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed){hideSelectionBubble();return;}const range=s.getRangeAt(0),txt=s.toString().trim();if(!txt){hideSelectionBubble();return;}
    const reader=$('readerBody');if(reader&&reader.contains(range.commonAncestorContainer)){selectionContext={surface:'reading',quote:txt};const rect=selectionRect();selectionBubble.classList.add('open');requestAnimationFrame(()=>positionSelectionBubble(rect));return;}
    const mind=captureMindSelection();if(mind){selectionContext=mind;const rect=selectionRect();selectionBubble.classList.add('open');requestAnimationFrame(()=>positionSelectionBubble(rect));return;}
    hideSelectionBubble();
  }
  ['pointerup','keyup','touchend'].forEach(ev=>document.addEventListener(ev,e=>{if(selectionBubble.contains(e.target))return;setTimeout(detectSelectionContext,ev==='touchend'?160:10);},true));
  document.addEventListener('selectionchange',()=>{const s=getSelection();if(!s||s.isCollapsed)setTimeout(()=>{if(!noteDialog.open)hideSelectionBubble();},80);});
  selectionBubble.querySelector('[data-sel="highlight"]').onclick=()=>{if(!selectionContext)return;if(selectionContext.surface==='mind')addMindAnnotation(selectionContext);else if(typeof beginAnnotation==='function'){beginAnnotation(false);hideSelectionBubble();setTimeout(()=>{renderReadingsV08();enhanceReaderV08();},50);}};
  selectionBubble.querySelector('[data-sel="note"]').onclick=()=>{if(!selectionContext)return;if(selectionContext.surface==='mind')openMindNote(selectionContext);else if(typeof beginAnnotation==='function'){beginAnnotation(true);hideSelectionBubble();}};
  selectionBubble.querySelector('[data-sel="ask"]').onclick=()=>{if(!selectionContext)return;const ctx=selectionContext;hideSelectionBubble();getSelection()?.removeAllRanges();if(ctx.surface==='mind')openMindConversation(ctx.threadId,ctx.quote);else openAskWithContext(ctx.quote,'Lectura');};

  // ---------- navigation ----------
  const priorSetView=window.setView;
  window.setView=function(v){if(['memory','graph'].includes(v))v='mind';priorSetView?.(v);document.body.classList.toggle('mind-mode',v==='mind');if(v==='mind')renderMinds();if(v==='readings')renderReadingsV08();if(v==='ask')renderAskV08();};
  document.querySelectorAll('#topnav button').forEach(b=>b.onclick=()=>window.setView(b.dataset.view));

  // Clean up inherited state and boot v0.8.
  document.querySelector('.left')?.setAttribute('aria-hidden','true');
  renderMinds();renderReadingsV08();renderAskV08();
  const current=(typeof state!=='undefined'&&['mind','readings','ask'].includes(state.view))?state.view:'mind';window.setView(current);

  // Export a small integration surface for the Supabase phase.
  window.MINDS_V08={
    get mindAnnotations(){return mindAnnotations},get mindChats(){return mindChats},get askMessages(){return askMessages},
    renderMinds,renderReadings:renderReadingsV08,openAskWithContext
  };
})();
