// Local times for anything a model reads (07.11.2026): the morning brief received UTC timestamps
// and showed hours one off (05.10, 27.10, 03.11, after the clock change of 25.10). Models get the
// local date and time already computed, never storage timestamps.
const parts=(date,tz,options)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,...options}).formatToParts(date).map(p=>[p.type,p.value]));
export function localDate(iso,tz='Europe/Berlin'){
  const p=parts(new Date(iso),tz,{year:'numeric',month:'2-digit',day:'2-digit'});
  return p.year+'-'+p.month+'-'+p.day;
}
export function localTime(iso,tz='Europe/Berlin'){
  const p=parts(new Date(iso),tz,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return p.hour+':'+p.minute;
}
/** An event as a model should see it: local day and hours, no storage timestamps. */
export function localEventView(e,tz='Europe/Berlin'){
  const out={title:String(e?.title||''),local_date:e?.starts_at?localDate(e.starts_at,tz):null,all_day:!!e?.all_day};
  if(!out.all_day&&e?.starts_at){
    out.local_start_time=localTime(e.starts_at,tz);
    if(e?.ends_at)out.local_end_time=localTime(e.ends_at,tz);
  }
  if(e?.ends_at&&localDate(e.ends_at,tz)!==out.local_date&&!out.all_day)out.local_end_date=localDate(e.ends_at,tz);
  if(e?.notes)out.notes=String(e.notes).slice(0,600);
  out.timezone=tz;
  return out;
}
