const navIcon = paths => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths+'</svg>';
const NAV_ICONS = Object.freeze({
  feed:navIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>'),
  assistant:navIcon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>'),
  calendar:navIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'),
  work:navIcon('<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>'),
  readings:navIcon('<path d="M12 21V5a4 4 0 0 0-4-2H3v16h5a4 4 0 0 1 4 2zm0 0V5a4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2z"/>')
});

document.body.innerHTML = `
<div class="app" id="app">
  <header class="topbar">
    <div class="topbar-brand"><div class="eyebrow">MINDS</div></div>
    <div id="orbDock" class="orb-dock" aria-label="Isabella"></div>
    <div class="top-actions"><button id="menuButton" class="dots" aria-label="Menú">•••</button></div>
  </header>

  <nav id="desktopLenses" class="desktop-lenses" aria-label="Vistas de MINDS">
    <div class="lenses-heading">VISTAS</div>
    <button class="lens-nav-item active" data-nav="assistant" aria-label="Chat"><span class="lens-glyph" aria-hidden="true">${NAV_ICONS.assistant}</span><span class="lens-copy"><strong>Chat</strong><small>Hablar con Isabella</small></span></button>
    <button class="lens-nav-item" data-nav="feed" aria-label="Situación"><span class="lens-glyph" aria-hidden="true">${NAV_ICONS.feed}</span><span class="lens-copy"><strong>Situación</strong><small>Ahora e Ideas</small></span></button>
    <button class="lens-nav-item" data-nav="calendar" aria-label="Tiempo"><span class="lens-glyph" aria-hidden="true">${NAV_ICONS.calendar}</span><span class="lens-copy"><strong>Tiempo</strong><small>Calendario y tareas</small></span></button>
    <button class="lens-nav-item" data-nav="work" aria-label="Work"><span class="lens-glyph" aria-hidden="true">${NAV_ICONS.work}</span><span class="lens-copy"><strong>Work</strong><small>Proyectos</small></span></button>
    <button class="lens-nav-item" data-nav="readings" aria-label="Lecturas"><span class="lens-glyph" aria-hidden="true">${NAV_ICONS.readings}</span><span class="lens-copy"><strong>Lecturas</strong><small>Investigación</small></span></button>
    <div class="lenses-foot">Una memoria · distintas vistas</div>
  </nav>

  <main id="swipeArea" class="swipe-area">
    <section id="assistantScreen" class="screen active" data-screen="assistant">
      <div class="assistant-scroll">
        <div id="orbHome" class="orb-home"><button id="orbButton" class="orb-button" aria-label="Hablar con Isabella"><span class="orb-haze orb-haze-a"></span><span class="orb-haze orb-haze-b"></span><span class="orb-core"></span></button></div>
        <button id="todayCard" class="today-card"><span class="today-title">Hoy</span><span id="todaySummary" class="today-summary">0 eventos · 0 tareas</span><span id="todayNext" class="today-next">Sin próxima cita</span><span class="chevron">›</span></button>
        <div id="messages" class="messages" aria-live="polite"></div>
      </div>
      <div class="composer-wrap">
        <div id="chatReplyPreview" class="chat-reply-preview hidden"></div>
        <div id="chatAttachmentPreview" class="chat-attachment-preview hidden"></div>
        <div class="composer">
          <button id="attachButton" class="attach" aria-label="Adjuntar archivo">＋</button>
          <input id="chatImageInput" class="hidden" type="file" accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.eml" multiple>
          <button id="micButton" class="mic" aria-label="Hablar">⌁</button>
          <textarea id="chatInput" rows="1" placeholder="Escríbele a Isabella..."></textarea>
          <button id="sendButton" class="send" aria-label="Enviar">↑</button>
        </div>
      </div>
    </section>

    <section id="feedScreen" class="screen surface-screen" data-screen="feed">
      <div class="surface-scroll">
        <div class="situation-toolbar">
          <div class="situation-tabs" role="tablist" aria-label="Situación"><button type="button" role="tab" aria-controls="feedScreen" aria-selected="true" class="active" data-situation-view="feed">Ahora</button><button type="button" role="tab" aria-controls="ideasScreen" aria-selected="false" data-situation-view="ideas">Ideas</button></div>
          <div class="situation-tools"><span id="feedRefreshStatus" class="surface-refresh-status" aria-live="polite"></span><button id="feedSettings" class="surface-text-action">Ajustar</button><span class="minds-menu-slot" data-menu-slot="feed"></span></div>
        </div>
        <div class="pull-refresh-indicator" data-pull-indicator="feed" aria-hidden="true"><span>Desliza para actualizar</span></div>
        <div id="situationWeather" class="situation-weather" aria-label="Clima"></div>
        <div id="situationLedger" class="situation-ledger" aria-live="polite"><p class="situation-loading">Comprobando tu situación…</p></div>
        <div id="feedList" class="surface-list"><div class="surface-loading">Leyendo tu situación…</div></div>
      </div>
    </section>

    <section id="ideasScreen" class="screen surface-screen" data-screen="ideas">
      <div class="surface-scroll">
        <div class="situation-toolbar">
          <div class="situation-tabs" role="tablist" aria-label="Situación"><button type="button" role="tab" aria-controls="feedScreen" aria-selected="false" data-situation-view="feed">Ahora</button><button type="button" role="tab" aria-controls="ideasScreen" aria-selected="true" class="active" data-situation-view="ideas">Ideas</button></div>
          <div class="situation-tools"><button type="button" id="generateIdeas" class="surface-text-action">Explorar nuevas ideas</button><span class="minds-menu-slot" data-menu-slot="ideas"></span></div>
        </div>
        <div class="pull-refresh-indicator" data-pull-indicator="ideas" aria-hidden="true"><span>Desliza para actualizar</span></div>
        <div id="ideasList" class="surface-list"><div class="surface-loading">Buscando algo que valga la pena producir…</div></div>
      </div>
    </section>

    <section id="workScreen" class="screen work-screen" data-screen="work">
      <div class="work-shell">
        <div class="work-head">
          <div><h1 id="workProjectTitle">Bernried</h1></div>
          <div class="work-project-switch" aria-label="Proyecto">
            <button data-work-project="bernried" class="active">Bernried</button>
            <button data-work-project="schwarz">Schwarz</button>
          </div>
          <span class="minds-menu-slot" data-menu-slot="work"></span>
        </div>
        <div class="work-tabs" role="tablist">
          <button data-work-view="overview" class="active">Panorama</button>
          <button data-work-view="desktop">Desktop</button>
          <button data-work-view="planner">Planner</button>
          <button data-work-view="knowledge">Conocimiento</button>\n          <button data-work-view="threads">Threads</button>
        </div>
        <div id="workStatus" class="work-status" aria-live="polite"></div>
        <div id="workBody" class="work-body"><div class="surface-loading">Abriendo Work…</div></div>
        <input id="workFileInput" class="hidden" type="file" multiple>
      </div>
    </section>

    <section id="calendarScreen" class="screen" data-screen="calendar">
      <div class="cal-toolbar"><button id="backButton" class="text-btn">‹ Isabella</button><div class="segments"><button data-view="day">Día</button><button data-view="week">Semana</button><button class="active" data-view="month">Mes</button></div><div class="cal-toolbar-right"><button id="todayButton" class="text-btn right">Hoy</button><span class="minds-menu-slot" data-menu-slot="calendar"></span></div></div>
      <div class="cal-nav"><button id="prevButton" class="round">‹</button><div id="calTitle" class="cal-title"></div><button id="nextButton" class="round">›</button></div>
      <div id="calendarContent" class="calendar-content"></div>
    </section>

    <section id="readingsScreen" class="screen readings-screen" data-screen="readings">
      <div class="readings-topline"><div><span class="readings-agent">SOFÍA</span><span class="readings-title">Readings</span></div><div class="readings-top-actions"><button id="openSofiaButton" class="sofia-button">Hablar con Sofía</button><span class="minds-menu-slot" data-menu-slot="readings"></span></div></div>
      <iframe id="readingsFrame" class="readings-frame" title="MINDS Readings · Sofía" loading="lazy"></iframe>
    </section>
  </main>

  <section id="feedDetail" class="feed-detail hidden" aria-hidden="true">
    <div class="feed-detail-head"><div class="eyebrow">MINDS · FEED</div><button id="closeFeedDetail" class="round" aria-label="Cerrar">×</button></div>
    <div id="feedDetailScroll" class="feed-detail-scroll">
      <div id="feedDetailMeta" class="feed-detail-meta"></div>
      <h1 id="feedDetailTitle"></h1>
      <div id="feedDetailMedia" class="feed-detail-media"></div>
      <p id="feedDetailSummary" class="feed-detail-summary"></p>
      <div id="feedDetailArticle" class="feed-detail-article"></div>
      <div id="feedDetailFollow" class="feed-detail-follow"></div>
      <div id="feedThreadLog" class="feed-thread-log"></div>
    </div>
    <form id="feedThreadForm" class="feed-thread-form">
      <textarea id="feedThreadInput" rows="1" placeholder="Preguntar sobre esto..."></textarea>
      <button class="send" aria-label="Enviar">↑</button>
    </form>
  </section>

  <section id="ideaWorkspace" class="idea-workspace hidden" aria-hidden="true">
    <div class="idea-workspace-head">
      <div><div class="eyebrow">MINDS · TRABAJO</div><div id="ideaWorkspaceStatus" class="idea-workspace-status">EN PRODUCCIÓN</div></div>
      <button id="closeIdeaWorkspace" class="round" aria-label="Cerrar">×</button>
    </div>
    <div id="ideaWorkspaceScroll" class="idea-workspace-scroll">
      <h1 id="ideaWorkspaceTitle"></h1>
      <p id="ideaWorkspaceBrief" class="idea-workspace-brief"></p>
      <div id="ideaWorkspaceArtifact" class="idea-workspace-artifact hidden"></div>
      <div id="ideaWorkspaceThread" class="idea-workspace-thread"></div>
    </div>
    <form id="ideaWorkspaceForm" class="idea-workspace-form">
      <textarea id="ideaWorkspaceInput" rows="1" placeholder="Seguir trabajando en esta idea..."></textarea>
      <button class="send" aria-label="Enviar">↑</button>
    </form>
  </section>

  <nav id="mainNav" class="main-nav" aria-label="MINDS">
    <button class="main-nav-item active" data-nav="assistant" aria-label="Chat"><span class="nav-icon">${NAV_ICONS.assistant}</span></button>
    <button class="main-nav-item" data-nav="feed" aria-label="Situación"><span class="nav-icon">${NAV_ICONS.feed}</span></button>
    <button class="main-nav-item" data-nav="calendar" aria-label="Tiempo"><span class="nav-icon">${NAV_ICONS.calendar}</span></button>
    <button class="main-nav-item" data-nav="work" aria-label="Work"><span class="nav-icon">${NAV_ICONS.work}</span></button>
    <button class="main-nav-item" data-nav="readings" aria-label="Lecturas"><span class="nav-icon">${NAV_ICONS.readings}</span></button>
  </nav>

  <div id="drawerBackdrop" class="backdrop hidden"></div>
  <aside id="drawer" class="drawer hidden"><div class="drawer-head"><div><div class="eyebrow">ISABELLA</div><div class="drawer-title">Más</div></div><button id="closeDrawer" class="round">×</button></div><button id="authButton">Conectar memoria</button><button id="refreshViewAction" data-action="refreshview" class="hidden">Actualizar vista</button><button data-action="tasks">Tareas</button><button data-action="new">Agregar manualmente</button><button data-action="memory">Lo que Isabella sabe de mí</button><button data-action="assistantprefs">Proactividad de Isabella</button><button data-action="push">Avisos de Isabella</button><button data-action="permissions">Permisos de Isabella</button><button data-action="reviews">Revisiones</button><button data-action="routines">Rutinas</button><button data-action="intents">Memoria futura</button><button data-action="continuity">Continuidad</button><button data-action="skills">Habilidades</button><button data-action="doctor">Estado de MINDS</button><button data-action="feedprefs">Feed y clima</button><button data-action="artifacts">Artefactos</button><button data-action="aiusage">Uso IA</button><button data-action="categories">Categorías y proyectos</button><div id="syncStatus" class="drawer-note">Preparando memoria…</div><div class="drawer-note">Build 2026.10.09.90.3</div></aside>
  <div id="focusMode" class="focus hidden" role="dialog" aria-modal="true"><div class="focus-head"><div class="focus-name">Isabella</div><button id="focusClose" class="round">×</button></div><div class="focus-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div id="focusStatus" class="focus-status">Escuchando…</div><textarea id="focusTranscript" class="focus-transcript" rows="5" readonly placeholder="Tu transcripción aparecerá aquí."></textarea></div><div class="focus-actions"><button id="focusKeyboard">Cancelar</button><button id="focusStop" class="dark">Detener</button></div></div>
  <div id="modalBackdrop" class="backdrop hidden"></div><div id="modal" class="modal hidden"><div class="modal-head"><div id="modalTitle" class="modal-title"></div><button id="closeModal" class="round">×</button></div><div id="modalBody"></div></div>
</div>`;
