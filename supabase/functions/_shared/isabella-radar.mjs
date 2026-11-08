// Window · Isabella's radar of Work (08.11.2026).
//
// Gari: «Tampoco sabe nada de los Threads ni me comenta cosas que podrían ser importantes y yo no me
// haya dado cuenta». The global chat is isolated from Work threads and the Projektakte by design
// (exposure scopes), so Isabella could not see them. The radar gives her a small, read-only summary —
// each active topic's Themenblatt status and open questions, the register's deadlines, entries waiting
// for Gari's confirmation and contradictions found by the nightly Akte-Pflege — never the threads'
// messages. For details she still has to search (search_work, search_work_threads).
import {clip,localDay,TZ,addDays} from './window-tools.mjs';
import {readOfficeTerminplanMilestones} from './office-terminplan.mjs';

export const RADAR_LIMITS={projects:4,topicsPerProject:4,topicDays:30,standChars:200,questions:2,fristenDays:21,fristen:4,proposedTasks:3,contradictions:2};
const list=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()):[];

/** Pure: rows → radar. Exported for tests. */
export function buildRadar({projects=[],threads=[],memos=[],today}){
  const L=RADAR_LIMITS,name=new Map(projects.filter(p=>!p.archived).map(p=>[p.id,p.name]));
  const until=addDays(today,L.fristenDays);
  const byProject=new Map();
  const slot=id=>{if(!name.has(id))return null;if(!byProject.has(id))byProject.set(id,{proyecto:name.get(id),temas:[],fristen:[],por_confirmar:0,tareas_propuestas:[],contradicciones:[],_last:''});return byProject.get(id)};
  for(const t of threads){
    const s=slot(t.project_id);if(!s||s.temas.length>=L.topicsPerProject)continue;
    const tb=t.metadata&&t.metadata.themenblatt||null;
    const updated=String((tb&&tb.aktualisiert_am)||t.last_activity_at||t.updated_at||'').slice(0,10);
    const q=list(tb&&tb.offene_fragen).slice(0,L.questions).map(x=>clip(x,140));
    s.temas.push({tema:t.title,estado:clip((tb&&tb.stand)||t.summary||'',L.standChars)||undefined,abiertas:q.length?q:undefined,actualizado:updated||undefined});
    if(updated>s._last)s._last=updated;
  }
  for(const m of memos){
    const s=slot(m.project_id);if(!s)continue;
    const day=String(m.occurred_at||'').slice(0,10);
    if(m.memory_type==='deadline'&&day&&day>=today&&day<=until&&s.fristen.length<L.fristen)s.fristen.push({que:clip(m.title,140),fecha:day,confirmada:m.status==='confirmed'});
    if(m.status==='proposed'&&(m.memory_type==='decision'||m.memory_type==='deadline'))s.por_confirmar++;
    if(m.memory_type==='commitment'&&m.status==='proposed'&&m.metadata&&m.metadata.kind==='aufgabe'&&s.tareas_propuestas.length<L.proposedTasks)s.tareas_propuestas.push(clip(m.title,140));
    if(m.memory_type==='open_question'&&m.status==='proposed'&&m.metadata&&m.metadata.kind==='widerspruch'&&s.contradicciones.length<L.contradictions)s.contradicciones.push(clip(m.title,160));
  }
  const out=[...byProject.values()]
    .filter(s=>s.temas.length||s.fristen.length||s.por_confirmar||s.tareas_propuestas.length||s.contradicciones.length)
    .sort((a,b)=>String(b._last).localeCompare(String(a._last))).slice(0,L.projects)
    .map(({_last,...s})=>{
      for(const k of ['fristen','tareas_propuestas','contradicciones'])if(!s[k].length)delete s[k];
      if(!s.por_confirmar)delete s.por_confirmar;
      s.fristen?.sort((a,b)=>a.fecha.localeCompare(b.fecha));
      return s;
    });
  return out.length?{fuente:'Themenblatt y registro de la Projektakte (resumen; el detalle con search_work o search_work_threads)',hoy:today,proyectos:out}:null;
}

/** Reads the radar with the caller's client (RLS keeps it to the owner). Never throws: no radar is fine.
 * @param {any} sb @param {{now?:Date,tz?:string,userId?:string|null,profile?:string}} [opts] */
export async function workRadar(sb,{now=new Date(),tz=TZ,userId=null,profile='window'}={}){
  if(!sb)return null;
  try{
    const today=localDay(now,tz),since=new Date(now.getTime()-RADAR_LIMITS.topicDays*864e5).toISOString();
    // Service-role runners must never broaden personal Work reads in Office.
    const own=q=>userId?q.eq('user_id',userId):q;
    const [p,t,m,terminplan]=await Promise.all([
      own(sb.from('isabella_projects').select('id,name,archived')).limit(60),
      own(sb.from('minds_work_threads').select('id,title,summary,metadata,project_id,last_activity_at,updated_at')).eq('status','active')
        .gte('updated_at',since).order('updated_at',{ascending:false}).limit(24),
      own(sb.from('minds_work_memory').select('id,memory_type,title,status,occurred_at,created_at,metadata,project_id'))
        .in('memory_type',['decision','deadline','commitment','open_question']).in('status',['proposed','confirmed'])
        .order('updated_at',{ascending:false}).limit(80),
      profile==='office'?readOfficeTerminplanMilestones(sb,{userId,from:today,to:addDays(today,RADAR_LIMITS.fristenDays),limit:8})
        :Promise.resolve(null)
    ]);
    if(p.error||t.error||m.error)return null;
    const base=buildRadar({projects:p.data||[],threads:t.data||[],memos:m.data||[],today});
    if(profile!=='office')return base;
    // Office Terminplan milestones are an independent, owner/team-scoped read.
    // An unavailable read must never be reported as no Fristen.
    const fristen=terminplan?.milestones||[];
    return {...(base||{fuente:'Projektakte und Terminplan',hoy:today,proyectos:[]}),
      ...(fristen.length?{terminplan_fristen:fristen}:{}),terminplan_status:terminplan?.status||'unavailable'};
  }catch{return null}
}
