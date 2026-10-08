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

type WatchObservation={
  observation_status:"ok"|"stale"|"error";
  condition_state:"matched"|"not_matched"|"unknown";
  observed_at?:string|null;
  freshness_minutes?:number|null;
  result_fingerprint?:string|null;
  evidence?:Record<string,unknown>;
  error?:string|null;
};

type WatchAdapter=(sb:any,userId:string,watch:any,channel:any)=>Promise<WatchObservation>;

// Deliberately empty in 86.3. A provider must ship code + verification before a channel may set runtime_supported=true.
const WATCH_ADAPTERS:Record<string,WatchAdapter>={};

async function observeWatch(sb:any,userId:string,watch:any,channel:any):Promise<WatchObservation>{
  const key=String(channel?.metadata?.runtime_adapter||"").trim();
  const adapter=key?WATCH_ADAPTERS[key]:null;
  if(!adapter)return {
    observation_status:"error",condition_state:"unknown",
    observed_at:null,freshness_minutes:null,result_fingerprint:null,evidence:{},
    error:"watch_adapter_unavailable"
  };
  try{return await adapter(sb,userId,watch,channel)}
  catch(e){return {
    observation_status:"error",condition_state:"unknown",
    observed_at:null,freshness_minutes:null,result_fingerprint:null,evidence:{},
    error:e instanceof Error?e.message:String(e)
  }}
}

async function runWatchChecks(sb:any,userId:string,timezone:string){
  const now=new Date(),nowMs=now.getTime();
  const [watchesQ,channelsQ]=await Promise.all([
    sb.from("minds_standing_intents")
      .select("id,trigger_text,reminder_text,status,mode,channel_ref,channel_kind,freshness_minutes,cooldown_minutes,max_triggers,trigger_count,last_trigger_at,expires_at,condition_json,return_rule,project_id,metadata")
      .eq("user_id",userId).eq("mode","watch").eq("status","armed").order("created_at",{ascending:true}).limit(100),
    sb.from("minds_watch_channels")
      .select("id,channel_key,label,provider,adapter_kind,status,freshness_minutes,verification_status,last_verified_at,runtime_supported,condition_schema,metadata")
      .eq("user_id",userId)
  ]);
  checked(watchesQ,"watch_list");checked(channelsQ,"watch_channels");
  const channels=new Map<string,any>((channelsQ.data||[]).map((x:any)=>[String(x.id),x] as [string,any]));
  let checkedCount=0,fired=0,errors=0,stale=0,skipped=0;
  const receipts:any[]=[];

  for(const watch of watchesQ.data||[]){
    if(watch.expires_at&&new Date(watch.expires_at).getTime()<=nowMs){
      checked(await sb.from("minds_standing_intents").update({status:"expired",expired_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",watch.id).eq("user_id",userId).eq("status","armed"),"watch_expire");
      skipped++;continue;
    }
    if(watch.last_trigger_at&&nowMs-new Date(watch.last_trigger_at).getTime()<Number(watch.cooldown_minutes||0)*60000){
      skipped++;continue;
    }
    const channel=channels.get(String(watch.channel_ref||""));
    if(!channel||channel.status!=="enabled"||channel.verification_status!=="verified"||channel.runtime_supported!==true){
      errors++;
      receipts.push({watch_id:watch.id,status:"channel_unavailable"});
      continue;
    }

    const observation=await observeWatch(sb,userId,watch,channel);
    const record=checked(await sb.rpc("minds_record_watch_check",{
      p_user:userId,p_watch:watch.id,p_channel:channel.id,p_result:observation
    }),"watch_check_record");
    checkedCount++;
    if(record?.status==="error")errors++;
    if(record?.status==="stale")stale++;
    if(record?.fire_ready){
      const fingerprint=String(observation.result_fingerprint||record.check_id||crypto.randomUUID());
      const publication=await publishCandidate(sb,userId,{
        event_type:"watch_fired",
        fingerprint:`watch:${watch.id}:${fingerprint}`,
        severity:"attention",
        title:String(watch.reminder_text||watch.trigger_text||"Cambio detectado"),
        body:String(watch.reminder_text||"La condición que pediste vigilar se ha cumplido."),
        project_id:watch.project_id||null,
        source:{
          watch_id:watch.id,check_id:record.check_id,channel_id:channel.id,
          channel_key:channel.channel_key,observed_at:observation.observed_at||now.toISOString(),
          result_fingerprint:fingerprint
        },
        metadata:{
          prospective_memory_mode:"watch",
          observation_mode:"autonomous",
          channel_key:channel.channel_key,
          freshness_minutes:observation.freshness_minutes??null
        },
        timezone,ttl_hours:72
      });
      checked(await sb.rpc("minds_finalize_watch_fire",{
        p_user:userId,p_watch:watch.id,p_check:record.check_id,p_publication:publication
      }),"watch_fire_finalize");
      fired++;
      receipts.push({watch_id:watch.id,status:"fired",check_id:record.check_id,attention_route:publication?.attention_route||null});
    }else{
      receipts.push({watch_id:watch.id,status:record?.status||"unknown",condition_state:record?.condition_state||"unknown",check_id:record?.check_id||null});
    }
  }
  return {checked:checkedCount,fired,errors,stale,skipped,receipts:receipts.slice(0,30)};
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
      const expirySweep=checked(await sb.rpc("minds_expire_prospective_memory",{p_user:userId,p_now:now.toISOString()}),"prospective_memory_expiry");
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
      const watchChecks=await runWatchChecks(sb,userId,routineTz);
      const contextMaintenance=await maintainConversationContext(sb,userId);
      const heartbeatError=contextMaintenance.status==="error"||watchChecks.errors>0;
      await finishRun(sb,run,heartbeatError?"error":"success",{
        timezone:routineTz,candidates:candidates.length,new_events:created,
        prospective_memory_expiry:expirySweep,watch_checks:watchChecks,context_maintenance:contextMaintenance
      },contextMaintenance.status==="error"?contextMaintenance.detail:(watchChecks.errors?String(watchChecks.errors)+" watch checks failed":undefined));
      results.push({user_id:userId,status:heartbeatError?"error":"success",candidates:candidates.length,new_events:created,prospective_memory_expiry:expirySweep,watch_checks:watchChecks});
    }catch(e){
      const detail=e instanceof Error?e.message:String(e);await finishRun(sb,run,"error",{},detail);results.push({user_id:userId,status:"error",error:detail});
    }
  }
  return json({ok:results.every(x=>x.status==="success"),users:users.size,results},results.some(x=>x.status==="error")?500:200);
});
