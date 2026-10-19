/* Build 95 · Pure presentation model for the existing Isabella entities.
 * No writes, projections or fabricated task durations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MINDS_DESK_MODEL = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const PANELS = ['chat', 'calendar', 'today', 'plan'];
  const dayKey = date => {
    const d = date instanceof Date ? date : new Date(String(date) + 'T12:00:00');
    if (Number.isNaN(d.valueOf())) return '';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const dateFromKey = key => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
    const d = new Date(String(key) + 'T12:00:00');
    return dayKey(d) === key ? d : null;
  };
  const addDays = (key, amount) => {
    const d = dateFromKey(key);
    if (!d) return '';
    d.setDate(d.getDate() + amount);
    return dayKey(d);
  };
  const monthShift = (key, amount) => {
    const d = dateFromKey(key);
    if (!d) return '';
    return dayKey(new Date(d.getFullYear(), d.getMonth() + amount, 1, 12));
  };
  const monthCells = key => {
    const d = dateFromKey(key);
    if (!d) return [];
    const month = d.getMonth(), year = d.getFullYear();
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - offset);
    return Array.from({length: 42}, (_, i) => {
      const cell = new Date(first);
      cell.setDate(first.getDate() + i);
      return {key: dayKey(cell), day: cell.getDate(), inMonth: cell.getMonth() === month};
    });
  };
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const tasksForDay = (state, key) => (state.tasks || [])
    .filter(t => t.date === key && !t.archivedAt)
    .sort((a,b) => Number(!!a.done) - Number(!!b.done)
      || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      || String(a.title || '').localeCompare(String(b.title || ''),'es'));
  const eventsForDay = (state, key) => (state.events || [])
    .filter(e => e.date === key)
    .sort((a,b) => String(a.start || '').localeCompare(String(b.start || '')));
  const minutes = clock => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(clock || ''));
    if (!m) return null;
    const h = Number(m[1]), n = Number(m[2]);
    return h < 24 && n < 60 ? h * 60 + n : null;
  };
  const timedEvents = (state, key, from = 7, to = 21) => {
    const start = from * 60, end = to * 60;
    return eventsForDay(state, key).filter(e => !e.allDay).flatMap(e => {
      const at = minutes(e.start);
      const length = Number(e.duration);
      if (at === null || !Number.isFinite(length) || length <= 0 || at >= end || at + length <= start) return [];
      return [{...e, left: Math.max(0, at - start) / (end-start) * 100,
        width: (Math.min(end, at+length) - Math.max(start, at)) / (end-start) * 100}];
    });
  };
  // A reservation is an event, not another task. Never match by title.
  const taskForSession = (state,event) => {
    const key = event?.metadata?.kind === 'task_work_session_v1' ? event.metadata.task_client_key : null;
    return typeof key === 'string' && key
      ? (state.tasks || []).find(task => task.id === key) || null : null;
  };
  const estimatedMinutes = item => {
    const n = Number(item?.metadata?.planning?.estimated_minutes);
    return Number.isInteger(n) && n>0 && n<=43200 ? n : 0;
  };
  const projectFor = (state,id) => (state.projects || []).find(p => p.id === id);
  const categoryFor = (state,id) => (state.categories || []).find(c => c.id === id);
  const colorFor = (state,item) =>
    projectFor(state,item.projectId)?.color || categoryFor(state,item.categoryId)?.color || '#7d8692';
  const defaultPreferences = () => ({focus:'chat',order:['calendar','today','plan'],
    minimized:[],width:332,navCollapsed:true,selectedDate:dayKey(new Date())});
  const sanitizePreferences = saved => {
    const input = saved && typeof saved === 'object' ? saved : {};
    const filtered = values => Array.isArray(values)
      ? [...new Set(values.filter(v => PANELS.includes(v)))] : [];
    const min = filtered(input.minimized), focus = PANELS.includes(input.focus) ? input.focus : 'chat';
    const minimized = min.filter(v => v !== focus);
    const width = Number(input.width);
    const order = filtered(input.order).filter(v => v !== 'chat');
    return {focus,order:[...order,...PANELS.filter(v => v !== 'chat' && !order.includes(v))],
      minimized,width:Number.isFinite(width) ? Math.max(270,Math.min(460,width)) : 332,
      navCollapsed: input.navCollapsed === true,
      selectedDate:dateFromKey(input.selectedDate) ? input.selectedDate : dayKey(new Date())};
  };
  return {PANELS,dayKey,dateFromKey,addDays,monthShift,monthCells,escapeHtml,tasksForDay,
    eventsForDay,timedEvents,taskForSession,estimatedMinutes,projectFor,categoryFor,colorFor,minutes,
    defaultPreferences,sanitizePreferences};
});
