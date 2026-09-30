document.body.innerHTML = `
<div class="app" id="app">
  <header class="topbar">
    <div class="topbar-brand"><div class="eyebrow">MINDS</div></div>
    <div id="orbDock" class="orb-dock" aria-label="Isabella"></div>
    <div class="top-actions"><button id="menuButton" class="dots" aria-label="Menú">•••</button></div>
  </header>

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
          <button id="attachButton" class="attach" aria-label="Adjuntar foto">＋</button>
          <input id="chatImageInput" class="hidden" type="file" accept="image/*" multiple>
          <button id="micButton" class="mic" aria-label="Hablar">⌁</button>
          <textarea id="chatInput" rows="1" placeholder="Escríbele a Isabella..."></textarea>
          <button id="sendButton" class="send" aria-label="Enviar">↑</button>
        </div>
      </div>
    </section>

    <section id="feedScreen" class="screen surface-screen" data-screen="feed">
      <div class="surface-scroll">
        <div class="surface-head surface-head-compact"><div class="surface-head-actions"><span id="feedRefreshStatus" class="surface-refresh-status" aria-live="polite"></span><button id="feedSettings" class="surface-text-action">Ajustar</button><button id="refreshFeed" class="round surface-refresh" aria-label="Actualizar Feed">↻</button></div></div>
        <div id="feedList" class="surface-list"><div class="surface-loading">Leyendo tu situación…</div></div>
      </div>
    </section>

    <section id="ideasScreen" class="screen surface-screen" data-screen="ideas">
      <div class="surface-scroll">
        <div class="surface-head surface-head-compact"><button id="refreshIdeas" class="round surface-refresh" aria-label="Actualizar Ideas">↻</button></div>
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
        </div>
        <div class="work-tabs" role="tablist">
          <button data-work-view="desktop" class="active">Desktop</button>
          <button data-work-view="planner">Planner</button>
          <button data-work-view="knowledge">Conocimiento</button>
        </div>
        <div id="workStatus" class="work-status" aria-live="polite"></div>
        <div id="workBody" class="work-body"><div class="surface-loading">Abriendo Work…</div></div>
        <input id="workFileInput" class="hidden" type="file" multiple>
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
    <button class="main-nav-item active" data-nav="assistant" aria-label="Chat"><span class="nav-icon">◯</span><span class="nav-label">Chat</span></button>
    <button class="main-nav-item" data-nav="calendar" aria-label="Calendario"><span class="nav-icon">□</span><span class="nav-label">Calendario</span></button>
    <button class="main-nav-item" data-nav="feed" aria-label="Feed"><span class="nav-icon">▤</span><span class="nav-label">Feed</span></button>
    <button class="main-nav-item" data-nav="ideas" aria-label="Ideas"><span class="nav-icon">◌</span><span class="nav-label">Ideas</span></button>
    <button class="main-nav-item" data-nav="readings" aria-label="Readings"><span class="nav-icon">≡</span><span class="nav-label">Readings</span></button>
    <button class="main-nav-item" data-nav="work" aria-label="Work"><span class="nav-icon">▱</span><span class="nav-label">Work</span></button>
  </nav>

  <div id="drawerBackdrop" class="backdrop hidden"></div>
  <aside id="drawer" class="drawer hidden"><div class="drawer-head"><div><div class="eyebrow">ISABELLA</div><div class="drawer-title">Más</div></div><button id="closeDrawer" class="round">×</button></div><button id="authButton">Conectar memoria</button><button data-action="tasks">Tareas</button><button data-action="new">Agregar manualmente</button><button data-action="memory">Lo que Isabella sabe de mí</button><button data-action="assistantprefs">Proactividad de Isabella</button><button data-action="routines">Rutinas</button><button data-action="intents">Memoria futura</button><button data-action="continuity">Continuidad</button><button data-action="skills">Habilidades</button><button data-action="doctor">Estado de MINDS</button><button data-action="feedprefs">Feed y clima</button><button data-action="artifacts">Artefactos</button><button data-action="aiusage">Uso IA</button><button data-action="categories">Categorías y proyectos</button><div id="syncStatus" class="drawer-note">Preparando memoria…</div><div class="drawer-note">Build 2026.09.30.59</div></aside>
  <div id="focusMode" class="focus hidden" role="dialog" aria-modal="true"><div class="focus-head"><div class="focus-name">Isabella</div><button id="focusClose" class="round">×</button></div><div class="focus-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div id="focusStatus" class="focus-status">Escuchando…</div><textarea id="focusTranscript" class="focus-transcript" rows="5" readonly placeholder="Tu transcripción aparecerá aquí."></textarea></div><div class="focus-actions"><button id="focusKeyboard">Cancelar</button><button id="focusStop" class="dark">Detener</button></div></div>
  <div id="modalBackdrop" class="backdrop hidden"></div><div id="modal" class="modal hidden"><div class="modal-head"><div id="modalTitle" class="modal-title"></div><button id="closeModal" class="round">×</button></div><div id="modalBody"></div></div>
</div>`;
