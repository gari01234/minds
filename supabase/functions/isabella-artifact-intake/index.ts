import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
async function sha256(bytes:Uint8Array){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function safeName(path:string,kind:string){
  const raw=String(path||"").split("/").pop()||("artifact."+kind);
  return raw.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,180)||("artifact."+kind);
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const authHeader=String(req.headers.get("Authorization")||"");
  const token=authHeader.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({error:"auth_required"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:userData,error:userErr}=await sb.auth.getUser(token);
  const user=userData?.user;
  if(userErr||!user)return json({error:"invalid_session"},401);

  let body:any={};try{body=await req.json()}catch{}
  const action=String(body?.action||"");
  const intakeId=String(body?.intake_id||"");
  if(!["preview","promote"].includes(action)||!/^[0-9a-f-]{36}$/i.test(intakeId))
    return json({error:"invalid_request"},400);

  try{
    const {data:intake,error:intakeErr}=await sb.from("minds_artifact_intake")
      .select("id,execution_id,user_id,provider,provider_artifact_id,provider_path,kind,title,mime_type,size_bytes,sha256,quarantine_storage_path,status,accepted_artifact_id,expires_at,metadata")
      .eq("id",intakeId).eq("user_id",user.id).maybeSingle();
    if(intakeErr)throw intakeErr;
    if(!intake)return json({error:"artifact_intake_not_found"},404);

    if(action==="preview"){
      if(!["pending","accepted"].includes(String(intake.status)))
        return json({error:"artifact_intake_not_previewable",status:intake.status},409);
      if(intake.expires_at&&Date.parse(intake.expires_at)<Date.now())
        return json({error:"artifact_intake_expired"},410);
      const {data,error}=await sb.storage.from("minds-artifact-intake")
        .createSignedUrl(intake.quarantine_storage_path,600);
      if(error||!data?.signedUrl)throw error||new Error("preview_url_missing");
      return json({
        ok:true,
        url:data.signedUrl,
        expires_in:600,
        title:intake.title,
        kind:intake.kind,
        mime_type:intake.mime_type,
        size_bytes:intake.size_bytes,
        sha256:intake.sha256
      });
    }

    if(intake.status==="promoted"&&intake.accepted_artifact_id){
      const {data:artifact}=await sb.from("minds_artifacts")
        .select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at")
        .eq("id",intake.accepted_artifact_id).maybeSingle();
      return json({ok:true,already_promoted:true,artifact});
    }
    if(intake.status!=="accepted")return json({error:"artifact_intake_not_accepted",status:intake.status},409);
    if(intake.expires_at&&Date.parse(intake.expires_at)<Date.now())
      return json({error:"artifact_intake_expired"},410);

    const {data:blob,error:downloadErr}=await sb.storage.from("minds-artifact-intake")
      .download(intake.quarantine_storage_path);
    if(downloadErr||!blob)throw downloadErr||new Error("quarantine_download_failed");
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes.byteLength!==Number(intake.size_bytes))return json({error:"artifact_size_mismatch"},409);
    const digest=await sha256(bytes);
    if(digest!==String(intake.sha256))return json({error:"artifact_hash_mismatch"},409);
    if(String(blob.type||intake.mime_type)!==String(intake.mime_type) && blob.type)
      return json({error:"artifact_mime_mismatch"},409);

    const {data:execution,error:execErr}=await sb.from("minds_mission_runtime_executions")
      .select("id,mission_run_id,user_id,provider").eq("id",intake.execution_id).eq("user_id",user.id).maybeSingle();
    if(execErr||!execution)return json({error:"runtime_execution_missing"},409);
    const {data:run,error:runErr}=await sb.from("minds_mission_runs")
      .select("id,workspace_id").eq("id",execution.mission_run_id).eq("user_id",user.id).maybeSingle();
    if(runErr||!run)return json({error:"mission_run_missing"},409);

    const filename=safeName(intake.provider_path,intake.kind);
    const permanentPath=user.id+"/mission-runtime/"+intake.id+"/"+filename;

    const {error:uploadErr}=await sb.storage.from("minds-artifacts").upload(permanentPath,bytes,{
      contentType:intake.mime_type,
      upsert:true
    });
    if(uploadErr)throw uploadErr;

    let {data:artifact,error:artifactFindErr}=await sb.from("minds_artifacts")
      .select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at")
      .eq("user_id",user.id).eq("storage_path",permanentPath).maybeSingle();
    if(artifactFindErr)throw artifactFindErr;
    if(!artifact){
      const inserted=await sb.from("minds_artifacts").insert({
        user_id:user.id,
        workspace_id:run.workspace_id,
        source_kind:"mission_runtime",
        kind:intake.kind,
        title:intake.title,
        mime_type:intake.mime_type,
        storage_path:permanentPath,
        metadata:{
          artifact_intake_id:intake.id,
          execution_id:intake.execution_id,
          mission_run_id:execution.mission_run_id,
          provider:intake.provider,
          provider_artifact_id:intake.provider_artifact_id,
          provider_path:intake.provider_path,
          sha256:intake.sha256,
          size_bytes:intake.size_bytes,
          provenance_class:"agent",
          accepted_by:user.id,
          accepted_at:new Date().toISOString()
        }
      }).select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at").single();
      if(inserted.error){
        await sb.storage.from("minds-artifacts").remove([permanentPath]);
        throw inserted.error;
      }
      artifact=inserted.data;
    }

    const {data:updated,error:updateErr}=await sb.from("minds_artifact_intake")
      .update({status:"promoted",accepted_artifact_id:artifact.id})
      .eq("id",intake.id).eq("user_id",user.id).eq("status","accepted")
      .select("id,status,accepted_artifact_id,promoted_at").single();
    if(updateErr)throw updateErr;

    await sb.storage.from("minds-artifact-intake").remove([intake.quarantine_storage_path]);

    await sb.from("minds_mission_runtime_events").insert({
      execution_id:intake.execution_id,
      user_id:user.id,
      event_type:"artifact.promoted",
      provider_turn_id:null,
      payload:{
        artifact_intake_id:intake.id,
        artifact_id:artifact.id,
        sha256:intake.sha256,
        kind:intake.kind,
        title:intake.title
      }
    });

    return json({ok:true,intake:updated,artifact});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    console.log("ARTIFACT_INTAKE_EDGE_ERROR "+detail);
    return json({error:"artifact_intake_failed",detail},500);
  }
});