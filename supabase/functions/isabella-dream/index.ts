// Window · Isabella's nightly dreaming (memory consolidation of her conversation with Gari).
// Started by isabella-heartbeat (pg_cron, every 15 min) between 02:00 and 06:00 local with the heartbeat
// runner secret: one pass per call, at most a few per night (dreamDue). The manual workflow
// .github/workflows/isabella-dream.yml (GitHub OIDC, audience minds-isabella-dream) runs it on demand.
// See _shared/isabella-dream.mjs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";
import {DREAM_AUDIENCE,DREAM_MODEL,trustedDreamWorkflow,runIsabellaDream,dreamCaller} from "../_shared/isabella-dream.mjs";
import {timingSafeEqual} from "node:crypto";

const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

const sameSecret=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);return x.length===y.length&&timingSafeEqual(x,y)};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{}
  // Two callers: the heartbeat (its runner secret; the night's gate decides) or the manual workflow (runs now).
  let due=false;
  const given=String(body?.secret||"");
  if(given){
    const {data:secret}=await sb.from("isabella_runtime_secrets").select("value").eq("key","heartbeat_runner").maybeSingle();
    if(!secret?.value||!sameSecret(given,String(secret.value)))return json({error:"unauthorized"},401);
    due=true;
  }else{
    try{
      const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
      const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:DREAM_AUDIENCE,maxTokenAge:"10 minutes"});
      if(!trustedDreamWorkflow(payload))throw new Error("workflow");
    }catch{return json({error:"unauthorized_workflow"},401)}
  }
  // A larger model suits the offline pass (it is not latency-bound); configurable without a deploy.
  const model=Deno.env.get("OPENAI_DREAM_MODEL")||Deno.env.get("OPENAI_DEEP_MODEL")||DREAM_MODEL;
  try{
    const result=await runIsabellaDream({sb,model,due,profile:Deno.env.get('ASSISTANT_PROFILE')||'window',callModel:dreamCaller(apiKey,model),log:(...a:unknown[])=>console.error(...a)});
    return json(result,result.ok?200:207);
  }catch(e){
    console.error("isabella_dream_run_failed",e instanceof Error?e.message:String(e));
    return json({error:"isabella_dream_failed"},500);
  }
});
