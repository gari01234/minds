/* Build 95 · Adaptive Isabella workspace.
 * Presentation only: reuses the existing chat DOM and task/calendar APIs.
 * Desktop/iPad landscape >=950px. On smaller screens restores original chat DOM. */
(() => {
  'use strict';
  const M = window.MINDS_DESK_MODEL;
  const app = () => window.ISABELLA_APP;
  const screen = document.getElementById('assistantScreen');
  const sidebar = document.getElementById('desktopLenses');
  const mq = window.matchMedia('(min-width: 950px)');
  if (!M || !screen || !sidebar) return;
  const KEY = 'isabella-adaptive-desk-v1';
  const LABELS = {chat:'Isabella',calendar:'Calendario',today:'Hoy',plan:'Plan del día'};
  const ICONS = {chat:'◇',calendar:'▦',today:'☷',plan:'▤'};
  const E = M.escapeHtml;
  const q = (parent,selector) => parent.querySelector(selector);
  const load = () => {
    // At each new launch the views rail starts collapsed; it stays toggleable
    // across Chat, Time, Work, Lecturas, Situación and Thoughts in this session.
    try { return {...M.sanitizePreferences(JSON.parse(localStorage.getItem(KEY) || 'null')),navCollapsed:true}; }
    catch { return {...M.defaultPreferences(),navCollapsed:true}; }
  };
  let prefs = load(),shell = null, stage = null, rail = null, parking = null, dock = null;
  let parts = {}, originalScroll = null, originalComposer = null, navButton = null;
  let previousFocus = 'chat', dragged = null, frame = 0;
  let todayDragId = null, todayDragDate = null, touchSort = null;
  const scrollChatAfterGridChange = () => {
    // WebKit resets the scroll offset when an existing chat node is reparented.
    // Restore at both animation frames and after the flex grid has settled.
    requestAnimationFrame(()=>requestAnimationFrame(()=>app()?.scrollChatToLatest?.()));
    setTimeout(()=>{if(shell)app()?.scrollChatToLatest?.();},90);
  };
  const commitTodayOrder = list => {
    if (!list) return;
    const ids=[...list.querySelectorAll(':scope > .desk-task-row:not(.is-done)')]
      .map(row=>row.dataset.deskRowId).filter(Boolean);
    app()?.reorderDeskTasks?.(prefs.selectedDate,ids);
  };
  const moveTodayRow = (row,target,y) => {
    if (!row || !target || row===target || row.classList.contains('is-done')
      || target.classList.contains('is-done') || row.parentNode!==target.parentNode) return;
    const rect=target.getBoundingClientRect();
    row.parentNode.insertBefore(row,y<rect.top+rect.height/2?target:target.nextSibling);
  };
  const nativeTimeScreen = document.getElementById('calendarScreen');
  const nativeTimeParts = nativeTimeScreen
    ? ['.cal-toolbar','.cal-nav','#calendarContent'].map(selector=>nativeTimeScreen.querySelector(selector))
    : [];
  let nativeTimeHost = null;
  const releaseTime = () => {
    if (!nativeTimeHost || !nativeTimeScreen) return;
    for (const node of nativeTimeParts) if (node) nativeTimeScreen.append(node);
    nativeTimeHost.remove();nativeTimeHost=null;
  };
  const mountTime = () => {
    if (nativeTimeHost || !parts.calendar || nativeTimeParts.some(node=>!node)) return;
    nativeTimeHost = elt('div','desk-time-native');
    for (const node of nativeTimeParts) nativeTimeHost.append(node);
    parts.calendar.append(nativeTimeHost);
    if (app()?.getState()?.date !== prefs.selectedDate) app()?.selectCalendarDate?.(prefs.selectedDate);
    else app()?.renderNativeCalendar?.();
  };
  const remember = () => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  };
  const elt = (tag,cls,html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };
  const niceDate = key => {
    const d = M.dateFromKey(key);
    return d ? d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}) : '';
  };
  const safeColor = color => /^#[0-9a-f]{3,8}$/i.test(String(color || '')) ? color : '#9297a0';
  const panel = key => {
    const node = elt('section','desk-panel desk-panel--' + key);
    node.dataset.deskPanel = key;
    node.setAttribute('aria-label',LABELS[key]);
    const head = elt('header','desk-panel-head',
      '<span class="desk-panel-grip" title="Arrastrar para ordenar" aria-hidden="true">⋮⋮</span>' +
      '<span class="desk-panel-title">' + LABELS[key] + '</span>' +
      '<span class="desk-panel-actions">' +
      '<button type="button" data-desk-focus="' + key + '" aria-label="Ampliar ' + LABELS[key] + '" title="Ampliar">↗</button>' +
      '<button type="button" data-desk-minimize="' + key + '" aria-label="Minimizar ' + LABELS[key] + '" title="Minimizar">−</button></span>');
    head.draggable = true;
    head.addEventListener('dragstart', event => {
      dragged = key;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain','minds-panel:' + key);
    });
    head.addEventListener('dragend',() => {dragged = null;});
    node.addEventListener('dragover',event => {
      if (!dragged || dragged === key) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    node.addEventListener('drop',event => {
      if (!dragged || dragged === key) return;
      event.preventDefault();
      const from = dragged;
      dragged = null;
      // Dropping on the enlarged panel promotes the dragged panel.
      if (key === prefs.focus) prefs.focus = from;
      else if (from === prefs.focus) prefs.focus = key;
      else {
        const order = prefs.order.filter(x=>x !== from);
        order.splice(Math.max(0,order.indexOf(key)),0,from);
        prefs.order = order;
      }
      remember();layout();
    });
    node.append(head);
    if (key !== 'chat') node.append(elt('div','desk-panel-content'));
    return node;
  };
  const layout = () => {
    if (!shell) return;
    if (prefs.focus !== 'calendar' || prefs.minimized.includes('calendar')) releaseTime();
    let visible = M.PANELS.filter(k => !prefs.minimized.includes(k));
    if (!visible.length) {prefs.minimized=[];visible=[...M.PANELS];}
    if (!visible.includes(prefs.focus)) prefs.focus = visible.includes('chat') ? 'chat' : visible[0];
    const other = ['chat',...prefs.order].filter((key,i,arr) => key !== prefs.focus && visible.includes(key) && arr.indexOf(key) === i);
    const chatParentBefore = parts.chat.parentElement;
    for (const key of M.PANELS) {
      const holder = key === prefs.focus ? stage : prefs.minimized.includes(key) ? parking : rail;
      if (parts[key].parentElement !== holder) holder.append(parts[key]);
      parts[key].classList.toggle('desk-panel-primary',key===prefs.focus);
      q(parts[key],'[data-desk-focus]').disabled = key === prefs.focus;
      parts[key].setAttribute('data-desk-layout',key === prefs.focus ? 'large' : 'compact');
    }
    // Reorder only if needed: preserving chat node and input focus matters.
    other.forEach((key,i) => {
      const node = parts[key],at = rail.children[i];
      if (at !== node) rail.insertBefore(node,at || null);
    });
    const handles = q(shell,'.desk-splitter');
    if (handles) {
      handles.hidden = rail.children.length === 0;
      handles.setAttribute('aria-valuenow',String(prefs.width));
    }
    shell.style.setProperty('--desk-rail-width',prefs.width + 'px');
    dock.innerHTML = prefs.minimized.map(key =>
      '<button type="button" data-desk-restore="' + key + '" aria-label="Restaurar ' + LABELS[key] + '">' +
      '<span aria-hidden="true">' + ICONS[key] + '</span>' + LABELS[key] + ' <span aria-hidden="true">＋</span></button>').join('');
    dock.hidden = prefs.minimized.length === 0;
    rail.hidden = rail.children.length === 0;
    if (prefs.focus === 'calendar' && app()?.getState()?.screen==='assistant') mountTime();
    document.body.classList.toggle('minds-nav-collapsed',prefs.navCollapsed);
    navButton.setAttribute('aria-expanded',String(!prefs.navCollapsed));
    navButton.title = prefs.navCollapsed ? 'Mostrar vistas' : 'Minimizar vistas';
    navButton.textContent = prefs.navCollapsed ? '›' : '‹';
    remember();
    if (chatParentBefore!==parts.chat.parentElement) scrollChatAfterGridChange();
  };
  const calendarHtml = state => {
    const date = M.dateFromKey(prefs.selectedDate) || new Date();
    const month = date.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
    const grid = M.monthCells(prefs.selectedDate);
    const now = M.dayKey(new Date());
    const cells = grid.map(cell => {
      const events = M.eventsForDay(state,cell.key);
      const tasks = M.tasksForDay(state,cell.key);
      const dots = [...events,...tasks].slice(0,3).map(item =>
        '<i style="background:' + safeColor(M.colorFor(state,item)) + '"></i>').join('');
      return '<button class="desk-month-day' + (cell.inMonth?'':' is-outside') +
        (cell.key===prefs.selectedDate?' is-selected':'') + (cell.key===now?' is-today':'') +
        '" type="button" data-desk-date="' + cell.key +
        '" aria-label="' + E(niceDate(cell.key)) + '" ' +
        (cell.key===now?'aria-current="date"':'') + '><span>' + cell.day +
        '</span><span class="desk-month-dots">' + dots + '</span></button>';
    }).join('');
    return '<div class="desk-month-bar"><button type="button" data-desk-month="-1" aria-label="Mes anterior">‹</button>' +
      '<strong>' + E(month) + '</strong><button type="button" data-desk-month="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="desk-month-weekdays" aria-hidden="true">' +
      ['L','M','X','J','V','S','D'].map(d=>'<span>'+d+'</span>').join('') +
      '</div><div class="desk-month-grid">' + cells + '</div>';
  };
  const todayHtml = state => {
    const items = M.tasksForDay(state,prefs.selectedDate);
    const meetings = M.eventsForDay(state,prefs.selectedDate);
    const dateName = prefs.selectedDate === M.dayKey(new Date()) ?
      'Hoy · ' + niceDate(prefs.selectedDate) : niceDate(prefs.selectedDate);
    const formatMinutes = n => Math.floor(n/60)+' h'+(n%60?' '+(n%60)+' min':'');
    const rows = items.map(item => {
      const project = M.projectFor(state,item.projectId);
      const category = M.categoryFor(state,item.categoryId);
      const sessions = (state.events||[]).filter(e=>e.metadata?.kind==='task_work_session_v1'
        &&e.metadata?.task_client_key===item.id);
      const reserved = sessions.reduce((sum,e)=>sum+Math.max(0,Number(e.duration)||0),0);
      const estimate = M.estimatedMinutes(item);
      return '<div class="desk-task-row' + (item.done?' is-done':'') +
        '" draggable="' + (!item.done) + '" data-desk-row-id="' + E(item.id) +
        '" data-desk-drag-task="' + E(item.id) + '">' +
        '<button class="desk-task-check" type="button" data-desk-complete="' + E(item.id) +
        '" aria-label="' + E(item.done?'Reabrir':'Completar') + ' ' + E(item.title) +
        '">' + (item.done?'✓':'') + '</button>' +
        '<button class="desk-task-detail" type="button" data-desk-task="' + E(item.id) + '">' +
        '<strong>' + E(item.title) + '</strong><small>' +
        E(project?.name || category?.name || '') +
        (estimate?' · estimado '+formatMinutes(estimate):'') +
        (reserved?' · reservado '+formatMinutes(reserved):'') +
        '</small></button>' +
        (!item.done?'<button type="button" class="desk-task-estimate" data-desk-estimate="' + E(item.id) +
        '" title="Estimar duración" aria-label="Estimar duración de ' + E(item.title) + '">◷</button>' +
        '<button type="button" class="desk-plan-task" data-desk-plan-task="' + E(item.id) +
        '" title="Reservar tiempo" aria-label="Reservar tiempo para ' + E(item.title) + '">＋</button>' +
        '<button type="button" class="desk-task-handle" data-desk-sort-handle="' + E(item.id) +
        '" title="Arrastrar para ordenar" aria-label="Arrastrar para ordenar ' + E(item.title) + '">⋮⋮</button>':'')+
        '</div>';
    }).join('');
    return '<div class="desk-today-toolbar"><span class="desk-subtitle">' + E(dateName) + '</span>' +
      '<button type="button" class="desk-add-task" data-desk-add-task>＋ Añadir tarea</button></div>' +
      '<div class="desk-task-list" data-desk-task-list>' +
      (rows || '<p class="desk-empty">No hay tareas para esta fecha.</p>') + '</div>' +
      '<div class="desk-panel-footer">' +
      '<span>' + items.filter(x=>!x.done).length + ' pendientes · ' + meetings.length + ' eventos</span>' +
      '<button type="button" data-desk-open-time>Ver en Tiempo →</button></div>';
  };
  const planHtml = state => {
    const date = prefs.selectedDate;
    const events = M.timedEvents(state,date,7,21);
    const sessions = M.eventsForDay(state,date).filter(e=>e.metadata?.kind==='task_work_session_v1');
    const scheduled = events.reduce((sum,e)=>sum+Number(e.duration||0),0);
    const hmins = min => Math.floor(min/60)+' h '+String(min%60).padStart(2,'0');
    const hours=[7,9,11,13,15,17,19,21];
    const bars=events.map(item=>{
      const isSession=item.metadata?.kind==='task_work_session_v1';
      const sourceTask=M.taskForSession(state,item);
      const eventTitle=isSession?'Sesión · '+(sourceTask?.title||item.title):item.title;
      const until=M.minutes(item.start)+Number(item.duration);
      const time=String(Math.floor(until/60)%24).padStart(2,'0')+':'+String(until%60).padStart(2,'0');
      return '<button type="button" class="desk-time-event' + (isSession?' is-work-session':'') + '" data-desk-event="' + E(item.id) +
        '" style="left:' + item.left.toFixed(3) + '%;width:' + Math.max(1.7,item.width).toFixed(3) +
        '%;--desk-accent:' + safeColor(M.colorFor(state,item)) + '" title="' + E(item.title) + '">' +
        '<strong>' + E(eventTitle) + '</strong><small>' + (isSession?'Tiempo reservado · ':'') + E(item.start) + '–' + time + '</small></button>';
    }).join('');
    const effort=Math.round(sessions.reduce((sum,e)=>sum+Math.max(0,Number(e.duration)||0),0));
    const plannedTasks=M.tasksForDay(state,date).filter(t=>!t.done);
    const totalEstimate=plannedTasks.reduce((sum,t)=>sum+M.estimatedMinutes(t),0);
    const unknown=plannedTasks.filter(t=>!M.estimatedMinutes(t)).length;
    const rows=plannedTasks.slice(0,6).map(t=>'<div class="desk-plan-task-row"><span>'+E(t.title)+'</span>'+
      '<button type="button" data-desk-plan-task="'+E(t.id)+'" aria-label="Reservar tiempo para '+E(t.title)+'">Reservar →</button></div>').join('');
    const line=hours.map(h=>'<span>'+String(h).padStart(2,'0')+':00</span>').join('');
    return '<div class="desk-plan-date">' + E(niceDate(date)) + '</div>' +
      '<div class="desk-plan-metrics"><span><strong>'+hmins(scheduled)+'</strong> · eventos programados</span>'+
      '<span>'+hmins(effort)+' · sesiones de tareas</span>' +
      '<span>'+(totalEstimate?hmins(totalEstimate)+' · estimadas':'Sin estimaciones')+
      (unknown?' · '+unknown+' por estimar':'')+'</span></div>' +
      '<div class="desk-plan-hours">'+line+'</div><div class="desk-time-track">'+bars+'</div>' +
      (!events.length?'<p class="desk-empty desk-plan-note">Sin eventos con horario. Elige una tarea para reservarle tiempo.</p>':'') +
      '<div class="desk-plan-tasks-head">Planificación consciente · tareas sin completar</div>' +
      (rows||'<p class="desk-empty">No hay tareas pendientes para esta fecha.</p>')+
      '<div class="desk-panel-footer"><span>Las sesiones están vinculadas a las tareas originales.</span>' +
      '<button type="button" data-desk-open-time>Tiempo →</button></div>';
  };
  const render = () => {
    if (!shell || !app()) return;
    const state = app().getState();
    if (nativeTimeHost && state.date && state.date!==prefs.selectedDate) {
      prefs.selectedDate=state.date;remember();
    }
    const map = {calendar:nativeTimeHost?null:calendarHtml(state),today:todayHtml(state),plan:planHtml(state)};
    for (const key of Object.keys(map)) {
      const container = q(parts[key],'.desk-panel-content');
      if (container && map[key] !== null) container.innerHTML = map[key];
    }
  };
  const scheduleRender = () => {
    if (!shell || frame) return;
    frame = requestAnimationFrame(() => {frame=0;render();});
  };
  const openTime = () => {
    app()?.selectCalendarDate?.(prefs.selectedDate);
    const button = document.querySelector('#desktopLenses [data-nav="calendar"]') ||
      document.querySelector('#mainNav [data-nav="calendar"]');
    button?.click();
  };
  const onClick = event => {
    const button = event.target.closest('button');
    if (!button || !shell) return;
    const focus = button.dataset.deskFocus,mini = button.dataset.deskMinimize,restore = button.dataset.deskRestore;
    if (focus && parts[focus]) {
      previousFocus=prefs.focus;prefs.focus=focus;
      prefs.minimized=prefs.minimized.filter(k=>k!==focus);layout();
      if (focus==='chat') requestAnimationFrame(()=>requestAnimationFrame(()=>app()?.scrollChatToLatest?.()));
      return;
    }
    if (mini && parts[mini]) {
      if (M.PANELS.filter(k=>!prefs.minimized.includes(k)).length<=1) return;
      prefs.minimized=[...prefs.minimized,mini];
      if (mini===prefs.focus) prefs.focus = M.PANELS.find(k=>!prefs.minimized.includes(k)) || 'chat';
      layout();return;
    }
    if (restore && parts[restore]) {prefs.minimized=prefs.minimized.filter(k=>k!==restore);layout();return;}
    if (button.dataset.deskMonth) {
      const next = M.monthShift(prefs.selectedDate,Number(button.dataset.deskMonth));
      if (next) {prefs.selectedDate=next;remember();render();}
      return;
    }
    if (button.dataset.deskDate) {
      prefs.selectedDate=button.dataset.deskDate;
      remember();app()?.selectCalendarDate?.(prefs.selectedDate);render();return;
    }
    if (button.hasAttribute('data-desk-add-task')) {app()?.openNewItem?.(prefs.selectedDate);return;}
    if (button.dataset.deskEstimate) {app()?.setTaskEstimatedMinutes?.(button.dataset.deskEstimate);return;}
    if (button.dataset.deskTask) {app()?.editTaskById?.(button.dataset.deskTask);return;}
    if (button.dataset.deskPlanTask) {app()?.planTaskSession?.(button.dataset.deskPlanTask,prefs.selectedDate);return;}
    if (button.dataset.deskComplete) {app()?.toggleTaskById?.(button.dataset.deskComplete);return;}
    if (button.dataset.deskEvent) {app()?.editEventById?.(button.dataset.deskEvent);return;}
    if (button.hasAttribute('data-desk-open-time')) openTime();
  };
  const onSplitter = splitter => {
    let starting = 0,width = 0;
    splitter.addEventListener('pointerdown',event => {
      if (event.button !== 0) return;
      starting=event.clientX;width=prefs.width;
      splitter.setPointerCapture(event.pointerId);
    });
    splitter.addEventListener('pointermove',event => {
      if (!splitter.hasPointerCapture(event.pointerId)) return;
      prefs.width=Math.max(270,Math.min(460,width+starting-event.clientX));
      shell.style.setProperty('--desk-rail-width',prefs.width+'px');
      splitter.setAttribute('aria-valuenow',String(prefs.width));
    });
    splitter.addEventListener('pointerup',event => {
      if (!splitter.hasPointerCapture(event.pointerId)) return;
      splitter.releasePointerCapture(event.pointerId);
      remember();
    });
    splitter.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      prefs.width=event.key==='Home'?270:event.key==='End'?460:
        Math.max(270,Math.min(460,prefs.width+(event.key==='ArrowLeft'?20:-20)));
      shell.style.setProperty('--desk-rail-width',prefs.width+'px');
      splitter.setAttribute('aria-valuenow',String(prefs.width));
      remember();
    });
  };
  const activate = () => {
    if (shell) return;
    originalScroll=q(screen,':scope > .assistant-scroll');
    originalComposer=q(screen,':scope > .composer-wrap');
    if (!originalScroll || !originalComposer || !app()) return;
    shell = elt('div','desk-shell');
    const layoutBox = elt('div','desk-layout');
    stage = elt('div','desk-stage');
    rail = elt('div','desk-rail');
    parking = elt('div','desk-parking');
    const splitter=elt('div','desk-splitter');
    splitter.setAttribute('role','separator');
    splitter.setAttribute('aria-label','Cambiar ancho del panel lateral');
    splitter.setAttribute('aria-orientation','vertical');
    splitter.setAttribute('aria-valuemin','270');
    splitter.setAttribute('aria-valuemax','460');
    splitter.setAttribute('tabindex','0');
    dock=elt('div','desk-dock');
    dock.setAttribute('aria-label','Paneles minimizados');
    layoutBox.append(stage,splitter,rail);
    shell.append(layoutBox,dock,parking);
    parts=Object.fromEntries(M.PANELS.map(k=>[k,panel(k)]));
    parts.chat.append(originalScroll,originalComposer);
    screen.append(shell);
    navButton = elt('button','desk-nav-collapse','‹');
    navButton.type='button';
    navButton.setAttribute('aria-label','Mostrar u ocultar vistas');
    navButton.addEventListener('click',()=>{prefs.navCollapsed=!prefs.navCollapsed;layout();});
    sidebar.prepend(navButton);
    shell.addEventListener('click',onClick);
    shell.addEventListener('dragstart',event=>{
      const row=event.target.closest?.('[data-desk-drag-task]');
      if (!row) return;
      if(row.closest('[data-desk-task-list]')) {
        todayDragId=row.dataset.deskRowId;todayDragDate=prefs.selectedDate;
        row.classList.add('desk-is-dragging');
      }
      try {event.dataTransfer.setData('application/x-minds-task',row.dataset.deskDragTask);}
      catch {}
    });
    shell.addEventListener('dragover',event=>{
      const target=event.target.closest?.('[data-desk-task-list] .desk-task-row');
      if(todayDragId&&target&&todayDragDate===prefs.selectedDate){
        event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';
        const source=q(shell,'[data-desk-row-id="'+todayDragId+'"]');
        moveTodayRow(source,target,event.clientY);
      }
      if (nativeTimeHost && event.target.closest?.('.hours')) event.preventDefault();
    });
    shell.addEventListener('drop',event=>{
      const target=event.target.closest?.('[data-desk-task-list]');
      if(target&&todayDragId){
        event.preventDefault();event.stopPropagation();
        const list=q(parts.today,'[data-desk-task-list]');
        commitTodayOrder(list);
        return;
      }
      if (!nativeTimeHost || !event.target.closest?.('.hours')) return;
      const id=event.dataTransfer?.getData('application/x-minds-task');
      if (!id) return;
      event.preventDefault();
      const bounds=event.target.closest('.hours').getBoundingClientRect();
      const y=Math.max(0,Math.min(945,event.clientY-bounds.top));
      const mins=Math.round((420+y)/15)*15;
      const time=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
      app()?.planTaskSession?.(id,prefs.selectedDate,time);
    });
    shell.addEventListener('dragend',()=> {
      q(shell,'.desk-is-dragging')?.classList.remove('desk-is-dragging');
      todayDragId=null;todayDragDate=null;
    });
    // iPad/touch: hold the familiar ⋮⋮ handle, move within the same canonical list,
    // persist the order through the same task mutation operation as Tiempo.
    shell.addEventListener('touchstart',event=>{
      const handle=event.target.closest?.('[data-desk-sort-handle]');
      if(!handle || event.touches.length!==1)return;
      const row=handle.closest('[data-desk-row-id]');
      if(!row || row.classList.contains('is-done'))return;
      touchSort={row,sourceY:event.touches[0].clientY,active:false,timer:null};
      touchSort.timer=setTimeout(()=>{
        if(touchSort?.row===row){
          touchSort.active=true;row.classList.add('desk-is-dragging');
        }
      },250);
    },{passive:true});
    shell.addEventListener('touchmove',event=>{
      if(!touchSort || event.touches.length!==1)return;
      const t=event.touches[0];
      if(!touchSort.active) {
        if(Math.abs(t.clientY-touchSort.sourceY)>9){
          clearTimeout(touchSort.timer);touchSort=null;
        }
        return;
      }
      event.preventDefault();event.stopPropagation();
      const target=document.elementFromPoint(t.clientX,t.clientY)
        ?.closest?.('[data-desk-task-list] .desk-task-row');
      if(target)moveTodayRow(touchSort.row,target,t.clientY);
    },{passive:false});
    const finishTouchSort=()=>{
      if(!touchSort)return;
      clearTimeout(touchSort.timer);
      const row=touchSort.row,active=touchSort.active;
      touchSort=null;row.classList.remove('desk-is-dragging');
      if(active)commitTodayOrder(q(parts.today,'[data-desk-task-list]'));
    };
    shell.addEventListener('touchend',finishTouchSort,{passive:true});
    shell.addEventListener('touchcancel',finishTouchSort,{passive:true});
    onSplitter(splitter);
    document.body.classList.add('desk-enabled');
    layout();
    render();
    // The scroller was laid out while detached during application bootstrap.
    // After docking it, restore the same bottom anchor as the original Chat.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if (shell && prefs.focus==='chat') app()?.scrollChatToLatest?.();
    }));
  };
  const deactivate = () => {
    if (!shell) return;
    if (frame) {cancelAnimationFrame(frame);frame=0;}
    releaseTime();
    screen.append(originalScroll,originalComposer);
    shell.remove();shell=null;
    navButton?.remove();navButton=null;
    document.body.classList.remove('desk-enabled','minds-nav-collapsed');
    parts={};
  };
  const reconcile = () => mq.matches ? activate() : deactivate();
  window.addEventListener('isabella:before-screen-change',event=>{
    if (event.detail?.next!=='assistant') releaseTime();
    if (event.detail?.next==='assistant') requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if (shell) {layout();app()?.scrollChatToLatest?.();}
    }));
  });
  window.addEventListener('isabella:state',scheduleRender);
  window.addEventListener('isabella:synced',scheduleRender);
  mq.addEventListener('change',reconcile);
  reconcile();
})();
