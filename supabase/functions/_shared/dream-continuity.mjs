import {localDay,addDays,TZ} from './window-tools.mjs';
import {localTime} from './local-agenda.mjs';
import {continuityKeys} from './continuity-view.mjs';

const dayMs=86400000;
// Isolate complete, first-person statements about ordinary energy, mood and sleep.
// Do not send their wording into the prompt that writes durable pages or claims.
const selfReports=[
  /^(?:me siento|estoy|ando) (?:muy |algo |un poco |bastante |más |menos |realmente )?(?:bien|mal|feliz|content[oa]|triste|nervios[oa]|tranquil[oa]|cansad[oa]|agotad[oa]|animad[oa]|preocupad[oa]|ilusionad[oa]|de buen humor|sin energía)$/,
  /^(?:tengo (?:mucho |poco )?sueño|me desvelé|no pegué (?:el |un )?ojo|pasé la noche en vela)$/,
  /^(?:(?:no |apenas )?(?:he dormido|dormí|pude dormir|logré dormir))(?: (?:nada|bien|mal|poco|mucho|muy|apenas|en toda la noche|toda la noche|[0-9]+ horas?))*$/,
  /^(?:ich bin (?:sehr |etwas )?(?:müde|erschöpft|traurig|froh)|ich habe (?:kaum|nicht|schlecht|gut) geschlafen)$/,
  /^(?:i(?: am|’m|'m) (?:very |a little )?(?:tired|happy|sad|exhausted)|i (?:slept (?:badly|well)|could(?: not|n’t|n't) sleep))$/
];
function ordinarySelfReport(quote){
  const normalized=quote.toLocaleLowerCase().replace(/[.!…]+$/u,'').trim()
    .replace(/^(?:(?:hoy|anoche|ayer|últimamente|pues|la verdad|yo) )+/u,'')
    .replace(/ (?:hoy|anoche|ayer|esta noche)$/u,'');
  return selfReports.some(expression=>expression.test(normalized));
}
const marker=/\[estado_(\d+)\]/g;

export function splitDreamEvidence(messages){
  const quotes=[];
  const transcript=messages.map(m=>{
    if(m.autor!=='Gari')return m;
    const texto=m.texto.replace(/[^,;.!?\n]+[.!]?/gu,part=>{
      const quote=part.trim();
      if(!ordinarySelfReport(quote)||quote.length>180)return part;
      const token='[estado_'+quotes.length+']';
      quotes.push({token,cita:quote,fecha:m.cuando.slice(0,10),at:m.at||m.cuando.slice(0,10)+'T12:00:00Z'});
      return part.replace(quote,token);
    });
    return {...m,texto};
  });
  return {transcript,quotes};
}
export function beforeToday(now){return addDays(localDay(now,TZ),-1)}
export async function reviewedEvents(sb,userId,date){
  const midnight=Date.parse(date+'T00:00:00Z');
  const q=await sb.from('isabella_events').select('id,title,starts_at,all_day').eq('user_id',userId)
    .gte('starts_at',new Date(midnight-dayMs).toISOString()).lt('starts_at',new Date(midnight+2*dayMs).toISOString())
    .order('starts_at',{ascending:true}).limit(200);
  if(q.error)throw q.error;
  return (q.data||[]).filter(e=>e.starts_at&&localDay(new Date(e.starts_at),TZ)===date)
    .map(e=>({id:e.id,titulo:String(e.title||'').slice(0,140),hora:e.all_day?'todo el día':localTime(e.starts_at,TZ)}));
}

export function nextState(old,proposed,quotes,stamp){
  const saved=(old?.items||[]).filter(x=>Date.parse(x.expires_at)>stamp);
  const items=new Map(saved.map(x=>[x.fecha+' '+x.cita,x]));
  for(const c of (proposed||[]).slice(0,3)){
    const source=quotes.find(q=>q.token===c.cita&&q.fecha===c.fecha);
    const days=c.dias_vigencia;
    if(!source||!Number.isInteger(days)||days<3||days>5||Date.parse(source.at)<=Number(old?.forgot_before||0))continue;
    const expiry=Date.parse(source.at)+days*dayMs;
    if(expiry<=stamp)continue;
    items.set(source.fecha+' '+source.cita,{texto:source.cita,cita:source.cita,fecha:source.fecha,expires_at:new Date(expiry).toISOString()});
  }
  return {...(old?.forgot_before?{forgot_before:old.forgot_before}:{}),items:[...items.values()].slice(-3)};
}
const noMarkers=value=>!String(value||'').match(marker);
export function yesterdayView(candidate,date,transcript){
  if(candidate?.fecha!==date||!transcript.some(m=>m.cuando.startsWith(date)&&noMarkers(m.texto)))return null;
  const summary=String(candidate.resumen||'').trim().split(/\n+/).filter(noMarkers).slice(0,3).join('\n').slice(0,480);
  if(!summary)return null;
  return {fecha:date,resumen:summary,abierto:(candidate.abierto||[]).filter(x=>typeof x==='string'&&noMarkers(x)).slice(0,3).map(x=>x.slice(0,120)),
    expires_at:new Date(Date.parse(addDays(date,1)+'T00:00:00Z')+2*dayMs).toISOString()};
}

// Compare-and-swap: an overlapping panel deletion takes precedence over an older nightly read.
async function changePreference(sb,userId,key,transform){
  for(let i=0;i<3;i++){
    const q=await sb.from('isabella_preferences').select('value,updated_at').eq('user_id',userId).eq('preference_key',key).maybeSingle();
    if(q.error)throw q.error;
    const next=transform(q.data?.value);
    if(!next||JSON.stringify(next)===JSON.stringify(q.data?.value)||(!q.data&&key===continuityKeys[0]&&!next.items.length))return;
    const row={user_id:userId,preference_key:key,value:next,status:'confirmed',updated_at:new Date().toISOString()};
    if(!q.data){
      const write=await sb.from('isabella_preferences').insert(row);
      if(!write.error)return;
      if(write.error.code!=='23505')throw write.error;
    }else{
      const write=await sb.from('isabella_preferences').update(row).eq('user_id',userId).eq('preference_key',key)
        .eq('updated_at',q.data.updated_at).select('updated_at').maybeSingle();
      if(write.error)throw write.error;
      if(write.data)return;
    }
  }
  throw new Error('continuity_preference_changed');
}
export async function saveTransient(sb,userId,value,{quotes=[],transcript=[],date,now}){
  const stamp=now.getTime(),yesterday=yesterdayView(value?.ayer,date,transcript);
  await changePreference(sb,userId,continuityKeys[0],old=>nextState(old,value?.estado,quotes,stamp));
  await changePreference(sb,userId,continuityKeys[1],old=>yesterday||((old?.expires_at&&Date.parse(old.expires_at)<=stamp)?{}:null));
}
export function durableDream(value){
  // A placeholder must never reach a durable fact, version, diary or hypothesis.
  const clean=x=>noMarkers(JSON.stringify(x));
  return {...value,paginas:(value?.paginas||[]).filter(clean),hipotesis:(value?.hipotesis||[]).filter(clean),
    hilos:(value?.hilos||[]).filter(clean),correcciones:(value?.correcciones||[]).filter(clean),diario:clean(value?.diario)?value.diario:''};
}
