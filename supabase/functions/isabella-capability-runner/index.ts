import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {reconcileCapabilityRun} from "../_shared/capability-runtime.ts";

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}})}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:secret,error:secretError}=await sb.from("isabella_runtime_secrets").select("value").eq("key","capability_runner").maybeSingle();
  if(secretError||!secret?.value||String(body?.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);

  const {data:runs,error}=await sb.from("minds_capability_runs").select("*")
    .in("status",["queued","in_progress"]).not("provider_response_id","is",null)
    .order("updated_at",{ascending:true}).limit(12);
  if(error)return json({error:"capability_runs_read_failed",detail:error.message},500);

  const results:any[]=[];
  for(const run of runs||[]){
    try{
      const missionParent=String(run?.metadata?.delivery||"")==="mission_parent";
      const rec=await reconcileCapabilityRun(sb,apiKey,run,{deliver:!missionParent});
      results.push({id:run.id,status:rec.status,artifacts:rec.artifacts?.length||0,mission_parent:missionParent});
    }catch(e){
      const detail=e instanceof Error?e.message:String(e);
      await sb.from("minds_capability_runs").update({error:detail.slice(0,4000),updated_at:new Date().toISOString()}).eq("id",run.id);
      results.push({id:run.id,status:"inspect_error",error:detail.slice(0,500)});
    }
  }
  return json({ok:true,checked:results.length,results});
});
