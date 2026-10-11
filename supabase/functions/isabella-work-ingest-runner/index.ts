/* MINDS Work ingestion runner: authenticated by a dedicated internal secret.
 * Claim is lease-locked in PostgreSQL; no browser session is required.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {processWorkFile} from "../_shared/work-ingest-core.ts";
import {isDoclingReady,configureDoclingRuntime} from "../_shared/work-docling.ts";
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key)return json({error:"server_unconfigured"},503);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:secret}=await sb.from("isabella_runtime_secrets").select("value").eq("key","work_ingest_runner").maybeSingle();
  if(!secret?.value||String(body.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);
  // Runtime secret lookup happens only after the private runner has authenticated.
  // The table permits service_role and postgres, never anon/authenticated.
  const {data:doclingSecrets,error:doclingSecretError}=await sb.from("isabella_runtime_secrets")
    .select("key,value").in("key",["docling_serve_url","docling_serve_key"]);
  if(doclingSecretError)console.error("work_docling_config_unavailable");
  const credentials=new Map((doclingSecrets||[]).map((s:any)=>[s.key,s.value]));
  configureDoclingRuntime(credentials.get("docling_serve_url")||null,credentials.get("docling_serve_key")||null);
  // One-time historical catch-up is incremental and gives newly uploaded files priority.
  // Waiting documents are reactivated only after authenticated private Docling readiness.
  const doclingReady=await isDoclingReady();
  const {error:reconcileError}=await sb.rpc("minds_reconcile_work_ingest",{
    p_limit:1,p_docling_ready:doclingReady
  });
  if(reconcileError)return json({error:"intake_reconciliation_failed"},500);
  const {data:jobs,error:claimError}=await sb.rpc("minds_claim_work_ingest",{p_limit:1});
  if(claimError)return json({error:"queue_claim_failed"},500);
  const results:any[]=[];
  for(const job of jobs||[]){
    try{
      const x=await processWorkFile(sb,job),now=new Date().toISOString();
      if(x.status==="docling_pending"){
        // Polling in later Heartbeats does not increment extraction attempts.
        // The original remains queued, and neither text nor Claims are invented.
        const {error:pendingError}=await sb.from("minds_work_ingest_queue")
          .update({status:"docling_pending",docling_task_id:x.taskId,
            docling_started_at:job.docling_started_at||now,
            source_version:x.version||job.source_version||null,
            locked_at:null,next_attempt_at:new Date(Date.now()+120000).toISOString(),
            updated_at:now})
          .eq("id",job.id).eq("status","processing").eq("attempts",job.attempts);
        if(pendingError)throw pendingError;
        results.push({status:"docling_pending"});
        continue;
      }
      const indexed=x.status==="completed";
      const needsParser=x.status==="waiting_parser";
      const metadata={...(x.file?.metadata||{}),knowledge_intake:{
        ...(x.file?.metadata?.knowledge_intake||{}),
        status:x.status,parser:x.parser||null,coverage:x.coverage||"none",
        reason:x.reason||null,source_version:x.version||null,claim_count:x.claims||0,
        structured_text:x.structuredText||{status:"not_supported"}}};
      const {error:fileError}=await sb.from("minds_work_files")
        .update({index_status:needsParser?"waiting_parser":indexed?"indexed":"failed",metadata,updated_at:now})
        .eq("id",job.file_id).eq("user_id",job.user_id);
      if(fileError)throw fileError;
      const {error:finishError}=await sb.from("minds_work_ingest_queue")
        .update({status:needsParser?"waiting_parser":indexed?"completed":"skipped",parser_name:x.parser||null,
          source_version:x.version||null,last_error:x.reason||null,locked_at:null,
          completed_at:now,updated_at:now})
        .eq("id",job.id).eq("status","processing").eq("attempts",job.attempts);
      if(finishError)throw finishError;
      results.push({status:x.status,claim_count:x.claims||0});
    }catch(e){
      const lastError=String(e instanceof Error?e.message:e).slice(0,160);
      // Internal diagnostics omit source contents; needed to distinguish
      // parser crashes from malformed cells without exposing documents.
      console.error("work_source_intake_failure",JSON.stringify({
        queue_id:job.id,error:lastError,
        stack:String(e instanceof Error?e.stack||"": "").slice(0,900)
      }));
      const terminal=Number(job.attempts)>=4,now=new Date().toISOString();
      const expired=lastError==="docling_result_expired";
      const recovery=expired?{docling_task_id:null,docling_started_at:null}:{};
      const {error:retryError}=await sb.from("minds_work_ingest_queue").update({
        status:terminal?(expired?"waiting_parser":"failed"):"queued",
        last_error:lastError,locked_at:null,...recovery,
        next_attempt_at:new Date(Date.now()+Math.min(30,Math.pow(2,Number(job.attempts)))*60000).toISOString(),
        completed_at:terminal?now:null,updated_at:now
      }).eq("id",job.id).eq("status","processing").eq("attempts",job.attempts);
      if(retryError)console.error("work_ingest_retry_state_failed",job.id);
      if(terminal)await sb.from("minds_work_files").update({
        index_status:expired?"waiting_parser":"failed"
      }).eq("id",job.file_id).eq("user_id",job.user_id);
      results.push({status:terminal?(expired?"waiting_parser":"failed"):"retry_scheduled"});
    }
  }
  return json({ok:true,claimed:(jobs||[]).length,results});
});
