
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function extractText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  const out:string[]=[];for(const item of payload?.output||[]){if(item?.type!=="message")continue;for(const p of item?.content||[]){if(typeof p?.text==="string")out.push(p.text);else if(typeof p?.output_text==="string")out.push(p.output_text)}}return out.join("\n").trim();
}
function parse(raw:string){
  const t=String(raw||"").replace(/^\s*`{3}(?:json)?/i,"").replace(/`{3}\s*$/i,"").trim();
  try{const v=JSON.parse(t);return Array.isArray(v)?v:(Array.isArray(v?.items)?v.items:[])}catch{}
  const a=t.indexOf("["),b=t.lastIndexOf("]");if(a>=0&&b>a){try{const v=JSON.parse(t.slice(a,b+1));return Array.isArray(v)?v:[]}catch{}}
  return [];
}
function functionCalls(payload:any){return (payload?.output||[]).filter((x:any)=>x?.type==="function_call")}
function callArgs(call:any){try{return JSON.parse(call?.arguments||"{}")}catch{return {}}}
async function consultSofia(req:Request,query:string){
  try{
    const base=Deno.env.get("SUPABASE_URL")||"",auth=req.headers.get("Authorization")||"";
    let key=Deno.env.get("SUPABASE_ANON_KEY")||"";try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
    if(!base||!auth||!key||!query.trim())return {status:"unavailable"};
    const response=await fetch(base+"/functions/v1/sofia-chat",{method:"POST",headers:{"Authorization":auth,"apikey":key,"Content-Type":"application/json"},body:JSON.stringify({
      message:"Consulta interna para el generador de Ideas de MINDS. Examina Readings, highlights, notas y teoría del usuario y devuelve únicamente conexiones intelectuales pertinentes para esta posible línea de trabajo. No conviertas una semejanza superficial en una idea.\n\nConsulta: "+query,
      background:true,conversation_key:"ideas-sofia-bridge"
    })});
    const data=await response.json();if(!response.ok||data?.error)return {status:"error",detail:data?.detail||data?.error};
    return {status:"ok",reply:String(data?.reply||""),sources:Array.isArray(data?.sources)?data.sources:[]};
  }catch(e){return {status:"error",detail:String(e)}}
}
async function recordUsage(sb:any,userId:string,model:string,usage:any){
  if(!usage)return;const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
  try{await sb.from("minds_ai_usage").insert({user_id:userId,feature:"ideas_generation",model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total})}catch{}
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("Authorization")||"";if(!auth)return json({error:"unauthorized"},401);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"";let key=Deno.env.get("SUPABASE_ANON_KEY")||"";try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!url||!key||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await sb.auth.getUser();if(error||!user)return json({error:"unauthorized"},401);
  const c=body?.context||{};
  const context={
    current_date:c.current_date,timezone:c.timezone,
    today_events:(c.today_events||[]).slice(0,16),today_tasks:(c.today_tasks||[]).slice(0,24),
    undated_tasks:(c.undated_tasks||[]).slice(0,18),upcoming:(c.upcoming||[]).slice(0,30),
    memories:(c.memories||[]).slice(-36),taxonomy:c.taxonomy||{},
    recent_local_conversation:(c.recent_local_conversation||[]).slice(-16),
    preferences:c.preferences||{}
  };
  const prompt=[
    "CONTEXTO:\n"+JSON.stringify(context),
    "Genera máximo 3 propuestas para MINDS.",
    "Una Idea NO es una observación, recordatorio, consejo ni noticia. Debe ser una posibilidad concreta que todavía no existe y cuya magnitud justifique un trabajo persistente separado del chat.",
    "Cada Idea debe poder producir un artefacto real: documento, investigación, protocolo, análisis, sistema, experimento, imagen o conjunto de archivos. No propongas como Idea una tarea pequeña que Isabella resolvería directamente en el chat, como redactar un email, generar una sola imagen pedida explícitamente o contestar una pregunta.",
    "Prioriza propuestas que conecten contexto real del usuario y puedan avanzar de forma autónoma. Si una posible Idea toca lecturas, autores, highlights, notas o teoría, consulta a Sofía antes de decidir si merece emerger. Si es puramente operativa o personal, no la consultes. Isabella sigue siendo quien formula y produce la Idea; Sofía aporta contexto intelectual selectivamente. Si no hay ninguna suficientemente fuerte, devuelve [].",
    'Devuelve SOLO JSON válido: [{"kind":"idea"|"research_project"|"isabella_improvement","title":"...","body":"qué se propone construir o investigar","deliverable":"producto concreto","work_type":"document|research|system|analysis|experiment|image|mixed|other","why":"por qué merece convertirse en trabajo ahora","action_prompt":"","icon":""}].'
  ].join("\n\n");
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
  const tools=[{type:"function",name:"consult_sofia",description:"Consult Sofía only when evaluating an Idea whose value materially depends on the user's Readings, highlights, notes, authors or theory memory.",strict:false,parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}];
  let input:any=[{role:"user",content:[{type:"input_text",text:prompt}]}],payload:any=null;
  for(let round=0;round<3;round++){
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({
      model,instructions:"Eres Isabella generando Ideas para MINDS. Sé selectiva: el chat resuelve tareas pequeñas; Ideas solo contiene trabajos con profundidad suficiente para producir algo durable. Sofía es tu especialista intelectual y está disponible mediante consult_sofia cuando una propuesta dependa de Readings o teoría.",reasoning:{effort:"medium"},max_output_tokens:1800,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},tools,input
    })});
    payload=await response.json();await recordUsage(sb,user.id,model,payload?.usage);
    if(!response.ok)return json({error:"openai_error",detail:payload?.error?.message||"OpenAI request failed"},502);
    const calls=functionCalls(payload);if(!calls.length)break;
    const outputs:any[]=[];
    for(const call of calls){
      if(call.name==="consult_sofia"){
        const a=callArgs(call),result=await consultSofia(req,String(a.query||""));
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});
      }else outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify({status:"ignored"})});
    }
    input=outputs;
  }
  const items=parse(extractText(payload)).slice(0,3).map((x:any)=>({
    kind:String(x?.kind||"idea"),title:String(x?.title||"").trim(),body:String(x?.body||"").trim(),
    deliverable:String(x?.deliverable||"").trim(),work_type:String(x?.work_type||"other").trim(),
    why:String(x?.why||"").trim(),action_prompt:"",icon:""
  })).filter((x:any)=>x.title&&x.body&&x.deliverable);
  return json({items});
});
