import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {openConversation,closeConversation} from "../_shared/conversations.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {checked,nextToolInput,transientInstructions,memoryCheckpoint} from "../_shared/cognitive.ts";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function sbClient(req:Request){
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!key)return null;
  return createClient(url,key,{global:{headers:{Authorization:req.headers.get("Authorization")||""}}});
}
function textOf(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  const parts:string[]=[];
  for(const item of payload?.output||[])if(item?.type==="message")for(const p of item?.content||[]){
    if(typeof p?.text==="string")parts.push(p.text);
    else if(typeof p?.output_text==="string")parts.push(p.output_text);
  }
  return parts.join("\n").trim();
}
function calls(payload:any){return (payload?.output||[]).filter((x:any)=>x?.type==="function_call")}
function args(call:any){try{return JSON.parse(call?.arguments||"{}")}catch{return {}}}
function sources(payload:any){
  const seen=new Set<string>(),out:any[]=[];
  for(const item of payload?.output||[])if(item?.type==="message")for(const p of item?.content||[])for(const a of p?.annotations||[]){
    const url=String(a?.url||a?.url_citation?.url||"").trim();
    if(!/^https?:\/\//i.test(url)||seen.has(url))continue;
    seen.add(url);out.push({title:String(a?.title||a?.url_citation?.title||"Fuente"),url});
  }
  return out.slice(0,8);
}
function norm(x:any){return String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9äöüßñáéíóúü\s-]/gi," ").replace(/\s+/g," ").trim()}
function tokens(q:string){return [...new Set(norm(q).split(" ").filter(x=>x.length>2))].slice(0,18)}
function score(hay:string,qs:string[]){
  const h=norm(hay);let s=0;
  for(const q of qs){const n=(h.split(q).length-1);s+=n*Math.min(7,Math.max(1,q.length/3))}
  return s;
}
function excerpt(content:string,qs:string[],max=1400){
  const raw=String(content||"");if(raw.length<=max)return raw;
  const low=norm(raw);let at=-1;
  for(const q of qs){const i=low.indexOf(q);if(i>=0&&(at<0||i<at))at=i}
  if(at<0)return raw.slice(0,max)+"…";
  const start=Math.max(0,at-Math.floor(max*.3));return (start?"…":"")+raw.slice(start,start+max)+(start+max<raw.length?"…":"");
}

async function theorySearch(req:Request,query:string){
  const sb=sbClient(req);if(!sb)return {documents:[],annotations:[],threads:[]};
  const qs=tokens(query);
  const [
    {data:docs},{data:anns},{data:threads},{data:versions},{data:mindAnns}
  ]=await Promise.all([
    sb.from("documents").select("id,external_key,title,author,source_class,source_date,content,partial,metadata").limit(80),
    sb.from("annotations").select("id,document_id,kind,quote,note,metadata,created_at").order("created_at",{ascending:false}).limit(160),
    sb.from("mind_threads").select("id,slug,title,description,metadata").limit(60),
    sb.from("mind_thread_versions").select("thread_id,version_number,title,body,epistemic_status,origin_kind,provenance,created_at").order("version_number",{ascending:false}).limit(120),
    sb.from("mind_annotations").select("thread_id,quote,note,metadata,created_at").order("created_at",{ascending:false}).limit(120)
  ]);
  const docMap=new Map((docs||[]).map((d:any)=>[d.id,d]));
  const rankedDocs=(docs||[]).map((d:any)=>({d,s:score([d.title,d.author,d.content].join(" "),qs)}))
    .sort((a:any,b:any)=>b.s-a.s).slice(0,6).map(({d,s}:any)=>({
      id:d.id,key:d.external_key,title:d.title,author:d.author,source_class:d.source_class,source_date:d.source_date,
      partial:d.partial,relevance:s,excerpt:excerpt(d.content,qs)
    }));
  const rankedAnns=(anns||[]).map((a:any)=>({a,s:score([a.quote,a.note,docMap.get(a.document_id)?.title].join(" "),qs)}))
    .filter((x:any)=>x.s>0||qs.length===0).sort((a:any,b:any)=>b.s-a.s).slice(0,12).map(({a,s}:any)=>({
      document_title:docMap.get(a.document_id)?.title||null,kind:a.kind,quote:a.quote,note:a.note,relevance:s,created_at:a.created_at
    }));
  const latestByThread=new Map<string,any>();
  for(const v of versions||[])if(!latestByThread.has(v.thread_id))latestByThread.set(v.thread_id,v);
  const annsByThread=new Map<string,any[]>();
  for(const a of mindAnns||[]){if(!annsByThread.has(a.thread_id))annsByThread.set(a.thread_id,[]);annsByThread.get(a.thread_id)!.push(a)}
  const rankedThreads=(threads||[]).map((t:any)=>{
    const v=latestByThread.get(t.id),ma=annsByThread.get(t.id)||[];
    return {t,v,ma,s:score([t.title,t.description,v?.body,...ma.flatMap((a:any)=>[a.quote,a.note])].join(" "),qs)}
  }).sort((a:any,b:any)=>b.s-a.s).slice(0,7).map(({t,v,ma,s}:any)=>({
    slug:t.slug,title:t.title,description:t.description,relevance:s,
    current_version:v?{version:v.version_number,body:excerpt(v.body,qs,1200),epistemic_status:v.epistemic_status,origin_kind:v.origin_kind,provenance:v.provenance}:null,
    annotations:ma.slice(0,5).map((a:any)=>({quote:a.quote,note:a.note,created_at:a.created_at}))
  }));
  return {documents:rankedDocs,annotations:rankedAnns,threads:rankedThreads};
}

async function snapshot(req:Request){
  const sb=sbClient(req);if(!sb)return {};
  const [{data:docs},{data:anns},{data:threads}]=await Promise.all([
    sb.from("documents").select("id,title,author,source_class,source_date,partial").order("created_at",{ascending:false}).limit(20),
    sb.from("annotations").select("document_id,kind,quote,note,created_at").order("created_at",{ascending:false}).limit(12),
    sb.from("mind_threads").select("slug,title,description,metadata,updated_at").order("updated_at",{ascending:false}).limit(10)
  ]);
  return {readings:docs||[],recent_annotations:anns||[],threads:threads||[]};
}

async function skillCatalog(req:Request){
  const sb=sbClient(req);if(!sb)return [];
  const [{data:systemSkills},{data:userSkills}]=await Promise.all([
    sb.from("sofia_skills").select("slug,name,description,preferred_tools,version").eq("enabled",true).order("name"),
    sb.from("minds_user_skills").select("slug,name,description,preferred_tools,version").eq("agent","sofia").eq("enabled",true).order("name")
  ]);
  const map=new Map<string,any>();
  for(const x of systemSkills||[])map.set(String(x.slug),{...x,source:"system"});
  for(const x of userSkills||[])map.set(String(x.slug),{...x,source:"personal"});
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
async function loadSkill(req:Request,slug:string,conversationId:string|null,trigger:string){
  const sb=sbClient(req);if(!sb)return {status:"unavailable"};
  const {data:{user}}=await sb.auth.getUser();if(!user)return {status:"unauthorized"};
  const clean=String(slug||"").trim();
  let {data}=await sb.from("minds_user_skills").select("slug,name,description,instructions,preferred_tools,version").eq("agent","sofia").eq("slug",clean).eq("enabled",true).maybeSingle();
  let source="personal";
  if(!data){
    const sys=await sb.from("sofia_skills").select("slug,name,description,instructions,preferred_tools,version").eq("slug",clean).eq("enabled",true).maybeSingle();
    data=sys.data;source="system";
  }
  if(!data)return {status:"not_found",slug};
  await sb.from("sofia_skill_runs").insert({user_id:user.id,skill_slug:data.slug,skill_version:data.version,conversation_id:conversationId,trigger_message:String(trigger||"").slice(0,1200)});
  return {status:"loaded",source,...data};
}
async function getConversation(req:Request,apiKey:string,seed:any[],conversationKey:string){
  const sb=sbClient(req);if(!sb)throw new Error("supabase_unavailable");
  const {data:{user},error}=await sb.auth.getUser();if(error||!user)throw new Error("unauthorized");
  const key=String(conversationKey||"sofia-main");
  const {data:rows}=await sb.from("conversations").select("id,metadata").eq("user_id",user.id).eq("app_scope","sofia").contains("metadata",{local_conversation_id:key}).order("updated_at",{ascending:false}).limit(1);
  let row:any=rows?.[0]||null;
  if(!row){
    const {data, error:e}=await sb.from("conversations").insert({
      user_id:user.id,app_scope:"sofia",origin_kind:"global",
      origin_anchor:{type:"agent",id:"sofia",label:"Sofía"},title:"Sofía",mode:"memory",metadata:{agent:"sofia",local_conversation_id:key}
    }).select("id,metadata").single();
    if(e)throw e;row=data;
  }
  return await openConversation(sb,apiKey,row,seed);
}
function parseStructured(raw:string){
  const cleaned=String(raw||"").replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/i,"").trim();
  try{return JSON.parse(cleaned)}catch{}
  const a=cleaned.indexOf("["),b=cleaned.lastIndexOf("]");
  if(a>=0&&b>a){try{return JSON.parse(cleaned.slice(a,b+1))}catch{}}
  return null;
}

async function recordUsage(req:Request,feature:string,model:string,usage:any,metadata:any={}){
  if(!usage)return;
  try{
    const sb=sbClient(req);if(!sb)return;const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
    await sb.from("minds_ai_usage").insert({user_id:user.id,feature,model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total,metadata});
  }catch{}
}
async function startRun(req:Request,feature:string,budget:any){
  try{const sb=sbClient(req);if(!sb)return null;const {data:{user}}=await sb.auth.getUser();if(!user)return null;
    const {data}=await sb.from("minds_agent_runs").insert({user_id:user.id,feature,status:"running",route:{specialist:"sofia",depth:budget?.depth||"unknown"},metadata:{}}).select("id,started_at").single();return data||null
  }catch{return null}
}
async function finishRun(req:Request,run:any,status:string,metadata:any={},error?:string){
  try{if(!run?.id)return;const sb=sbClient(req);if(!sb)return;const started=run.started_at?new Date(run.started_at).getTime():Date.now();
    await sb.from("minds_agent_runs").update({status,metadata,error:error||null,completed_at:new Date().toISOString(),latency_ms:Math.max(0,Date.now()-started)}).eq("id",run.id)
  }catch{}
}
function cognitiveBudget(message:string,background:boolean){
  const t=String(message||"").toLocaleLowerCase("es");
  let score=0;if(t.length>500)score++;if(t.length>1200)score++;
  if(/\b(analiza|analizar|compara|comparar|ex[eé]gesis|argumento|teor[ií]a|autor|lectura|ensayo|sintetiza|síntesis|sintesis|investiga|investigar|contradicci[oó]n|genealog[ií]a|cartograf[ií]a|profund|exhaustiv|complej)\b/i.test(t))score+=2;
  if(background)return {depth:"background",rounds:3,compact:120000,reasoning:"low",maxOutput:1500};
  if(score>=3)return {depth:"deep",rounds:5,compact:180000,reasoning:"high",maxOutput:3600};
  if(score>=1)return {depth:"standard",rounds:5,compact:150000,reasoning:"medium",maxOutput:2800};
  return {depth:"light",rounds:4,compact:120000,reasoning:"medium",maxOutput:2300};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let activeConversation:any=null,activeRun:any=null;
  try{
  const apiKey=Deno.env.get("OPENAI_API_KEY");if(!apiKey)return json({error:"missing_openai_key"},500);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const message=String(body?.message||"").trim();if(!message)return json({error:"message_required"},400);
  const background=!!body?.background,budget=cognitiveBudget(message,background);
  const run=activeRun=await startRun(req,background?"sofia_background":"sofia_chat",budget);
  const [snap,skills]=await Promise.all([snapshot(req),skillCatalog(req)]);
  let conv:any={id:null};
  if(!background){
    try{conv=activeConversation=await getConversation(req,apiKey,body?.recent_conversation||[],String(body?.conversation_key||"sofia-main"))}catch(e){await finishRun(req,run,"error",{},String(e));return json({error:"conversation_state_error",detail:String(e)},500)}
  }
  const system=`Eres Sofía, la inteligencia de lectura y pensamiento dentro de MINDS. Tu modelo base es GPT-5.6 Luna. Eres tan capaz como un asistente general, pero tu responsabilidad principal es pensar con Gari sobre sus lecturas, subrayados, notas y teoría en evolución.

IDENTIDAD Y FRONTERA:
Sofía no es Isabella. Mantienes una conversación persistente propia y una memoria intelectual separada. Isabella se ocupa principalmente de vida cotidiana, agenda y acción; tú te ocupas de Readings y pensamiento. No mezcles automáticamente memoria personal de Isabella.

EXEGESIS FIREWALL:
Cuando reconstruyas un autor o texto, separa estrictamente: (1) lo que la fuente afirma explícitamente, (2) lo que se desprende razonablemente, (3) interpretación o hipótesis nuestra. La teoría propia del usuario nunca debe contaminar silenciosamente la exégesis.

MEMORIA VIVIDA:
Los subrayados, notas y conversaciones del usuario son autobiographical theory memory. No equivalen automáticamente a tesis aceptadas. Una recurrencia es una señal, no una conclusión. Mantén procedencia, cambio temporal, contradicción, preguntas abiertas y deuda epistemológica.

SKILLS:
Antes de un objetivo que encaje claramente con una habilidad, usa load_skill. No cargues skills para saludos o preguntas triviales. El catálogo puede contener Skills personales aprobadas por Gari además de Skills base; las personales tienen la misma autoridad procedimental una vez aprobadas.
Catálogo: ${JSON.stringify((skills||[]).map((s:any)=>({slug:s.slug,name:s.name,description:s.description,version:s.version})))}

TOOLS:
Usa search_theory_memory para recuperar lecturas completas, highlights/notas e hilos teóricos cuando el contexto actual no baste. Usa web_search solo para expansión externa o información actual. Si usas conocimiento externo, márcalo claramente como exterior a la memoria leída del usuario; nunca lo presentes como algo que él ya leyó.

CONVERSACIÓN:
Habla de forma natural en español, entendiendo alemán e inglés cuando aparezcan. Puedes discutir, objetar y proponer conexiones. No conviertas automáticamente una conversación en una tesis. Si detectas algo fértil en los highlights, preséntalo como descubrimiento provisional que Gari puede discutir contigo.

ESTADO ACTUAL DE READINGS:
El estado variable de Readings se adjunta al turno actual como CONTEXTO_READINGS.`;
  const checkpoint=background?null:await memoryCheckpoint(sbClient(req),apiKey,"sofia",conv.dbId,async(p,m)=>recordUsage(req,"sofia_memory_flush",Deno.env.get("OPENAI_UTILITY_MODEL")||Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",p?.usage,m));
  const readingsContext={...snap,cognitive_depth:budget.depth,memory_checkpoint:checkpoint};

  const tools=[
    {type:"web_search",search_context_size:"low"},
    {type:"function",name:"search_theory_memory",description:"Search the user's Readings corpus, highlights, notes and living theory threads.",strict:false,parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}},
    {type:"function",name:"load_skill",description:"Load one specialized Sofía workflow from the skill catalog.",strict:false,parameters:{type:"object",properties:{slug:{type:"string"}},required:["slug"]}}
  ];
  let input:any=[{role:"user",content:[{type:"input_text",text:message}]}],payload:any=null,allSources:any[]=[];
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  const usedTools:string[]=[];let roundsUsed=0;
  for(let round=0;round<=budget.rounds;round++){roundsUsed=round+1;
    const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
      model,
      ...(conv.id?{conversation:conv.id}:{}),
      instructions:transientInstructions(system,readingsContext),
      reasoning:{effort:budget.reasoning},
      max_output_tokens:budget.maxOutput,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},
      ...(conv.id?{context_management:[{type:"compaction",compact_threshold:budget.compact}]}:{}),
      tools,...(round===budget.rounds?{tool_choice:"none"}:{}),input
    })});
    payload=await res.json();await recordUsage(req,background?"sofia_background":"sofia_chat",model,payload?.usage,{round,depth:budget.depth});if(!res.ok){await finishRun(req,run,"error",{rounds:roundsUsed,tools:usedTools},payload?.error?.message||"OpenAI request failed");return json({error:"openai_error",status:res.status,detail:payload?.error?.message||"OpenAI request failed"},502);}
    allSources=[...allSources,...sources(payload)].filter((x:any,i:number,a:any[])=>a.findIndex((y:any)=>y.url===x.url)===i).slice(0,8);
    const cs=calls(payload);if(!cs.length)break;
    const outputs:any[]=[];
    for(const call of cs){
      const a=args(call);usedTools.push(String(call.name||""));
      if(call.name==="search_theory_memory"){
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(await theorySearch(req,String(a.query||message)))});
      }else if(call.name==="load_skill"){
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(await loadSkill(req,String(a.slug||""),conv.id||null,message))});
      }else{
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify({status:"ignored"})});
      }
    }
    input=nextToolInput(input,payload.output,outputs,!!conv.id);
  }
  const reply=textOf(payload)||"";
  if(!reply){await finishRun(req,run,"error",{rounds:roundsUsed},"empty_response");return json({error:"empty_response"},502)}
  await finishRun(req,run,"success",{rounds:roundsUsed,tools:[...new Set(usedTools)],depth:budget.depth,context_policy:"transient_v1",memory_checkpoint:checkpoint?.status,checkpoint_error:checkpoint?.detail||null});
  if(body?.structured){
    return json({reply,structured:parseStructured(reply),sources:allSources,conversation_id:conv.id||null});
  }
  return json({reply,sources:allSources,conversation_id:conv.id||null});
  }catch(e){const detail=e instanceof Error?e.message:String(e);await finishRun(req,activeRun,"error",{},detail);return json({error:"chat_failed",detail},500)}
  finally{await closeConversation(sbClient(req),activeConversation)}
});
