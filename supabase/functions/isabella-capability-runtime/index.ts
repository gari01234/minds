import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {
  CAPABILITY_RUNTIME_VERSION,GENERAL_EXECUTION_MODEL,startGeneralExecution,
  reconcileCapabilityRun,cancelGeneralExecution
} from "../_shared/capability-runtime.ts";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function uuid(v:any){const s=String(v||"").trim();return /^[0-9a-f-]{36}$/i.test(s)?s:null}
function outputs(v:any){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x||"").toLowerCase()).filter(x=>["docx","pdf","xlsx","pptx","csv","zip","html","txt","json"].includes(x)))].slice(0,4)}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const token=String(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({error:"auth_required"},401);

  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  const user=userData?.user;if(userError||!user)return json({error:"invalid_session"},401);

  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const action=String(body?.action||"start");

  try{
    if(action==="start"){
      const objective=String(body?.objective||"").trim(),title=String(body?.title||objective.slice(0,120)||"Trabajo").trim().slice(0,240);
      if(!objective||objective.length>20000)return json({error:"invalid_objective"},400);

      let projectId=uuid(body?.project_id),workThreadId=uuid(body?.work_thread_id),conversationId=uuid(body?.conversation_id);
      if(workThreadId){
        const {data:thread}=await sb.from("minds_work_threads").select("id,user_id,project_id,conversation_id,status").eq("id",workThreadId).eq("user_id",user.id).maybeSingle();
        if(!thread||thread.status!=="active")return json({error:"work_thread_not_found"},404);
        projectId=thread.project_id;conversationId=conversationId||thread.conversation_id||null;
      }
      if(!projectId&&String(body?.project||"").trim()){
        const p=String(body.project).trim();
        const {data:projects}=await sb.from("isabella_projects").select("id,name,client_key").eq("user_id",user.id).eq("archived",false);
        const hit=(projects||[]).find((x:any)=>[x.id,x.name,x.client_key].some(v=>String(v||"").toLowerCase()===p.toLowerCase()));
        projectId=hit?.id||null;
      }
      if(projectId){
        const {data:project}=await sb.from("isabella_projects").select("id").eq("id",projectId).eq("user_id",user.id).eq("archived",false).maybeSingle();
        if(!project)return json({error:"project_not_found"},404);
      }
      if(conversationId){
        const {data:conversation}=await sb.from("conversations").select("id").eq("id",conversationId).eq("user_id",user.id).maybeSingle();
        if(!conversation)return json({error:"conversation_not_found"},404);
      }

      const desired=outputs(body?.desired_outputs),model=String(body?.model||GENERAL_EXECUTION_MODEL);
      const originKind=workThreadId?"work_thread":"chat";
      const {data:run,error:insertError}=await sb.from("minds_capability_runs").insert({
        user_id:user.id,capability:"general_execution",origin_kind:originKind,conversation_id:conversationId,
        project_id:projectId,work_thread_id:workThreadId,title,request:objective,status:"queued",provider:"openai_responses",
        metadata:{runtime_version:CAPABILITY_RUNTIME_VERSION,model,desired_outputs:desired,delivery:"chat_or_runner"}
      }).select("*").single();
      if(insertError||!run)throw insertError||new Error("capability_run_create_failed");

      let provider:any;
      try{
        provider=await startGeneralExecution(apiKey,{objective,title,desired_outputs:desired,context:body?.context||{},model});
      }catch(e){
        const detail=e instanceof Error?e.message:String(e);
        await sb.from("minds_capability_runs").update({status:"failed",error:detail.slice(0,4000),completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",run.id);
        return json({error:"capability_start_failed",detail,run_id:run.id},502);
      }

      const providerResponseId=String(provider?.id||"").trim();
      if(!providerResponseId)throw new Error("provider_response_id_missing");
      const now=new Date().toISOString();
      let current={...run,provider_response_id:providerResponseId,status:["queued","in_progress"].includes(String(provider?.status||""))?String(provider.status):"in_progress",started_at:now,updated_at:now};
      const {data:started}=await sb.from("minds_capability_runs").update({
        provider_response_id:providerResponseId,status:current.status,started_at:now,updated_at:now,
        metadata:{...run.metadata,provider_status:provider?.status||null}
      }).eq("id",run.id).select("*").single();
      if(started)current=started;

      for(let i=0;i<20&&["queued","in_progress"].includes(current.status);i++){
        await sleep(i===0?600:1450);
        const rec=await reconcileCapabilityRun(sb,apiKey,current,{deliver:false});
        current=rec.run;
        if(rec.status==="completed")return json({ok:true,status:"completed",run:current,artifacts:rec.artifacts});
        if(["failed","cancelled"].includes(rec.status))return json({ok:false,status:rec.status,run:current,artifacts:[]},rec.status==="failed"?502:200);
      }
      return json({ok:true,status:current.status,run:current,artifacts:[]},202);
    }

    const runId=uuid(body?.run_id);if(!runId)return json({error:"run_id_required"},400);
    const {data:run,error:runError}=await sb.from("minds_capability_runs").select("*").eq("id",runId).eq("user_id",user.id).maybeSingle();
    if(runError||!run)return json({error:"capability_run_not_found"},404);

    if(action==="status"){
      if(["queued","in_progress"].includes(run.status)&&run.provider_response_id){
        const rec=await reconcileCapabilityRun(sb,apiKey,run,{deliver:false});
        return json({ok:true,status:rec.status,run:rec.run,artifacts:rec.artifacts});
      }
      const ids=Array.isArray(run.artifact_ids)?run.artifact_ids:[];
      const {data:rows}=ids.length?await sb.from("minds_artifacts").select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at").in("id",ids):{data:[]};
      const artifacts=await Promise.all((rows||[]).map(async(x:any)=>{
        const {data:signed}=await sb.storage.from("minds-artifacts").createSignedUrl(x.storage_path,7*24*60*60);
        return {...x,url:signed?.signedUrl||null};
      }));
      return json({ok:true,status:run.status,run,artifacts});
    }

    if(action==="cancel"){
      if(run.provider_response_id&&["queued","in_progress"].includes(run.status))await cancelGeneralExecution(apiKey,run.provider_response_id);
      const now=new Date().toISOString();
      const {data:cancelled}=await sb.from("minds_capability_runs").update({status:"cancelled",completed_at:now,updated_at:now}).eq("id",run.id).select("*").single();
      return json({ok:true,status:"cancelled",run:cancelled||run});
    }
    return json({error:"unsupported_action"},400);
  }catch(e){
    return json({error:"capability_runtime_failed",detail:e instanceof Error?e.message:String(e)},500);
  }
});
