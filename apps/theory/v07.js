/* MINDS - Theory v0.7 — Spanish UI, rich memory, mobile reading, semantic topology */
(()=>{
  const $=id=>document.getElementById(id);
  const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Brand + global Spanish UI.
  document.title='MINDS - Theory';
  const brand=document.querySelector('.brand'); if(brand) brand.textContent='MINDS - Theory';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='tercer cerebro · v0.7 · teoría viva';
  const navLabels={mind:'PENSAMIENTO',readings:'LECTURAS',memory:'MEMORIA',ask:'PREGUNTAR',graph:'TOPOLOGÍA'};
  document.querySelectorAll('#topnav button').forEach(b=>{b.textContent=navLabels[b.dataset.view]||b.textContent;});
  const sectionEls=document.querySelectorAll('.left .section');
  if(sectionEls[0]) sectionEls[0].textContent='Lentes cognitivas';
  if(sectionEls[1]) sectionEls[1].textContent='Límite de memoria';
  const sideLabels={alive:'Lo que está vivo ahora',liked:'Lo que permaneció conmigo',unresolved:'No resuelto',return:'Volver más tarde',forgotten:'Dormido / olvidado',mine:'Mi corpus vivido',outside:'Más allá de mi corpus'};
  document.querySelectorAll('.sidebtn').forEach(b=>{const dot=b.querySelector('.dot'); b.textContent=sideLabels[b.dataset.filter]||b.textContent; if(dot)b.appendChild(dot);});
  const small=document.querySelector('.smallnote'); if(small) small.innerHTML='Nada se elimina porque deje de ser central. El sistema distingue <b>memoria</b> de <b>vitalidad actual</b>. Una idea dormida sigue siendo recuperable.';

  // Translate inherited ask surface and keep its current demo behavior explicit.
  const ask=$('view-ask');
  if(ask){
    const kicker=ask.querySelector('.askbox .kicker'); if(kicker) kicker.textContent='PREGUNTA AL TERCER CEREBRO';
    const h2=ask.querySelector('.askbox h2'); if(h2) h2.textContent='Pregunta por lo que ya has pensado o abre una frontera fuera de tu memoria.';
    const tabs=ask.querySelectorAll('.asktabs button'); if(tabs[0])tabs[0].textContent='MI MEMORIA'; if(tabs[1])tabs[1].textContent='MÁS ALLÁ DE MI MEMORIA';
    const btn=$('askbtn'); if(btn)btn.textContent='PENSAR';
    const hint=ask.querySelector('.askhint'); if(hint)hint.textContent='Esta vista sigue siendo una demostración local. Cuando conectemos Supabase y el modelo, consultará tu memoria real y separará claramente lo leído de la exploración externa.';
    const label=ask.querySelector('.answer .label'); if(label)label.textContent='RESPUESTA DEL SISTEMA';
    const ah=ask.querySelector('.answer h3'); if(ah)ah.textContent='Escribe una pregunta real.';
    const ap=ask.querySelector('.answer p'); if(ap)ap.textContent='Por ahora responde desde el corpus local. La versión conectada recuperará lecturas, subrayados, notas, memoria temporal y piezas previas de pensamiento antes de generar una respuesta.';
    const quickK=ask.querySelector('.panel .kicker'); if(quickK)quickK.textContent='PREGUNTAS POSIBLES';
    const quickH=ask.querySelector('.panel h3'); if(quickH)quickH.textContent='Preguntas que tu memoria no debería reconstruir sola';
  }

  // Clean remaining MIND/English framing produced by v0.6 while preserving long arguments.
  function localizeMind(){
    const view=$('view-mind'); if(!view)return;
    const d=view.querySelector('.mind-date'); if(d)d.textContent='24 SEP 2026 · COGNICIÓN ACTIVA';
    const h=view.querySelector('.mind-mast h1'); if(h)h.textContent='No resume lo que has pensado. Intenta continuar pensando desde ahí.';
    const p=view.querySelector('.mind-mast p'); if(p)p.textContent='Esta superficie trabaja sobre lecturas, feedback, memoria dormida y anotaciones. Sus mecanismos internos no aparecen como herramientas: deberían sentirse únicamente en la calidad del argumento.';
    const sig=view.querySelector('.signal-meta'); if(sig)sig.textContent='MEMORIA DE LECTURA ACTIVA';
    const dates=view.querySelectorAll('.dispatch-date');
    const names=['24 SEP 2026 · PENSAMIENTO ACTUAL','24 SEP 2026 · DESARROLLO ENTRE LECTURAS','24 SEP 2026 · FRONTERA ABIERTA'];
    dates.forEach((x,i)=>x.textContent=names[i]||x.textContent);
    const traces=view.querySelectorAll('.mind-trace'); traces.forEach(x=>x.childNodes[0]&&(x.childNodes[0].textContent='Trazabilidad: '));
    const quiet=view.querySelector('.mind-quiet'); if(quiet)quiet.textContent='El sistema también puede conservar silencio. En la versión viva no debería producir una pieza nueva si no existe una transformación, tensión o conexión suficientemente significativa.';
  }
  localizeMind();

  // ---------- Rich autobiographical memory ----------
  const memoryEpisodes=[
    {date:'19 SEP 2026',title:'Silvestrin cambia la pregunta: reducir deja de ser una finalidad.',docs:['sil-feedback','sil-response'],context:'Aquí se consolida una distinción que sigue organizando la investigación: las operaciones —reducción, simplicidad, claridad, vacío— no son equivalentes a los estados que podrían favorecer. Lo decisivo fue empezar a preguntar qué queda intensificado y qué experiencia puede aparecer después.'},
    {date:'19 SEP 2026',title:'Se fija un método para no contaminar lectura, comparación y teoría.',docs:['method-feedback','method-response'],context:'Esta memoria no es una preferencia formal sino una regla de trabajo: primero reconstruir al autor con rigor, después comparar, y solo entonces proponer hipótesis propias. Esa separación es la base del cortafuegos exegético del sistema.'},
    {date:'21 SEP 2026',title:'Morris permanece, pero deja de ocupar el centro.',docs:['morris-feedback','morris-response'],context:'La memoria conserva el argumento de Morris sin confundir validez documental con fertilidad teórica. Quedó como contraste y caso límite: puede reactivarse si resuelve una fragilidad puntual, pero no debe arrastrar la investigación hacia una dirección que no te interesa.'},
    {date:'22 SEP 2026',title:'La reducción se formula explícitamente como medio.',docs:['means-feedback','means-response'],context:'Este episodio desplaza la investigación de “qué es reducción” hacia “para qué sirve”. A partir de aquí cualquier operación reductiva necesita justificar lo que permite aparecer o cambiar después de ella.'},
    {date:'23 SEP 2026',title:'La cadena se vuelve más exigente: qué se intensifica, qué experiencia favorece y para qué.',docs:['purpose-feedback','purpose-response'],context:'Aquí corriges el riesgo de convertir “presencia” en una abstracción y haces explícita la secuencia de investigación. La finalidad humana permanece abierta: calma y tranquilidad tienen alta resonancia, pero no pueden darse por resueltas.'}
  ];
  function paragraphsFor(docId,count=3){
    const arr=(typeof blocks!=='undefined'&&blocks[docId])||[];
    return arr.filter(b=>b.kind==='p').slice(0,count).map(b=>`<p>${escapeHTML(b.text)}</p>`).join('');
  }
  function renderRichMemory(){
    const view=$('view-memory'); if(!view)return;
    let ann=[]; try{ann=JSON.parse(localStorage.getItem('theorylab_v05_annotations')||'[]')}catch{}
    const noteCount=Array.isArray(ann)?ann.filter(a=>(a.note||'').trim()).length:0;
    const signal=Array.isArray(ann)&&ann.length
      ?`Tu memoria de lectura contiene <strong>${ann.length} subrayados</strong> y <strong>${noteCount} notas propias</strong>. Estas marcas no prueban una tesis; registran qué partes del corpus siguen ejerciendo presión sobre tu pensamiento.`
      :'Todavía no hay subrayados guardados en este navegador. Cuando marques lecturas, esta sección empezará a registrar qué pasajes vuelven, qué notas produces y qué memorias se reactivan.';
    view.innerHTML=`<div class="memory-surface">
      <header class="memory-mast"><div class="overline">MEMORIA AUTOBIOGRÁFICA DE TEORÍA</div><h1>No es un archivo de frases. Es la historia de cómo ha cambiado tu pensamiento.</h1><p>La memoria conserva episodios completos: tus formulaciones, las respuestas que las desarrollaron, los desplazamientos posteriores y las ideas que quedaron dormidas sin desaparecer.</p></header>
      <div class="memory-annotation-signal"><p>${signal}</p></div>
      ${memoryEpisodes.map(ep=>`<article class="memory-episode"><time>${ep.date}</time><h2>${ep.title}</h2><p class="memory-context">${ep.context}</p>${ep.docs.map((id,i)=>{const d=corpus.docs[id];return `<div class="memory-source"><div class="role">${escapeHTML(d.role)} · ${escapeHTML(d.label)}</div>${paragraphsFor(id,i===0?3:2)}</div>`}).join('')}<div class="memory-actions"><button class="vbtn primary" data-memory-open="${ep.docs.join(',')}">Abrir contexto completo y anotar</button></div></article>`).join('')}
      <section class="memory-dormant"><h2>Dormido no significa perdido.</h2><p>Morris y la latencia perceptiva permanecen disponibles aunque hoy no sean ejes centrales. La función de esta memoria no es mantener todo igualmente activo, sino poder recuperar una línea periférica cuando una lectura nueva vuelva a hacerla útil.</p><div class="memory-actions"><button class="vbtn" data-memory-reading="mor">Volver a Morris</button><button class="vbtn" data-memory-reading="rei">Volver a Reinhardt</button></div></section>
    </div>`;
    view.querySelectorAll('[data-memory-open]').forEach(b=>b.onclick=()=>{const ids=b.dataset.memoryOpen.split(','); if(typeof openOrigin==='function')openOrigin(ids,'Memoria autobiográfica');});
    view.querySelectorAll('[data-memory-reading]').forEach(b=>b.onclick=()=>{if(typeof openReading==='function')openReading(b.dataset.memoryReading);});
  }
  renderRichMemory();

  // ---------- Mobile-first reader improvements ----------
  const priorOpenReader=typeof openReader==='function'?openReader:null;
  if(priorOpenReader){
    openReader=function(...args){ priorOpenReader(...args); enhanceReader(); };
  }
  const priorOpenReading=typeof openReading==='function'?openReading:null;
  // openReading in v05 calls the lexical openReader binding, so wrapping openReader is enough.

  function enhanceReader(){
    const drawer=$('drawer'); if(!drawer)return;
    const k=drawer.querySelector('.drawer-inner>.kicker'); if(k)k.textContent='MEMORIA DE LECTURA';
    const availability=drawer.querySelector('.drawer-inner>.availability'); if(availability)availability.textContent='Texto recuperado de nuestras lecturas y conversaciones. Puedes subrayar, añadir notas y volver al fragmento exacto. Las anotaciones forman memoria autobiográfica, no evidencia adicional sobre el autor.';
    const toolbar=drawer.querySelector('.reader-toolbar');
    if(toolbar&&!toolbar.querySelector('.reader-font-controls')){
      toolbar.insertAdjacentHTML('beforeend','<div class="reader-font-controls"><button class="vbtn" data-font="down">A−</button><button class="vbtn" data-font="up">A+</button></div>');
    }
    let progress=drawer.querySelector('.reader-progress'); if(!progress){progress=document.createElement('div');progress.className='reader-progress';drawer.appendChild(progress);}
    let mob=drawer.querySelector('.mobile-reader-actions');
    if(!mob){
      mob=document.createElement('div');mob.className='mobile-reader-actions';mob.innerHTML='<button class="primary" data-mobile-act="highlight">Subrayar</button><button data-mobile-act="note">Nota</button><button data-mobile-act="notes">Notas</button><button class="icon" data-mobile-act="font-down">A−</button><button class="icon" data-mobile-act="font-up">A+</button>';drawer.appendChild(mob);
    }
    const tools=drawer.querySelector('.reader-tools');
    if(tools&&!tools.querySelector('.mobile-notes-close')) tools.insertAdjacentHTML('afterbegin','<button class="vbtn mobile-notes-close" type="button">Cerrar anotaciones</button>');
    const savedSize=parseFloat(localStorage.getItem('minds_reading_size')||'1.12'); setReadingSize(savedSize);
    const font=(dir)=>{const cur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reading-size'))||1.12;setReadingSize(Math.max(.98,Math.min(1.38,cur+(dir==='up'?.06:-.06))));};
    drawer.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>font(b.dataset.font));
    mob.querySelector('[data-mobile-act="highlight"]').onclick=()=>drawer.querySelector('#highlightSelection')?.click();
    mob.querySelector('[data-mobile-act="note"]').onclick=()=>drawer.querySelector('#noteSelection')?.click();
    mob.querySelector('[data-mobile-act="notes"]').onclick=()=>tools?.classList.toggle('mobile-open');
    mob.querySelector('[data-mobile-act="font-down"]').onclick=()=>font('down');
    mob.querySelector('[data-mobile-act="font-up"]').onclick=()=>font('up');
    tools?.querySelector('.mobile-notes-close')?.addEventListener('click',()=>tools.classList.remove('mobile-open'));
    const go=drawer.querySelector('#goNotes'); if(go)go.onclick=()=>{if(matchMedia('(max-width:840px)').matches)tools?.classList.add('mobile-open');else tools?.scrollIntoView({behavior:'smooth'});};
    const updateProgress=()=>{const body=drawer.querySelector('.reader-body');if(!body)return;const r=body.getBoundingClientRect();const viewport=innerHeight;const total=Math.max(1,r.height-viewport*.45);const passed=Math.max(0,Math.min(total,-r.top+120));progress.style.width=(passed/total*100)+'%';};
    drawer.addEventListener('scroll',updateProgress,{passive:true}); updateProgress();
  }
  function setReadingSize(rem){document.documentElement.style.setProperty('--reading-size',rem+'rem');try{localStorage.setItem('minds_reading_size',String(rem))}catch{}}

  // ---------- Semantic topology ----------
  const G=window.MINDS_GRAPH_DATA;
  const labelEs={
    sil_spec:'Espectáculo / aceleración / consumo',sil_parallel:'La arquitectura no tiene que limitarse a describir su época',sil_simple:'Una apariencia simple puede contener complejidad',sil_minmax:'Configuración mínima / intensidad máxima',sil_retreat:'Retiro / paz / clarificación mental',sil_elemental:'Materia / cielo / tierra / agua / sol',paw_stop:'Detenerse cuando sustraer más deja de mejorar',paw_clarity:'Claridad / esencial / espacio',paw_precision:'La precisión puede proteger la quietud perceptiva',paw_rearrange:'Reorganizar puede clarificar sin eliminar',mor_order:'Las formas unitarias ordenan relaciones',mor_simple:'Forma simple ≠ experiencia simple',rei_boundary:'Reducción como límite disciplinar',rei_slow:'La diferencia casi negra aparece lentamente',rei_notime:'Doctrina de «no tiempo»',rei_lowvar:'Poca variedad puede exigir mucha atención',martin_dist:'La distracción puede obstaculizar una respuesta sutil',martin_weak:'La belleza puede registrarse como emoción muy tenue',martin_end:'La felicidad como finalidad humana explícita',red:'Reducción',simp:'Simplicidad',clarity:'Claridad',absence:'Ausencia / vacío',precision:'Precisión',essentiality:'Esencialidad',time:'Tiempo',attention:'Economía de la atención',calmint:'Calma / intensidad',op_remove:'Retirar interferencia',op_select:'Seleccionar / limitar repertorio',op_rearrange:'Reorganizar relaciones',op_repeat:'Repetir / estabilizar parámetros',op_latency:'Reducir disponibilidad inmediata',int_world:'Materia / luz / horizonte / espacio',int_sens:'Sensibilidad a diferencias débiles',int_silence:'Silencio / quietud perceptiva',fb_sil:'Feedback · Silvestrin',fb_mor:'Feedback · Morris',fb_now:'Feedback · dirección actual',th_means:'La reducción es un medio, no un fin',th_scarcity:'Reducción ≠ escasez',th_simple:'Una apariencia simple puede contener complejidad',th_claims:'La arquitectura puede proponer, no garantizar, estados mentales',h_intens:'La reducción puede intensificar lo que permanece',h_relation:'Reducción como operación relacional A→B',h_criterion:'La interferencia requiere un criterio',h_attention:'Menos estímulos ≠ menor demanda atencional',h_latency:'La reducción puede regular el umbral de aparición',h_sensitivity:'La reducción puede proteger la sensibilidad',h_rhythm:'La reducción puede alterar el ritmo perceptivo',exp_calm:'Calma / tranquilidad',exp_contemp:'Disposición contemplativa',exp_sens:'Sensibilidad aumentada',final_human:'¿Qué necesita la persona contemporánea?',q_intens:'¿Qué se intensifica?',q_forwhat:'¿Para qué?',q_stop:'¿Dónde debe detenerse la reducción?',q_claim:'¿Cuánto puede afirmar legítimamente la arquitectura?',q_measure:'¿Cómo investigar la calma sin reducirla a una métrica?',debt_emp:'Deuda epistemológica · falta puente empírico',contra_time:'Contradicción · «no tiempo» ↔ percepción lenta',contra_aut:'Contradicción · autonomía ↔ condiciones de visión',ghost_morris:'Hipótesis fantasma · redistribución de complejidad',rei_black:'Pinturas negras'
  };
  const territoryEs={
    doc:['ARCHIPIÉLAGO DOCUMENTAL','Autores · obras · afirmaciones'],
    concept:['NÚCLEO CONCEPTUAL','Vocabulario en transformación'],
    ops:['OPERACIONES','Qué se retira, limita o reorganiza'],
    int:['¿QUÉ SE INTENSIFICA?','Lo que gana presencia o legibilidad'],
    theory:['NÚCLEO TEÓRICO','Tesis e hipótesis propias'],
    human:['HORIZONTE HUMANO','Experiencias y finalidades posibles'],
    frontier:['FRONTERA ACTIVA','Preguntas, contradicciones y deuda']
  };
  const typeEs={author:'autor',work:'obra / texto',claim:'afirmación documentada',concept:'concepto',operation:'operación',intensified_quality:'cualidad intensificada',feedback:'feedback',thesis:'tesis',hypothesis:'hipótesis',experience:'experiencia posible',finality:'finalidad posible',question:'pregunta abierta',contradiction:'contradicción'};
  const statusEs={documented:'documentado',accepted:'aceptado',provisional:'provisional',open:'abierto',deprioritized:'despriorizado'};
  const relEs={AUTHORED:'autoría',ASSERTS:'afirma',ABOUT:'trata de',SUPPORTS:'apoya',QUALIFIES:'matiza',QUALIFIED_BY:'matizado por',CONTRADICTS:'contradice',DEPENDS_ON:'depende de',DEPRIORITIZES:'desprioriza',DOCUMENTS:'documenta',ENABLES:'habilita',FORMALIZES:'formaliza',INTENSIFIES:'intensifica',KEEPS_OPEN:'mantiene abierto',KEEPS_PROVISIONAL:'mantiene provisional',LEADS_TO:'conduce a',MAY_FAVOR:'puede favorecer',MAY_INTENSIFY:'puede intensificar',MOTIVATES:'motiva',OPENS:'abre',PRIORITIZES:'prioriza',REVEALS:'revela',SUGGESTS:'sugiere',TESTS:'pone a prueba',AIMS_AT:'apunta a',ACCEPTS:'acepta'};
  const majorTypes=new Set(['author','concept','thesis','finality']);
  const midTypes=new Set(['work','operation','hypothesis','question','experience','intensified_quality','contradiction']);
  const readingMap={sil:'sil',paw:'paw',mor:'mor',rei:'rei',martin:'martin',silvestrin:'sil',pawson:'paw',morris:'mor',reinhardt:'rei','agnes martin':'martin'};
  function topoLabel(n){return labelEs[n.id]||n.label;}
  function renderSemanticTopology(){
    const view=$('view-graph'); if(!view||!G)return;
    view.innerHTML=`<div class="topology-shell"><div class="topology-head"><div class="copy"><div class="overline">TOPOLOGÍA COGNITIVA</div><h1>Al acercarte, el pensamiento gana resolución.</h1><p>Lejos ves territorios. Al acercarte aparecen autores, conceptos e hipótesis; más cerca emergen obras, afirmaciones y relaciones. Arrastra para desplazarte y usa la rueda, el gesto de pellizco o los controles para hacer zoom.</p></div><div class="topology-controls"><button data-topo="in" aria-label="Acercar">+</button><button data-topo="out" aria-label="Alejar">−</button><button data-topo="reset">Reencuadrar</button></div></div><div class="topology-stage"><svg id="semanticGraph" viewBox="0 0 1200 760" aria-label="Mapa navegable de la teoría"><g id="topologyScene"></g></svg><aside class="topology-detail" id="topologyDetail"></aside><div class="topology-zoom-label" id="topologyZoomLabel"></div></div></div>`;
    const svg=$('semanticGraph'),scene=$('topologyScene'),detail=$('topologyDetail');
    const nodes=new Map(G.nodes.map(n=>[n.id,n]));
    const territoryMarkup=G.territories.map(t=>{const es=territoryEs[t.id]||[String(t.label).replace(/\n/g,' '),t.types];return `<g class="topo-territory" data-territory="${escapeHTML(t.id)}"><ellipse cx="${t.x}" cy="${t.y}" rx="${t.rx}" ry="${t.ry}"></ellipse><text x="${t.x}" y="${t.y-4}">${escapeHTML(es[0])}</text><text class="territory-desc" x="${t.x}" y="${t.y+16}">${escapeHTML(es[1])}</text></g>`}).join('');
    const edgeMarkup=G.edges.map((e,i)=>{const a=nodes.get(e.source),b=nodes.get(e.target);if(!a||!b)return'';const strong=(e.strength||0)>.75?' strong':'';return `<line class="topo-edge${strong}" data-edge="${i}" data-source="${escapeHTML(e.source)}" data-target="${escapeHTML(e.target)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`}).join('')+G.suggestions.map((e,i)=>{const a=nodes.get(e.source),b=nodes.get(e.target);if(!a||!b)return'';return `<line class="topo-edge ghost" data-ghost="${i}" data-source="${escapeHTML(e.source)}" data-target="${escapeHTML(e.target)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`}).join('');
    const nodeMarkup=G.nodes.map(n=>{const level=majorTypes.has(n.type)?0:midTypes.has(n.type)?1:2;const r=n.type==='author'?9:n.type==='thesis'?8:6;return `<g class="topo-node" data-node="${escapeHTML(n.id)}" data-type="${escapeHTML(n.type)}" data-level="${level}" transform="translate(${n.x},${n.y})"><circle r="${r}"></circle><text x="${r+7}" y="4">${escapeHTML(topoLabel(n))}</text></g>`}).join('');
    scene.innerHTML=territoryMarkup+'<g class="topo-edges">'+edgeMarkup+'</g><g class="topo-nodes">'+nodeMarkup+'</g>';
    let vb={x:0,y:0,w:1200,h:760}; const base={w:1200,h:760};
    function scale(){return base.w/vb.w;}
    function apply(){svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);const k=scale();$('topologyZoomLabel').textContent=k<.82?'Vista territorial':k<1.35?'Autores, conceptos y líneas':'Detalle: obras, afirmaciones y relaciones';scene.querySelectorAll('.topo-territory').forEach(el=>el.style.opacity=k>1.65?.16:k>1.2?.38:1);scene.querySelectorAll('.topo-node').forEach(el=>{const l=+el.dataset.level;el.style.display=(l===0||l===1&&k>=.78||l===2&&k>=1.28)?'':'none'});scene.querySelectorAll('.topo-edge').forEach(el=>{const a=nodes.get(el.dataset.source),b=nodes.get(el.dataset.target);const la=majorTypes.has(a?.type)?0:midTypes.has(a?.type)?1:2,lb=majorTypes.has(b?.type)?0:midTypes.has(b?.type)?1:2;const need=Math.max(la,lb);el.style.display=(need===0||need===1&&k>=.82||need===2&&k>=1.28)?'':'none';});}
    function zoom(f,cx=600,cy=380){const oldW=vb.w,oldH=vb.h;const nw=Math.max(330,Math.min(1800,oldW*f)),nh=nw*base.h/base.w;const rx=(cx-vb.x)/oldW,ry=(cy-vb.y)/oldH;vb.x=cx-rx*nw;vb.y=cy-ry*nh;vb.w=nw;vb.h=nh;apply();}
    function clientWorld(clientX,clientY){const r=svg.getBoundingClientRect();return{x:vb.x+(clientX-r.left)/r.width*vb.w,y:vb.y+(clientY-r.top)/r.height*vb.h};}
    svg.addEventListener('wheel',e=>{e.preventDefault();const p=clientWorld(e.clientX,e.clientY);zoom(e.deltaY>0?1.13:.885,p.x,p.y);},{passive:false});
    let pointers=new Map(),panStart=null,pinchStart=null;
    svg.addEventListener('pointerdown',e=>{if(e.target.closest('.topo-node'))return;svg.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)panStart={x:e.clientX,y:e.clientY,vb:{...vb}};if(pointers.size===2){const ps=[...pointers.values()];pinchStart={dist:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),vb:{...vb},mid:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}};}});
    svg.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&panStart){const r=svg.getBoundingClientRect(),dx=(e.clientX-panStart.x)/r.width*panStart.vb.w,dy=(e.clientY-panStart.y)/r.height*panStart.vb.h;vb={...panStart.vb,x:panStart.vb.x-dx,y:panStart.vb.y-dy};apply();}else if(pointers.size===2&&pinchStart){const ps=[...pointers.values()],dist=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),ratio=pinchStart.dist/Math.max(20,dist);vb={...pinchStart.vb};const p=clientWorld((ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2);zoom(ratio,p.x,p.y);pinchStart={dist, vb:{...vb}, mid:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}};}});
    const endPointer=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinchStart=null;if(pointers.size===0)panStart=null;};svg.addEventListener('pointerup',endPointer);svg.addEventListener('pointercancel',endPointer);
    function clearFocus(){scene.querySelectorAll('.focus,.dim').forEach(x=>x.classList.remove('focus','dim'));}
    function openNode(id){const n=nodes.get(id);if(!n)return;clearFocus();const conn=G.edges.filter(e=>e.source===id||e.target===id);const related=new Set([id,...conn.flatMap(e=>[e.source,e.target])]);scene.querySelectorAll('.topo-node').forEach(x=>x.classList.toggle('dim',!related.has(x.dataset.node)));scene.querySelectorAll('.topo-edge').forEach(x=>{const hit=x.dataset.source===id||x.dataset.target===id;x.classList.toggle('focus',hit);x.classList.toggle('dim',!hit);});scene.querySelector(`[data-node="${CSS.escape(id)}"]`)?.classList.add('focus');const rels=conn.slice(0,10).map(e=>{const other=nodes.get(e.source===id?e.target:e.source);return `<div><b>${escapeHTML(relEs[e.type]||e.type)}</b> · ${escapeHTML(topoLabel(other))}</div>`}).join('');const authorKey=readingMap[id]||readingMap[String(n.author||'').toLowerCase()];detail.innerHTML=`<button class="close" aria-label="Cerrar">×</button><div class="type">${escapeHTML(typeEs[n.type]||n.type)} · ${escapeHTML(statusEs[n.status]||n.status||'')}</div><h2>${escapeHTML(topoLabel(n))}</h2><div class="meta">Capa: ${escapeHTML(n.layer==='documentary'?'documental':n.layer==='theoretical'?'teórica':'puente')}<br>Relaciones visibles: ${conn.length}</div>${rels?`<div class="rels">${rels}</div>`:''}${authorKey?`<div class="memory-actions"><button class="vbtn primary" data-open-reading="${authorKey}">Abrir lectura</button></div>`:''}`;detail.classList.add('open');detail.querySelector('.close').onclick=()=>{detail.classList.remove('open');clearFocus();};detail.querySelector('[data-open-reading]')?.addEventListener('click',e=>openReading?.(e.currentTarget.dataset.openReading));}
    scene.querySelectorAll('.topo-node').forEach(el=>el.addEventListener('pointerdown',e=>e.stopPropagation()));scene.querySelectorAll('.topo-node').forEach(el=>el.addEventListener('click',()=>openNode(el.dataset.node)));
    view.querySelector('[data-topo="in"]').onclick=()=>zoom(.82,vb.x+vb.w/2,vb.y+vb.h/2);view.querySelector('[data-topo="out"]').onclick=()=>zoom(1.22,vb.x+vb.w/2,vb.y+vb.h/2);view.querySelector('[data-topo="reset"]').onclick=()=>{vb={x:0,y:0,w:1200,h:760};detail.classList.remove('open');clearFocus();apply();};apply();
  }
  if(G)renderSemanticTopology();
  renderGraph=function(){renderSemanticTopology();};

  // Keep new views refreshed when navigating.
  const previousSetView=window.setView;
  if(typeof previousSetView==='function'){
    window.setView=function(v){previousSetView(v);if(v==='mind')setTimeout(localizeMind,0);if(v==='memory')renderRichMemory();if(v==='graph')renderSemanticTopology();};
    document.querySelectorAll('#topnav button').forEach(b=>b.onclick=()=>window.setView(b.dataset.view));
  }

  // Localize dynamic answers from the inherited ASK demo.
  if(typeof answerQuery==='function'){
    const oldAnswerQuery=answerQuery;
    const localizedAnswer=()=>{
      oldAnswerQuery();
      const a=$('answer'); if(!a)return;
      const lab=a.querySelector('.label');
      if(lab) lab.textContent=state.askMode==='memory'?'RESPUESTA DESDE TU MEMORIA':'EXPANSIÓN FUERA DE TU MEMORIA';
      a.querySelectorAll('.label').forEach((x,i)=>{if(i>0)x.textContent='PROCEDENCIA';});
      a.querySelectorAll('p').forEach(p=>{
        if(p.textContent.includes('No strong stored provenance match')) p.textContent='No hay una coincidencia fuerte de procedencia almacenada.';
      });
      const sourceTranslations={'your Morris feedback':'tu feedback sobre Morris','Silvestrin feedback':'feedback sobre Silvestrin','Reinhardt reflection':'reflexión sobre Reinhardt','23 Sep methodological feedback':'feedback metodológico del 23 Sep','return queue':'cola de retorno','calm/tranquility node':'calma / tranquilidad'};
      a.querySelectorAll('.evidencechip').forEach(ch=>{for(const [en,es] of Object.entries(sourceTranslations))if(ch.textContent.includes(en)){ch.childNodes[ch.childNodes.length-1].textContent=es;}});
    };
    answerQuery=localizedAnswer;
    $('askbtn').onclick=localizedAnswer;
  }

  // Re-render current state with the new version.
  if(typeof state!=='undefined'){if(state.view==='mind')localizeMind();}
})();
