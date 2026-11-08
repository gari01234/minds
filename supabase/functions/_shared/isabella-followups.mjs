// Window · what Isabella decides to do later on her own, said and cancellable (08.11.2026, point 4f).
//
// Gari, about a reminder he received: «así es como me gustaría que funcionara Isabella». When she decides
// to come back to something later (ask how a presentation went, prepare something, write another day), she
// schedules it here and tells him in one sentence what, when and why, and that he can cancel it. A follow-up
// carries no authority: it is a note to herself in isabella_return_queue (kind conversation_thread,
// metadata.kind 'seguimiento_propio'), surfaced by isabella-presence at the first real moment after it is
// due, mentioned by the morning brief on its day, and cancellable by a word in the chat or from the panel.
export const FOLLOWUP_KIND='seguimiento_propio';
export const FOLLOWUP_LIMITS={open:4,titleChars:160,reasonChars:240,maxDaysAhead:60,graceDays:2};

const DAY=/^\d{4}-\d{2}-\d{2}$/,TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('es').replace(/[\p{P}\p{S}]+/gu,' ').replace(/\s+/g,' ').trim();
const clip=(s,n)=>{const t=String(s||'').trim();return t.length>n?t.slice(0,n-1)+'…':t};

function offsetMinutes(utcMs,tz){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
    .formatToParts(new Date(utcMs)).reduce((a,x)=>(a[x.type]=x.value,a),{});
  const asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  return Math.round((asUtc-utcMs)/60000);
}
/** Local wall-clock time in `tz` → UTC ISO string. */
export function localToUtcIso(day,time='09:00',tz='Europe/Berlin'){
  if(!DAY.test(String(day))||!TIME.test(String(time)))return null;
  const [y,m,d]=day.split('-').map(Number),[h,mi]=time.split(':').map(Number);
  const guess=Date.UTC(y,m-1,d,h,mi);
  const first=guess-offsetMinutes(guess,tz)*60000;
  return new Date(guess-offsetMinutes(first,tz)*60000).toISOString();
}

export const FOLLOWUP_TOOLS=[
  {type:'function',name:'schedule_follow_up',strict:false,
    description:'Leave yourself a follow-up to come back to something later on your own initiative (ask how something went, prepare something, write another day). No authority over tasks, calendar or anything outside the chat. After scheduling, tell Gari in one sentence what, when and why, and that he can cancel it. At most one open follow-up per topic.',
    parameters:{type:'object',properties:{
      about:{type:'string',description:'What you will come back to, in Gari\'s words (short).'},
      day:{type:'string',description:'Local day YYYY-MM-DD.'},
      time:{type:'string',description:'Optional local time HH:MM (after which it may surface).'},
      why:{type:'string',description:'Why it is worth coming back to (one line).'}
    },required:['about','day','why']}},
  {type:'function',name:'cancel_follow_up',strict:false,
    description:'Close a follow-up you scheduled: cancel it when Gari asks you not to come back to it, or done=true when it was due and you just did it in this conversation.',
    parameters:{type:'object',properties:{id:{type:'string'},about:{type:'string'},done:{type:'boolean'}}}}
];
export const FOLLOWUP_TOOL_NAMES=new Set(FOLLOWUP_TOOLS.map(t=>t.name));

/** @param {any} sb user-scoped client (RLS) @param {{userId:string,args:any,tz?:string,now?:Date,turnId?:string|null,ownerName?:string}} o */
export async function scheduleFollowUp(sb,{userId,args,tz='Europe/Berlin',now=new Date(),turnId=null,ownerName='Gari'}){
  const about=clip(args&&args.about,FOLLOWUP_LIMITS.titleChars),why=clip(args&&args.why,FOLLOWUP_LIMITS.reasonChars);
  const day=String(args&&args.day||''),time=args&&args.time?String(args.time):'09:00';
  const due=localToUtcIso(day,time,tz);
  if(!sb||!userId||!about||!why||!due)return {status:'invalid',reason:'about, why y day (AAAA-MM-DD) son obligatorios; time HH:MM opcional.'};
  const dueMs=Date.parse(due);
  if(dueMs<now.getTime()-60000)return {status:'invalid',reason:'La fecha ya pasó.'};
  if(dueMs>now.getTime()+FOLLOWUP_LIMITS.maxDaysAhead*864e5)return {status:'invalid',reason:'Demasiado lejos; como mucho 60 días.'};
  const open=await sb.from('isabella_return_queue').select('id,title,metadata').eq('user_id',userId)
    .eq('kind','conversation_thread').eq('status','ready').limit(50);
  if(open.error)return {status:'error'};
  const mine=(open.data||[]).filter(r=>r.metadata&&r.metadata.kind===FOLLOWUP_KIND);
  const same=mine.find(r=>norm(r.title)===norm(about));
  if(same)return {status:'duplicate',id:same.id,due_at:same.metadata.due_at,note:'Ya tenías este seguimiento; no lo dupliques.'};
  if(mine.length>=FOLLOWUP_LIMITS.open)return {status:'limit',note:'Ya tienes varios seguimientos abiertos; no añadas más ahora.'};
  const expires=new Date(dueMs+FOLLOWUP_LIMITS.graceDays*864e5).toISOString();
  const ins=await sb.from('isabella_return_queue').insert({user_id:userId,kind:'conversation_thread',status:'ready',title:about,reason:why,
    reactivate_after:due,metadata:{kind:FOLLOWUP_KIND,due_at:due,due_local:day+(args&&args.time?' '+time:''),expires_at:expires,source:'isabella_chat',turn_id:turnId}})
    .select('id').single();
  if(ins.error||!ins.data)return {status:'error'};
  return {status:'scheduled',id:ins.data.id,due_local:day+(args&&args.time?' '+time:''),
    note:'Díselo a '+ownerName+' en una frase: qué harás, cuándo y por qué, y que puede cancelarlo.'};
}

/** @param {any} sb @param {{userId:string,args:any}} o */
export async function cancelFollowUp(sb,{userId,args}){
  if(!sb||!userId)return {status:'error'};
  const open=await sb.from('isabella_return_queue').select('id,title,metadata').eq('user_id',userId)
    .eq('kind','conversation_thread').eq('status','ready').limit(50);
  if(open.error)return {status:'error'};
  const mine=(open.data||[]).filter(r=>r.metadata&&r.metadata.kind===FOLLOWUP_KIND);
  const id=String(args&&args.id||''),about=norm(args&&args.about);
  const target=mine.find(r=>r.id===id)||(about?mine.find(r=>norm(r.title).includes(about)||about.includes(norm(r.title))):null);
  if(!target)return {status:'not_found',open:mine.map(r=>({id:r.id,about:r.title,due_local:r.metadata.due_local}))};
  const done=args&&args.done===true;
  const up=await sb.from('isabella_return_queue').update({status:done?'returned':'dismissed',updated_at:new Date().toISOString()})
    .eq('id',target.id).eq('user_id',userId).eq('status','ready');
  return up.error?{status:'error'}:{status:done?'done':'cancelled',id:target.id,about:target.title};
}

/** Splits ready threads: follow-ups not yet due stay out of conversation openings, but she knows them. */
export function splitFollowUps(threads,stamp=Date.now()){
  const list=Array.isArray(threads)?threads:[];
  const isMine=t=>t&&t.metadata&&t.metadata.kind===FOLLOWUP_KIND;
  const live=t=>!(t.metadata&&t.metadata.expires_at&&Date.parse(t.metadata.expires_at)<stamp);
  const due=t=>Date.parse(t.metadata&&t.metadata.due_at||'')<=stamp;
  return {
    others:list.filter(t=>!isMine(t)),
    due:list.filter(t=>isMine(t)&&live(t)&&due(t)),
    scheduled:list.filter(t=>isMine(t)&&live(t)&&!due(t))
  };
}
