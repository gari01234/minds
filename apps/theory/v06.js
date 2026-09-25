/* THEORY//LAB v0.6
   MIND is not a dashboard. It is the active cognition of the system.
   Internal faculties remain metadata, not interface controls.
*/
(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Invisible cognitive orchestration. These are deliberately not rendered as modes or buttons.
  const mindFaculties={
    synthesize:true, challenge:true, connect:true, resurface:true, extend:true,
    gap:true, counterexample:true, thinkForward:true, epistemicDebt:true,
    contradiction:true, dormantMemory:true, provenance:true
  };

  const dispatches=[
    {
      id:'teleology',
      date:'24 SEP 2026 · CURRENT THOUGHT',
      title:'La reducción empieza a parecer menos una doctrina formal que una operación cuyo sentido está siempre después de ella.',
      faculties:['synthesize','epistemicDebt','resurface','challenge','thinkForward'],
      trace:['Silvestrin · lectura rigurosa','Pawson · Minimum','Reinhardt · lectura revisada','Morris · Notes on Sculpture','feedback del usuario · 23–24 Sep'],
      html:`
      <p>Hay algo que se repite con suficiente insistencia como para merecer una formulación más fuerte, pero todavía no una tesis cerrada. Las lecturas no están convergiendo en una definición única de reducción. Están mostrando que <strong>reducir solo adquiere sentido cuando podemos reconstruir la relación entre aquello que se retira y aquello que esa retirada permite</strong>. En Silvestrin esta estructura aparece con especial claridad: reducir elementos, ruido o interferencias no tiene valor por sí mismo; importa porque puede hacer más perceptibles el espacio, la materia, la luz, el horizonte, el silencio o ciertas condiciones elementales. En Pawson aparece otro límite: seguir sustrayendo deja de ser reducción productiva cuando empieza a perjudicar aquello que permanece. Reinhardt, por su parte, muestra una variante distinta y más normativa: antes de quitar algo hay ya una decisión acerca de qué pertenece al campo y qué debe considerarse impropio.</p>
      <p>Esto sugiere que una teoría arquitectónica de la reducción no debería comenzar por contar elementos ni terminar en una estética de escasez. Tendría que reconstruir una secuencia de decisiones. Primero: <em>qué se considera interferencia</em>. Después: <em>qué se modifica al retirarla</em>. Después: <em>qué cualidad adquiere mayor legibilidad o intensidad</em>. Y solo entonces: <em>qué experiencia puede favorecer esa nueva condición y por qué esa experiencia tendría valor</em>. La reducción queda así situada en medio de una cadena causal y no en su extremo moral.</p>
      <p class="turn">El punto todavía vacío no está en “qué quitar”. Está después de la intensificación: <strong>¿para qué queremos que algo se vuelva más perceptible?</strong></p>
      <p>Aquí aparece una deuda epistemológica importante. La calma y la tranquilidad poseen una resonancia extraordinariamente alta en esta investigación porque Silvestrin las conecta con retiro, silencio y clarificación mental, y porque esa dirección ha reaparecido espontáneamente en tu feedback. Pero todavía sabemos mucho menos de lo que parece. Que una operación reduzca competencia visual no demuestra que produzca calma. Que haga más perceptible la luz tampoco demuestra que la experiencia resultante sea tranquilizadora. Reinhardt constituye una advertencia especialmente útil: sus campos reducidos pueden exigir una atención intensa y sostenida. Menos estímulos visibles no equivale necesariamente a menor exigencia perceptiva.</p>
      <p>Precisamente aquí conviene reactivar una idea que habíamos dejado dormida con Morris. Su teoría de las relaciones internas y externas no necesita volver como eje central —tu feedback sobre esto fue claro—, pero conserva una función crítica muy específica: <strong>una forma simple no garantiza una experiencia simple</strong>. Reintroducida en este punto, la idea funciona como una protección metodológica. Nos impide convertir demasiado rápidamente “reducción” en “descanso”. Morris reaparece no porque de pronto tenga más peso para tu teoría, sino porque una memoria extensa puede recuperar una pieza periférica exactamente cuando vuelve a ser útil.</p>
      <p>Lo que empieza a emerger, entonces, no es todavía una definición de la finalidad humana. Es una exigencia de método: cada flecha debe demostrarse por separado. Una operación reductiva puede hacer más perceptible una condición; esa condición puede favorecer cierto régimen de atención; ese régimen puede o no contribuir a una experiencia de calma; y el valor de esa calma, en relación con la vida contemporánea, constituye todavía otra pregunta. La teoría se vuelve más lenta, pero también más precisa. Y quizá esa lentitud sea necesaria: si llegamos demasiado pronto a “calma”, habremos convertido una afinidad fuerte con Silvestrin en una conclusión universal que las lecturas todavía no sostienen.</p>
      <p class="caution">Deuda abierta: “calma / tranquilidad” es hoy una de las ideas más fértiles y al mismo tiempo una de las menos demostradas transversalmente. Conviene mantenerla viva sin convertirla todavía en respuesta.</p>`
    },
    {
      id:'sensitivity',
      date:'24 SEP 2026 · CROSS-READING DEVELOPMENT',
      title:'No todo lo que se intensifica se vuelve más fuerte. A veces lo que cambia es la capacidad de percibirlo.',
      faculties:['connect','resurface','contradiction','extend','thinkForward'],
      trace:['Silvestrin · mínimo / máxima intensidad','Reinhardt · Black Paintings','Agnes Martin · Beauty Is the Mystery of Life'],
      html:`
      <p>La palabra <em>intensificación</em> está empezando a contener dos mecanismos diferentes y conviene separarlos antes de que se vuelvan indistinguibles. El primero consiste en hacer que un fenómeno adquiera mayor fuerza dentro del campo perceptivo: más contraste, más luz, mayor diferencia, una jerarquía más clara. El segundo mecanismo es casi inverso: el fenómeno puede permanecer tenue, pero cambian las condiciones bajo las cuales somos capaces de percibirlo. Reinhardt y Martin permiten ver esta diferencia con una precisión que Silvestrin, por sí solo, no exigía todavía.</p>
      <p>Las Black Paintings de Reinhardt son importantes justamente porque no intensifican el color mediante contraste fuerte. Reducen la diferencia hasta acercarla al umbral de visibilidad. El resultado es que la percepción necesita tiempo, adaptación y discriminación fina. Martin, desde una finalidad completamente distinta, introduce la idea de que ciertas distracciones pueden obstaculizar respuestas emocionales muy sutiles. En ambos casos hay una consecuencia común que no debemos confundir con sus teorías particulares: <strong>reducir el campo no necesariamente fortalece el estímulo; puede aumentar la sensibilidad necesaria para registrar diferencias débiles</strong>.</p>
      <p>Esto modifica de manera importante la formulación “mínima configuración / máxima intensidad”. Si la intensidad se entiende únicamente como fuerza del estímulo, una teoría de la reducción terminaría siendo contradictoria: ¿por qué retirar para hacer algo más intenso si podríamos simplemente amplificarlo? Pero si distinguimos fuerza de estímulo y sensibilidad perceptiva, aparece otra posibilidad. La reducción puede funcionar no como amplificador sino como <em>condicionador del campo</em>: retira competencia para que algo que ya estaba allí pueda ser registrado de otra manera.</p>
      <p class="turn">La diferencia decisiva podría ser esta: <strong>intensificar el fenómeno</strong> no es lo mismo que <strong>intensificar nuestra sensibilidad hacia el fenómeno</strong>.</p>
      <p>Esta distinción es especialmente fértil para arquitectura porque evita reducir el problema a efectos espectaculares. Una arquitectura que quisiera hacer más presente la luz no tendría necesariamente que producir una iluminación más dramática. Podría establecer condiciones en las que variaciones ordinarias adquirieran legibilidad. Lo mismo podría ocurrir con material, distancia, sonido, temperatura o tiempo. Pero este movimiento solo es teóricamente útil si resistimos otra simplificación: sensibilidad no es automáticamente contemplación, y contemplación no es automáticamente calma. Una mayor capacidad de distinguir puede ser tranquilizadora, inquietante, absorbente o incluso agotadora.</p>
      <p>Esto reubica también el problema de la atención. Hasta ahora “economía de la atención” podía entenderse como gastar menos atención. Reinhardt obliga a corregirlo: un campo con muy pocas diferencias puede exigir muchísima. Tal vez sea más preciso hablar de <strong>distribución, concentración y libertad de atención</strong>. Una arquitectura puede reducir competencia sin reducir necesariamente el trabajo perceptivo. La pregunta interesante sería entonces qué tipo de atención permite: una atención capturada, una atención voluntaria, una atención sostenida, una atención que puede retirarse sin fricción.</p>
      <p>Si futuras lecturas sostienen esta distinción, la teoría podría adquirir una precisión que todavía no tenía: la reducción no solo modifica objetos o configuraciones; puede modificar <strong>el umbral a partir del cual algo se vuelve experiencialmente disponible</strong>. Pero por ahora conviene dejar esta formulación en observación. Reinhardt y Martin la abren; aún necesitamos saber si tiene verdadero poder explicativo en arquitectura o si estamos extrapolando demasiado desde la pintura.</p>`
    },
    {
      id:'human-end',
      date:'24 SEP 2026 · FRONTIER',
      title:'La pregunta más difícil ya no es qué reducir ni siquiera qué intensificar, sino qué necesita realmente el ser humano contemporáneo de la arquitectura.',
      faculties:['gap','challenge','counterexample','epistemicDebt','thinkForward'],
      trace:['Silvestrin · The Supreme Ambition / Like an Elephant','feedback del usuario · calma y tranquilidad','cadena de investigación · reducción → intensificación → experiencia → finalidad'],
      html:`
      <p>Hay una razón por la que Silvestrin sigue teniendo más peso que otros autores a pesar de que su teoría no sea la más rigurosa en todos los niveles. Él no se detiene en la organización formal. Formula un diagnóstico cultural: aceleración, espectáculo, consumo, ruido, explotación y ego no son simplemente características del contexto; son condiciones frente a las cuales la arquitectura podría tomar posición. Y a partir de ese diagnóstico intenta responder qué podría ofrecer un espacio: silencio, retiro, sensibilidad, paz, clarificación. Esa estructura explica por qué su pensamiento continúa produciendo preguntas mientras otros argumentos, aunque convincentes, quedan más periféricos.</p>
      <p>Sin embargo, precisamente aquí el tercer cerebro debe resistir la tendencia natural a completar demasiado rápido un patrón. Que estas ideas tengan mucha resonancia en tu pensamiento no significa que deban convertirse en la finalidad de la teoría. Lo más importante de tu corrección reciente fue otra cosa: seguir leyendo teorías distintas de la reducción porque es a través de sus diferencias como estamos descubriendo qué preguntas merecen realmente ser investigadas. La investigación no debe convertirse todavía en una búsqueda selectiva de autores que confirmen “calma”. Eso produciría una cámara de resonancia teórica.</p>
      <p class="turn">Tal vez la verdadera pregunta de fondo sea todavía anterior a la calma: <strong>¿qué condiciones de la vida contemporánea debería la arquitectura ser capaz de suspender, contradecir o transformar temporalmente?</strong></p>
      <p>Esta pregunta cambia la estructura del problema. La reducción ya no sería buena porque produzca menos información, ni siquiera porque intensifique materia o luz. Sería relevante cuando forma parte de una estrategia capaz de instituir otra condición de experiencia. Pero incluso “otra condición” debe especificarse. ¿Menor competencia perceptiva? ¿Mayor libertad de atención? ¿Mayor capacidad de contemplar? ¿Una temporalidad menos acelerada? ¿Una relación más sensible con condiciones elementales? ¿Distancia respecto de la lógica de consumo y espectáculo? Cada una de estas posibilidades puede requerir operaciones distintas y, en algunos casos, incluso operaciones no reductivas.</p>
      <p>Esto introduce un contraejemplo útil para cualquier teoría demasiado pura. Puede haber situaciones en las que añadir espesor, umbral, sombra, masa, vegetación o secuencia produzca mejor la condición buscada que eliminar. Si eso ocurre, la teoría no debería sentirse amenazada. Al contrario: confirmaría que la reducción es un medio y no una moral cuantitativa. Lo importante sería comprender por qué una operación —sustractiva o no— reorganiza el campo de experiencia de una manera que responde a un problema humano concreto.</p>
      <p>Por eso el siguiente tramo de la investigación debería conservar una doble disciplina. Por un lado, continuar leyendo concepciones diferentes de reducción sin imponerles nuestro horizonte. Por otro, observar sistemáticamente la cadena que ellas abren: qué retiran o limitan, qué hacen perceptible, qué régimen de experiencia favorecen y qué finalidad declaran o dejan implícita. Con suficiente diversidad de casos, quizá podamos reconocer si la calma es verdaderamente una finalidad recurrente, una preferencia localizada, o solo un nombre provisional para algo más complejo que todavía no sabemos formular.</p>
      <p class="caution">Frontera activa: no necesitamos resolver todavía “qué necesita el ser humano contemporáneo”. Necesitamos construir suficiente contraste para que la respuesta, si aparece, no sea simplemente una proyección de nuestras primeras afinidades.</p>`
    }
  ];

  function traceButtons(trace){
    const map={
      'Silvestrin · lectura rigurosa':'sil',
      'Pawson · Minimum':'paw',
      'Morris · Notes on Sculpture':'mor',
      'Reinhardt · lectura revisada':'rei',
      'Agnes Martin · Beauty Is the Mystery of Life':'martin',
      'Silvestrin · mínimo / máxima intensidad':'sil',
      'Reinhardt · Black Paintings':'rei',
      'Silvestrin · The Supreme Ambition / Like an Elephant':'sil'
    };
    return trace.map(t=>map[t]?`<button data-mind-reading="${map[t]}">${esc(t)}</button>`:esc(t)).join(' · ');
  }

  function annotationSignal(){
    let notes=[];
    try{ notes=JSON.parse(localStorage.getItem('theorylab_v05_annotations')||'[]'); }catch{}
    if(!Array.isArray(notes)||!notes.length) return '';
    const txt=notes.map(a=>(a.quote||'')+' '+(a.note||'')).join(' ').toLowerCase();
    const lex={
      'calma / silencio':['calma','tranquil','silencio','quiet','paz','retiro'],
      'luz / percepción':['luz','light','percep','visual','ver','mirada'],
      'materia / materialidad':['materia','material','piedra','madera','textura'],
      'tiempo / lentitud':['tiempo','temporal','lent','duración','ritmo'],
      'reducción / sustracción':['reduc','sustra','quitar','menos','eliminar','retirar'],
      'atención / sensibilidad':['atenci','sensib','contempl','distrac']
    };
    const ranked=Object.entries(lex).map(([k,ws])=>[k,ws.reduce((n,w)=>n+(txt.split(w).length-1),0)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
    const top=ranked.slice(0,2).map(x=>x[0]);
    const withNotes=notes.filter(a=>(a.note||'').trim()).length;
    if(!top.length) return `Tus ${notes.length} subrayados ya forman una capa de memoria activa. ${withNotes} contienen notas propias. MIND los conserva como señales de resonancia, pero todavía no intenta convertir frecuencia de subrayado en verdad teórica.`;
    return `Tus ${notes.length} subrayados y notas están concentrando atención especialmente alrededor de <strong>${esc(top.join(' y '))}</strong>. Esto no cuenta como evidencia adicional sobre los autores; sí cuenta como evidencia autobiográfica de qué partes del corpus siguen trabajando en tu pensamiento. En una versión conectada al modelo, esta concentración deberá modificar qué memorias se reactivan y qué preguntas MIND intenta desarrollar a continuación.`;
  }

  function renderMind(){
    const view=$('view-mind'); if(!view) return;
    const signal=annotationSignal();
    view.innerHTML=`<div class="mind-surface">
      <header class="mind-mast">
        <div class="mind-date">MIND · 24 SEP 2026 · ACTIVE COGNITION</div>
        <h1>MIND no resume lo que has pensado. Intenta continuar pensando desde ahí.</h1>
        <p>Esta superficie trabaja sobre lecturas, feedback, memoria dormida y anotaciones. Los mecanismos internos no aparecen como herramientas: solo deberían sentirse en la calidad del argumento.</p>
      </header>
      <aside class="mind-live-signal" ${signal?'':'hidden'}><div class="signal-meta">LIVE READING MEMORY</div><p>${signal}</p></aside>
      ${dispatches.map(d=>`<article class="mind-dispatch" data-mind-id="${d.id}" data-faculties="${d.faculties.join(' ')}"><div class="dispatch-date">${d.date}</div><h2>${d.title}</h2>${d.html}<div class="mind-trace">Trazabilidad silenciosa: ${traceButtons(d.trace)}</div></article>`).join('')}
      <div class="mind-quiet">MIND puede conservar silencio. En el sistema vivo no debería publicar una pieza nueva si no existe una transformación, tensión o conexión suficientemente significativa.</div>
    </div>`;
    view.querySelectorAll('[data-mind-reading]').forEach(b=>b.onclick=()=>{
      if(typeof openReading==='function') openReading(b.dataset.mindReading);
    });
  }

  function syncMindMode(v){ document.body.classList.toggle('mind-mode',v==='mind'); }
  const oldSetView=window.setView;
  if(typeof oldSetView==='function'){
    window.setView=function(v){ oldSetView(v); syncMindMode(v); if(v==='mind')renderMind(); };
  }
  document.querySelectorAll('#topnav button').forEach(btn=>{
    const old=btn.onclick;
    btn.onclick=()=>{ if(old)old(); syncMindMode(btn.dataset.view); if(btn.dataset.view==='mind')renderMind(); };
  });

  document.querySelector('.sub').textContent='SUPERBRAIN · v0.6 · active cognition';
  renderMind();
  syncMindMode(state?.view||'mind');

  // Expose only for future backend integration; it is not a UI surface.
  window.THEORYLAB_MIND={faculties:mindFaculties,dispatches,refresh:renderMind};
})();
