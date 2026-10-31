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
  // A task with a start date runs until its due date: it belongs to every day of
  // that window, not only to the due day. Done tasks stay on their own date.
  const validKey = key => /^\d{4}-\d{2}-\d{2}$/.test(String(key || ''));
  const spansDay = (task, key) => !!task && !task.done && !task.archivedAt
    && validKey(task.startDate) && validKey(task.date)
    && task.startDate < task.date && task.startDate <= key && key < task.date;
  const tasksForDay = (state, key) => (state.tasks || [])
    .filter(t => !t.archivedAt && (t.date === key || spansDay(t, key)))
    .sort((a,b) => Number(!!a.done) - Number(!!b.done)
      || Number(a.date !== key) - Number(b.date !== key)
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
  // One canonical task per calendar day; reservations stay individually editable events.
  // A task may have sessions on days other than its due date, without cloning it.
  const monthAgendaGroups = (state,key) => {
    const tasks = tasksForDay(state,key).map(task => ({task,sessions:[]}));
    const byId = new Map(tasks.map(group => [group.task.id,group]));
    const events = [];
    for (const event of eventsForDay(state,key)) {
      const task = taskForSession(state,event);
      if (!task || task.archivedAt) { events.push(event); continue; }
      let group = byId.get(task.id);
      if (!group) {
        group = {task,sessions:[]};
        byId.set(task.id,group);
        tasks.push(group);
      }
      group.sessions.push(event);
    }
    return {tasks,events};
  };
  // Weekly planning is a read-only projection of one canonical task and its events.
  // A start/due interval describes a delivery window, never hours worked.
  const weekStart = key => {
    const date = dateFromKey(key);
    return date ? addDays(key,-((date.getDay()+6)%7)) : '';
  };
  const weeklyPlan = (state,selectedDate,projectId='') => {
    const start = weekStart(selectedDate);
    if (!start) return {start:'',end:'',days:[],rows:[],unscheduled:[],overdue:[],events:[]};
    const days = Array.from({length:7},(_,i)=>addDays(start,i));
    const end = days[6], sessionsByTask = new Map(), events = [];
    const eligible = (state.tasks||[]).filter(t=>!t.archivedAt&&!t.done &&
      (!projectId||t.projectId===projectId));
    const eligibleIds = new Set(eligible.map(t=>t.id));
    for (const e of state.events||[]) {
      if (!days.includes(e.date)) continue;
      const isSession=e.metadata?.kind==='task_work_session_v1';
      const linked=isSession?taskForSession(state,e):null;
      if (linked && eligibleIds.has(linked.id)) {
        if (!sessionsByTask.has(linked.id)) sessionsByTask.set(linked.id,[]);
        sessionsByTask.get(linked.id).push(e);
      } else if ((!linked||!isSession||!eligibleIds.has(linked.id))&&(!projectId||e.projectId===projectId)) {
        // An orphan remains visible as an event, not an invented task.
        events.push(e);
      }
    }
    const rows=[],unscheduled=[],overdue=[];
    for (const task of eligible) {
      const began=dateFromKey(task.startDate)?task.startDate:'';
      const due=dateFromKey(task.date)?task.date:'';
      const invalid=!!(began&&due&&due<began);
      const first=invalid?due:(began||due),last=invalid?due:(due||began);
      const sessions=sessionsByTask.get(task.id)||[];
      const cells=days.map(key=>({key,
        inWindow:!!(first&&last&&first<=key&&key<=last),
        begins:!!(began&&began===key),due:!!(due&&due===key),
        sessions:sessions.filter(e=>e.date===key).sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')))
      }));
      const entry={task,began,due,invalid,cells,
        overdue:!!(due&&due<start),
        noDates:!began&&!due};
      if (cells.some(c=>c.inWindow||c.sessions.length)) rows.push(entry);
      else if (entry.overdue) overdue.push(entry);
      else if (!due||invalid) unscheduled.push(entry);
    }
    const order=(a,b)=>String(a.due||'9999-12-31').localeCompare(String(b.due||'9999-12-31'))
      ||String(a.task.title||'').localeCompare(String(b.task.title||''),'es');
    rows.sort(order);unscheduled.sort(order);overdue.sort(order);
    events.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))
      ||String(a.start||'').localeCompare(String(b.start||'')));
    return {start,end,days,rows,unscheduled,overdue,events};
  };
  const estimatedMinutes = item => {
    const n = Number(item?.metadata?.planning?.estimated_minutes);
    return Number.isInteger(n) && n>0 && n<=43200 ? n : 0;
  };
  // Loads are obligations, NOT free capacity. Estimates are for whole tasks, not
  // hours automatically distributed over the visible seven-day interval.
  const weeklyWorkload = (state,week,people=[],projectId='') => {
    const entries=[...(week.rows||[]),...(week.overdue||[]),...(week.unscheduled||[])];
    const unique=new Map(entries.map(entry=>[entry.task.id,entry.task]));
    const groups=new Map();
    const personNames=new Map((people||[]).filter(p=>p?.id).map(p=>[p.id,p.name]));
    const ensure=(key,name)=>{
      if(!groups.has(key))groups.set(key,{key,name,tasks:0,dueThisWeek:0,
        overdue:0,estimatedMinutes:0,withoutEstimate:0});
      return groups.get(key);
    };
    for (const p of people||[])if(p?.id)ensure('person:'+p.id,p.name);
    for (const t of unique.values()) {
      const key=t.assigneePersonId?'person:'+t.assigneePersonId:
        t.assignee?'legacy:'+t.assignee:'unassigned';
      const name=t.assigneePersonId?personNames.get(t.assigneePersonId)||t.assignee||'Responsable sin nombre':
        t.assignee||'Sin responsable';
      const group=ensure(key,name);
      group.tasks++;
      if(t.date>=week.start&&t.date<=week.end)group.dueThisWeek++;
      if(t.date&&t.date<week.start)group.overdue++;
      const estimate=estimatedMinutes(t);
      if(estimate)group.estimatedMinutes+=estimate;
      else group.withoutEstimate++;
    }
    let reservedOwnMinutes=0,bookings=0;
    for (const e of state.events||[]) {
      if(e.metadata?.kind!=='task_work_session_v1'||!(week.days||[]).includes(e.date))continue;
      const source=taskForSession(state,e);
      if(projectId&&(source?source.projectId:e.projectId)!==projectId)continue;
      const duration=Number(e.duration);
      if(!Number.isFinite(duration)||duration<=0)continue;
      reservedOwnMinutes+=duration;bookings++;
    }
    return {tasks:unique.size,groups:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'es')),
      reservedOwnMinutes,bookings,availabilityKnown:false,actualTimeKnown:false};
  };
  const projectFor = (state,id) => (state.projects || []).find(p => p.id === id);
  const categoryFor = (state,id) => (state.categories || []).find(c => c.id === id);
  const colorFor = (state,item) =>
    projectFor(state,item.projectId)?.color || categoryFor(state,item.categoryId)?.color || '#7d8692';
  const defaultPreferences = () => ({focus:'chat',order:['calendar','today','plan'],
    minimized:[],width:332,navCollapsed:true,selectedDate:dayKey(new Date()),
    planMode:'day',planProject:'',planPerson:'',planGrouping:'date'});
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
      selectedDate:dateFromKey(input.selectedDate) ? input.selectedDate : dayKey(new Date()),
      planMode:input.planMode==='week'?'week':'day',
      planProject:typeof input.planProject==='string'?input.planProject:'',
      planPerson:typeof input.planPerson==='string'?input.planPerson:'',
      planGrouping:input.planGrouping==='person'?'person':'date'};
  };
  return {PANELS,dayKey,dateFromKey,addDays,monthShift,monthCells,escapeHtml,tasksForDay,spansDay,
    eventsForDay,timedEvents,taskForSession,monthAgendaGroups,weekStart,weeklyPlan,estimatedMinutes,weeklyWorkload,projectFor,categoryFor,colorFor,minutes,
    defaultPreferences,sanitizePreferences};
});
