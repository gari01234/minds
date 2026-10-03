
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
}
function extractText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  const out:string[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      if(typeof part?.text==="string")out.push(part.text);
      else if(typeof part?.output_text==="string")out.push(part.output_text);
    }
  }
  return out.join("\n").trim();
}
function extractSources(payload:any){
  const seen=new Set<string>(),out:any[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      for(const ann of part?.annotations||[]){
        const url=String(ann?.url||ann?.url_citation?.url||"").trim();
        if(!/^https?:\/\//i.test(url)||seen.has(url))continue;
        seen.add(url);out.push({title:String(ann?.title||ann?.url_citation?.title||"Fuente"),url});
      }
    }
  }
  return out.slice(0,8);
}
function parseJson(raw:string){
  const t=String(raw||"").trim().replace(/^\s*\x60{3}(?:json)?/i,"").replace(/\x60{3}\s*$/i,"").trim();
  try{return JSON.parse(t)}catch{}
  const a=t.indexOf("{"),b=t.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch{}}
  return null;
}
async function recordUsage(sb:any,userId:string,feature:string,model:string,usage:any){
  if(!usage)return;const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
  try{await sb.from("minds_ai_usage").insert({user_id:userId,feature,model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total})}catch{}
}
async function discover(apiKey:string,context:any,sb:any,userId:string){
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",
      instructions:"Eres el módulo de reflexión de Isabella. Decide si existe UNA investigación externa de alto valor que valga la pena hacer en segundo plano para este usuario. No generes trabajo por generar. No investigues salud, religión, política personal, sexualidad, finanzas privadas ni otros datos sensibles. Devuelve exclusivamente JSON.",
      reasoning:{effort:"low"},
      max_output_tokens:650,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},
      input:[{role:"user",content:[{type:"input_text",text:
        "Contexto actual:\n"+JSON.stringify(context)+"\n\n"+
        'Devuelve null si no existe una investigación suficientemente valiosa. Si existe, devuelve {"title":"título breve","question":"pregunta investigable externamente","rationale":"por qué puede ayudar ahora","priority":0.0}. Prioriza proyectos activos, intereses confirmados, entidades seguidas, preguntas recurrentes o una conexión sorprendente con evidencia. No dupliques investigaciones recientes.'
      }]}]
    })
  });
  const payload=await response.json();
  await recordUsage(sb,userId,"research_discovery",Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",payload?.usage);
  if(!response.ok)throw new Error(payload?.error?.message||"discover_failed");
  const raw=extractText(payload);
  if(/^null$/i.test(raw))return null;
  const obj=parseJson(raw);
  if(!obj?.title||!obj?.question)return null;
  return {
    title:String(obj.title).slice(0,180),
    question:String(obj.question).slice(0,1200),
    rationale:String(obj.rationale||"").slice(0,1200),
    priority:Math.max(0,Math.min(1,Number(obj.priority??0.6)))
  };
}
async function research(apiKey:string,row:any,sb:any){
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",
      instructions:"Investiga con rigor para Isabella. El resultado será una señal personal dentro de MINDS, no un ensayo. Distingue hechos de interpretación, evita exageraciones y usa fuentes verificables.",
      reasoning:{effort:"medium"},
      max_output_tokens:1800,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},
      tools:[{type:"web_search",search_context_size:"medium"}],
      input:[{role:"user",content:[{type:"input_text",text:
        "Pregunta: "+row.question+"\n"+
        "Razón: "+String(row.rationale||"")+"\n\n"+
        "Investiga la pregunta. Devuelve un resumen claro de 250–450 palabras con lo más relevante, por qué importa y qué conviene observar después. No inventes datos."
      }]}]
    })
  });
  const payload=await response.json();
  await recordUsage(sb,row.user_id,"research",Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",payload?.usage);
  if(!response.ok)throw new Error(payload?.error?.message||"research_failed");
  return {summary:extractText(payload),sources:extractSources(payload)};
}
async function runResearch(sb:any,apiKey:string,row:any){
  try{
    const result=await research(apiKey,row,sb);
    await sb.from("isabella_research_queue").update({
      status:"ready",
      result:{summary:result.summary,sources:result.sources,generated_at:new Date().toISOString()},
      completed_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",row.id);
    console.log(JSON.stringify({event:"research_ready",id:row.id,title:row.title}));
  }catch(e){
    await sb.from("isabella_research_queue").update({
      status:"dismissed",
      result:{error:String(e)},
      completed_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",row.id);
    console.error(JSON.stringify({event:"research_failed",id:row.id,error:String(e)}));
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!auth)return json({error:"unauthorized"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  let publishable=Deno.env.get("SUPABASE_ANON_KEY")||"";
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");publishable=keys?.default||publishable}catch{}
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!publishable||!apiKey)return json({error:"server_not_configured"},503);

  const sb=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError||!user)return json({error:"unauthorized"},401);

  const twelveHoursAgo=new Date(Date.now()-12*3600e3).toISOString();
  const {data:recent}=await sb.from("isabella_research_queue")
    .select("id,title,question,rationale,status,created_at")
    .eq("user_id",user.id)
    .gte("created_at",twelveHoursAgo)
    .order("created_at",{ascending:false})
    .limit(6);
  const active=(recent||[]).find((x:any)=>["queued","running"].includes(x.status));
  if(active)return json({accepted:true,reused:true,id:active.id,status:active.status},202);
  if((recent||[]).length)return json({accepted:false,skipped:true,reason:"cadence"},200);

  const now=new Date(),today=now.toISOString().slice(0,10),future=new Date(Date.now()+14*86400e3).toISOString().slice(0,10);
  const [{data:claims},{data:memories},{data:tasks},{data:events},{data:feedback},{data:feedPref},{data:olderResearch}]=await Promise.all([
    sb.from("isabella_model_claims").select("claim_type,claim,status,source_type,last_seen_at").eq("user_id",user.id).eq("status","confirmed").order("last_seen_at",{ascending:false}).limit(30),
    sb.from("isabella_memories").select("kind,content,confidence,updated_at").eq("user_id",user.id).eq("status","active").order("updated_at",{ascending:false}).limit(25),
    sb.from("isabella_tasks").select("title,due_date,completed_at,archived_at,notes").eq("user_id",user.id).gte("due_date",today).lte("due_date",future).is("archived_at",null).order("due_date",{ascending:true}).limit(30),
    sb.from("isabella_events").select("title,starts_at,ends_at,notes").eq("user_id",user.id).gte("starts_at",now.toISOString()).lte("starts_at",new Date(Date.now()+14*86400e3).toISOString()).order("starts_at",{ascending:true}).limit(25),
    sb.from("minds_surface_feedback").select("action,title,metadata,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30),
    sb.from("isabella_preferences").select("value").eq("user_id",user.id).eq("preference_key","feed").maybeSingle(),
    sb.from("isabella_research_queue").select("title,question,rationale,status,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(12)
  ]);

  const context={
    date:today,
    model_claims:claims||[],
    memories:memories||[],
    upcoming_tasks:tasks||[],
    upcoming_events:events||[],
    feed_feedback:feedback||[],
    feed_preferences:feedPref?.value||{},
    recent_research:olderResearch||[]
  };

  let candidate:any=null;
  try{candidate=await discover(apiKey,context,sb,user.id)}catch(e){return json({error:"discovery_failed",detail:String(e)},502)}
  if(!candidate)return json({accepted:false,skipped:true,reason:"no_high_value_question"},200);

  const {data:row,error}=await sb.from("isabella_research_queue").insert({
    user_id:user.id,
    title:candidate.title,
    question:candidate.question,
    rationale:candidate.rationale,
    status:"running",
    priority:candidate.priority,
    updated_at:new Date().toISOString()
  }).select("*").single();
  if(error||!row)return json({error:"queue_insert_failed",detail:error?.message||"no row"},500);

  EdgeRuntime.waitUntil(runResearch(sb,apiKey,row));
  return json({accepted:true,id:row.id,status:"running",title:row.title},202);
});
