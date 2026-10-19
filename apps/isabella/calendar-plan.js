/* Build 98 · Pure continuous task-range projection, never a second task or calendar. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MINDS_CALENDAR_PLAN=api;
})(typeof window==='undefined'?null:window,function(){
'use strict';
const valid=key=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return false;
  const d=new Date(key+'T12:00:00');
  return Number.isFinite(d.getTime())&&d.getFullYear()===Number(key.slice(0,4))
    &&d.getMonth()+1===Number(key.slice(5,7))&&d.getDate()===Number(key.slice(8,10));
};
const dateKey=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const addDays=(key,number)=>{if(!valid(key))return null;const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+number);return dateKey(d)};
const monday=key=>{if(!valid(key))return null;const d=new Date(key+'T12:00:00');return addDays(key,-((d.getDay()+6)%7))};
const personIds=task=>Array.isArray(task.assigneePersonIds)&&task.assigneePersonIds.length?
  task.assigneePersonIds:(task.assigneePersonId?[task.assigneePersonId]:[]);
const personKey=task=>personIds(task).length?'person:'+personIds(task)[0]:
  task.assignee?'legacy:'+task.assignee:'unassigned';
const interval=task=>{
  const start=valid(task.startDate)?task.startDate:null;
  const due=valid(task.date)?task.date:null;
  if(!start&&!due)return null;
  if(start&&due&&start>due)return {start:due,end:due,invalid:true};
  return {start:start||due,end:due||start,invalid:false};
};
const qualifies=(task,filters={})=>{
  if(task.archivedAt)return false;
  if(filters.projectId&&task.projectId!==filters.projectId)return false;
  if(filters.personKey){
    const ids=personIds(task);
    if(filters.personKey.startsWith('person:')){
      if(!ids.includes(filters.personKey.slice(7)))return false;
    }else if(personKey(task)!==filters.personKey)return false;
  }
  return true;
};
function plan(state,reference,weeks=1,filters={},maxRows=4){
  const start=monday(reference);
  if(!start||!Number.isInteger(weeks)||weeks<1||weeks>6)return {start:null,weeks:[],undated:[]};
  const days=Array.from({length:weeks*7},(_,i)=>addDays(start,i));
  const last=days[days.length-1];
  const unique=new Map();
  for(const task of state.tasks||[])if(task&&task.id&&!unique.has(task.id)&&qualifies(task,filters))unique.set(task.id,task);
  const tasks=[...unique.values()];
  const undated=tasks.filter(task=>!interval(task));
  const range=tasks.map(task=>({task,span:interval(task)}))
    .filter(entry=>entry.span&&entry.span.start<=last&&entry.span.end>=start)
    .sort((a,b)=>a.span.start.localeCompare(b.span.start)
      ||a.span.end.localeCompare(b.span.end)
      ||String(a.task.id).localeCompare(String(b.task.id)));
  const result=[];
  for(let w=0;w<weeks;w++){
    const from=days[w*7],to=days[w*7+6],segments=[],occupied=[];
    for(const entry of range){
      if(entry.span.start>to||entry.span.end<from)continue;
      const actualStart=entry.span.start<from?from:entry.span.start;
      const actualEnd=entry.span.end>to?to:entry.span.end;
      const left=days.slice(w*7,w*7+7).indexOf(actualStart);
      const right=days.slice(w*7,w*7+7).indexOf(actualEnd);
      if(left<0||right<left)continue;
      let lane=occupied.findIndex(end=>end<actualStart);
      if(lane<0){lane=occupied.length;occupied.push(actualEnd)}
      else occupied[lane]=actualEnd;
      segments.push({task:entry.task,lane,col:left+1,length:right-left+1,
        continuesBefore:entry.span.start<from,continuesAfter:entry.span.end>to,
        originalStart:entry.span.start,originalEnd:entry.span.end,invalid:entry.span.invalid});
    }
    result.push({start:from,end:to,days:days.slice(w*7,w*7+7),
      segments:segments.filter(s=>s.lane<maxRows),hidden:segments.filter(s=>s.lane>=maxRows).length,
      total:segments.length});
  }
  return {start,end:last,weeks:result,undated};
}
return {valid,addDays,monday,personKey,interval,qualifies,plan};
});