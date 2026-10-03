import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createMcpHandler,McpServer} from "npm:@modelcontextprotocol/server@2.2.0";
import * as z from "npm:zod@4.6.5";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
async function sha256(text:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  const auth=String(req.headers.get("Authorization")||"");
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(token.length<32)return json({error:"capability_token_required"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const tokenHash=await sha256(token);
  const now=new Date().toISOString();
  const {data:grant,error:grantErr}=await sb.from("minds_runtime_capability_grants")
    .select("id,execution_id,user_id,capabilities,status,expires_at,use_count,metadata")
    .eq("token_hash",tokenHash).maybeSingle();
  if(grantErr)return json({error:"capability_lookup_failed"},500);
  if(!grant)return json({error:"capability_token_invalid"},401);
  if(grant.status!=="active")return json({error:"capability_not_active"},403);
  if(Date.parse(grant.expires_at)<=Date.now()){
    await sb.from("minds_runtime_capability_grants").update({status:"expired"}).eq("id",grant.id).eq("status","active");
    return json({error:"capability_expired"},403);
  }

  const {data:execution,error:execErr}=await sb.from("minds_mission_runtime_executions")
    .select("id,mission_run_id,user_id,provider,mode,lifecycle")
    .eq("id",grant.execution_id).eq("user_id",grant.user_id).maybeSingle();
  if(execErr||!execution)return json({error:"capability_execution_missing"},403);
  if(execution.provider!=="openai_agents"||execution.mode!=="shadow")
    return json({error:"capability_execution_not_allowed"},403);

  const {data:run,error:runErr}=await sb.from("minds_mission_runs")
    .select("id,workspace_id,user_id,instruction,status,iteration,max_iterations")
    .eq("id",execution.mission_run_id).eq("user_id",grant.user_id).maybeSingle();
  if(runErr||!run)return json({error:"capability_mission_missing"},403);

  const allowed=new Set((grant.capabilities||[]).map(String));

  async function audit(capability:string,details:Record<string,unknown>={}){
    await Promise.all([
      sb.from("minds_runtime_capability_grants").update({
        last_used_at:new Date().toISOString(),
        use_count:Number(grant.use_count||0)+1
      }).eq("id",grant.id).eq("status","active"),
      sb.from("minds_mission_runtime_events").insert({
        execution_id:execution.id,
        user_id:grant.user_id,
        event_type:"mcp.read",
        provider_turn_id:null,
        payload:{
          capability,
          grant_id:grant.id,
          mission_run_id:run.id,
          ...details
        }
      })
    ]);
  }

  const handler=createMcpHandler(()=>{
    const server=new McpServer({name:"MINDS Runtime Read Boundary",version:"0.1.0"});

    if(allowed.has("read_mission_workspace")){
      server.registerTool("read_mission_workspace",{
        description:"Read the Mission Workspace bound to this execution. Returns only objective, completion criterion, summary, and bounded workspace items with provenance.",
        inputSchema:z.object({})
      },async()=>{
        const [{data:workspace,error:wErr},{data:items,error:iErr}]=await Promise.all([
          sb.from("minds_commitment_workspaces")
            .select("id,commitment_id,title,objective_snapshot,completion_criteria_snapshot,status,summary,updated_at")
            .eq("id",run.workspace_id).eq("user_id",grant.user_id).maybeSingle(),
          sb.from("minds_commitment_workspace_items")
            .select("id,kind,status,content,provenance_class,source_kind,source_ref,created_at")
            .eq("workspace_id",run.workspace_id).eq("user_id",grant.user_id)
            .order("created_at",{ascending:true}).limit(80)
        ]);
        if(wErr||!workspace)throw new Error("workspace_unavailable");
        if(iErr)throw iErr;
        const bounded=(items||[]).map((x:any)=>({
          id:x.id,
          kind:x.kind,
          status:x.status,
          content:String(x.content||"").slice(0,12000),
          provenance_class:x.provenance_class,
          source_kind:x.source_kind,
          source_ref:x.source_ref,
          created_at:x.created_at
        }));
        await audit("read_mission_workspace",{workspace_id:workspace.id,item_count:bounded.length});
        return {content:[{type:"text",text:JSON.stringify({
          mission_run_id:run.id,
          workspace:{
            id:workspace.id,
            title:workspace.title,
            objective:workspace.objective_snapshot,
            completion_criterion:workspace.completion_criteria_snapshot,
            status:workspace.status,
            summary:workspace.summary,
            updated_at:workspace.updated_at
          },
          items:bounded
        })}]};
      });
    }

    if(allowed.has("read_relevant_artifacts")){
      server.registerTool("read_relevant_artifacts",{
        description:"Read metadata only for permanent MINDS artifacts already accepted into this Mission Workspace. Does not expose quarantine candidates or file bytes.",
        inputSchema:z.object({})
      },async()=>{
        const {data:rows,error}=await sb.from("minds_artifacts")
          .select("id,source_kind,kind,title,mime_type,storage_path,metadata,created_at")
          .eq("workspace_id",run.workspace_id).eq("user_id",grant.user_id)
          .order("created_at",{ascending:false}).limit(40);
        if(error)throw error;
        const artifacts=(rows||[]).map((x:any)=>({
          id:x.id,source_kind:x.source_kind,kind:x.kind,title:x.title,mime_type:x.mime_type,
          sha256:x.metadata?.sha256||null,size_bytes:x.metadata?.size_bytes||null,created_at:x.created_at
        }));
        await audit("read_relevant_artifacts",{artifact_count:artifacts.length});
        return {content:[{type:"text",text:JSON.stringify({mission_run_id:run.id,artifacts})}]};
      });
    }

    if(allowed.has("read_project_context")){
      server.registerTool("read_project_context",{
        description:"Read minimal project identity and confirmed project claims for the project bound to this Commitment. Returns no files and no credentials.",
        inputSchema:z.object({})
      },async()=>{
        const {data:workspace,error:wErr}=await sb.from("minds_commitment_workspaces")
          .select("commitment_id").eq("id",run.workspace_id).eq("user_id",grant.user_id).maybeSingle();
        if(wErr||!workspace)throw new Error("workspace_unavailable");
        const {data:commitment,error:cErr}=await sb.from("minds_commitments")
          .select("project_id").eq("id",workspace.commitment_id).eq("user_id",grant.user_id).maybeSingle();
        if(cErr||!commitment)throw new Error("commitment_unavailable");
        if(!commitment.project_id){
          await audit("read_project_context",{project_bound:false,claim_count:0});
          return {content:[{type:"text",text:JSON.stringify({project:null,claims:[]})}]};
        }
        const [{data:project,error:pErr},{data:claims,error:clErr}]=await Promise.all([
          sb.from("isabella_projects").select("id,client_key,name").eq("id",commitment.project_id).eq("user_id",grant.user_id).maybeSingle(),
          sb.from("minds_work_claims")
            .select("id,statement,claim_type,provenance_class,status,discipline,topic,subject,updated_at")
            .eq("project_id",commitment.project_id).eq("user_id",grant.user_id)
            .eq("status","confirmed").order("updated_at",{ascending:false}).limit(40)
        ]);
        if(pErr)throw pErr;if(clErr)throw clErr;
        const bounded=(claims||[]).map((x:any)=>({...x,statement:String(x.statement||"").slice(0,6000)}));
        await audit("read_project_context",{project_bound:true,project_id:project?.id||null,claim_count:bounded.length});
        return {content:[{type:"text",text:JSON.stringify({project,claims:bounded})}]};
      });
    }

    return server;
  });

  return handler.fetch(req);
});