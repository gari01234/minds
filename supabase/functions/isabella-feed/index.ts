
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
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
function parseItems(raw:string){
  const text=String(raw||"").trim().replace(/^\s*`{3}(?:json)?/i,"").replace(/`{3}\s*$/i,"").trim();
  try{
    const value=JSON.parse(text),items=Array.isArray(value)?value:Array.isArray(value?.items)?value.items:[];
    return items.filter((x:any)=>x&&typeof x==="object");
  }catch{}
  const a=text.indexOf("["),b=text.lastIndexOf("]");
  if(a>=0&&b>a){try{const value=JSON.parse(text.slice(a,b+1));return Array.isArray(value)?value:[]}catch{}}
  return [];
}
function normalizeSignal(x:any){
  const source=String(x?.source_url||"").trim();
  return {
    section:"now",
    kind:String(x?.kind||"signal").trim()||"signal",
    title:String(x?.title||"").trim(),
    body:String(x?.body||"").trim(),
    action_prompt:"",
    icon:"",
    details:[],
    source_title:String(x?.source_title||"").trim(),
    source_url:/^https?:\/\//i.test(source)?source:"",
    entities:Array.isArray(x?.entities)?x.entities.slice(0,4):[],
    why:String(x?.why||"").trim()
  };
}
function dedupe(items:any[]){
  const seen=new Set<string>(),out:any[]=[];
  for(const x of items){
    const key=(String(x?.source_url||"").trim()||String(x?.title||"").trim()).toLocaleLowerCase();
    if(!key||seen.has(key))continue;
    seen.add(key);out.push(x);
  }
  return out;
}
function feedbackKey(sourceUrl:any,title:any){
  const source=String(sourceUrl||"").trim().toLocaleLowerCase();
  if(source)return "url:"+source;
  const name=String(title||"").trim().toLocaleLowerCase();
  return name?"title:"+name:"";
}
function explicitFeedbackMap(rows:any[]){
  const map=new Map<string,string>();
  for(const row of rows||[]){
    const action=String(row?.action||"");
    if(!["liked","not_relevant","dismissed"].includes(action))continue;
    const key=feedbackKey(row?.metadata?.source_url,row?.title);
    if(key&&!map.has(key))map.set(key,action);
  }
  return map;
}
function feedbackForItem(item:any,map:Map<string,string>){
  const bySource=feedbackKey(item?.source_url,"");
  if(bySource&&map.has(bySource))return map.get(bySource)||"";
  const byTitle=feedbackKey("",item?.title);
  return byTitle?(map.get(byTitle)||""):"";
}
function weatherLabel(code:number){
  if(code===0)return "Despejado";
  if([1,2].includes(code))return "Parcialmente nublado";
  if(code===3)return "Nublado";
  if([45,48].includes(code))return "Niebla";
  if([51,53,55,56,57].includes(code))return "Llovizna";
  if([61,63,65,66,67].includes(code))return "Lluvia";
  if([71,73,75,77].includes(code))return "Nieve";
  if([80,81,82].includes(code))return "Chubascos";
  if([85,86].includes(code))return "Chubascos de nieve";
  if([95,96,99].includes(code))return "Tormenta";
  return "Condiciones variables";
}
function roundTemp(v:any){const n=Number(v);return Number.isFinite(n)?Math.round(n):null}
async function weatherCard(location:string){
  const query=String(location||"").trim();if(!query)return null;
  try{
    const geo=await fetch("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(query)+"&count=1&language=es&format=json");
    if(!geo.ok)return null;
    const g=await geo.json(),place=g?.results?.[0];if(!place)return null;
    const params=new URLSearchParams({
      latitude:String(place.latitude),longitude:String(place.longitude),
      current:"temperature_2m,apparent_temperature,weather_code,precipitation",
      daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone:"auto",forecast_days:"7"
    });
    const res=await fetch("https://api.open-meteo.com/v1/forecast?"+params.toString());if(!res.ok)return null;
    const data=await res.json(),daily=data?.daily||{},current=data?.current||{};
    const max=roundTemp(daily?.temperature_2m_max?.[0]),min=roundTemp(daily?.temperature_2m_min?.[0]),now=roundTemp(current?.temperature_2m);
    const label=weatherLabel(Number(current?.weather_code??daily?.weather_code?.[0]??-1));
    const details=(daily?.time||[]).slice(0,7).map((date:string,i:number)=>{
      const d=new Date(date+"T12:00:00Z");
      const day=d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric"});
      const hi=roundTemp(daily?.temperature_2m_max?.[i]),lo=roundTemp(daily?.temperature_2m_min?.[i]),rain=Number(daily?.precipitation_probability_max?.[i]);
      return {label:day,summary:[weatherLabel(Number(daily?.weather_code?.[i]??-1)),hi!=null&&lo!=null?hi+"° / "+lo+"°":"",Number.isFinite(rain)?"lluvia "+Math.round(rain)+"%":""].filter(Boolean).join(" · ")};
    });
    const placeName=[place.name,place.admin1].filter(Boolean).filter((x:any,i:number,a:any[])=>a.indexOf(x)===i).join(", ");
    return {
      section:"weather",kind:"weather",title:"Clima · "+(placeName||query),
      body:[label,now!=null?now+" °C ahora":"",max!=null&&min!=null?"máx. "+max+"° / mín. "+min+"°":""].filter(Boolean).join(" · "),
      action_prompt:"",icon:"",details,source_title:"",source_url:"",entities:[],why:"",
      weather_location:placeName||query
    };
  }catch{return null}
}
async function recordUsage(sb:any,userId:string,model:string,usage:any){
  if(!usage)return;const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
  try{await sb.from("minds_ai_usage").insert({user_id:userId,feature:"situational_feed",model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total})}catch{}
}
async function generate(apiKey:string,prompt:string){
  const started=Date.now();
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",
      instructions:"Eres el analista situacional del Feed de MINDS. No produces un news feed ni exploras contenido por intereses. Detectas pocas señales personales que realmente merecen atención ahora. Puedes verificar el mundo exterior solo cuando una dependencia externa concreta de un proyecto, compromiso, viaje, investigación o seguimiento activo pueda haber cambiado. Devuelve exclusivamente JSON válido, sin markdown.",
      reasoning:{effort:"medium"},
      max_output_tokens:2200,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},
      tools:[{type:"web_search",search_context_size:"low"}],
      input:[{role:"user",content:[{type:"input_text",text:prompt}]}]
    })
  });
  const payload=await response.json();
  console.log(JSON.stringify({event:"situational_feed",status:response.status,ms:Date.now()-started}));
  if(!response.ok)throw new Error(payload?.error?.message||"OpenAI request failed");
  return {items:parseItems(extractText(payload)),usage:payload?.usage,model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna"};
}
function buildPrompt(context:any,currentTitles:string[],feedback:any[],modelClaims:any[],readyResearch:any[]){
  return [
    "Construye el briefing situacional de MINDS para este momento.",
    "CONTEXTO PERSONAL ACTUAL:\n"+JSON.stringify({
      current_date:context.current_date,
      timezone:context.timezone,
      today_events:context.today_events||[],
      today_tasks:context.today_tasks||[],
      undated_tasks:context.undated_tasks||[],
      upcoming:(context.upcoming||[]).slice(0,24),
      recent_local_conversation:(context.recent_local_conversation||[]).slice(-16),
      pending_intent:context.pending_intent||null,
      memories:(context.memories||[]).slice(-32),
      taxonomy:context.taxonomy||{},
      preferences:{feed_instructions:context?.preferences?.feed_instructions||""},
      personal_model_claims:modelClaims||[],
      ready_research:(readyResearch||[]).slice(0,5)
    }),
    "SEÑALES QUE YA ESTÁN EN PANTALLA:\n"+JSON.stringify(currentTitles),
    "FEEDBACK EXPLÍCITO RECIENTE:\n"+JSON.stringify(feedback),
    "REGLA CENTRAL: esto NO es un news feed, NO es descubrimiento de contenido y NO debe llenar tiempo libre. No incluyas algo simplemente porque coincide con intereses del usuario.",
    "Genera entre 0 y 5 señales. Una señal existe solo si un hecho, cambio, convergencia, dependencia, vencimiento, contradicción o concentración dentro de la situación real del usuario merece ser visto ahora. No repitas el calendario ni una lista de tareas: interpreta relaciones entre sus elementos.",
    "Las tarjetas deben ser indicativas, no generativas: describen lo que está ocurriendo. Evita recomendaciones genéricas como 'conviene organizarse' o 'deberías'. Las propuestas de cosas nuevas pertenecen a Ideas, no al Feed.",
    "WEB ADAPTATIVA: no busques noticias generales ni contenido por afinidad. Usa web_search únicamente después de identificar una dependencia externa concreta dentro de algo ya activo —por ejemplo una institución, viaje, normativa, disponibilidad, evento, entrega, seguimiento o investigación— cuyo estado actual pueda cambiar materialmente la situación. Si consultas la web, verifica el cambio y aporta source_title y source_url. Si no existe esa dependencia, no busques nada.",
    "Actualizar el Feed significa REEVALUAR, no producir novedad. Si una señal anterior sigue siendo la más relevante, puede repetirse. Si nada merece atención, devuelve [].",
    'Devuelve exclusivamente un array JSON. Cada elemento: {"kind":"signal"|"project"|"follow_up"|"attention"|"reading"|"external_change"|"other","title":"...","body":"1-2 frases descriptivas y concretas","why":"por qué merece atención ahora","source_title":"","source_url":"","entities":[{"name":"...","type":"project|person|institution|topic|other","focus":"..."}]}.'
  ].join("\n\n");
}
async function runJob(opts:any){
  const {sb,userId,jobId,generationId,signature,context,currentTitles,apiKey}=opts,started=Date.now();
  try{
    await sb.from("minds_feed_jobs").update({status:"running",started_at:new Date().toISOString(),error:null}).eq("id",jobId);
    const [{data:feedbackRows},{data:modelRows},{data:researchRows},weather]=await Promise.all([
      sb.from("minds_surface_feedback").select("action,title,metadata,created_at").eq("user_id",userId).in("action",["liked","not_relevant","dismissed"]).order("created_at",{ascending:false}).limit(60),
      sb.from("isabella_model_claims").select("claim_type,claim,status,confidence,last_seen_at").eq("user_id",userId).in("status",["confirmed","hypothesis"]).order("confidence",{ascending:false}).limit(24),
      sb.from("isabella_research_queue").select("id,title,question,rationale,result,completed_at").eq("user_id",userId).eq("status","ready").order("priority",{ascending:false}).limit(5),
      weatherCard(String(context?.preferences?.weather_location||""))
    ]);
    let raw:any[]=[];
    try{const generated=await generate(apiKey,buildPrompt(context,currentTitles,feedbackRows||[],modelRows||[],researchRows||[]));raw=generated.items;await recordUsage(sb,userId,generated.model,generated.usage)}
    catch(e){console.error(JSON.stringify({event:"situational_generation_error",generation_id:generationId,detail:String(e)}))}
    const feedbackMap=explicitFeedbackMap(feedbackRows||[]);
    const signals=dedupe(raw.map(normalizeSignal).filter((x:any)=>x.title&&x.body)).filter((x:any)=>{
      if(x.kind==="external_change"&&!x.source_url)return false;
      const action=feedbackForItem(x,feedbackMap);
      return action!=="not_relevant"&&action!=="dismissed";
    }).slice(0,5);
    const items=[...(weather?[weather]:[]),...signals];
    if(!items.length)items.push({section:"now",kind:"clear",title:"Sin señales nuevas",body:"Ahora mismo no hay nada que merezca interrumpirte.",action_prompt:"",icon:"",details:[],source_title:"",source_url:"",entities:[],why:""});
    const rows=items.map((x:any)=>{
      const action=x.kind==="weather"||x.kind==="clear"?"":feedbackForItem(x,feedbackMap);
      return {
        user_id:userId,surface:"feed",agent:"isabella",title:x.title,body:x.body,action_prompt:null,icon:null,
        user_feedback:action==="liked"?"liked":null,
        metadata:{
          source:"situational_feed",section:x.section||"now",kind:x.kind||"signal",surface_version:11,preference_signature:signature,generation_id:generationId,
          details:x.details||[],entities:x.entities||[],detail:"",image_url:null,image_alt:null,
          source_title:x.source_title||null,source_url:x.source_url||null,why:x.why||null,weather_location:x.weather_location||null
        },
        lifecycle_state:"new",expires_at:new Date(Date.now()+12*60*60*1000).toISOString()
      };
    });
    const {data:inserted,error:insertError}=await sb.from("minds_surface_items").insert(rows).select("id,title,metadata,generated_at");
    if(insertError)throw insertError;
    const firstGenerated=(inserted||[]).map((x:any)=>x.generated_at).sort()[0];
    if(firstGenerated){
      await sb.from("minds_surface_items").update({status:"dismissed"})
        .eq("surface","feed").eq("agent","isabella").eq("status","active")
        .contains("metadata",{source:"situational_feed"})
        .eq("lifecycle_state","new").is("user_feedback",null).lt("generated_at",firstGenerated);
    }
    const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
    await sb.from("minds_surface_items").update({status:"dismissed"})
      .eq("surface","feed").eq("agent","isabella").eq("status","active")
      .contains("metadata",{source:"situational_feed"}).lt("generated_at",cutoff);
    await sb.from("minds_feed_jobs").update({status:"succeeded",completed_at:new Date().toISOString(),error:null}).eq("id",jobId);
    console.log(JSON.stringify({event:"situational_feed_done",generation_id:generationId,count:rows.length,signals:signals.length,weather:!!weather,ms:Date.now()-started}));
  }catch(e){
    const error=String((e as any)?.message||e);
    console.error(JSON.stringify({event:"situational_feed_failed",generation_id:generationId,error}));
    await sb.from("minds_feed_jobs").update({status:"failed",error:error.slice(0,1500),completed_at:new Date().toISOString()}).eq("id",jobId);
  }
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const authHeader=req.headers.get("Authorization")||"";if(!authHeader)return json({error:"unauthorized"},401);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"";
  let publishable=Deno.env.get("SUPABASE_ANON_KEY")||"";
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");publishable=keys?.default||publishable}catch{}
  if(!url||!publishable)return json({error:"server_not_configured"},503);
  const sb=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await sb.auth.getUser();if(userError||!user)return json({error:"unauthorized"},401);
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!apiKey)return json({error:"server_not_configured"},503);
  const context=body?.context&&typeof body.context==="object"?body.context:{};
  const force=!!body?.force,signature=String(body?.preference_signature||"").slice(0,120);
  const currentTitles=Array.isArray(body?.current_titles)?body.current_titles.map((x:any)=>String(x||"").trim()).filter(Boolean).slice(0,12):[];
  const cutoff=new Date(Date.now()-2*60*1000).toISOString();
  const {data:existing}=await sb.from("minds_feed_jobs").select("id,generation_id,status,created_at")
    .eq("user_id",user.id).in("status",["queued","running"]).gte("created_at",cutoff).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(existing)return json({accepted:true,reused:true,generation_id:existing.generation_id,status:existing.status},202);
  const generationId=crypto.randomUUID();
  const {data:job,error:jobError}=await sb.from("minds_feed_jobs").insert({
    user_id:user.id,generation_id:generationId,preference_signature:signature||null,force,status:"queued"
  }).select("id").single();
  if(jobError||!job)return json({error:"feed_job_create_failed",detail:jobError?.message||"No job"},500);
  EdgeRuntime.waitUntil(runJob({sb,userId:user.id,jobId:job.id,generationId,signature,context,currentTitles,apiKey}));
  console.log(JSON.stringify({event:"situational_feed_accepted",generation_id:generationId,force}));
  return json({accepted:true,generation_id:generationId,status:"queued"},202);
});
