// Window · Proactividad tied to the Projektakte.
// Two signals, checked by the heartbeat during the day (08–20 h local, never at night):
//   - a Frist in the register is due today, tomorrow or the day after;
//   - entries are waiting for Gari's confirmation (Entscheidungen, Fristen, Aufgaben, Widersprüche).
// Gari picks how each one reaches him in Proactividad (akteFristen / akteOffen):
//   interrupt → explicit request, notified at once (he asked for it in settings)
//   briefing  → kept for the summary
//   ambient   → a card in Feed (default)
//   silent    → nothing
// The attention router only knows a fixed set of event types, so each choice maps to one it routes that way.
export const AKTE_ATTENTION_PREFIX='akte:';
export const AKTE_ATTENTION_DEFAULTS={akteFristen:'ambient',akteOffen:'ambient'};
const ROUTES=['interrupt','briefing','ambient','silent'];
export const DAY_START=8,DAY_END=20;

export function akteRoutes(attention){
  const a=attention&&typeof attention==='object'?attention:{};
  const pick=(v,f)=>ROUTES.includes(String(v||''))?String(v):f;
  return {akteFristen:pick(a.akteFristen,AKTE_ATTENTION_DEFAULTS.akteFristen),akteOffen:pick(a.akteOffen,AKTE_ATTENTION_DEFAULTS.akteOffen)};
}
function routing(route,baseType){
  if(route==='interrupt')return {event_type:baseType,user_requested:true};
  if(route==='briefing')return {event_type:'review_required'};
  if(route==='ambient')return {event_type:'expectation_due'};
  return null;
}
function localParts(now,tz){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const g=t=>(p.find(x=>x.type===t)||{}).value||'';
  return {day:g('year')+'-'+g('month')+'-'+g('day'),hour:Number(g('hour'))};
}
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const deDate=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.':''};

export function inDaytime(now,tz){const h=localParts(now,tz).hour;return h>=DAY_START&&h<DAY_END}

// Pure: rows in, attention candidates out (for minds_publish_attention).
export function akteAttentionCandidates({deadlines=[],pending=[],projects=[],attention,now=new Date(),tz='Europe/Berlin'}){
  const routes=akteRoutes(attention),{day}=localParts(now,tz),names=new Map(projects.map(p=>[p.id,p.name]));
  const out=[];
  const fr=routing(routes.akteFristen,'upcoming_event');
  if(fr){
    const words={0:'hoy',1:'mañana',2:'pasado mañana'};
    for(const d of deadlines){
      const due=String(d.occurred_at||'').slice(0,10);if(!due)continue;
      const inDays=[0,1,2].find(n=>addDays(day,n)===due);if(inDays===undefined)continue;
      if(!['proposed','confirmed'].includes(d.status))continue;
      const project=names.get(d.project_id)||'proyecto';
      out.push({...fr,event_key:AKTE_ATTENTION_PREFIX+'frist:'+d.id+':'+due,source_type:'system',source_id:String(d.id),
        title:'Plazo '+words[inDays]+' ('+deDate(due)+'): '+d.title,
        body:'Del registro de '+project+(d.status==='proposed'?'. Todavía está sin confirmar (Proyecto → Panorama).':'.'),
        urgency:inDays===0?'urgent':inDays===1?'attention':'info',deadline_at:due+'T18:00:00Z',timezone:tz,
        metadata:{source:'akte',akte_kind:'frist',memory_id:d.id,project_id:d.project_id,due}});
    }
  }
  const of=routing(routes.akteOffen,'review_required');
  if(of){
    const byProject=new Map();
    for(const r of pending){if(!byProject.has(r.project_id))byProject.set(r.project_id,[]);byProject.get(r.project_id).push(r)}
    for(const [projectId,rows] of byProject){
      // One card per batch: the key changes only when newer entries arrive, not when Gari confirms some.
      const newest=rows.map(r=>String(r.created_at||'')).sort().pop()||'';
      const batch=newest?localParts(new Date(newest),tz).day:'sin-fecha';
      const project=names.get(projectId)||'proyecto';
      const top=rows.slice(0,3).map(r=>'· '+r.title).join('\n');
      out.push({...of,event_key:AKTE_ATTENTION_PREFIX+'offen:'+projectId+':'+batch,source_type:'system',source_id:String(projectId),
        title:rows.length===1?'1 entrada por confirmar en '+project:rows.length+' entradas por confirmar en '+project,
        body:top+(rows.length>3?'\n· +'+(rows.length-3)+' más':'')+'\nBestätigen o Verwerfen en Proyecto → Panorama.',
        urgency:'info',timezone:tz,metadata:{source:'akte',akte_kind:'offen',project_id:projectId,count:rows.length}});
    }
  }
  return out;
}

// Heartbeat step: read, publish, and resolve Akte notices that no longer apply. Never throws.
export async function runAkteAttention(sb,userId,{now=new Date(),tz='Europe/Berlin'}={}){
  try{
    const {day}=localParts(now,tz);
    const [prefQ,deadlinesQ,pendingQ,projectsQ]=await Promise.all([
      sb.from('isabella_preferences').select('value').eq('user_id',userId).eq('preference_key','assistant').maybeSingle(),
      sb.from('minds_work_memory').select('id,project_id,title,status,occurred_at').eq('user_id',userId).eq('memory_type','deadline')
        .in('status',['proposed','confirmed']).gte('occurred_at',day+'T00:00:00Z').lte('occurred_at',addDays(day,2)+'T23:59:59Z').limit(40),
      sb.from('minds_work_memory').select('id,project_id,title,memory_type,metadata,created_at').eq('user_id',userId).eq('status','proposed')
        .in('memory_type',['decision','deadline','commitment','open_question']).lte('created_at',new Date(now.getTime()-2*3600e3).toISOString())
        .order('created_at',{ascending:true}).limit(200),
      sb.from('isabella_projects').select('id,name').eq('user_id',userId).limit(200)
    ]);
    for(const q of [deadlinesQ,pendingQ,projectsQ])if(q.error)throw q.error;
    // Only Akte entries: plain decisions/deadlines, or tasks and contradictions proposed by the Akte-Pflege.
    const pending=(pendingQ.data||[]).filter(r=>r.memory_type==='decision'||r.memory_type==='deadline'||
      (r.metadata&&['aufgabe','widerspruch'].includes(r.metadata.kind)));
    const candidates=inDaytime(now,tz)?akteAttentionCandidates({deadlines:deadlinesQ.data||[],pending,projects:projectsQ.data||[],
      attention:prefQ.data&&prefQ.data.value&&prefQ.data.value.attention,now,tz}):null;
    let published=0;
    if(candidates)for(const c of candidates){
      const r=await sb.rpc('minds_publish_attention',{p_user:userId,p_candidate:c});
      if(!r.error&&r.data&&!r.data.duplicate)published++;
    }
    // Resolve notices whose entry was confirmed, discarded or is past (only when we computed a fresh set).
    let resolved=0;
    if(candidates){
      const keys=new Set(candidates.map(c=>c.event_key));
      const open=await sb.from('minds_attention_events').select('id,event_key,surface_item_id').eq('user_id',userId)
        .like('event_key',AKTE_ATTENTION_PREFIX+'%').in('status',['pending','delivered','suppressed']).limit(200);
      if(open.error)throw open.error;
      for(const e of open.data||[]){
        if(keys.has(e.event_key))continue;
        await sb.from('minds_attention_events').update({status:'resolved',updated_at:new Date().toISOString()}).eq('id',e.id).eq('user_id',userId);
        if(e.surface_item_id)await sb.from('minds_surface_items').update({status:'dismissed',lifecycle_state:'resolved'}).eq('id',e.surface_item_id).eq('user_id',userId);
        resolved++;
      }
    }
    return {status:candidates?'ok':'night',candidates:candidates?candidates.length:0,published,resolved};
  }catch(e){return {status:'error',detail:e instanceof Error?e.message:String(e)}}
}
