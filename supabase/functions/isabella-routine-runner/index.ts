import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {checked} from "../_shared/cognitive.ts";

function json(data: unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
function extractText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  const parts:string[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const c of item?.content||[]){
      if(typeof c?.text==="string")parts.push(c.text);
      if(typeof c?.output_text==="string")parts.push(c.output_text);
    }
  }
  return parts.join("\n").trim();
}
function extractSources(payload:any){
  const seen=new Set<string>(),out:any[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      for(const ann of part?.annotations||[]){
        const url=String(ann?.url||ann?.url_citation?.url||"").trim();
        if(!/^https?:\/\//i.test(url)||seen.has(url))continue;
        seen.add(url);
        out.push({title:String(ann?.title||ann?.url_citation?.title||"Fuente").trim(),url});
      }
    }
  }
  return out.slice(0,8);
}
function localDateISO(tz:string,date=new Date()){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDaysISO(iso:string,days:number){
  const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}

async function startRun(sb:any,userId:string,routine:any){
  try{const {data}=await sb.from("minds_agent_runs").insert({user_id:userId,feature:"routine",run_key:String(routine?.id||""),status:"running",route:{kind:String(routine?.schedule?.kind||"")},metadata:{title:String(routine?.title||"")}}).select("id,started_at").single();return data||null}catch{return null}
}
async function finishRun(sb:any,run:any,status:string,metadata:any={},error?:string){
  try{if(!run?.id)return;const started=run.started_at?new Date(run.started_at).getTime():Date.now();await sb.from("minds_agent_runs").update({status,metadata,error:error||null,completed_at:new Date().toISOString(),latency_ms:Math.max(0,Date.now()-started)}).eq("id",run.id)}catch{}
}
async function recordUsage(sb:any,userId:string,model:string,usage:any){
  if(!usage)return;const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
  try{await sb.from("minds_ai_usage").insert({user_id:userId,feature:"routine",model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total})}catch{}
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:secretRow,error:secretErr}=await sb.from("isabella_runtime_secrets").select("value").eq("key","routine_runner").maybeSingle();
  if(secretErr||!secretRow?.value||String(body?.secret||"")!==String(secretRow.value))return json({error:"unauthorized"},401);

  const {data:routines,error:claimErr}=await sb.rpc("claim_due_isabella_routines",{p_limit:20});
  if(claimErr)return json({error:"claim_failed",detail:claimErr.message},500);
  const results:any[]=[];

  for(const routine of routines||[]){
    const agentRun=await startRun(sb,routine.user_id,routine);
    const deliveryId=routine.metadata?.delivery_id;
    const attentionDigest=Boolean(routine?.metadata?.attention_digest)||/\b(resumen diario|briefing|morning brief)\b/i.test(String(routine?.title||"")+" "+String(routine?.instruction||""));
    let attentionEventIds:string[]=[];
    let phase="claimed";
    try{
      if(!deliveryId)throw new Error("missing_delivery_id");
      if(!routine.metadata?.delivery_output){
      phase="context";
      const tz=String(routine.timezone||"Europe/Berlin");
      const today=localDateISO(tz),until=addDaysISO(today,7);
      const now=new Date(),eventsFrom=new Date(now.getTime()-6*3600e3).toISOString(),eventsTo=new Date(now.getTime()+8*86400e3).toISOString();

      const contextQueries=await Promise.all([
        sb.from("isabella_events").select("title,starts_at,ends_at,all_day,notes").eq("user_id",routine.user_id).gte("starts_at",eventsFrom).lte("starts_at",eventsTo).order("starts_at",{ascending:true}).limit(40),
        sb.from("isabella_tasks").select("title,due_date,completed_at,archived_at,reminder_time,notes").eq("user_id",routine.user_id).gte("due_date",today).lte("due_date",until).is("archived_at",null).order("due_date",{ascending:true}).limit(50),
        sb.from("isabella_memories").select("kind,content,updated_at").eq("user_id",routine.user_id).eq("status","active").order("updated_at",{ascending:false}).limit(16),
        sb.from("conversations").select("id").eq("user_id",routine.user_id).eq("app_scope","isabella").order("updated_at",{ascending:false}).limit(1),
        sb.from("isabella_preferences").select("value").eq("user_id",routine.user_id).eq("preference_key","feed").maybeSingle(),
        sb.from("isabella_model_claims").select("claim_type,claim,status,confidence").eq("user_id",routine.user_id).in("status",["confirmed","hypothesis"]).order("confidence",{ascending:false}).limit(12),
        attentionDigest?sb.from("minds_attention_events").select("id,title,body,urgency,reason,reason_code,source_type,event_type,created_at").eq("user_id",routine.user_id).eq("route","briefing").eq("status","pending").order("created_at",{ascending:true}).limit(12):Promise.resolve({data:[],error:null})
      ]);

      const [events,tasks,memories,convs,feedPref,modelClaims,attentionQ]=contextQueries.map((q,i)=>checked(q,"routine_context_"+i));
      const attentionItems=(attentionQ||[]).sort((a:any,b:any)=>({urgent:0,attention:1,info:2}[a.urgency]??3)-({urgent:0,attention:1,info:2}[b.urgency]??3)||String(a.created_at).localeCompare(String(b.created_at))).slice(0,8);
      attentionEventIds=attentionItems.map((x:any)=>String(x.id));
      let recent:any[]=[];
      const conversationId=convs?.[0]?.id||null;
      if(conversationId){
        const msgsQ=await sb.from("conversation_messages").select("role,content,created_at").eq("user_id",routine.user_id).eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(12);
        recent=(checked(msgsQ,"routine_messages")||[]).reverse();
      }

      const localNow=new Intl.DateTimeFormat("es-ES",{timeZone:tz,dateStyle:"full",timeStyle:"short"}).format(now);
      const system=`Eres Isabella, la asistente personal de Gari, ejecutando una rutina que él configuró explícitamente. El resultado se insertará como un mensaje proactivo en su chat personal. Mantén la misma voz cercana, natural y precisa de Isabella. No menciones cron, scheduler, backend ni que estás ejecutando una función. Tampoco expongas términos internos de MINDS como Mission, Attention Economy, briefing route, workspace, checkpoint o event_type: tradúcelos a qué ocurrió, si hace falta una decisión y qué debe hacer Gari. Distingue claramente hechos confirmados, cosas que estás comprobando e inferencias todavía inciertas. No inventes información. Usa web_search solo si la instrucción requiere información actual externa. No crees ni modifiques tareas, eventos o rutinas desde esta ejecución.`;
      const prompt=`RUTINA: ${routine.title}
INSTRUCCIÓN: ${routine.instruction}
HORA LOCAL ACTUAL: ${localNow}

CONTEXTO DE AGENDA:
Eventos próximos: ${JSON.stringify(events||[])}
Tareas próximas: ${JSON.stringify(tasks||[])}

MEMORIA RECIENTE:
${JSON.stringify(memories||[])}

MODELO PERSONAL ACTIVO:
${JSON.stringify(modelClaims||[])}

PREFERENCIAS DEL FEED Y CLIMA:
${JSON.stringify(feedPref?.value||{})}

CONVERSACIÓN RECIENTE:
${JSON.stringify(recent)}

COSAS QUE DECIDISTE NO INTERRUMPIR ANTES:
${JSON.stringify(attentionItems)}
Si esta lista contiene elementos, intégralos en el briefing solo una vez y en lenguaje natural. Estas señales ya fueron clasificadas como suficientemente importantes para el briefing pero no para interrumpir antes. Prioriza las que requieren una decisión, un fallo operativo o un trabajo ya terminado. Si una señal ya queda completamente cubierta por la agenda anterior, no la repitas de forma redundante.

Si la rutina pide clima, usa weatherLocation solo si está configurado en las preferencias anteriores. Si está vacío, no inventes una ubicación: omite el clima o menciona muy brevemente que falta configurar el lugar. Si la rutina pide noticias, usa web_search y selecciona pocas noticias de alto valor en vez de una lista genérica.

Genera únicamente el mensaje que Isabella debe enviar ahora como resultado de esta rutina.`;

      phase="generating";
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",
          instructions:system,
          reasoning:{effort:"low"},
          max_output_tokens:1000,
          prompt_cache_options:{mode:"implicit",ttl:"30m"},
          tools:[{type:"web_search",search_context_size:"low"}],
          input:[{role:"user",content:[{type:"input_text",text:prompt}]}]
        })
      });
      const payload=await response.json();
      await recordUsage(sb,routine.user_id,Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",payload?.usage);
      if(!response.ok)throw new Error(payload?.error?.message||"OpenAI request failed");
      const message=extractText(payload);
      if(!message)throw new Error("empty_response");
      const sources=extractSources(payload);

      phase="generated";
      checked(await sb.from("minds_routine_deliveries").update({output:message,sources,model:Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna",status:"generated",generated_at:new Date().toISOString(),attention_event_ids:attentionEventIds}).eq("id",deliveryId),"routine_save_output");
      }else if(attentionDigest&&deliveryId){
        const saved=checked(await sb.from("minds_routine_deliveries").select("attention_event_ids").eq("id",deliveryId).maybeSingle(),"routine_attention_restore");
        attentionEventIds=Array.isArray(saved?.attention_event_ids)?saved.attention_event_ids.map((x:any)=>String(x)):[];
      }
      phase="delivery";
      const delivered=checked(await sb.rpc("minds_deliver_routine",{p_delivery_id:deliveryId}),"routine_delivery");
      let attentionConsumed=0;
      if(attentionEventIds.length){
        attentionConsumed=Number(checked(await sb.rpc("minds_consume_attention_briefing",{p_user:routine.user_id,p_event_ids:attentionEventIds,p_delivery_id:deliveryId}),"routine_attention_consume")||0);
      }
      await finishRun(sb,agentRun,"success",{routine_id:routine.id,delivery_id:deliveryId,title:routine.title,phase:"delivered",attempt:routine.metadata?.delivery_attempt,attention_digest:attentionDigest,attention_consumed:attentionConsumed,...delivered});
      results.push({id:routine.id,status:"sent",delivery_id:deliveryId});
    }catch(e){
      const detail=e instanceof Error?e.message:(()=>{try{return JSON.stringify(e)}catch{return String(e)}})();
      const retries=Number(routine.metadata?.delivery_attempt||1);
      const retryAt=retries<5?new Date(Date.now()+Math.min(60,5*Math.pow(2,retries-1))*60000).toISOString():null;
      const metadata={...(routine.metadata||{}),failure_retries:retries,failure_episode_at:routine.metadata?.failure_episode_at||new Date().toISOString()};
      for(const k of ['delivery_id','scheduled_at','delivery_output','delivery_sources','delivery_model','delivery_attempt'])delete metadata[k];
      const update=await sb.from("isabella_routines").update({last_error:detail,metadata,updated_at:new Date().toISOString()}).eq("id",routine.id);
      const outbox=deliveryId?await sb.from("minds_routine_deliveries").update({status:"error",error:detail,lease_until:null,retry_at:retryAt}).eq("id",deliveryId):null;
      await finishRun(sb,agentRun,"error",{routine_id:routine.id,delivery_id:deliveryId,title:routine.title,phase,attempt:retries,retry_at:retryAt,record_error:update.error?.message||outbox?.error?.message||null},detail);
      results.push({id:routine.id,status:"error",error:detail});
    }
  }
  return json({ok:results.every(x=>x.status!=="error"),claimed:(routines||[]).length,results},results.some(x=>x.status==="error")?500:200);
});
