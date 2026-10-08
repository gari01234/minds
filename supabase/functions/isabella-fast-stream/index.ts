import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const enc=new TextEncoder();

function publishableKey(){
  let key=Deno.env.get("SUPABASE_ANON_KEY")||"";
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
  return key;
}
function userClient(req:Request){
  const url=Deno.env.get("SUPABASE_URL")||"",key=publishableKey(),auth=req.headers.get("Authorization")||"";
  if(!url||!key||!auth)return null;
  return createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
}
function serviceClient(){
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function normalize(v:any){return String(v||"").trim().replace(/\s+/g," ").toLowerCase()}
function validRequestId(v:any){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||"").trim())}
function fastCreateCandidate(message:string){
  const t=normalize(message);
  if(!t||t.length>320||/[?¿]/.test(t))return false;
  if(/\b(si|unless|excepto|salvo|depende|cuando tenga sentido|como antes|como hablamos|como dijimos|lo anterior|eso|esto|aquello|lo de)\b/i.test(t))return false;
  if(/\b(y|además|también|also|und)\s+(agrega|añade|crea|pon|apunta|add|create|erstelle|füge)\b/i.test(t))return false;
  return /\b(agrega|agregar|añade|añadir|crea|crear|pon|poner|apunta|apuntar|add|create|erstelle|hinzufügen|füge)\b/i.test(t);
}
function temporal(ctx:any){
  const zone=String(ctx?.timezone||"Europe/Berlin"),now=new Date();
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"long",hourCycle:"h23"}).formatToParts(now);
    const get=(x:string)=>parts.find(p=>p.type===x)?.value||"";
    return {date:get("year")+"-"+get("month")+"-"+get("day"),time:get("hour")+":"+get("minute"),weekday:get("weekday"),timezone:zone};
  }catch{return {date:now.toISOString().slice(0,10),time:now.toISOString().slice(11,16),weekday:"",timezone:"UTC"}}
}
function proposalFromCall(name:string,a:any){
  if(name==="create_task")return {
    action:"create",kind:"task",request_id:crypto.randomUUID(),
    title:String(a?.title||"").trim(),date:a?.date?String(a.date):null,reminder_time:a?.reminder_time?String(a.reminder_time):null,
    category:a?.category?String(a.category):null,project:a?.project?String(a.project):null,
    recurrence:a?.recurrence??null,notes:a?.notes??null,all_day:false,time:null,duration_minutes:null,clear_date:false,
    target_id:null,target_title:null,target_date:null,target_time:null
  };
  if(name==="create_event")return {
    action:"create",kind:"event",request_id:crypto.randomUUID(),
    title:String(a?.title||"").trim(),date:a?.date?String(a.date):null,time:a?.time?String(a.time):null,
    duration_minutes:Number(a?.duration_minutes||60),all_day:!!a?.all_day,category:a?.category?String(a.category):null,
    project:a?.project?String(a.project):null,recurrence:a?.recurrence??null,notes:a?.notes??null,reminder_time:null,clear_date:false,
    target_id:null,target_title:null,target_date:null,target_time:null
  };
  return null;
}
function contextualFastContext(message:string,p:any,ctx:any){
  const words=(s:any)=>' '+normalize(s).replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
  // Literal user input must contain both the category and task, not only recent context.
  const direct=fastCreateCandidate(message)&&p?.kind==='task'&&!p.project&&!ctx?.work_context?.active
    &&!!p.category&&!!p.title&&words(message).includes(words(p.category))&&words(message).includes(words(p.title));
  return {autonomy_contract:'fast_task_v1',direct_request:direct,fast_path:true,one_round:true,source_tainted:false,background:false};
}
async function tryContextualTask(uc:any,proposal:any,context:any){
  if(!context.direct_request)return {status:'confirm',reason:'unverified_direct_request'};
  const {data,error}=await uc.rpc('minds_try_contextual_task',{p_request_id:proposal.request_id});
  if(error)throw new Error('No pude verificar el resultado del permiso. Revisa tus tareas antes de repetir la petición.');
  if(!['confirm','executed'].includes(data?.status))throw new Error('No pude verificar el resultado del permiso.');
  return data;
}
function previewText(p:any){
  const title=p?.title?`“${p.title}”`:(p?.kind==="event"?"el evento":"la tarea");
  if(p?.kind==="event"){
    const when=p.date?` para ${p.date}${p.time?` a las ${p.time}`:""}`:"";
    return `He preparado ${title}${when} para que lo revises.`;
  }
  const when=p.date?` para ${p.date}`:" como tarea sin fecha";
  return `He preparado ${title}${when} para que lo revises.`;
}
function parseSseBlocks(buffer:string,onEvent:(ev:any)=>void){
  let rest=buffer;
  while(true){
    const i=rest.indexOf("\n\n");if(i<0)break;
    const block=rest.slice(0,i);rest=rest.slice(i+2);
    const data=block.split("\n").filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim()).join("\n");
    if(!data||data==="[DONE]")continue;
    try{onEvent(JSON.parse(data))}catch{}
  }
  return rest;
}
async function logUsage(service:any,userId:string,model:string,usage:any,metadata:any){
  if(!service||!usage)return;
  await service.from("minds_ai_usage").insert({
    user_id:userId,feature:"isabella_fast_action",model,
    input_tokens:Number(usage?.input_tokens||0),
    cached_input_tokens:Number(usage?.input_tokens_details?.cached_tokens||0),
    output_tokens:Number(usage?.output_tokens||0),
    total_tokens:Number(usage?.total_tokens||0),
    metadata
  });
}
async function finishRun(service:any,id:string|null,status:string,started:number,metadata:any,error:string|null=null){
  if(!service||!id)return;
  await service.from("minds_agent_runs").update({
    status,metadata,error,completed_at:new Date().toISOString(),latency_ms:Math.max(0,Date.now()-started)
  }).eq("id",id);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response("method_not_allowed",{status:405,headers:cors});
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  const uc=userClient(req),service=serviceClient();
  if(!apiKey||!uc||!service)return new Response("unavailable",{status:503,headers:cors});
  const {data:{user}}=await uc.auth.getUser();
  if(!user)return new Response("unauthorized",{status:401,headers:cors});

  let body:any={};
  try{body=await req.json()}catch{return new Response("invalid_json",{status:400,headers:cors})}
  const message=String(body?.message||"").trim(),ctx=body?.context||{};
  const clientRequestId=validRequestId(body?.client_request_id)?String(body.client_request_id).trim():null;
  if(!fastCreateCandidate(message))return new Response(JSON.stringify({fallback:true}),{status:409,headers:{...cors,"Content-Type":"application/json"}});

  const started=Date.now();
  const {data:run}=await service.from("minds_agent_runs").insert({
    user_id:user.id,feature:"isabella_fast_action",status:"running",
    route:{complexity:"light",fast_path:true,one_round:true},
    metadata:{transport:"sse",gate:"strict_create_v1"}
  }).select("id").single();
  const runId=run?.id||null;

  const stream=new ReadableStream({
    async start(controller){
      const send=(type:string,payload:any={})=>controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify({type,...payload})}\n\n`));
      try{
        send("status",{phase:"routing",label:"Entendiendo…"});
        const t=temporal(ctx);
        const taxonomy=ctx?.taxonomy||{};
        const todayTasks=Array.isArray(ctx?.today_tasks)?ctx.today_tasks.slice(0,16):[];
        const todayEvents=Array.isArray(ctx?.today_events)?ctx.today_events.slice(0,12):[];
        const recent=Array.isArray(ctx?.recent_local_conversation)?ctx.recent_local_conversation.slice(-6):[];
        const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
        const instructions=`Eres el Fast Action Gate interno de Isabella. Tu única tarea es convertir UNA instrucción inequívoca de creación en exactamente una llamada create_task o create_event. Nunca ejecutes nada y nunca hables al usuario.

Hoy es ${t.date}, hora local ${t.time}, ${t.weekday}, zona ${t.timezone}. Resuelve "hoy", "mañana" y días de la semana respecto de esa fecha.

REGLAS DE SEGURIDAD:
- Si hay ambigüedad sobre qué crear, referencia a contexto no resuelta, condición ("si...", "salvo..."), más de una acción, petición que requiere consultar Work/memoria/calendario, o una modificación/borrado de algo existente: llama escalate_to_full_isabella.
- Si dice Termin, reunión, cita, Besprechung o evento, usa create_event. Un evento necesita fecha y hora; si falta una de ellas, escala.
- En ausencia de una señal clara de evento, una instrucción "agrega/pon/apunta X" significa create_task.
- Una tarea puede no tener fecha.
- Usa únicamente categorías y proyectos presentes en TAXONOMÍA. Si el usuario nombra uno que coincide claramente, consérvalo; si no, déjalo vacío.
- No inventes duración especial: para eventos usa 60 minutos salvo que el usuario indique otra.
- Devuelve solo una function call.`;
        const tools=[
          {type:"function",name:"create_task",description:"Prepare exactly one task proposal for user confirmation.",strict:false,parameters:{type:"object",properties:{
            title:{type:"string"},date:{type:"string",description:"Optional YYYY-MM-DD"},reminder_time:{type:"string"},category:{type:"string"},project:{type:"string"},recurrence:{type:"string"},notes:{type:"string"}
          },required:["title"]}},
          {type:"function",name:"create_event",description:"Prepare exactly one calendar event proposal for user confirmation.",strict:false,parameters:{type:"object",properties:{
            title:{type:"string"},date:{type:"string"},time:{type:"string"},duration_minutes:{type:"number"},all_day:{type:"boolean"},category:{type:"string"},project:{type:"string"},recurrence:{type:"string"},notes:{type:"string"}
          },required:["title","date","time","duration_minutes"]}},
          {type:"function",name:"escalate_to_full_isabella",description:"Use whenever this request is not one completely resolved create action.",strict:false,parameters:{type:"object",properties:{reason:{type:"string"}},required:["reason"]}}
        ];
        const input=`MENSAJE:\n${message}\n\nTAXONOMÍA:\n${JSON.stringify(taxonomy)}\n\nAGENDA DE HOY (solo para detectar conflicto/ambigüedad, no para razonar en profundidad):\n${JSON.stringify({tasks:todayTasks,events:todayEvents})}\n\nCONTEXTO RECIENTE:\n${JSON.stringify(recent)}`;
        const response=await fetch("https://api.openai.com/v1/responses",{
          method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
          body:JSON.stringify({model,instructions,reasoning:{effort:"low"},max_output_tokens:700,tools,tool_choice:"required",parallel_tool_calls:false,stream:true,input:[{role:"user",content:input}]})
        });
        if(!response.ok||!response.body)throw new Error("fast_openai_"+response.status);
        send("status",{phase:"model",label:"Preparando…"});
        const reader=response.body.getReader(),decoder=new TextDecoder();
        let buffer="",call:any=null,completed:any=null,ackSent=false;
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          buffer=parseSseBlocks(buffer,(ev:any)=>{
            if(ev?.type==="response.output_item.added"&&ev?.item?.type==="function_call"){
              call={name:ev.item.name,call_id:ev.item.call_id||null,arguments:String(ev.item.arguments||"")};
              send("status",{phase:"tool",label:ev.item.name==="create_event"?"Preparando evento…":ev.item.name==="create_task"?"Preparando tarea…":"Comprobando…"});
              if(!ackSent&&(ev.item.name==="create_task"||ev.item.name==="create_event")){ackSent=true;send("text_delta",{delta:"Entendido. "});}
            }else if(ev?.type==="response.function_call_arguments.delta"&&call){
              call.arguments+=String(ev.delta||"");
            }else if(ev?.type==="response.output_item.done"&&ev?.item?.type==="function_call"){
              call={name:ev.item.name,call_id:ev.item.call_id||call?.call_id||null,arguments:String(ev.item.arguments||call?.arguments||"")};
            }else if(ev?.type==="response.completed")completed=ev.response;
            else if(ev?.type==="error")throw new Error(ev?.message||"fast_stream_error");
          });
        }
        if(!call||call.name==="escalate_to_full_isabella"){
          await logUsage(service,user.id,model,completed?.usage,{fast_path:true,one_round:true,outcome:"fallback"});
          await finishRun(service,runId,"skipped",started,{transport:"sse",fast_path:true,one_round:true,outcome:"fallback"});
          send("fallback",{reason:call?.arguments||"gate"});
          controller.close();return;
        }
        let args:any={};try{args=JSON.parse(call.arguments||"{}")}catch{}
        const proposal=proposalFromCall(call.name,args);
        if(proposal&&clientRequestId)proposal.request_id=clientRequestId;
        if(!proposal?.title||(proposal.kind==="event"&&(!proposal.date||!proposal.time))){
          await finishRun(service,runId,"skipped",started,{transport:"sse",fast_path:true,one_round:true,outcome:"invalid_proposal"});
          send("fallback",{reason:"invalid_proposal"});controller.close();return;
        }
        const permissionContext={...contextualFastContext(message,proposal,ctx),run_id:runId};
        if(body?.permission_protocol!=='contextual_v1')permissionContext.direct_request=false;
        const recorded=await service.rpc("minds_admit_shadow_decision",{
          p_user:user.id,p_request_id:proposal.request_id,p_action:call.name,p_candidate:proposal,
          p_context:permissionContext
        });
        if(recorded.error)throw new Error('No pude registrar la propuesta para revisión.');
        if(recorded.data?.status==="suppressed"){
          const text='Eso ya está en el estado que pediste; no hace falta otra confirmación.';
          const reply=(ackSent?'Entendido. ':'')+text;
          send('text_delta',{delta:text});
          send('result',{reply,proposal:null,proposals:[],memory_candidates:[],quick_replies:[],sources:[],artifacts:[],pending_intent:null,fast_path:true,one_round:true,streamed_reply:true,review_admission:recorded.data});
          await logUsage(service,user.id,model,completed?.usage,{fast_path:true,one_round:true,outcome:'review_suppressed',reason:recorded.data?.reason||null});
          await finishRun(service,runId,'success',started,{transport:'sse',fast_path:true,one_round:true,tool:call.name,outcome:'review_suppressed'});
          controller.close();return;
        }
        const canonicalProposal=recorded.data?.decision?.candidate&&recorded.data.decision.candidate.title
          ?{...recorded.data.decision.candidate,request_id:recorded.data.decision.request_id||recorded.data.decision.candidate.request_id}
          :proposal;
        const permission=await tryContextualTask(uc,canonicalProposal,permissionContext);
        if(permission.status==='executed'){
          const text=`Guardé “${canonicalProposal.title}”${canonicalProposal.date?` para ${canonicalProposal.date}`:' sin fecha'}${canonicalProposal.category?` en ${canonicalProposal.category}`:''}, con el permiso que autorizaste.`;
          const reply=(ackSent?'Entendido. ':'')+text;
          send('text_delta',{delta:text});
          send('result',{reply,proposal:null,proposals:[],memory_candidates:[],quick_replies:[],sources:[],artifacts:[],pending_intent:null,fast_path:true,one_round:true,streamed_reply:true,autonomy_execution:permission.receipt});
          await logUsage(service,user.id,model,completed?.usage,{fast_path:true,one_round:true,outcome:'authorized_execution',permission_id:permission.receipt.permission_id});
          await finishRun(service,runId,'success',started,{transport:'sse',fast_path:true,one_round:true,tool:call.name,outcome:'authorized_execution',receipt_id:permission.receipt.id});
          controller.close();return;
        }
        await logUsage(service,user.id,model,completed?.usage,{fast_path:true,one_round:true,outcome:"proposal",tool:call.name});
        const reply=(ackSent?"Entendido. ":"")+previewText(canonicalProposal);
        send("text_delta",{delta:previewText(canonicalProposal)});
        send("status",{phase:"ready",label:"Listo para revisar"});
        send("result",{reply,proposal:canonicalProposal,proposals:[],memory_candidates:[],quick_replies:[],sources:[],artifacts:[],pending_intent:null,fast_path:true,one_round:true,streamed_reply:true});
        await finishRun(service,runId,"success",started,{transport:"sse",fast_path:true,one_round:true,tool:call.name,outcome:"proposal"});
        controller.close();
      }catch(e){
        const detail=e instanceof Error?e.message:String(e);
        await finishRun(service,runId,"error",started,{transport:"sse",fast_path:true,one_round:true},detail);
        try{send("error",{message:detail})}catch{}
        controller.close();
      }
    }
  });
  return new Response(stream,{status:200,headers:{...cors,"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
});
