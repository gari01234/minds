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
    if(!url||!auth||!key)return;const sb=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
    await sb.from("minds_ai_usage").insert({user_id:user.id,feature:"feed_detail",model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total});
  }catch{}
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const apiKey=Deno.env.get("OPENAI_API_KEY");if(!apiKey)return json({error:"openai_not_configured"},503);
  const item=body?.item||{},context=body?.context&&typeof body.context==="object"?body.context:{};
  const question=String(body?.question||"").trim(),history=Array.isArray(body?.history)?body.history.slice(-12):[];
  const sourceUrl=String(item?.source_url||item?.metadata?.source_url||"").trim();
  const sourceTitle=String(item?.source_title||item?.metadata?.source_title||"").trim();
  const transcript=history.map((m:any)=>(m?.role==="user"?"USUARIO":"MINDS")+": "+String(m?.text||m?.content||"")).join("\n\n");
  const external=/^https?:\/\//i.test(sourceUrl);
  const task=question
    ? "Responde de forma sustantiva a la pregunta concreta. Usa primero el contexto personal aportado. Si la pregunta depende de información externa actual, verifícala con web_search. No repitas el resumen salvo cuando sea necesario."
    : external
      ? "Amplía esta señal en 250-450 palabras con contexto verificable: qué cambió, antecedentes, por qué afecta al contexto activo del usuario y qué conviene observar. Aporta información nueva respecto del resumen."
      : "Amplía esta señal personal en 220-400 palabras usando el contexto real aportado: explica qué elementos concretos se relacionan, por qué la convergencia merece atención ahora y qué cambia en la lectura de la situación. No conviertas la ampliación en consejo genérico. No inventes datos que no estén en el contexto.";
  const prompt=[
    "TÍTULO: "+String(item?.title||""),
    "RESUMEN: "+String(item?.body||""),
    "POR QUÉ EMERGIÓ: "+String(item?.why||item?.metadata?.why||""),
    external?"FUENTE EXTERNA: "+sourceTitle+" — "+sourceUrl:"",
    "CONTEXTO PERSONAL DISPONIBLE:\n"+JSON.stringify(context),
    transcript?"HILO DE ESTA SEÑAL:\n"+transcript:"",
    question?"PREGUNTA: "+question:"",
    task,
    "Distingue hechos de inferencias. Si el contexto no basta para una afirmación, dilo de forma breve en lugar de rellenar el hueco. Escribe en español claro."
  ].filter(Boolean).join("\n\n");
  const started=Date.now();
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",
      instructions:"Eres el analista de detalle del Feed situacional de MINDS. Tu función es profundizar una señal real del contexto del usuario, no convertirla en contenido editorial ni inventar contexto.",
      reasoning:{effort:"medium"},
      max_output_tokens:question?1400:1800,
      prompt_cache_options:{mode:"implicit",ttl:"30m"},
      ...(external?{tools:[{type:"web_search",search_context_size:"low"}]}:{}),
      input:[{role:"user",content:[{type:"input_text",text:prompt}]}]
    })
  });
  const payload=await response.json();
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";await recordUsage(req,model,payload?.usage);
  console.log(JSON.stringify({event:"feed_signal_detail",status:response.status,ms:Date.now()-started,question:!!question,external}));
  if(!response.ok)return json({error:"openai_error",detail:payload?.error?.message||"OpenAI request failed"},502);
  const reply=extractText(payload);if(!reply)return json({error:"empty_reply"},502);
  return json({reply,sources:extractSources(payload)});
});
