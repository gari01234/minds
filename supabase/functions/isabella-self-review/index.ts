import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {SELF_REVIEW_INSTRUCTIONS,selfReviewSchema,validateSelfReview,evidencePacket} from "../_shared/self-review.mjs";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 let body:any;try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
 if(!url||!key||!apiKey)return json({error:"server_not_configured"},503);
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const secret=await sb.from("isabella_runtime_secrets").select("value").eq("key","self_review_runner").maybeSingle();
 if(secret.error||!secret.data?.value||body?.secret!==secret.data.value)return json({error:"unauthorized"},401);
 const claim=await sb.rpc("minds_claim_self_review_v1");if(claim.error)return json({error:"claim_failed"},500);
 const job=claim.data;if(!job)return json({status:"idle"});
 try{
  const since=job.window_start,until=job.window_end,u=job.user_id;
  const queries=[
   {kind:"message",query:sb.from("conversation_messages").select("id,role,content,created_at,conversation_id,exposure_scope_key",{count:"exact"}).eq("user_id",u).gte("created_at",since).lt("created_at",until).order("created_at",{ascending:false}).limit(240)},
   {kind:"run",query:sb.from("minds_agent_runs").select("id,feature,status,route,metadata,error,started_at",{count:"exact"}).eq("user_id",u).eq("feature","isabella_chat").gte("started_at",since).lt("started_at",until).order("started_at").limit(120)},
   {kind:"decision",query:sb.from("minds_shadow_decisions").select("id,request_id,action,status,candidate,reviewed_candidate,created_at",{count:"exact"}).eq("user_id",u).gte("created_at",since).lt("created_at",until).order("created_at").limit(80)},
   {kind:"calendar_receipt",query:sb.from("minds_calendar_action_receipts").select("id,request_id,action,entity_id,after_state,created_at",{count:"exact"}).eq("user_id",u).gte("created_at",since).lt("created_at",until).limit(80)},
   {kind:"routine_receipt",query:sb.from("minds_routine_action_receipts").select("id,request_id,action,entity_id,after_state,created_at",{count:"exact"}).eq("user_id",u).gte("created_at",since).lt("created_at",until).limit(80)},
   {kind:"routine_snapshot",query:sb.from("isabella_routines").select("id,title,schedule,timezone,enabled,updated_at",{count:"exact"}).eq("user_id",u).order("id").limit(100)}
  ];
  const raw=await Promise.all(queries.map(async q=>{const r=await q.query;return {kind:q.kind,rows:r.data||[],count:r.count,error:r.error?.message}}));
  // Protect the context budget without pretending it contains complete sources.
  for(const g of raw)g.rows=g.rows.map((r:any)=>g.kind==="message"?{...r,content:String(r.content||"").slice(0,5000),content_truncated:String(r.content||"").length>5000}:r);
  const packet:{evidence:any[];coverage:Record<string,any>}=evidencePacket(raw);
  const existingResult=await sb.from("minds_self_review_proposals").select("id,problem_key,title,status,details,owner_note",{count:"exact"}).eq("user_id",u).eq("project_id",job.project_id).order("created_at",{ascending:false}).limit(100);
  if(existingResult.error)throw Error("existing_proposals_unavailable");
  const existing=existingResult.data||[];
  packet.coverage.existing_proposals={available:existingResult.count,included:existing.length,complete:existing.length===existingResult.count};
  let report:any;
  const primary=raw.filter(g=>["message","run"].includes(g.kind));
  if(primary.every(g=>g.error))throw Error("conversation_and_run_evidence_unavailable");
  if(primary.every(g=>!g.error&&g.count===0))report={summary:"No se registraron conversaciones ni ejecuciones de Isabella en este periodo. No hay interacción nueva que evaluar.",what_worked:"No evaluado por falta de actividad.",limitations:"La ausencia de actividad no demuestra una mejora ni un fallo.",findings:[]};
  else{
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:AbortSignal.timeout(85000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:Deno.env.get("OPENAI_REVIEW_MODEL")||Deno.env.get("OPENAI_MODEL")||"gpt-5.6",reasoning:{effort:"medium"},max_output_tokens:6500,
    instructions:SELF_REVIEW_INSTRUCTIONS,text:{format:{type:"json_schema",name:"isabella_daily_review",strict:true,schema:selfReviewSchema}},
    input:[{role:"user",content:JSON.stringify({window:{start:since,end:until,key:job.review_key},...packet,existing_proposals:existing})}]
   })});
   const payload=await response.json();if(!response.ok)throw Error("review_model_http_"+response.status);
   const output=(payload.output||[]).filter((o:any)=>o.type==="message").flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==="output_text").map((c:any)=>c.text).join("");
   report=validateSelfReview(JSON.parse(output),packet.evidence,existing);
   packet.coverage.model={model:payload.model,usage:payload.usage||{},independent_verification:false};
  }
  const done=await sb.rpc("minds_finish_self_review_v1",{p_id:job.id,p_token:job.lease_token,p_report:report,p_evidence:packet.evidence,p_coverage:packet.coverage});
  if(done.error)throw done.error;
  return json(done.data);
 }catch(e){
  const detail=e instanceof Error?e.message:String(e);
  await sb.from("minds_self_review_reports").update({status:"failed",error:detail.slice(0,500),lease_until:null}).eq("id",job.id).eq("lease_token",job.lease_token).eq("status","running");
  return json({status:"failed",report_id:job.id,error:detail.slice(0,500)},500);
 }
});
