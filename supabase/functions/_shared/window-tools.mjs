// Window connector · tool handlers.
// Every query runs with the signed-in owner's token, so Row Level Security is the boundary.
// Scope: projects, Work desktop (folders, files, extracted text), project memory, tasks,
// calendar and Work threads. Isabella's personal chat history and personal memories stay out.
export const TZ='Europe/Berlin';
const DAY=864e5;

export function localDay(date=new Date(),tz=TZ){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const g=t=>(p.find(x=>x.type===t)||{}).value||'';
  return g('year')+'-'+g('month')+'-'+g('day');
}
export function addDays(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const clip=(s,n)=>{const t=String(s||'');return t.length>n?t.slice(0,n)+'…':t};
const isDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!isNaN(Date.parse(String(s)+'T12:00:00Z'));

// A message the model can show Gari as-is.
export class ToolError extends Error{constructor(message){super(message);this.name='ToolError'}}
function must(res,label){
  if(res&&res.error)throw new Error(label+': '+(res.error.message||res.error.code||'query_failed'));
  return res?res.data:null;
}
function taskOut(t,names){
  return {id:t.id,title:t.title,due:t.due_date||null,start:t.start_date||null,done:!!t.completed_at,
    project:names.get(t.project_id)||null,status:t.work_status||null,priority:t.priority&&t.priority!=='normal'?t.priority:undefined,
    assignee:t.assignee||undefined,notes:t.notes?clip(t.notes,600):undefined};
}
const TASK_COLS='id,client_key,title,due_date,start_date,completed_at,archived_at,notes,project_id,work_status,priority,assignee,work_bucket_id,updated_at';

export function createWindowTools({sb,userId,now=()=>new Date(),uuid=()=>crypto.randomUUID(),tz=TZ}){
  if(!sb||!userId)throw new Error('window_tools_need_owner');
  const today=()=>localDay(now(),tz);

  async function projectList(){
    const rows=must(await sb.from('isabella_projects').select('id,client_key,name,archived').eq('user_id',userId).order('name',{ascending:true}),'projects')||[];
    return rows.filter(p=>!p.archived).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es',{sensitivity:'base'}));
  }
  async function projectNames(){return new Map((await projectList()).map(p=>[p.id,p.name]))}
  async function resolveProject(ref){
    const r=String(ref||'').trim();
    if(!r)throw new ToolError('Indica el proyecto (nombre o id).');
    const list=await projectList();
    const exact=list.find(p=>p.id===r||p.client_key===r||norm(p.name)===norm(r));
    if(exact)return exact;
    const partial=list.filter(p=>norm(p.name).includes(norm(r))||norm(r).includes(norm(p.name)));
    if(partial.length===1)return partial[0];
    if(partial.length>1)throw new ToolError('Varios proyectos encajan con "'+r+'": '+partial.map(p=>p.name).join(', ')+'.');
    throw new ToolError('No encuentro el proyecto "'+r+'". Proyectos en Window: '+(list.map(p=>p.name).join(', ')||'ninguno')+'.');
  }

  async function listProjects(){
    const list=await projectList();
    return {projects:list.map(p=>({id:p.id,name:p.name}))};
  }

  async function listTasks({project,range='open',query,limit=80}={}){
    const day=today(),names=await projectNames();
    const p=project?await resolveProject(project):null;
    const cap=Math.min(Math.max(Number(limit)||80,1),200);
    let q=sb.from('isabella_tasks').select(TASK_COLS).eq('user_id',userId).is('archived_at',null);
    if(p)q=q.eq('project_id',p.id);
    if(query)q=q.ilike('title','%'+String(query).replace(/[%_]/g,' ').trim()+'%');
    if(range==='done_recent')q=q.not('completed_at','is',null).gte('completed_at',new Date(now().getTime()-14*DAY).toISOString()).order('completed_at',{ascending:false});
    else{
      q=q.is('completed_at',null);
      if(range==='today')q=q.or('due_date.lte.'+day+',start_date.lte.'+day);
      else if(range==='week')q=q.or('due_date.lte.'+addDays(day,7)+',start_date.lte.'+addDays(day,7));
      q=q.order('due_date',{ascending:true,nullsFirst:false});
    }
    let rows=must(await q.limit(cap),'tasks')||[];
    // A multi-day task belongs to every day from its start until its due date.
    if(range==='today')rows=rows.filter(t=>(t.due_date&&t.due_date<=day)||(t.start_date&&t.start_date<=day&&(!t.due_date||t.due_date>=day)));
    if(range==='week')rows=rows.filter(t=>(t.due_date&&t.due_date<=addDays(day,7))||(t.start_date&&t.start_date<=addDays(day,7)&&(!t.due_date||t.due_date>=day)));
    return {today:day,range,project:p?p.name:null,count:rows.length,tasks:rows.map(t=>({...taskOut(t,names),overdue:!t.completed_at&&t.due_date&&t.due_date<day||undefined}))};
  }

  async function listEvents({from,to}={}){
    const start=isDay(from)?from:today(),end=isDay(to)?to:addDays(start,7);
    if(end<start)throw new ToolError('La fecha final es anterior a la inicial.');
    const fromIso=new Date(start+'T00:00:00Z').getTime()-2*3600e3,toIso=new Date(addDays(end,1)+'T00:00:00Z').getTime();
    const names=await projectNames();
    const rows=must(await sb.from('isabella_events').select('id,title,starts_at,ends_at,all_day,notes,project_id,recurrence')
      .eq('user_id',userId).lt('starts_at',new Date(toIso).toISOString()).gte('ends_at',new Date(fromIso).toISOString())
      .order('starts_at',{ascending:true}).limit(200),'events')||[];
    const fmt=iso=>new Intl.DateTimeFormat('es-ES',{timeZone:tz,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
    return {from:start,to:end,timezone:tz,events:rows.map(e=>({id:e.id,title:e.title,starts:e.all_day?localDay(new Date(e.starts_at),tz):fmt(e.starts_at),
      ends:e.all_day?undefined:fmt(e.ends_at),all_day:!!e.all_day||undefined,project:names.get(e.project_id)||undefined,
      recurring:e.recurrence&&Object.keys(e.recurrence).length?true:undefined,notes:e.notes?clip(e.notes,400):undefined}))};
  }

  async function overview(){
    const [tasks,events,projects,threads]=await Promise.all([
      listTasks({range:'today',limit:60}),
      listEvents({from:today(),to:addDays(today(),1)}),
      listProjects(),
      sb.from('minds_work_threads').select('id,title,project_id,last_activity_at,updated_at').eq('user_id',userId).eq('status','active').order('updated_at',{ascending:false}).limit(12)
    ]);
    const names=new Map(projects.projects.map(p=>[p.id,p.name]));
    return {today:tasks.today,timezone:tz,tasks_today_and_overdue:tasks.tasks,events_today_and_tomorrow:events.events,projects:projects.projects,
      recent_threads:(must(threads,'threads')||[]).map(t=>({id:t.id,title:t.title,project:names.get(t.project_id)||null,last_activity:t.last_activity_at||t.updated_at}))};
  }

  async function projectContext({project}={}){
    const p=await resolveProject(project),names=new Map([[p.id,p.name]]);
    const [buckets,tasks,folders,files,people,memory,claims,threads]=await Promise.all([
      sb.from('minds_work_buckets').select('id,name,sort_order,archived').eq('user_id',userId).eq('project_id',p.id).order('sort_order',{ascending:true}),
      sb.from('isabella_tasks').select(TASK_COLS).eq('user_id',userId).eq('project_id',p.id).is('archived_at',null).is('completed_at',null).order('due_date',{ascending:true,nullsFirst:false}).limit(150),
      sb.from('minds_work_folders').select('id,parent_id,name,sort_order').eq('user_id',userId).eq('project_id',p.id).order('sort_order',{ascending:true}).limit(300),
      sb.from('minds_work_files').select('id,folder_id,name,mime_type,size_bytes,source_kind,index_status,created_at').eq('user_id',userId).eq('project_id',p.id).order('created_at',{ascending:false}).limit(400),
      sb.from('minds_work_project_people').select('person_id').eq('user_id',userId).eq('project_id',p.id),
      sb.from('minds_work_memory').select('memory_type,title,body,status,occurred_at').eq('user_id',userId).eq('project_id',p.id).in('status',['confirmed','proposed']).order('updated_at',{ascending:false}).limit(40),
      sb.from('minds_work_claims').select('claim_type,statement,status,provenance_class,discipline,updated_at').eq('user_id',userId).eq('project_id',p.id).in('status',['confirmed','proposed','disputed']).order('updated_at',{ascending:false}).limit(40),
      sb.from('minds_work_threads').select('id,title,summary,last_activity_at,updated_at').eq('user_id',userId).eq('project_id',p.id).eq('status','active').order('updated_at',{ascending:false}).limit(30)
    ]);
    const bucketRows=(must(buckets,'buckets')||[]).filter(b=>!b.archived),bucketName=new Map(bucketRows.map(b=>[b.id,b.name]));
    const folderRows=must(folders,'folders')||[],folderPath=new Map();
    const byId=new Map(folderRows.map(f=>[f.id,f]));
    const pathOf=id=>{if(!id)return '';if(folderPath.has(id))return folderPath.get(id);const f=byId.get(id);if(!f)return '';
      const parts=[];let cur=f,guard=0;while(cur&&guard++<12){parts.unshift(cur.name);cur=byId.get(cur.parent_id)}const v=parts.join(' / ');folderPath.set(id,v);return v};
    const personIds=(must(people,'people')||[]).map(x=>x.person_id);
    const personRows=personIds.length?must(await sb.from('isabella_people').select('id,name,relationship').eq('user_id',userId).in('id',personIds),'people_names')||[]:[];
    return {project:{id:p.id,name:p.name},today:today(),
      buckets:bucketRows.map(b=>b.name),
      open_tasks:(must(tasks,'tasks')||[]).map(t=>({...taskOut(t,names),bucket:bucketName.get(t.work_bucket_id)||undefined,project:undefined})),
      desktop:{folders:folderRows.map(f=>pathOf(f.id)),
        files:(must(files,'files')||[]).map(f=>({id:f.id,name:f.name,folder:pathOf(f.folder_id)||undefined,kind:f.source_kind,
          text:f.index_status==='indexed'?'disponible':f.index_status,size_kb:Math.round(Number(f.size_bytes||0)/1024),added:String(f.created_at||'').slice(0,10)}))},
      people:personRows.map(x=>({name:x.name,role:x.relationship||undefined})),
      project_memory:(must(memory,'memory')||[]).map(m=>({type:m.memory_type,title:m.title,body:clip(m.body,500),status:m.status})),
      claims:(must(claims,'claims')||[]).map(c=>({type:c.claim_type,statement:clip(c.statement,500),status:c.status,source:c.provenance_class})),
      threads:(must(threads,'threads')||[]).map(t=>({id:t.id,title:t.title,summary:t.summary?clip(t.summary,400):undefined,last_activity:t.last_activity_at||t.updated_at}))};
  }

  async function searchFiles({project,query,limit=12}={}){
    const q=String(query||'').trim();
    if(q.length<2)throw new ToolError('Escribe al menos dos caracteres para buscar.');
    const p=project?await resolveProject(project):null,cap=Math.min(Math.max(Number(limit)||12,1),30);
    let seg=sb.from('minds_work_source_segments').select('file_id,project_id,segment_no,locator,content').eq('user_id',userId)
      .textSearch('content',q,{config:'simple',type:'websearch'});
    if(p)seg=seg.eq('project_id',p.id);
    let byName=sb.from('minds_work_files').select('id,name,project_id,index_status').eq('user_id',userId).ilike('name','%'+q.replace(/[%_]/g,' ')+'%');
    if(p)byName=byName.eq('project_id',p.id);
    const [segments,named]=await Promise.all([seg.limit(cap*3),byName.limit(cap)]);
    const segRows=must(segments,'search')||[],nameRows=must(named,'search_names')||[];
    const ids=[...new Set(segRows.map(s=>s.file_id))];
    const files=ids.length?must(await sb.from('minds_work_files').select('id,name,project_id').eq('user_id',userId).in('id',ids),'search_files')||[]:[];
    const fileName=new Map(files.map(f=>[f.id,f.name])),names=await projectNames();
    const terms=norm(q).split(/\s+/).filter(t=>t.length>2);
    const snippet=text=>{const t=String(text||''),n=norm(t);let at=-1;for(const term of terms){at=n.indexOf(term);if(at>=0)break}
      const s=Math.max(0,(at<0?0:at)-220);return (s>0?'…':'')+t.slice(s,s+520).replace(/\s+/g,' ')+(s+520<t.length?'…':'')};
    const seen=new Set(),hits=[];
    for(const s of segRows){const key=s.file_id+':'+s.segment_no;if(seen.has(key))continue;seen.add(key);
      hits.push({file_id:s.file_id,file:fileName.get(s.file_id)||'Archivo',project:names.get(s.project_id)||null,segment:s.segment_no,where:s.locator&&Object.keys(s.locator).length?s.locator:undefined,snippet:snippet(s.content)});
      if(hits.length>=cap)break}
    return {query:q,project:p?p.name:null,matches:hits,files_named_like_query:nameRows.map(f=>({file_id:f.id,file:f.name,project:names.get(f.project_id)||null,text:f.index_status==='indexed'?'disponible':f.index_status}))};
  }

  async function readFile({file_id,from_segment=0,max_chars=30000}={}){
    const id=String(file_id||'').trim();
    if(!id)throw new ToolError('Indica file_id (lo devuelven project_context o search_files).');
    const file=must(await sb.from('minds_work_files').select('id,name,project_id,mime_type,source_kind,index_status,created_at').eq('user_id',userId).eq('id',id).maybeSingle(),'file');
    if(!file)throw new ToolError('No encuentro ese archivo en Window.');
    const rows=must(await sb.from('minds_work_source_segments').select('source_version,segment_no,segment_kind,locator,content,created_at').eq('user_id',userId).eq('file_id',id).order('created_at',{ascending:false}).limit(500),'segments')||[];
    const names=await projectNames();
    const head={file:{id:file.id,name:file.name,project:names.get(file.project_id)||null,kind:file.source_kind,mime:file.mime_type}};
    if(!rows.length)return {...head,text:null,note:'Este archivo no tiene texto extraído todavía (estado: '+file.index_status+').'};
    const version=rows[0].source_version;
    const segs=rows.filter(r=>r.source_version===version).sort((a,b)=>a.segment_no-b.segment_no);
    const cap=Math.min(Math.max(Number(max_chars)||30000,2000),60000),start=Math.max(0,Number(from_segment)||0);
    let text='',last=start-1;
    for(const s of segs){if(s.segment_no<start)continue;const loc=s.locator&&s.locator.page?'[p. '+s.locator.page+']\n':'';
      const piece=(text?'\n\n':'')+loc+s.content;if(text&&text.length+piece.length>cap)break;text+=piece;last=s.segment_no}
    const more=segs.some(s=>s.segment_no>last);
    return {...head,segments_total:segs.length,from_segment:start,to_segment:last,text,more:more?{next_from_segment:last+1}:undefined};
  }

  async function listThreads({project}={}){
    const p=await resolveProject(project);
    const rows=must(await sb.from('minds_work_threads').select('id,title,summary,status,last_activity_at,updated_at').eq('user_id',userId).eq('project_id',p.id).eq('status','active').order('updated_at',{ascending:false}).limit(60),'threads')||[];
    return {project:p.name,threads:rows.map(t=>({id:t.id,title:t.title,summary:t.summary?clip(t.summary,400):undefined,last_activity:t.last_activity_at||t.updated_at}))};
  }

  async function threadById(id){
    const t=must(await sb.from('minds_work_threads').select('id,title,summary,status,project_id,conversation_id').eq('user_id',userId).eq('id',String(id||'')).maybeSingle(),'thread');
    if(!t)throw new ToolError('No encuentro ese thread en Window.');
    return t;
  }
  async function readThread({thread_id,limit=40}={}){
    const t=await threadById(thread_id),names=await projectNames();
    if(!t.conversation_id)return {thread:{id:t.id,title:t.title,project:names.get(t.project_id)||null,summary:t.summary||undefined},messages:[]};
    const cap=Math.min(Math.max(Number(limit)||40,1),120);
    const rows=must(await sb.from('conversation_messages').select('role,content,created_at,metadata').eq('user_id',userId).eq('conversation_id',t.conversation_id)
      .in('role',['user','assistant']).order('created_at',{ascending:false}).limit(cap),'thread_messages')||[];
    return {thread:{id:t.id,title:t.title,project:names.get(t.project_id)||null,summary:t.summary||undefined},
      messages:rows.reverse().map(m=>({role:m.role,author:m.role==='user'?'Gari':(m.metadata&&m.metadata.source==='claude_connector'?'Claude':'Isabella'),content:clip(m.content,6000),at:m.created_at}))};
  }

  async function createTask({title,project,due_date,start_date,notes}={}){
    const t=String(title||'').trim();
    if(!t)throw new ToolError('La tarea necesita un título.');
    if(t.length>300)throw new ToolError('El título es demasiado largo (máximo 300 caracteres).');
    if(due_date&&!isDay(due_date))throw new ToolError('due_date debe tener formato AAAA-MM-DD.');
    if(start_date&&!isDay(start_date))throw new ToolError('start_date debe tener formato AAAA-MM-DD.');
    if(start_date&&due_date&&start_date>due_date)throw new ToolError('La fecha de inicio es posterior a la fecha límite.');
    const p=project?await resolveProject(project):null,id=uuid(),stamp=now().toISOString();
    const row={id,client_key:id,user_id:userId,title:t,due_date:due_date||null,start_date:start_date||null,notes:String(notes||'').slice(0,4000),
      project_id:p?p.id:null,metadata:{source:'claude_connector'},created_at:stamp,updated_at:stamp};
    const saved=must(await sb.from('isabella_tasks').insert(row).select('id,title,due_date,start_date,project_id').single(),'create_task');
    return {created:{id:saved.id,title:saved.title,due:saved.due_date,start:saved.start_date,project:p?p.name:null},note:'Aparece en Window la próxima vez que se sincronice.'};
  }

  async function updateTask({task_id,title,due_date,start_date,notes,done}={}){
    const id=String(task_id||'').trim();
    if(!id)throw new ToolError('Indica task_id.');
    const current=must(await sb.from('isabella_tasks').select(TASK_COLS).eq('user_id',userId).eq('id',id).maybeSingle(),'task');
    if(!current)throw new ToolError('No encuentro esa tarea en Window.');
    const patch={updated_at:now().toISOString()};
    if(title!==undefined){const t=String(title).trim();if(!t)throw new ToolError('El título no puede quedar vacío.');patch.title=t.slice(0,300)}
    if(due_date!==undefined){if(due_date!==null&&due_date!==''&&!isDay(due_date))throw new ToolError('due_date debe tener formato AAAA-MM-DD.');patch.due_date=due_date||null}
    if(start_date!==undefined){if(start_date!==null&&start_date!==''&&!isDay(start_date))throw new ToolError('start_date debe tener formato AAAA-MM-DD.');patch.start_date=start_date||null}
    const s=patch.start_date!==undefined?patch.start_date:current.start_date,d=patch.due_date!==undefined?patch.due_date:current.due_date;
    if(s&&d&&s>d)throw new ToolError('La fecha de inicio quedaría después de la fecha límite.');
    if(notes!==undefined)patch.notes=String(notes||'').slice(0,4000);
    if(done!==undefined)patch.completed_at=done?(current.completed_at||now().toISOString()):null;
    if(Object.keys(patch).length===1)throw new ToolError('No hay cambios que aplicar.');
    const saved=must(await sb.from('isabella_tasks').update(patch).eq('user_id',userId).eq('id',id).select(TASK_COLS).single(),'update_task');
    return {updated:taskOut(saved,await projectNames())};
  }

  async function saveToThread({project,thread_id,thread_title,entries,summary}={}){
    const list=Array.isArray(entries)?entries.filter(e=>e&&String(e.content||'').trim()):[];
    if(!list.length&&!String(summary||'').trim())throw new ToolError('No hay nada que guardar: añade entries o summary.');
    if(list.length>40)throw new ToolError('Guarda como máximo 40 mensajes por llamada.');
    let thread;
    if(thread_id)thread=await threadById(thread_id);
    else{
      const p=await resolveProject(project),title=String(thread_title||'').trim().slice(0,160);
      if(!title)throw new ToolError('Indica thread_id o thread_title.');
      const existing=must(await sb.from('minds_work_threads').select('id,title,summary,status,project_id,conversation_id').eq('user_id',userId).eq('project_id',p.id).eq('status','active').limit(80),'threads')||[];
      thread=existing.find(t=>norm(t.title)===norm(title));
      if(!thread){
        const created=must(await sb.from('minds_work_threads').insert({user_id:userId,project_id:p.id,title,sort_order:0,metadata:{source:'claude_connector'}}).select('id').single(),'create_thread');
        thread=await threadById(created.id);
      }
    }
    let conversationId=thread.conversation_id;
    if(!conversationId){conversationId=String(must(await sb.rpc('minds_ensure_work_thread_conversation',{p_thread_id:thread.id}),'thread_conversation')||'');}
    if(!conversationId)throw new Error('thread_conversation_unavailable');
    const base=now().getTime();
    const rows=list.map((e,i)=>({user_id:userId,conversation_id:conversationId,client_key:uuid(),role:e.role==='user'?'user':'assistant',
      content:String(e.content).slice(0,20000),provisional:false,citations:[],
      created_at:new Date(base+i).toISOString(),
      metadata:{app:'work_thread',work_thread_id:thread.id,project_id:thread.project_id,source:'claude_connector'}}));
    if(rows.length)must(await sb.from('conversation_messages').insert(rows),'save_messages');
    const patch={last_activity_at:now().toISOString(),updated_at:now().toISOString()};
    if(String(summary||'').trim())patch.summary=String(summary).trim().slice(0,4000);
    must(await sb.from('minds_work_threads').update(patch).eq('user_id',userId).eq('id',thread.id),'thread_touch');
    try{await sb.from('conversations').update({updated_at:now().toISOString()}).eq('id',conversationId)}catch{}
    const names=await projectNames();
    return {saved:{thread_id:thread.id,thread:thread.title,project:names.get(thread.project_id)||null,messages:rows.length,summary_updated:!!patch.summary}};
  }

  return {listProjects,overview,projectContext,searchFiles,readFile,listTasks,listEvents,listThreads,readThread,createTask,updateTask,saveToThread,resolveProject};
}
