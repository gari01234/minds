document.body.innerHTML = `
<div class="app" id="app">
  <header class="topbar">
    <div><div class="eyebrow">MINDS</div></div>
    <div class="top-actions"><button id="calendarButton" class="text-btn top-calendar-shortcut">Calendario</button><button id="menuButton" class="dots" aria-label="Menú">•••</button></div>
  </header>

  <main id="swipeArea" class="swipe-area">
    <section id="assistantScreen" class="screen active" data-screen="assistant">
      <div class="assistant-scroll">
        <button id="orbButton" class="orb-button" aria-label="Hablar con Isabella"><span class="orb-haze orb-haze-a"></span><span class="orb-haze orb-haze-b"></span><span class="orb-core"></span></button>
        <button id="todayCard" class="today-card"><span class="today-title">Hoy</span><span id="todaySummary" class="today-summary">0 eventos · 0 tareas</span><span id="todayNext" class="today-next">Sin próxima cita</span><span class="chevron">›</span></button>
        <div id="messages" class="messages" aria-live="polite"></div>
      </div>
      <div class="composer-wrap"><div class="composer"><button id="micButton" class="mic" aria-label="Hablar">⌁</button><textarea id="chatInput" rows="1" placeholder="Escríbele a Isabella..."></textarea><button id="sendButton" class="send" aria-label="Enviar">↑</button></div></div>
    </section>

    <section id="feedScreen" class="screen surface-screen" data-screen="feed">
      <div class="surface-scroll">
        <div class="surface-head"><div><div class="surface-agent">ISABELLA</div><h1>Feed</h1><p>Lo que merece tu atención, sin tener que pedirlo.</p></div><button id="refreshFeed" class="round surface-refresh" aria-label="Actualizar Feed">↻</button></div>
        <div id="feedList" class="surface-list"><div class="surface-loading">Preparando tu Feed…</div></div>
      </div>
    </section>

    <section id="ideasScreen" class="screen surface-screen" data-screen="ideas">
      <div class="surface-scroll">
        <div class="surface-head"><div><div class="surface-agent">MINDS</div><h1>Ideas</h1><p>Sugerencias que emergen de tu contexto, tus proyectos y tus lecturas.</p></div><button id="refreshIdeas" class="round surface-refresh" aria-label="Actualizar Ideas">↻</button></div>
        <div id="ideasList" class="surface-list"><div class="surface-loading">Buscando conexiones útiles…</div></div>
      </div>
    </section>

    <section id="calendarScreen" class="screen" data-screen="calendar">
      <div class="cal-toolbar"><button id="backButton" class="text-btn">‹ Isabella</button><div class="segments"><button data-view="day">Día</button><button data-view="week">Semana</button><button class="active" data-view="month">Mes</button></div><button id="todayButton" class="text-btn right">Hoy</button></div>
      <div class="cal-nav"><button id="prevButton" class="round">‹</button><div id="calTitle" class="cal-title"></div><button id="nextButton" class="round">›</button></div>
      <div id="calendarContent" class="calendar-content"></div>
    </section>

    <section id="readingsScreen" class="screen readings-screen" data-screen="readings">
      <div class="readings-topline"><div><span class="readings-agent">SOFÍA</span><span class="readings-title">Readings</span></div><button id="openSofiaButton" class="sofia-button">Hablar con Sofía</button></div>
      <iframe id="readingsFrame" class="readings-frame" title="MINDS Readings · Sofía" loading="lazy"></iframe>
    </section>
  </main>

  <nav id="mainNav" class="main-nav" aria-label="MINDS">
    <button class="main-nav-item active" data-nav="assistant" aria-label="Chat"><span class="nav-icon">◯</span><span class="nav-label">Chat</span></button>
    <button class="main-nav-item" data-nav="feed" aria-label="Feed"><span class="nav-icon">▤</span><span class="nav-label">Feed</span></button>
    <button class="main-nav-item" data-nav="ideas" aria-label="Ideas"><span class="nav-icon">◌</span><span class="nav-label">Ideas</span></button>
    <button class="main-nav-item" data-nav="calendar" aria-label="Calendario"><span class="nav-icon">□</span><span class="nav-label">Calendario</span></button>
    <button class="main-nav-item" data-nav="readings" aria-label="Readings"><span class="nav-icon">≡</span><span class="nav-label">Readings</span></button>
  </nav>

  <div id="drawerBackdrop" class="backdrop hidden"></div>
  <aside id="drawer" class="drawer hidden"><div class="drawer-head"><div><div class="eyebrow">ISABELLA</div><div class="drawer-title">Más</div></div><button id="closeDrawer" class="round">×</button></div><button id="authButton">Conectar memoria</button><button data-action="tasks">Tareas</button><button data-action="new">Agregar manualmente</button><button data-action="memory">Lo que Isabella sabe de mí</button><button data-action="skills">Habilidades</button><button data-action="categories">Categorías y proyectos</button><div id="syncStatus" class="drawer-note">Preparando memoria…</div><div class="drawer-note">Build 2026.09.26.15</div></aside>
  <div id="focusMode" class="focus hidden" role="dialog" aria-modal="true"><div class="focus-head"><div class="focus-name">Isabella</div><button id="focusClose" class="round">×</button></div><div class="focus-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div id="focusStatus" class="focus-status">Escuchando…</div><textarea id="focusTranscript" class="focus-transcript" rows="5" readonly placeholder="Tu transcripción aparecerá aquí."></textarea></div><div class="focus-actions"><button id="focusKeyboard">Cancelar</button><button id="focusStop" class="dark">Detener</button></div></div>
  <div id="modalBackdrop" class="backdrop hidden"></div><div id="modal" class="modal hidden"><div class="modal-head"><div id="modalTitle" class="modal-title"></div><button id="closeModal" class="round">×</button></div><div id="modalBody"></div></div>
</div>`;