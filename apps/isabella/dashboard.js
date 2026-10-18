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
    try { return M.sanitizePreferences(JSON.parse(localStorage.getItem(KEY) || 'null')); }
    catch { return M.defaultPreferences(); }
  };
  let prefs = load(),shell = null, stage = null, rail = null, parking = null, dock = null;
  let parts = {}, originalScroll = null, originalComposer = null, navButton = null;
  let previousFocus = 'chat', dragged = null, frame = 0;
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
    let visible = M.PANELS.filter(k => !prefs.minimized.includes(k));
    if (!visible.length) {prefs.minimized=[];visible=[...M.PANELS];}
    if (!visible.includes(prefs.focus)) prefs.focus = visible.includes('chat') ? 'chat' : visible[0];
    const other = ['chat',...prefs.order].filter((key,i,arr) => key !== prefs.focus && visible.includes(key) && arr.indexOf(key) === i);
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
    document.body.classList.toggle('minds-nav-collapsed',prefs.navCollapsed);
    navButton.setAttribute('aria-expanded',String(!prefs.navCollapsed));
    navButton.title = prefs.navCollapsed ? 'Mostrar vistas' : 'Minimizar vistas';
    navButton.textContent = prefs.navCollapsed ? '›' : '‹';
    remember();
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
    const dateName = prefs.selectedDate === M.dayKey(new Date()) ? 'Hoy · ' + niceDate(prefs.selectedDate) : niceDate(prefs.selectedDate);
    const rows = items.slice(0,12).map(item => {
      const project = M.projectFor(state,item.projectId);
      const category = M.categoryFor(state,item.categoryId);
      return '<div class="desk-task-row' + (item.done?' is-done':'') + '">' +
        '<button class="desk-task-check" type="button" data-desk-complete="' + E(item.id) +
        '" aria-label="' + E(item.done?'Reabrir':'Completar') + ' ' + E(item.title) +
        '">' + (item.done?'✓':'') + '</button>' +
        '<button class="desk-task-detail" type="button" data-desk-task="' + E(item.id) + '">' +
        '<strong>' + E(item.title) + '</strong><small>' +
        E(project?.name || category?.name || '') + '</small></button></div>';
    }).join('');
    return '<div class="desk-subtitle">' + E(dateName) + '</div>' +
      (rows || '<p class="desk-empty">No hay tareas para esta fecha.</p>') +
      (items.length > 12 ? '<p class="desk-small">'+(items.length-12)+' tareas más en Tiempo</p>' : '') +
      '<div class="desk-panel-footer">' +
      '<span>' + items.filter(x=>!x.done).length + ' pendientes · ' + meetings.length + ' eventos</span>' +
      '<button type="button" data-desk-open-time>Ver en Tiempo →</button></div>';
  };
  const planHtml = state => {
    const date = prefs.selectedDate;
    const events = M.timedEvents(state,date,7,21);
    const hours = [7,9,11,13,15,17,19,21];
    const bars = events.map(item => {
      const start = E(item.start),end = M.minutes(item.start) + Number(item.duration);
      const until = String(Math.floor(end/60)%24).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
      return '<button type="button" class="desk-time-event" data-desk-event="' + E(item.id) +
        '" style="left:' + item.left.toFixed(3) + '%;width:' + Math.max(1.7,item.width).toFixed(3) + '%;--desk-accent:' +
        safeColor(M.colorFor(state,item)) + '" title="' + E(item.title) + '">' +
        '<strong>' + E(item.title) + '</strong><small>' + start + '–' + until + '</small></button>';
    }).join('');
    const lines = hours.map(h => '<span>' + String(h).padStart(2,'0') + ':00</span>').join('');
    return '<div class="desk-plan-date">' + E(niceDate(date)) + '</div>' +
      '<div class="desk-plan-hours">' + lines + '</div>' +
      '<div class="desk-time-track">' + bars + '</div>' +
      (!events.length?'<p class="desk-empty desk-plan-note">Sin eventos con hora. Las tareas sin horario permanecen en «Hoy».</p>':'') +
      '<div class="desk-panel-footer"><span>Solo bloques horarios confirmados</span>' +
      '<button type="button" data-desk-open-time>Abrir calendario →</button></div>';
  };
  const render = () => {
    if (!shell || !app()) return;
    const state = app().getState();
    const map = {calendar:calendarHtml(state),today:todayHtml(state),plan:planHtml(state)};
    for (const key of Object.keys(map)) {
      const container = q(parts[key],'.desk-panel-content');
      if (container) container.innerHTML = map[key];
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
    if (focus && parts[focus]) {previousFocus=prefs.focus;prefs.focus=focus;prefs.minimized=prefs.minimized.filter(k=>k!==focus);layout();return;}
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
    if (button.dataset.deskTask) {app()?.editTaskById?.(button.dataset.deskTask);return;}
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
    onSplitter(splitter);
    document.body.classList.add('desk-enabled');
    layout();
    render();
  };
  const deactivate = () => {
    if (!shell) return;
    if (frame) {cancelAnimationFrame(frame);frame=0;}
    screen.append(originalScroll,originalComposer);
    shell.remove();shell=null;
    navButton?.remove();navButton=null;
    document.body.classList.remove('desk-enabled','minds-nav-collapsed');
    parts={};
  };
  const reconcile = () => mq.matches ? activate() : deactivate();
  window.addEventListener('isabella:state',scheduleRender);
  window.addEventListener('isabella:synced',scheduleRender);
  mq.addEventListener('change',reconcile);
  reconcile();
})();
