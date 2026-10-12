/* MINDS Work ingestion runner: authenticated by a dedicated internal secret.
 * Claim is lease-locked in PostgreSQL; no browser session is required.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {processWorkFile} from "../_shared/work-ingest-core.ts";
import {isDoclingReady,isDoclingConfigured,configureDoclingRuntime} from "../_shared/work-docling.ts";
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
  // Discover new originals without touching Railway. Readiness is expensive:
  // an HTTP request can wake a sleeping 2-3 GB Docling container.
  const {error:reconcileError}=await sb.rpc("minds_reconcile_work_ingest",{
    p_limit:1,p_docling_ready:false
  });
  if(reconcileError)return json({error:"intake_reconciliation_failed"},500);
  const now=new Date().toISOString();
  const staleLock=new Date(Date.now()-8*60*1000).toISOString();
  const probes=await Promise.all([
    sb.from("minds_work_ingest_queue").select("id")
      .in("status",["queued","docling_pending"]).lte("next_attempt_at",now).limit(1),
    sb.from("minds_work_ingest_queue").select("id")
      .eq("status","processing").lt("locked_at",staleLock).limit(1),
    sb.from("minds_work_ingest_queue").select("id")
      .eq("status","waiting_parser")
      .in("last_error",["docling_required_large_source","needs_private_docling_image"]).limit(1),
    sb.from("minds_work_ingest_queue").select("id")
      .eq("status","completed").eq("parser_name","existing-provider-file-input").limit(1)
  ]);
  if(probes.some(p=>p.error))return json({error:"work_probe_unavailable"},500);
  const hasWork=probes.some(p=>(p.data||[]).length>0);
  const doclingReady=hasWork?await isDoclingReady():false;
  if(doclingReady){
    const {error:resumeError}=await sb.rpc("minds_reconcile_work_ingest",{
      p_limit:1,p_docling_ready:true
    });
    if(resumeError)return json({error:"intake_resume_failed"},500);
  }
  // A cold boot or transient 502 must not consume a document's attempt budget.
  if(hasWork&&isDoclingConfigured()&&!doclingReady)
    return json({ok:true,claimed:0,deferred:"docling_not_ready"});
  // Enrich one historic, Claims-only PDF per cron run, without losing its
  // existing source ingestion/Claims or displacing newly queued originals.
  if(doclingReady){
    const {data:historic,error:historicError}=await sb.from("minds_work_ingest_queue")
      .select("id,file_id").eq("status","completed")
      .eq("parser_name","existing-provider-file-input")
      .order("completed_at",{ascending:true}).limit(1);
    if(historicError)console.error("work_historic_enrichment_lookup_failed");
    else if(historic?.length){
      const job=historic[0];
      const {data:receipt,error:receiptError}=await sb.from("minds_work_source_text_receipts")
        .select("id").eq("file_id",job.file_id).limit(1);
      if(receiptError)console.error("work_historic_receipt_lookup_failed");
      else{
        const now=new Date().toISOString();
        const alreadyReadable=!!receipt?.length;
        const {error:enrichError}=await sb.from("minds_work_ingest_queue").update(
          alreadyReadable?{parser_name:"source_first_existing",updated_at:now}:{
            status:"queued",parser_name:"docling_enrichment",attempts:0,
            is_backfill:true,last_error:null,locked_at:null,completed_at:null,
            docling_task_id:null,docling_started_at:null,
            next_attempt_at:now,updated_at:now
          }).eq("id",job.id).eq("status","completed")
          .eq("parser_name","existing-provider-file-input");
        if(enrichError)console.error("work_historic_enrichment_queue_failed");
      }
    }
  }
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
      const expired=lastError==="docling_result_expired"||
        lastError==="docling_task_lost"||lastError==="docling_task_stale";
      const recovery=expired?{docling_task_id:null,docling_started_at:null}:{};
      const {error:retryError}=await sb.from("minds_work_ingest_queue").update({
        status:terminal?(expired?"waiting_parser":"failed"):"queued",
        last_error:lastError,locked_at:null,...recovery,
        next_attempt_at:new Date(Date.now()+Math.min(30,Math.pow(2,Number(job.attempts)))*60000).toISOString(),
        completed_at:terminal?now:null,updated_at:now
      }).eq("id",job.id).eq("status","processing").eq("attempts",job.attempts);
      if(retryError)console.error("work_ingest_retry_state_failed",job.id);
      // An enrichment failure must not erase the already-indexed Claims.
      if(terminal&&job.parser_name!=="docling_enrichment")await sb.from("minds_work_files").update({
        index_status:expired?"waiting_parser":"failed"
      }).eq("id",job.file_id).eq("user_id",job.user_id);
      results.push({status:terminal?(expired?"waiting_parser":"failed"):"retry_scheduled"});
    }
  }
  return json({ok:true,claimed:(jobs||[]).length,results,
    docling_probed:hasWork,docling_ready:doclingReady});
});
