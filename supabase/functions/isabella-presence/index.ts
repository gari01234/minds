// Window · Isabella writes first, at most once a day (Phase 1, step 8). See _shared/isabella-presence.mjs.
// Called by .github/workflows/isabella-presence.yml; only that workflow on main can run it
// (GitHub OIDC token with audience minds-isabella-presence).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";
import {presencePusher} from "../_shared/presence-push.ts";
import {relationshipPolicy} from "../_shared/relationship-policy.ts";
import {resolveAssistantProfile,profileRelationshipPolicy} from "../_shared/assistant-profile.mjs";
import {PRESENCE_AUDIENCE,PRESENCE_MODEL,trustedPresenceWorkflow,runIsabellaPresence,presenceCaller} from "../_shared/isabella-presence.mjs";

const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  try{
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    const {payload}=await jwtVerify(token,jwks,{issuer:"https://token.actions.githubusercontent.com",audience:PRESENCE_AUDIENCE,maxTokenAge:"10 minutes"});
    if(!trustedPresenceWorkflow(payload))throw new Error("workflow");
  }catch{return json({error:"unauthorized_workflow"},401)}
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",apiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!apiKey)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const model=Deno.env.get("OPENAI_PRESENCE_MODEL")||Deno.env.get("OPENAI_MODEL")||PRESENCE_MODEL;
  try{
    const profile=resolveAssistantProfile(Deno.env.get("ASSISTANT_PROFILE")||"window");
    const result=await runIsabellaPresence({sb,model,profile:profile.id,callModel:presenceCaller(apiKey,model),relationship:profileRelationshipPolicy(relationshipPolicy("proactive"),profile.id),
      push:profile.multi_user?async()=>({sent:0}):presencePusher(sb),log:(...a:unknown[])=>console.error(...a)});
    return json(result,result.ok?200:207);
  }catch(e){
    console.error("isabella_presence_failed",e instanceof Error?e.message:String(e));
    return json({error:"isabella_presence_failed"},500);
  }
});
