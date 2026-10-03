import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {cleanLegacyConversation,closeConversation} from "../_shared/conversations.ts";
import {checked} from "../_shared/cognitive.ts";

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}})}
function localDateISO(tz:string,date=new Date()){
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const g=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
async function startRun(sb:any,userId:string){
  const {data}=await sb.from("minds_agent_runs").insert({user_id:userId,feature:"heartbeat",status:"running",route:{mode:"deterministic"},metadata:{}}).select("id,started_at").single();
  return data||null;
}
async function finishRun(sb:any,run:any,status:string,metadata:any,error?:string){
  if(!run?.id)return;
  const start=run.started_at?new Date(run.started_at).getTime():Date.now();
  await sb.from("minds_agent_runs").update({status,metadata,error:error||null,completed_at:new Date().toISOString(),latency_ms:Math.max(0,Date.now()-start)}).eq("id",run.id);
}
async function publishCandidate(sb:any,userId:string,c:any){
  return checked(await sb.rpc("minds_publish_heartbeat",{p_user:userId,p_candidate:c}),"heartbeat_publish");
}
async function resolveAbsent(sb:any,userId:string,candidates:any[]){
  const active=checked(await sb.from("minds_heartbeat_events").select("id,fingerprint").eq("user_id",userId).in("status",["new","surfaced"]).in("event_type",["overdue_digest","upcoming_event","routine_failure","expectation_due"]),"heartbeat_active")||[];
  const keys=new Set(candidates.map(x=>x.fingerprint));
  for(const e of active)if(!keys.has(e.fingerprint)){
    checked(await sb.from("minds_heartbeat_events").update({status:"resolved"}).eq("id",e.id),"heartbeat_resolve");
    checked(await sb.from("minds_surface_items").update({status:"dismissed",lifecycle_state:"resolved"}).eq("user_id",userId).contains("metadata",{heartbeat_event_id:e.id}),"heartbeat_surface_resolve");
    checked(await sb.from("minds_attention_events").update({status:"resolved",updated_at:new Date().toISOString()}).eq("user_id",userId).eq("source_type","heartbeat").eq("source_id",String(e.id)).in("status",["pending","delivered","suppressed"]),"heartbeat_attention_resolve");
  }
}

async function maintainConversationContext(sb:any,userId:string){
  const apiKey=Deno.env.get("OPENAI_API_KEY");if(!apiKey)return {status:"unavailable"};
  const rows=checked(await sb.from("conversations").select("id,metadata,app_scope").eq("user_id",userId).in("app_scope",["isabella","sofia"]).order("updated_at",{ascending:false}),"context_maintenance_list")||[];
  const row=rows.find((r:any)=>r.metadata?.openai_conversation_id&&r.metadata?.context_policy!=="transient_v1");
  if(!row)return {status:"current"};
  const token=crypto.randomUUID();
  if(!checked(await sb.rpc("minds_lock_conversation",{p_id:row.id,p_token:token}),"maintenance_lock"))return {status:"busy"};
  try{return {status:"success",...await cleanLegacyConversation(sb,apiKey,row,token)}}
  catch(e){return {status:"error",detail:e instanceof Error?e.message:String(e)}}
  finally{await closeConversation(sb,{dbId:row.id,leaseToken:token})}
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:secret}=await sb.from("isabella_runtime_secrets").select("value").eq("key","heartbeat_runner").maybeSingle();
  if(!secret?.value||String(body?.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);

  const usersQ=await sb.rpc("minds_heartbeat_users");
  if(usersQ.error)return json({error:"heartbeat_users_failed",detail:usersQ.error.message},500);
  const userRows=usersQ.data||[];
  const users=new Set<string>(userRows.map((x:any)=>x.user_id));
  const results:any[]=[];

  for(const userId of users){
    const run=await startRun(sb,userId);
    try{
      const routineTz=userRows.find((x:any)=>x.user_id===userId)?.timezone||"Europe/Berlin";
      const today=localDateISO(routineTz),now=new Date(),soon=new Date(now.getTime()+45*60000);
      const [tasks,routines,events,expectations]=await Promise.all([
        sb.from("isabella_tasks").select("id,title,due_date,project_id,priority,updated_at").eq("user_id",userId).is("archived_at",null).is("completed_at",null).lt("due_date",today).order("due_date",{ascending:true}).limit(20),
        sb.from("isabella_routines").select("id,title,last_error,last_run_at,updated_at,metadata").eq("user_id",userId).eq("enabled",true).not("last_error","is",null).limit(20),
        sb.from("isabella_events").select("id,title,starts_at,project_id").eq("user_id",userId).gte("starts_at",now.toISOString()).lte("starts_at",soon.toISOString()).order("starts_at",{ascending:true}).limit(10),
        sb.from("minds_expectations").select("id,title,expected_event,due_at,due_precision,timezone,project_id,status,due_detected_at").eq("user_id",userId).in("status",["active","due_unconfirmed"]).lte("due_at",now.toISOString()).order("due_at",{ascending:true}).limit(20)
      ]);
      for(const [label,q] of [["tasks",tasks],["routines",routines],["events",events],["expectations",expectations]] as any[])checked(q,"heartbeat_"+label);
      const candidates:any[]=[];
      const overdue=(tasks.data||[]).slice(0,20);
      if(overdue.length){
        const top=overdue.slice(0,3).map((t:any)=>t.title),extra=Math.max(0,overdue.length-top.length);
        candidates.push({
          event_type:"overdue_digest",fingerprint:`overdue_digest:${overdue.map((t:any)=>String(t.id)).sort().join(",")}`,severity:"attention",
          title:overdue.length===1?`Tarea vencida: ${top[0]}`:`${overdue.length} tareas vencidas`,
          body:overdue.length===1?`Sigue pendiente desde ${overdue[0].due_date}.`:`${top.join(" · ")}${extra?` · +${extra} más`:""}`,
          project_id:overdue.every((t:any)=>t.project_id&&t.project_id===overdue[0].project_id)?overdue[0].project_id:null,
          source:{task_ids:overdue.map((t:any)=>t.id),due_dates:overdue.map((t:any)=>t.due_date)},ttl_hours:18
        });
      }
      for(const e of (events.data||[]).slice(0,2))candidates.push({event_type:"upcoming_event",fingerprint:`event_upcoming:${e.id}:${e.starts_at}`,severity:"attention",title:`Próximo: ${e.title}`,body:`Empieza a las ${new Intl.DateTimeFormat("es-ES",{timeZone:routineTz,hour:"2-digit",minute:"2-digit"}).format(new Date(e.starts_at))}.`,project_id:e.project_id||null,source:{event_id:e.id,starts_at:e.starts_at},ttl_hours:2});
      for(const r of routines.data||[]){
        const failures=Math.max(1,Number(r?.metadata?.failure_retries||1));
        candidates.push({
          event_type:"routine_failure",fingerprint:`routine_failure:${r.id}:${r.metadata?.failure_episode_at||r.last_run_at||r.updated_at}`,severity:"urgent",
          title:`Rutina con error: ${r.title}`,
          body:failures>=2?`Ha fallado ${failures} veces. MINDS la mantiene registrada para diagnóstico.`:String(r.last_error||"La última ejecución falló."),
          source:{routine_id:r.id,last_run_at:r.last_run_at,failure_retries:failures},
          surface:failures>=2,ttl_hours:24
        });
      }
      for(const e of expectations.data||[]){
        if(e.status==="active"){
          checked(await sb.from("minds_expectations").update({status:"due_unconfirmed",due_detected_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",e.id).eq("user_id",userId).eq("status","active"),"heartbeat_expectation_due_state");
        }
        const tz=String(e.timezone||routineTz);
        const due=e.due_precision==="datetime"
          ?new Intl.DateTimeFormat("es-ES",{timeZone:tz,dateStyle:"medium",timeStyle:"short"}).format(new Date(e.due_at))
          :new Intl.DateTimeFormat("es-ES",{timeZone:tz,dateStyle:"medium"}).format(new Date(e.due_at));
        candidates.push({
          event_type:"expectation_due",
          fingerprint:`expectation_due:${e.id}:${e.due_at}`,
          severity:"attention",
          title:`Esperabas: ${e.title}`,
          body:`Se esperaba para ${due}. Todavía no tengo confirmación de que haya ocurrido.`,
          project_id:e.project_id||null,
          source:{expectation_id:e.id,due_at:e.due_at,due_precision:e.due_precision,status:"due_unconfirmed"},
          metadata:{expectation_id:e.id},
          ttl_hours:72
        });
      }
      let created=0;
      for(const c of candidates){const x=await publishCandidate(sb,userId,{...c,timezone:routineTz});if(x.created)created++}
      await resolveAbsent(sb,userId,candidates);
      const contextMaintenance=await maintainConversationContext(sb,userId);
      await finishRun(sb,run,contextMaintenance.status==="error"?"error":"success",{timezone:routineTz,candidates:candidates.length,new_events:created,context_maintenance:contextMaintenance},contextMaintenance.status==="error"?contextMaintenance.detail:undefined);
      results.push({user_id:userId,status:"success",candidates:candidates.length,new_events:created});
    }catch(e){
      const detail=e instanceof Error?e.message:String(e);await finishRun(sb,run,"error",{},detail);results.push({user_id:userId,status:"error",error:detail});
    }
  }
  return json({ok:results.every(x=>x.status==="success"),users:users.size,results},results.some(x=>x.status==="error")?500:200);
});
