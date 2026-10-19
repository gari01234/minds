/* Build 99A · Pure, conservative task-session suggestions.
 * A task estimate is not booked time. A proposal never writes or assumes coworker availability. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MINDS_TIME_PLAN_MODEL=api;
})(typeof window==='undefined'?null:window,function(){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const validDate=key=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return false;
  const d=new Date(key+'T12:00:00');
  return !Number.isNaN(d.getTime())&&dateKey(d)===key;
};
const addDays=(key,n)=>{if(!validDate(key))return null;const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d)};
const minuteOf=value=>{
  const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value||''));
  return m?Number(m[1])*60+Number(m[2]):null;
};
const clock=n=>pad(Math.floor(n/60))+':'+pad(n%60);
const localTime=(key,minute)=>new Date(key+'T'+clock(minute)+':00').getTime();
const expectedMinutes=task=>{
  const n=Number(task?.metadata?.planning?.estimated_minutes);
  return Number.isInteger(n)&&n>0&&n<=43200?n:0;
};
const overlap=(a,b,c,d)=>a<d&&c<b;
const rangeMs=(e)=>{
  const a=Date.parse(e?.starts_at||''),b=Date.parse(e?.ends_at||'');
  return Number.isFinite(a)&&Number.isFinite(b)&&b>a?{start:a,end:b}:null;
};
const defaults=()=>({from:'09:00',until:'18:00',block:90,dailyCap:180,skipWeekends:true});
/* Support only the existing unambiguous annual all-day recurrence shape.
 * Never treat an unknown recurrence as a one-off event or silently ignore it. */
function expandRecurrence(events,from,to){
  if(!validDate(from)||!validDate(to)||from>to)return {events:[],unsupported:true};
  const out=[];
  for(const event of events||[]){
    const recurrence=event?.recurrence;
    if(!recurrence||typeof recurrence!=='object'||!Object.keys(recurrence).length){
      out.push(event);continue;
    }
    if(recurrence.text!=='annual'||Object.keys(recurrence).length!==1||!event.all_day)
      return {events:[],unsupported:true};
    const range=rangeMs(event);
    if(!range)return {events:[],unsupported:true};
    const first=new Date(range.start),last=new Date(range.end);
    if(first.getHours()!==0||first.getMinutes()!==0||
      last.getHours()!==0||last.getMinutes()!==0)return {events:[],unsupported:true};
    const firstKey=dateKey(first),lastKey=dateKey(last);
    const days=Math.round((new Date(lastKey+'T12:00:00')-new Date(firstKey+'T12:00:00'))/86400000);
    if(days<1||days>14)return {events:[],unsupported:true};
    for(let year=Number(from.slice(0,4))-1;year<=Number(to.slice(0,4))+1;year++){
      if(year<first.getFullYear())continue;
      const occurrence=new Date(year,first.getMonth(),first.getDate(),0,0,0);
      if(occurrence.getFullYear()!==year||occurrence.getMonth()!==first.getMonth()||
        occurrence.getDate()!==first.getDate())continue;
      const end=new Date(occurrence);
      end.setDate(occurrence.getDate()+days);
      if(dateKey(end)<=from||dateKey(occurrence)>to)continue;
      out.push({...event,starts_at:occurrence.toISOString(),ends_at:end.toISOString(),
        recurrence:{},metadata:{...(event.metadata||{}),expanded_annual:true}});
    }
  }
  return {events:out,unsupported:false};
}

function suggest({task,events=[],settings={},today=dateKey(new Date()),now=new Date()}={}){
  const cfg={...defaults(),...settings};
  const startHour=minuteOf(cfg.from),endHour=minuteOf(cfg.until);
  if(startHour===null||endHour===null||endHour<=startHour||endHour-startHour<30)
    return {reason:'invalid_hours',slots:[],unplannedMinutes:0};
  const block=Number(cfg.block),dailyCap=Number(cfg.dailyCap);
  if(!Number.isInteger(block)||block<15||block>180||block%15||
    !Number.isInteger(dailyCap)||dailyCap<15||dailyCap>720||dailyCap%15)
    return {reason:'invalid_limits',slots:[],unplannedMinutes:0};
  if(!task||!validDate(task.due_date))
    return {reason:'missing_deadline',slots:[],unplannedMinutes:0};
  const estimated=expectedMinutes(task);
  if(!estimated)return {reason:'missing_estimate',slots:[],unplannedMinutes:0};
  if(!validDate(today))return {reason:'invalid_today',slots:[],unplannedMinutes:0};
  const begins=validDate(task.start_date)?task.start_date:today;
  if(begins>task.due_date)return {reason:'inconsistent_dates',slots:[],unplannedMinutes:estimated};
  const start=begins>today?begins:today,finish=task.due_date;
  if(finish<today)return {reason:'overdue',slots:[],unplannedMinutes:estimated};
  const span=Math.round((new Date(finish+'T12:00:00')-new Date(start+'T12:00:00'))/86400000);
  if(span>89)return {reason:'horizon_too_long',slots:[],unplannedMinutes:estimated};
  const taskKey=task.client_key;
  const all=events.map(e=>({event:e,range:rangeMs(e)})).filter(x=>x.range);
  const already=all.reduce((sum,x)=>{
    if(x.event.metadata?.kind!=='task_work_session_v1'||x.event.metadata?.task_client_key!==taskKey)return sum;
    return sum+Math.round((x.range.end-x.range.start)/60000);
  },0);
  let remaining=Math.max(0,estimated-already);
  if(!remaining)return {reason:'already_reserved',slots:[],estimatedMinutes:estimated,alreadyReservedMinutes:already,unplannedMinutes:0};
  const slots=[],refNow=Number(new Date(now).getTime());
  for(let index=0;index<=span&&remaining>0&&slots.length<36;index++){
    const day=addDays(start,index),weekday=new Date(day+'T12:00:00').getDay();
    if(cfg.skipWeekends&&(weekday===0||weekday===6))continue;
    let dayBooked=0;
    for(let minute=startHour;minute+15<=endHour&&dayBooked<dailyCap&&remaining>0&&slots.length<36;){
      const starts=localTime(day,minute);
      if(!Number.isFinite(starts)||starts<refNow){minute+=15;continue}
      const max=Math.min(block,dailyCap-dayBooked,remaining,endHour-minute);
      let duration=Math.floor(max/15)*15,found=false;
      while(duration>=15){
        const ends=localTime(day,minute+duration);
        if(ends-starts===duration*60000&&
          !all.some(x=>overlap(starts,ends,x.range.start,x.range.end))&&
          !slots.some(x=>overlap(starts,ends,x.startsMs,x.endsMs))){found=true;break}
        duration-=15;
      }
      if(found){
        const ends=localTime(day,minute+duration);
        slots.push({date:day,start:clock(minute),duration,startsMs:starts,endsMs:ends});
        remaining-=duration;dayBooked+=duration;minute+=duration;
      }else minute+=15;
    }
  }
  return {reason:remaining?'partial':'ready',slots,estimatedMinutes:estimated,
    alreadyReservedMinutes:already,plannedMinutes:slots.reduce((s,x)=>s+x.duration,0),
    unplannedMinutes:remaining,settings:cfg};
}
const sameSlots=(left,right)=>
  Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&
  left.every((x,i)=>x.date===right[i].date&&x.start===right[i].start&&x.duration===right[i].duration);
return {defaults,dateKey,validDate,addDays,minuteOf,clock,expectedMinutes,rangeMs,expandRecurrence,suggest,sameSlots};
});