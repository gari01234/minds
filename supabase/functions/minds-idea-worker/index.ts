import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function extractText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  const out:string[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      if(typeof part?.text==="string")out.push(part.text);
      if(typeof part?.output_text==="string")out.push(part.output_text);
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
        seen.add(url);out.push({title:String(ann?.title||ann?.url_citation?.title||"Fuente").trim()||"Fuente",url});
      }
    }
  }
  return out.slice(0,8);
}
async function recordUsage(req:Request,model:string,usage:any){
  if(!usage)return;
  try{
    const url=Deno.env.get("SUPABASE_URL")||"",auth=req.headers.get("Authorization")||"";let key=Deno.env.get("SUPABASE_ANON_KEY")||"";
    try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
    if(!url||!auth||!key)return;
    const sb=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
    await sb.from("minds_ai_usage").insert({user_id:user.id,feature:"idea_worker",model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total});
  }catch{}
}
function functionCalls(payload:any){return (payload?.output||[]).filter((x:any)=>x?.type==="function_call")}
function callArgs(call:any){try{return JSON.parse(call?.arguments||"{}")}catch{return {}}}
async function consultSofia(req:Request,query:string){
  try{
    const base=Deno.env.get("SUPABASE_URL")||"",auth=req.headers.get("Authorization")||"";
    let key=Deno.env.get("SUPABASE_ANON_KEY")||"";try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
    if(!base||!auth||!key||!query.trim())return {status:"unavailable"};
    const response=await fetch(base+"/functions/v1/sofia-chat",{method:"POST",headers:{"Authorization":auth,"apikey":key,"Content-Type":"application/json"},body:JSON.stringify({
      message:"Consulta interna de Isabella durante un trabajo activo de MINDS. Recupera de Readings, highlights, notas y teoría únicamente el contexto intelectual que pueda mejorar este artefacto. Distingue memoria leída de conocimiento externo y conserva matices o contradicciones relevantes.\n\nConsulta: "+query,
      background:true,conversation_key:"idea-worker-sofia-bridge"
    })});
    const data=await response.json();if(!response.ok||data?.error)return {status:"error",detail:data?.detail||data?.error};
    return {status:"ok",reply:String(data?.reply||""),sources:Array.isArray(data?.sources)?data.sources:[]};
  }catch(e){return {status:"error",detail:String(e)}}
}
function workBudget(workspace:any,message:string){
  const t=(String(workspace?.brief||"")+" "+String(workspace?.why||"")+" "+String(message||"")).toLocaleLowerCase("es");
  const deep=/\b(teor[ií]a|lectura|autor|investigaci[oó]n|ensayo|an[aá]lisis|sistema|protocolo|documento|compar|estrategia|arquitectura|complej|profund|exhaustiv)\b/i.test(t);
  return deep?{rounds:5,reasoning:"high",maxOutput:5600}:{rounds:4,reasoning:"medium",maxOutput:4600};
}
function parseObject(raw:string){
  const clean=String(raw||"").replace(/^\s*`{3}(?:json)?/i,"").replace(/`{3}\s*$/i,"").trim();
  try{return JSON.parse(clean)}catch{}
  const a=clean.indexOf("{"),b=clean.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(clean.slice(a,b+1))}catch{}}
  return {reply:clean,artifact:null};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const apiKey=Deno.env.get("OPENAI_API_KEY");if(!apiKey)return json({error:"openai_not_configured"},503);
  const workspace=body?.workspace||{},context=body?.context&&typeof body.context==="object"?body.context:{};
  const message=String(body?.message||"").trim();if(!message)return json({error:"message_required"},400);
  const history=Array.isArray(body?.history)?body.history.slice(-16):[];
  const transcript=history.map((m:any)=>(m?.role==="user"?"USUARIO":"MINDS")+": "+String(m?.content||m?.text||"")).join("\n\n");
  const currentArtifact=String(workspace?.artifact_content||"").trim();
  const prompt=[
    "TRABAJO ACTIVO DE MINDS",
    "Título: "+String(workspace?.title||"Trabajo"),
    "Brief: "+String(workspace?.brief||""),
    "Por qué surgió: "+String(workspace?.why||""),
    "CONTEXTO PERSONAL Y DE PROYECTOS DISPONIBLE:\n"+JSON.stringify(context),
    currentArtifact?"ARTEFACTO ACTUAL:\n"+currentArtifact:"",
    transcript?"HISTORIAL DEL TRABAJO:\n"+transcript:"",
    "NUEVO MENSAJE DEL USUARIO:\n"+message,
    "Tu prioridad es PRODUCIR. Una idea aceptada ya no es una sugerencia: es un trabajo activo. Avanza el artefacto todo lo posible en este turno. Investiga con web_search cuando sea necesario. Si el trabajo toca lecturas, autores, highlights, notas o teoría, consulta selectivamente a Sofía para incorporar la memoria intelectual pertinente en vez de reconstruirla desde cero. Si existe información suficiente para crear una primera versión, créala ahora.",
    "Haz como máximo una pregunta cuando falte una decisión que realmente bloquee el siguiente avance. No conviertas el trabajo en una conversación interminable ni repitas el brief.",
    'Devuelve EXCLUSIVAMENTE JSON válido: {"reply":"qué avanzaste o la única pregunta bloqueante","artifact":null o {"title":"título del artefacto","format":"markdown","content":"contenido COMPLETO actualizado"},"file_request":null o {"kind":"image|docx|pdf","title":"...","instruction":"..."}}. Si modificas un artefacto textual existente, devuelve siempre su versión completa. Si el usuario pide explícitamente Word/PDF, o el producto final debe ser un archivo de ese tipo, devuelve file_request y usa artifact.content como contenido del archivo. Si el producto es visual, devuelve file_request kind=image con una instrucción visual precisa; no intentes representar una imagen como markdown.'
  ].filter(Boolean).join("\n\n");
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",budget=workBudget(workspace,message);
  const tools:any[]=[
    {type:"web_search",search_context_size:"medium"},
    {type:"function",name:"consult_sofia",description:"Consult Sofía when this active work materially depends on the user's Readings, highlights, notes, authors or evolving theory. Do not use for purely operational work.",strict:false,parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}
  ];
  let input:any=[{role:"user",content:[{type:"input_text",text:prompt}]}],payload:any=null,allSources:any[]=[];
  for(let round=0;round<budget.rounds;round++){
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,
        instructions:"Eres Isabella produciendo un trabajo real de MINDS. Tu éxito se mide por el progreso del artefacto, no por la cantidad de conversación. Mantén el alcance, usa todo el contexto pertinente, consulta selectivamente a Sofía cuando el trabajo dependa de la memoria intelectual del usuario, investiga cuando haga falta y no declares acciones externas que no realizaste.",
        reasoning:{effort:budget.reasoning},
        max_output_tokens:budget.maxOutput,
        prompt_cache_options:{mode:"implicit",ttl:"30m"},
        tools,input
      })
    });
    payload=await response.json();await recordUsage(req,model,payload?.usage);
    if(!response.ok)return json({error:"openai_error",detail:payload?.error?.message||"OpenAI request failed"},502);
    allSources=[...allSources,...extractSources(payload)].filter((x:any,i:number,a:any[])=>a.findIndex((y:any)=>y.url===x.url)===i).slice(0,12);
    const calls=functionCalls(payload);if(!calls.length)break;
    const outputs:any[]=[];
    for(const call of calls){
      if(call.name==="consult_sofia"){
        const a=callArgs(call),result=await consultSofia(req,String(a.query||message));
        outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});
      }else outputs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify({status:"ignored"})});
    }
    input=outputs;
  }
  const parsed=parseObject(extractText(payload));
  return json({
    reply:String(parsed?.reply||"").trim()||"He avanzado el trabajo.",
    artifact:parsed?.artifact&&String(parsed.artifact.content||"").trim()?{
      title:String(parsed.artifact.title||workspace?.title||"Artefacto").trim(),
      format:"markdown",content:String(parsed.artifact.content||"")
    }:null,
    file_request:parsed?.file_request&&["image","docx","pdf"].includes(String(parsed.file_request.kind||""))?{
      kind:String(parsed.file_request.kind),title:String(parsed.file_request.title||workspace?.title||"Artefacto").trim(),
      instruction:String(parsed.file_request.instruction||"").trim()
    }:null,
    sources:allSources
  });
});
