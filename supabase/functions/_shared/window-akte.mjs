// Window connector · Projektakte (phase 1).
// Three layers, so Claude reads little and well-chosen context:
//   1. always at hand: Projektsteckbrief per project and Themenblatt per topic (short, rewritten on close)
//   2. history: the topic thread's session handoffs and messages (read only when needed)
//   3. archive: the Work desktop and extracted text (searched just in time)
// Akte content is German. Storage reuses existing owner-scoped tables (RLS):
//   Steckbrief  → minds_work_memory (memory_type 'document_state', metadata.kind 'projektsteckbrief')
//   Themenblatt → minds_work_threads.metadata.themenblatt (+ summary for the thread list)
//   Entscheidungen / Fristen → minds_work_memory ('decision' / 'deadline'), proposed until confirmed
//   Documents (e-mails, notes, letters) → minds-work storage + minds_work_files (ingest runs on insert)
import {ToolError,must,norm,clip,isDay,localDay,addDays,TZ} from './window-tools.mjs';

const KINDS={email:'E-Mail',notiz:'Notiz',brief:'Brief',protokoll:'Protokoll',dokument:'Dokument'};
const list=v=>(Array.isArray(v)?v:[]).map(x=>typeof x==='string'?x.trim():x).filter(x=>x&&(typeof x!=='string'||x.length));
const deDate=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:String(iso||'')};
const tokens=s=>new Set(norm(s).split(/[^a-z0-9äöüß]+/).filter(t=>t.length>2));
export async function sha256Hex(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const safeName=s=>String(s||'dokument').normalize('NFKD').replace(/[^\w.\- äöüÄÖÜß]+/g,'').replace(/\s+/g,'_').slice(0,90)||'dokument';

export function renderSteckbrief(f){
  if(!f)return '';
  const out=[];
  if(f.phase)out.push('Phase: '+f.phase);
  if(list(f.meilensteine).length)out.push('Meilensteine:\n'+list(f.meilensteine).map(m=>'- '+(m.datum?deDate(m.datum)+' – ':'')+(m.was||m.text||m)).join('\n'));
  if(list(f.beteiligte).length)out.push('Beteiligte:\n'+list(f.beteiligte).map(b=>'- '+(b.rolle?b.rolle+': ':'')+(b.name||b)).join('\n'));
  if(list(f.prioritaeten).length)out.push('Prioritäten:\n'+list(f.prioritaeten).map(p=>'- '+p).join('\n'));
  if(f.notizen)out.push('Notizen: '+f.notizen);
  return out.join('\n\n');
}
export function renderThemenblatt(t){
  if(!t)return '';
  const out=[];
  if(t.stand)out.push('Stand: '+t.stand);
  if(list(t.entscheidungen).length)out.push('Entscheidungen:\n'+list(t.entscheidungen).map(e=>'- '+(e.datum?deDate(e.datum)+': ':'')+e.text+(e.quelle?' (Quelle: '+e.quelle+')':'')).join('\n'));
  if(list(t.offene_fragen).length)out.push('Offene Fragen:\n'+list(t.offene_fragen).map(q=>'- '+q).join('\n'));
  if(list(t.naechste_schritte).length)out.push('Nächste Schritte:\n'+list(t.naechste_schritte).map(q=>'- '+q).join('\n'));
  if(list(t.dokumente).length)out.push('Dokumente: '+list(t.dokumente).map(d=>d.name||d).join(', '));
  return out.join('\n\n');
}
// One readable message in the thread, so Window shows what happened in the Claude session.
export function renderHandoff(t,day){
  const parts=['**Sitzungsübergabe** · '+deDate(day)];
  if(t.stand)parts.push('**Stand:** '+t.stand);
  if(list(t.neue_entscheidungen).length)parts.push('**Entscheidungen:**\n'+list(t.neue_entscheidungen).map(e=>'- '+e.text+(e.bestaetigt?'':' *(vorgeschlagen)*')).join('\n'));
  if(list(t.offene_fragen).length)parts.push('**Offene Fragen:**\n'+list(t.offene_fragen).map(q=>'- '+q).join('\n'));
  if(list(t.naechste_schritte).length)parts.push('**Nächste Schritte:**\n'+list(t.naechste_schritte).map(q=>'- '+q).join('\n'));
  return parts.join('\n\n');
}
// Best single thread for a free-text topic name, or the candidates when it is not clear.
export function matchTopic(threads,ref){
  const r=norm(ref);if(!r)return {match:null,candidates:[]};
  const exact=threads.find(t=>norm(t.title)===r);if(exact)return {match:exact,candidates:[]};
  const contains=threads.filter(t=>{const n=norm(t.title);return n.includes(r)||r.includes(n)});
  if(contains.length===1)return {match:contains[0],candidates:[]};
  const want=tokens(ref);
  const scored=threads.map(t=>{const have=tokens(t.title);const inter=[...want].filter(x=>have.has(x)).length;const uni=new Set([...want,...have]).size||1;return {t,score:inter/uni}})
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(scored.length&&scored[0].score>=0.5&&(!scored[1]||scored[0].score-scored[1].score>=0.2))return {match:scored[0].t,candidates:[]};
  return {match:null,candidates:(contains.length?contains:scored.map(x=>x.t)).slice(0,5)};
}

// Dimensions of Isabella's operating model ("Lo que Isabella sabe de mí").
export const ARBEITSWEISE_BEREICHE=['scheduling','task_management','work_rhythm','interruptions','planning','decision_style','communication','tooling','review'];

// actor 'claude' = the connector (Gari's own session); 'isabella' = the nightly Akte-Pflege.
export function createAkteTools({sb,userId,base,now=()=>new Date(),uuid=()=>crypto.randomUUID(),tz=TZ,actor='claude'}){
  if(!sb||!userId||!base)throw new Error('akte_tools_need_owner');
  const ACTOR=actor==='isabella'?{source:'isabella_akte_pflege',name:'Isabella',prov:'akte_pflege'}:{source:'claude_connector',name:'Claude',prov:'claude_session'};
  const today=()=>localDay(now(),tz);
  const stamp=()=>now().toISOString();

  async function threadsOf(projectId){
    return must(await sb.from('minds_work_threads').select('id,title,summary,status,project_id,conversation_id,metadata,last_activity_at,updated_at')
      .eq('user_id',userId).eq('project_id',projectId).eq('status','active').order('updated_at',{ascending:false}).limit(120),'threads')||[];
  }
  async function steckbriefRow(projectId){
    const rows=must(await sb.from('minds_work_memory').select('id,body,metadata,updated_at').eq('user_id',userId).eq('project_id',projectId)
      .eq('memory_type','document_state').eq('metadata->>kind','projektsteckbrief').limit(1),'steckbrief')||[];
    return rows[0]||null;
  }
  async function desktopSummary(projectId){
    const [folders,files]=await Promise.all([
      sb.from('minds_work_folders').select('id,parent_id,name').eq('user_id',userId).eq('project_id',projectId).limit(400),
      sb.from('minds_work_files').select('id,folder_id,name,index_status,created_at').eq('user_id',userId).eq('project_id',projectId).order('created_at',{ascending:false}).limit(1000)
    ]);
    const fRows=must(folders,'folders')||[],byId=new Map(fRows.map(f=>[f.id,f]));
    const pathOf=id=>{const parts=[];let cur=byId.get(id),g=0;while(cur&&g++<12){parts.unshift(cur.name);cur=byId.get(cur.parent_id)}return parts.join(' / ')};
    const fileRows=must(files,'files')||[],counts=new Map(),seen=new Map();
    for(const f of fileRows){counts.set(f.folder_id||'',(counts.get(f.folder_id||'')||0)+1);seen.set(norm(f.name),(seen.get(norm(f.name))||0)+1)}
    const newest=[],names=new Set();
    for(const f of fileRows){const k=norm(f.name);if(names.has(k))continue;names.add(k);newest.push({id:'file:'+f.id,name:f.name,ordner:pathOf(f.folder_id)||'(Hauptebene)',datum:String(f.created_at||'').slice(0,10)});if(newest.length>=10)break}
    return {dateien_gesamt:fileRows.length,doppelte_namen:[...seen.values()].filter(n=>n>1).length,
      ordner:[...counts.entries()].map(([id,n])=>({id:id?'folder:'+id:null,pfad:id?pathOf(id):'(Hauptebene)',dateien:n})).sort((a,b)=>b.dateien-a.dateien).slice(0,20),neueste:newest};
  }
  function topicLine(t){const tb=t.metadata&&t.metadata.themenblatt;return {id:'topic:'+t.id,titel:t.title,stand:clip((tb&&tb.stand)||t.summary||'',220)||undefined,aktualisiert:String((tb&&tb.aktualisiert_am)||t.last_activity_at||t.updated_at||'').slice(0,10)}}

  async function openProject({project}={}){
    const p=await base.resolveProject(project),day=today();
    const [sb1,topics,memos,tasks,desk]=await Promise.all([
      steckbriefRow(p.id),threadsOf(p.id),
      sb.from('minds_work_memory').select('id,memory_type,title,status,occurred_at,created_at,metadata').eq('user_id',userId).eq('project_id',p.id).in('memory_type',['decision','deadline','commitment','open_question']).in('status',['proposed','confirmed']).order('created_at',{ascending:false}).limit(60),
      sb.from('isabella_tasks').select('id,title,due_date,start_date,assignee,completed_at,archived_at').eq('user_id',userId).eq('project_id',p.id).is('completed_at',null).is('archived_at',null).lte('due_date',addDays(day,14)).order('due_date',{ascending:true}).limit(15),
      desktopSummary(p.id)
    ]);
    const memoRows=must(memos,'register')||[];
    return {projekt:{id:p.id,name:p.name},heute:day,
      projektsteckbrief:sb1?{text:sb1.body,aktualisiert:String(sb1.updated_at||'').slice(0,10)}:null,
      hinweis:sb1?undefined:'Noch kein Projektsteckbrief. Mit update_project_brief anlegen, wenn Gari Phase, Meilensteine oder Beteiligte nennt.',
      themen:topics.map(topicLine),
      register:{offen_zu_bestaetigen:memoRows.filter(m=>m.status==='proposed'&&(m.memory_type==='decision'||m.memory_type==='deadline')).length,
        fristen:memoRows.filter(m=>m.memory_type==='deadline'&&(!m.occurred_at||String(m.occurred_at).slice(0,10)>=day)).slice(0,8).map(m=>({id:'memo:'+m.id,frist:String(m.occurred_at||'').slice(0,10)||null,titel:m.title,status:m.status})),
        letzte_entscheidungen:memoRows.filter(m=>m.memory_type==='decision').slice(0,6).map(m=>({id:'memo:'+m.id,titel:m.title,status:m.status,datum:String(m.occurred_at||m.created_at||'').slice(0,10)})),
        vorgeschlagene_aufgaben:memoRows.filter(m=>m.memory_type==='commitment'&&m.status==='proposed'&&m.metadata&&m.metadata.kind==='aufgabe').slice(0,6).map(m=>({id:'memo:'+m.id,titel:m.title,faellig:String(m.occurred_at||'').slice(0,10)||undefined})),
        widersprueche:memoRows.filter(m=>m.memory_type==='open_question'&&m.status==='proposed'&&m.metadata&&m.metadata.kind==='widerspruch').slice(0,4).map(m=>({id:'memo:'+m.id,titel:m.title}))},
      aufgaben_naechste_14_tage:(must(tasks,'tasks')||[]).map(t=>({id:t.id,titel:t.title,faellig:t.due_date,start:t.start_date||undefined,verantwortlich:t.assignee||undefined})),
      schreibtisch:desk};
  }

  async function openTopic({project,topic}={}){
    const p=await base.resolveProject(project);
    const topics=await threadsOf(p.id),{match,candidates}=matchTopic(topics,topic);
    if(!match)return {projekt:p.name,thema_gefunden:false,gesucht:String(topic||''),
      vorschlaege:candidates.map(t=>({id:'topic:'+t.id,titel:t.title})),alle_themen:topics.map(t=>t.title),
      hinweis:'Kein eindeutiges Thema. Frag Gari, welches gemeint ist, oder schlag einen neuen Titel vor (close_session mit neues_thema=true legt es an).'};
    const tb=(match.metadata&&match.metadata.themenblatt)||null;
    let sessions=[];
    if(match.conversation_id){
      const rows=must(await sb.from('conversation_messages').select('role,content,created_at,metadata').eq('user_id',userId).eq('conversation_id',match.conversation_id)
        .in('role',['user','assistant']).order('created_at',{ascending:false}).limit(tb?6:12),'topic_messages')||[];
      sessions=rows.reverse().map(m=>({von:m.role==='user'?'Gari':(m.metadata&&m.metadata.source==='claude_connector'?'Claude':'Isabella'),am:String(m.created_at||'').slice(0,16).replace('T',' '),text:clip(m.content,tb?1800:2500)}));
    }
    return {projekt:p.name,thema:{id:'topic:'+match.id,titel:match.title},themenblatt:tb?{text:renderThemenblatt(tb),aktualisiert:tb.aktualisiert_am||null,von:tb.aktualisiert_von||null}:null,
      hinweis:tb?undefined:'Dieses Thema hat noch kein Themenblatt; der Verlauf unten ist die Grundlage. Beim Abschluss legt close_session es an.',
      letzter_verlauf:sessions};
  }

  async function search({query,project,limit=12}={}){
    const q=String(query||'').trim();
    if(q.length<2)throw new ToolError('Escribe al menos dos caracteres para buscar.');
    const p=project?await base.resolveProject(project):null,cap=Math.min(Math.max(Number(limit)||12,1),25);
    const like='%'+q.replace(/[%_,()]/g,' ').trim()+'%';
    let files=sb.from('minds_work_source_segments').select('file_id,project_id,segment_no,content').eq('user_id',userId).textSearch('content',q,{config:'simple',type:'websearch'});
    let named=sb.from('minds_work_files').select('id,name,project_id').eq('user_id',userId).ilike('name',like);
    let topics=sb.from('minds_work_threads').select('id,title,summary,project_id').eq('user_id',userId).eq('status','active').or('title.ilike.'+like+',summary.ilike.'+like);
    let memos=sb.from('minds_work_memory').select('id,memory_type,title,body,project_id,status').eq('user_id',userId).in('memory_type',['decision','deadline','document_state']).or('title.ilike.'+like+',body.ilike.'+like);
    if(p){files=files.eq('project_id',p.id);named=named.eq('project_id',p.id);topics=topics.eq('project_id',p.id);memos=memos.eq('project_id',p.id)}
    const [a,b,c,d]=await Promise.all([files.limit(cap*2),named.limit(cap),topics.limit(8),memos.limit(8)]);
    const segs=must(a,'search')||[],ids=[...new Set(segs.map(s=>s.file_id))];
    const fileNames=ids.length?new Map((must(await sb.from('minds_work_files').select('id,name').eq('user_id',userId).in('id',ids),'search_files')||[]).map(f=>[f.id,f.name])):new Map();
    const terms=norm(q).split(/\s+/).filter(t=>t.length>2);
    const snip=t=>{const s=String(t||''),n=norm(s);let at=-1;for(const term of terms){at=n.indexOf(term);if(at>=0)break}const st=Math.max(0,(at<0?0:at)-200);return (st>0?'…':'')+s.slice(st,st+480).replace(/\s+/g,' ')+(st+480<s.length?'…':'')};
    const url='https://gari01234.github.io/minds/isabella/';
    const results=[],seen=new Set();
    for(const t of must(c,'search_topics')||[])results.push({id:'topic:'+t.id,title:'Thema: '+t.title,text:clip(t.summary||'',300),url});
    for(const m of must(d,'search_register')||[])results.push({id:'memo:'+m.id,title:(m.memory_type==='decision'?'Entscheidung':m.memory_type==='deadline'?'Frist':'Projektsteckbrief')+': '+clip(m.title,120),text:clip(m.body||'',300),url});
    for(const s of segs){if(seen.has(s.file_id+'@'+s.segment_no))continue;seen.add(s.file_id+'@'+s.segment_no);results.push({id:'file:'+s.file_id+'@'+s.segment_no,title:fileNames.get(s.file_id)||'Dokument',text:snip(s.content),url});if(results.length>=cap+10)break}
    for(const f of must(b,'search_names')||[]){if(results.some(r=>r.id.startsWith('file:'+f.id)))continue;results.push({id:'file:'+f.id,title:f.name,text:'Dateiname passt zur Suche.',url})}
    return {query:q,projekt:p?p.name:null,results:results.slice(0,cap+8)};
  }

  async function fetchItem({id,offset}={}){
    const raw=String(id||'').trim(),m=raw.match(/^(file|topic|memo|folder):([A-Za-z0-9-]{3,})(?:@(\d+))?$/i);
    if(!m)throw new ToolError('id no reconocido. Usa un id de search u open_project (file:…, topic:…, memo:…, folder:…).');
    const [,kind,key,seg]=m;
    if(kind==='file'){const r=await base.readFile({file_id:key,from_segment:offset!=null?offset:(seg?Number(seg):0),max_chars:30000});return {id:raw,title:r.file.name,text:r.text||r.note||'',metadata:{projekt:r.file.project,segmente:r.segments_total,weiter_ab:r.more?r.more.next_from_segment:undefined}}}
    if(kind==='topic'){
      const t=await base.threadById(key);const tb=t.metadata&&t.metadata.themenblatt;
      const r=await base.readThread({thread_id:key,limit:40});
      return {id:raw,title:'Thema: '+t.title,text:(tb?renderThemenblatt(tb)+'\n\n---\n\n':'')+r.messages.map(x=>'['+x.author+' · '+String(x.at||'').slice(0,10)+']\n'+x.content).join('\n\n'),metadata:{projekt:r.thread.project}};
    }
    if(kind==='memo'){
      const row=must(await sb.from('minds_work_memory').select('id,memory_type,title,body,status,occurred_at,metadata,created_at').eq('user_id',userId).eq('id',key).maybeSingle(),'memo');
      if(!row)throw new ToolError('No encuentro esa entrada en Window.');
      return {id:raw,title:row.title,text:row.body||row.title,metadata:{art:row.memory_type,status:row.status,datum:row.occurred_at||null,quelle:row.metadata&&row.metadata.quelle||undefined}};
    }
    const files=must(await sb.from('minds_work_files').select('id,name,created_at,index_status').eq('user_id',userId).eq('folder_id',key).order('created_at',{ascending:false}).limit(200),'folder')||[];
    return {id:raw,title:'Ordner',text:files.map(f=>'file:'+f.id+' · '+f.name+' · '+String(f.created_at||'').slice(0,10)).join('\n')||'(leer)',metadata:{dateien:files.length}};
  }

  async function addRegister(p,{titel,details,datum,quelle,art='entscheidung',bestaetigt=false,thema},existing){
    const title=String(titel||'').trim().slice(0,240);
    if(!title)return null;
    const type=art==='frist'?'deadline':'decision';
    if((existing||[]).some(r=>r.memory_type===type&&norm(r.title)===norm(title)))return {skipped:true,titel:title};
    const at=isDay(datum)?datum+'T12:00:00Z':null;
    const row={user_id:userId,project_id:p.id,memory_type:type,title,body:String(details||'').slice(0,4000),status:bestaetigt?'confirmed':'proposed',
      occurred_at:at,confirmed_at:bestaetigt?stamp():null,
      metadata:{source:ACTOR.source,quelle:quelle?String(quelle).slice(0,300):undefined,thema_id:thema?thema.id:undefined,thema:thema?thema.title:undefined},
      provenance:[{kind:ACTOR.prov,thread_id:thema?thema.id:null,at:stamp()}]};
    const saved=must(await sb.from('minds_work_memory').insert(row).select('id,status').single(),'register_insert');
    return {id:'memo:'+saved.id,titel:title,art:type==='deadline'?'Frist':'Entscheidung',status:saved.status};
  }

  async function recordDecision(args={}){
    const p=await base.resolveProject(args.project);
    if(args.datum&&!isDay(args.datum))throw new ToolError('datum debe tener formato AAAA-MM-DD.');
    let thema=null;
    if(args.thema){const {match}=matchTopic(await threadsOf(p.id),args.thema);thema=match}
    const existing=must(await sb.from('minds_work_memory').select('memory_type,title').eq('user_id',userId).eq('project_id',p.id).in('memory_type',['decision','deadline']).limit(500),'register')||[];
    const r=await addRegister(p,{...args,thema},existing);
    if(!r)throw new ToolError('Falta el título de la entrada.');
    return r.skipped?{bereits_vorhanden:r.titel}:{eingetragen:r,hinweis:r.status==='proposed'?'Vorgeschlagen: Gari bestätigt es in Window (Projekt → Panorama).':undefined};
  }

  async function closeSession(args={}){
    const p=await base.resolveProject(args.project);
    const topics=await threadsOf(p.id);
    let thread=null;
    if(args.topic_id){const id=String(args.topic_id).replace(/^topic:/,'');thread=topics.find(t=>t.id===id)||null}
    if(!thread&&args.topic){const r=matchTopic(topics,args.topic);thread=r.match;
      if(!thread&&!args.neues_thema)return {gespeichert:false,grund:'Kein eindeutiges Thema für "'+args.topic+'".',vorschlaege:r.candidates.map(t=>t.title),hinweis:'Mit Gari klären und erneut aufrufen; für ein neues Thema neues_thema=true setzen.'}}
    if(!thread){
      const title=String(args.topic||'').trim().slice(0,160);
      if(!title)throw new ToolError('Indica el tema (topic) de la sesión.');
      const created=must(await sb.from('minds_work_threads').insert({user_id:userId,project_id:p.id,title,status:'active',sort_order:0,metadata:{source:'claude_connector'}}).select('id').single(),'create_topic');
      thread=(await threadsOf(p.id)).find(t=>t.id===created.id);
    }
    const prev=(thread.metadata&&thread.metadata.themenblatt)||{};
    const neue=list(args.entscheidungen).map(e=>typeof e==='string'?{text:e}:{text:String(e.text||'').trim(),datum:isDay(e.datum)?e.datum:undefined,quelle:e.quelle?String(e.quelle).slice(0,200):undefined,bestaetigt:!!e.bestaetigt}).filter(e=>e.text);
    const merged=[...list(prev.entscheidungen)];
    for(const e of neue)if(!merged.some(x=>norm(x.text)===norm(e.text)))merged.push({text:e.text,datum:e.datum||today(),quelle:e.quelle,bestaetigt:e.bestaetigt});
    const themenblatt={stand:String(args.stand||prev.stand||'').trim().slice(0,1500),
      entscheidungen:merged.slice(-30),
      offene_fragen:args.offene_fragen!==undefined?list(args.offene_fragen).slice(0,20):list(prev.offene_fragen),
      naechste_schritte:args.naechste_schritte!==undefined?list(args.naechste_schritte).slice(0,20):list(prev.naechste_schritte),
      dokumente:args.dokumente!==undefined?list(args.dokumente).slice(0,20):list(prev.dokumente),
      aktualisiert_am:stamp(),aktualisiert_von:ACTOR.name};
    if(!themenblatt.stand)throw new ToolError('Falta "stand": resume en una o dos frases dónde está el tema.');
    // History first: the handoff and any condensed exchange become thread messages.
    let conversationId=thread.conversation_id;
    if(!conversationId)conversationId=String(must(await sb.rpc('minds_ensure_work_thread_conversation',{p_thread_id:thread.id}),'topic_conversation')||'');
    if(!conversationId)throw new Error('topic_conversation_unavailable');
    const base0=now().getTime(),entries=list(args.verlauf).filter(e=>e&&String(e.content||'').trim()).slice(0,30);
    const rows=[...entries.map(e=>({role:e.role==='user'?'user':'assistant',content:String(e.content).slice(0,20000),kind:'verlauf'})),
      {role:'assistant',content:renderHandoff({...themenblatt,neue_entscheidungen:neue},today()),kind:'sitzungsuebergabe'}]
      .map((e,i)=>({user_id:userId,conversation_id:conversationId,client_key:uuid(),role:e.role,content:e.content,provisional:false,citations:[],
        created_at:new Date(base0+i).toISOString(),metadata:{app:'work_thread',work_thread_id:thread.id,project_id:p.id,source:'claude_connector',kind:e.kind}}));
    must(await sb.from('conversation_messages').insert(rows),'topic_messages_insert');
    must(await sb.from('minds_work_threads').update({summary:clip(themenblatt.stand,400),metadata:{...(thread.metadata||{}),themenblatt},last_activity_at:stamp(),updated_at:stamp()}).eq('user_id',userId).eq('id',thread.id),'themenblatt_update');
    try{await sb.from('conversations').update({updated_at:stamp()}).eq('id',conversationId)}catch{}
    // Decisions also go to the project register; unconfirmed ones wait for Gari in Window.
    const existing=must(await sb.from('minds_work_memory').select('memory_type,title').eq('user_id',userId).eq('project_id',p.id).in('memory_type',['decision','deadline']).limit(500),'register')||[];
    const register=[];
    for(const e of neue){const r=await addRegister(p,{titel:e.text,datum:e.datum,quelle:e.quelle,bestaetigt:e.bestaetigt,thema:thread},existing);if(r&&!r.skipped){register.push(r);existing.push({memory_type:'decision',title:e.text})}}
    for(const f of list(args.fristen)){const fr=typeof f==='string'?{titel:f}:f;const r=await addRegister(p,{titel:fr.titel||fr.text,datum:fr.datum,quelle:fr.quelle,art:'frist',bestaetigt:!!fr.bestaetigt,thema:thread},existing);if(r&&!r.skipped)register.push(r)}
    // What Gari said explicitly about how he wants to work becomes a proposal in his operating model;
    // nothing changes how Isabella works until he confirms it in "Lo que Isabella sabe de mí".
    const arbeitsweise=[];
    for(const w of list(args.arbeitsweise).slice(0,5)){
      const aussage=String((typeof w==='string'?w:w&&w.aussage)||'').trim().slice(0,600);if(!aussage)continue;
      const bereich=ARBEITSWEISE_BEREICHE.includes(w&&w.bereich)?w.bereich:'communication';
      const r=await sb.rpc('minds_propose_operating_model_hypothesis',{p_dimension:bereich,p_claim_type:'preference',p_statement:aussage,
        p_rationale:'Gari lo dijo explícitamente en una sesión de Claude ('+p.name+' · '+thread.title+').',p_source_kind:'conversation',
        p_source_ref:'claude:topic:'+thread.id,p_evidence_note:w&&w.zitat?String(w.zitat).slice(0,600):null});
      arbeitsweise.push(r.error?{aussage,gespeichert:false}:{aussage,vorgeschlagen:true});
    }
    return {gespeichert:true,projekt:p.name,thema:{id:'topic:'+thread.id,titel:thread.title},themenblatt:renderThemenblatt(themenblatt),nachrichten:rows.length,register,
      arbeitsweise:arbeitsweise.length?arbeitsweise:undefined,
      hinweis:[register.some(r=>r.status==='proposed')?'Vorgeschlagene Einträge bestätigt Gari in Window (Projekt → Panorama).':'',
        arbeitsweise.some(a=>a.vorgeschlagen)?'Arbeitsweise: Gari bestätigt sie in Window (Lo que Isabella sabe de mí).':''].filter(Boolean).join(' ')||undefined};
  }

  async function updateProjectBrief(args={}){
    const p=await base.resolveProject(args.project);
    const row=await steckbriefRow(p.id),prev=(row&&row.metadata&&row.metadata.felder)||{};
    const felder={...prev};
    for(const k of ['phase','notizen'])if(args[k]!==undefined)felder[k]=String(args[k]||'').slice(0,1500);
    for(const k of ['meilensteine','beteiligte','prioritaeten'])if(args[k]!==undefined)felder[k]=list(args[k]).slice(0,30);
    const body=renderSteckbrief(felder);
    if(!body)throw new ToolError('El Projektsteckbrief necesita al menos un campo (phase, meilensteine, beteiligte, prioritaeten o notizen).');
    if(row&&row.body===body)return {projekt:p.name,projektsteckbrief:body,unveraendert:true};
    // Descriptive updates apply directly but stay versioned, so Gari can undo them in Window.
    const versionen=row?[{body:row.body,felder:prev,aktualisiert_am:row.updated_at,aktualisiert_von:(row.metadata&&row.metadata.aktualisiert_von)||null},
      ...list(row.metadata&&row.metadata.versionen)].slice(0,10):[];
    const meta={kind:'projektsteckbrief',felder,aktualisiert_von:ACTOR.name,versionen};
    if(row)must(await sb.from('minds_work_memory').update({body,metadata:{...(row.metadata||{}),...meta},updated_at:stamp()}).eq('user_id',userId).eq('id',row.id),'steckbrief_update');
    else must(await sb.from('minds_work_memory').insert({user_id:userId,project_id:p.id,memory_type:'document_state',title:'Projektsteckbrief',body,status:'confirmed',confirmed_at:stamp(),metadata:meta}),'steckbrief_insert');
    return {projekt:p.name,projektsteckbrief:body};
  }

  async function folderFor(p,pfad){
    const parts=String(pfad||'').split('/').map(s=>s.trim()).filter(Boolean).slice(0,3);
    if(!parts.length)return null;
    const folders=must(await sb.from('minds_work_folders').select('id,parent_id,name').eq('user_id',userId).eq('project_id',p.id).limit(400),'folders')||[];
    let parent=null;
    for(const name of parts){
      let f=folders.find(x=>(x.parent_id||null)===parent&&norm(x.name)===norm(name));
      if(!f){f=must(await sb.from('minds_work_folders').insert({user_id:userId,project_id:p.id,parent_id:parent,name:name.slice(0,120),sort_order:0}).select('id,parent_id,name').single(),'folder_create');folders.push(f)}
      parent=f.id;
    }
    return parent;
  }

  async function fileDocument(args={}){
    const p=await base.resolveProject(args.project);
    const inhalt=String(args.inhalt||'').trim(),art=KINDS[args.art]?args.art:'dokument';
    if(inhalt.length<20)throw new ToolError('El documento está vacío o es demasiado corto.');
    if(inhalt.length>400000)throw new ToolError('El documento es demasiado largo para archivarlo de una vez.');
    if(args.datum&&!isDay(args.datum))throw new ToolError('datum debe tener formato AAAA-MM-DD.');
    const hash=await sha256Hex(norm(inhalt).replace(/\s+/g,' '));
    const dup=must(await sb.from('minds_work_files').select('id,name').eq('user_id',userId).eq('project_id',p.id).eq('metadata->>content_sha256',hash).limit(1),'dedupe')||[];
    if(dup.length)return {abgelegt:false,bereits_vorhanden:{id:'file:'+dup[0].id,name:dup[0].name},hinweis:'Dieser Inhalt liegt schon im Schreibtisch; kein Duplikat angelegt.'};
    const datum=isDay(args.datum)?args.datum:today();
    const titel=String(args.titel||args.betreff||KINDS[art]).trim().slice(0,120);
    const name=(datum.replace(/-/g,'').slice(2)+' '+(art==='email'?'E-Mail ':'')+titel).slice(0,140)+'.md';
    const kopf=[['Art',KINDS[art]],['Datum',deDate(datum)],['Von',args.von],['An',args.an],['Betreff',args.betreff]].filter(([,v])=>v).map(([k,v])=>'**'+k+':** '+String(v).slice(0,300)).join('  \n');
    const text='# '+titel+'\n\n'+kopf+'\n\n---\n\n'+inhalt+'\n';
    const folderId=await folderFor(p,args.ordner||(art==='email'?'Emails':art==='protokoll'?'Protokolle':'Dokumente'));
    const path=userId+'/'+(p.client_key||p.id)+'/'+(folderId||'root')+'/'+now().getTime()+'-'+uuid().slice(0,6)+'-'+safeName(name);
    const bytes=new TextEncoder().encode(text);
    const up=await sb.storage.from('minds-work').upload(path,new Blob([bytes],{type:'text/markdown'}),{contentType:'text/markdown; charset=utf-8',upsert:false});
    if(up&&up.error)throw new Error('upload: '+(up.error.message||'failed'));
    let thema=null;if(args.thema){const {match}=matchTopic(await threadsOf(p.id),args.thema);thema=match}
    const ins=await sb.from('minds_work_files').insert({user_id:userId,project_id:p.id,folder_id:folderId,name,mime_type:'text/markdown',size_bytes:bytes.length,storage_path:path,source_kind:art==='email'?'email':'document',
      metadata:{content_sha256:hash,art,von:args.von||undefined,an:args.an||undefined,datum,betreff:args.betreff||undefined,source:'claude_connector',thema_id:thema?thema.id:undefined}}).select('id,name').single();
    if(ins.error){try{await sb.storage.from('minds-work').remove([path])}catch{}throw new Error('file_insert: '+(ins.error.message||'failed'))}
    return {abgelegt:true,datei:{id:'file:'+ins.data.id,name:ins.data.name},ordner:args.ordner||(art==='email'?'Emails':art==='protokoll'?'Protokolle':'Dokumente'),thema:thema?thema.title:undefined,
      hinweis:'Der Text wird in den nächsten Minuten erfasst und ist danach über search auffindbar.'};
  }

  // Proposed tasks and contradictions (nightly Akte-Pflege). Never re-proposes something Gari already discarded.
  async function proposeEntry(projectRef,{art,titel,details,datum,quelle,thema}={}){
    const p=await base.resolveProject(projectRef);
    const type=art==='aufgabe'?'commitment':art==='widerspruch'?'open_question':null;
    if(!type)throw new ToolError('art debe ser aufgabe o widerspruch.');
    const title=String(titel||'').trim().slice(0,240);if(!title)return null;
    const existing=must(await sb.from('minds_work_memory').select('title').eq('user_id',userId).eq('project_id',p.id).eq('memory_type',type).limit(500),'entries')||[];
    if(existing.some(r=>norm(r.title)===norm(title)))return {skipped:true,titel:title};
    let topic=null;if(thema){const {match}=matchTopic(await threadsOf(p.id),thema);topic=match}
    const row={user_id:userId,project_id:p.id,memory_type:type,title,body:String(details||'').slice(0,4000),status:'proposed',
      occurred_at:isDay(datum)?datum+'T12:00:00Z':null,
      metadata:{source:ACTOR.source,kind:art,quelle:quelle?String(quelle).slice(0,300):undefined,faellig:isDay(datum)?datum:undefined,thema_id:topic?topic.id:undefined,thema:topic?topic.title:undefined},
      provenance:[{kind:ACTOR.prov,thread_id:topic?topic.id:null,at:stamp()}]};
    const saved=must(await sb.from('minds_work_memory').insert(row).select('id,status').single(),'entry_insert');
    return {id:'memo:'+saved.id,titel:title,art,status:saved.status};
  }

  // Gari's own edited copy of a Projektakte skill, if he installed the pack and changed it in Window.
  async function personalSkill(slug){
    const r=await sb.from('minds_user_skills').select('instructions,version,enabled').eq('user_id',userId).eq('agent','isabella').eq('slug',String(slug||'')).maybeSingle();
    if(r.error||!r.data||r.data.enabled===false)return null;
    return r.data;
  }

  async function renameTopic({topic_id,titel}={}){
    const id=String(topic_id||'').replace(/^topic:/,''),t=String(titel||'').trim().slice(0,160);
    if(!id||!t)throw new ToolError('Indica topic_id y el nuevo título.');
    const thread=await base.threadById(id);
    must(await sb.rpc('minds_rename_work_thread',{p_thread_id:thread.id,p_title:t}),'rename_topic');
    return {umbenannt:{id:'topic:'+thread.id,von:thread.title,nach:t}};
  }

  return {openProject,openTopic,search,fetchItem,recordDecision,closeSession,updateProjectBrief,fileDocument,renameTopic,matchTopic,proposeEntry,personalSkill};
}
