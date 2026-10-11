/* Build 90.8 · Durable Chat reconciliation
 * OpenAI background execution is already underway: this worker only observes
 * the provider response and persists the terminal result. No tools or actions.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
function replyOf(p:any){
  if(typeof p?.output_text==="string"&&p.output_text.trim())return p.output_text.trim();
  return (p?.output||[]).filter((x:any)=>x?.type==="message")
    .flatMap((x:any)=>x.content||[])
    .map((x:any)=>typeof x.text==="string"?x.text:typeof x.output_text==="string"?x.output_text:"")
    .join("\n").trim();
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",
    key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!key)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:secret,error:secretError}=await sb.from("isabella_runtime_secrets")
    .select("value").eq("key","chat_runner").maybeSingle();
  if(secretError||!secret?.value||String(body?.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);
  const {data:jobs,error}=await sb.from("minds_chat_jobs")
    .select("id,user_id,status,provider_response_id,agent_run_id,started_at,created_at")
    .in("status",["preparing","running"]).order("created_at",{ascending:true}).limit(12);
  if(error)return json({error:"jobs_query_failed",detail:error.message},500);
  const outcomes:any[]=[];
  for(const job of jobs||[]){
    try{
      const age=Date.now()-new Date(job.created_at).getTime();
      if(job.status==="preparing"){
        if(age>4*60*1000){
          await sb.from("minds_chat_jobs").update({
            status:"failed",incomplete_reason:"provider_creation_unconfirmed_no_automatic_retry",
            completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
          }).eq("id",job.id).eq("status","preparing");
          if(job.agent_run_id)await sb.from("minds_agent_runs").update({status:"error",
            metadata:{durable_chat:true,reason:"provider_creation_unconfirmed"},error:"provider_creation_unconfirmed",
            completed_at:new Date().toISOString()}).eq("id",job.agent_run_id);
          outcomes.push({id:job.id,status:"failed_unconfirmed"});
        }
        continue;
      }
      if(!job.provider_response_id){outcomes.push({id:job.id,status:"missing_provider_id"});continue}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      let response:Response;
      try{
        response=await fetch("https://api.openai.com/v1/responses/"+encodeURIComponent(job.provider_response_id),{
          headers:{"Authorization":"Bearer "+key},signal:controller.signal
        });
      }finally{clearTimeout(timer)}
      if(!response.ok){
        // A temporary upstream error is not evidence that the response failed.
        outcomes.push({id:job.id,status:"provider_http_"+response.status});continue;
      }
      const result=await response.json();
      if(["queued","in_progress"].includes(String(result.status||""))){
        outcomes.push({id:job.id,status:result.status});continue;
      }
      const text=replyOf(result),success=result.status==="completed"&&!!text;
      const status=success?"completed":text?"incomplete":"failed";
      const reason=success?null:String(result.incomplete_details?.reason||result.error?.message||result.status||"empty_response").slice(0,250);
      const now=new Date().toISOString();
      const {error:updateError}=await sb.from("minds_chat_jobs").update({
        status,reply:text||null,incomplete_reason:reason,
        metadata:{version:"durable_chat_v0.1",provider_status:result.status,
          usage:result.usage||null,delivered_to_chat:false},
        completed_at:now,updated_at:now
      }).eq("id",job.id).eq("status","running");
      if(updateError)throw updateError;
      if(job.agent_run_id)await sb.from("minds_agent_runs").update({
        status:success?"success":"error",completed_at:now,
        error:reason,metadata:{durable_chat:true,provider_status:result.status,incomplete_response:!success}
      }).eq("id",job.agent_run_id);
      outcomes.push({id:job.id,status});
    }catch(e){
      outcomes.push({id:job.id,status:"transient_runner_error",
        detail:(e instanceof Error?e.message:String(e)).slice(0,160)});
    }
  }
  return json({ok:true,checked:(jobs||[]).length,outcomes});
});
