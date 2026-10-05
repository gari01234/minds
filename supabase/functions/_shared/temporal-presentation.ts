export type ZonedDateTimePresentation={
  iso:string;
  date:string;
  time:string;
  timezone:string;
};

function partsMap(parts:Intl.DateTimeFormatPart[]){
  const out:Record<string,string>={};
  for(const part of parts)if(part.type!=="literal")out[part.type]=part.value;
  return out;
}

export function presentZonedDateTime(iso:string,timeZone:string):ZonedDateTimePresentation{
  const value=String(iso||"").trim();
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime()))return {iso:value,date:"",time:"",timezone:timeZone};
  const dateParts=partsMap(new Intl.DateTimeFormat("en-CA",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(date));
  const timeParts=partsMap(new Intl.DateTimeFormat("en-GB",{
    timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date));
  return {
    iso:value,
    date:`${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time:`${timeParts.hour}:${timeParts.minute}`,
    timezone:timeZone
  };
}

export function presentZonedRange(startsAt:string,endsAt:string|null|undefined,timeZone:string,allDay=false){
  const start=presentZonedDateTime(startsAt,timeZone);
  const end=endsAt?presentZonedDateTime(endsAt,timeZone):null;
  return {
    local_date:start.date,
    local_start_time:allDay?null:start.time,
    local_end_time:allDay?null:(end?.time||null),
    timezone:timeZone,
    display_time:allDay?"Todo el día":(end?.time?`${start.time}–${end.time}`:start.time),
    crosses_local_date:!!end?.date&&end.date!==start.date
  };
}
