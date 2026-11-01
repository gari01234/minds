// Window · nightly Akte-Pflege. Called once a night by .github/workflows/akte-pflege.yml.
// Only that workflow on main can run it: the request must carry a GitHub OIDC token for it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";
import {PFLEGE_AUDIENCE,PFLEGE_MODEL,trustedPflegeWorkflow,runAktePflege,openaiCaller} from "../_shared/akte-pflege.mjs";

const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:PFLEGE_AUDIENCE,maxTokenAge:"10 minutes"});
    if(!trustedPflegeWorkflow(payload))throw new Error("workflow");
  }catch{return json({error:"unauthorized_workflow"},401)}
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const model=Deno.env.get("OPENAI_AKTE_MODEL")||PFLEGE_MODEL;
  try{
    const result=await runAktePflege({sb,model,callModel:openaiCaller(apiKey,model),log:(...a:unknown[])=>console.error(...a)});
    return json(result,result.ok?200:207);
  }catch(e){
    console.error("akte_pflege_run_failed",e instanceof Error?e.message:String(e));
    return json({error:"akte_pflege_failed"},500);
  }
});
