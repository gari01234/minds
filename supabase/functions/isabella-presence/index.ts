// Window · Isabella writes first, at most once a day (Phase 1, step 8). See _shared/isabella-presence.mjs.
// Called by .github/workflows/isabella-presence.yml; only that workflow on main can run it
// (GitHub OIDC token with audience minds-isabella-presence).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";
import {sendPushNotification} from "npm:@mmmike/web-push@1.3.0/send";
import {ensureVapidKeys,VAPID_SUBJECT} from "../_shared/webpush.ts";
import {relationshipPolicy} from "../_shared/relationship-policy.ts";
import {PRESENCE_AUDIENCE,PRESENCE_MODEL,trustedPresenceWorkflow,runIsabellaPresence,presenceCaller} from "../_shared/isabella-presence.mjs";

const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

// A short banner to Gari's devices; the message itself is in the chat.
function pusher(sb:any){
  return async(userId:string,text:string,day:string)=>{
    const vapid=await ensureVapidKeys(sb);
    const {data:subs,error}=await sb.from("minds_push_subscriptions").select("id,endpoint,p256dh,auth_key")
      .eq("user_id",userId).eq("active",true).order("last_seen_at",{ascending:false}).limit(8);
    if(error)return {sent:0};
    let sent=0;
    for(const sub of subs||[]){
      try{
        const ok=await sendPushNotification({endpoint:String(sub.endpoint),keys:{p256dh:String(sub.p256dh),auth:String(sub.auth_key)}},
          {title:"Isabella",body:text.length>140?text.slice(0,139)+"…":text,url:"/minds/isabella/",tag:"presence-"+day},
          {publicKey:vapid.publicKey,privateKey:vapid.privateKey,subject:VAPID_SUBJECT},{ttl:4*3600,urgency:"normal"});
        if(ok)sent++;
      }catch{/* a gone device is cleaned up by the delivery runner */}
    }
    return {sent};
  };
}

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
    const result=await runIsabellaPresence({sb,model,callModel:presenceCaller(apiKey,model),relationship:relationshipPolicy("proactive"),
      push:pusher(sb),log:(...a:unknown[])=>console.error(...a)});
    return json(result,result.ok?200:207);
  }catch(e){
    console.error("isabella_presence_failed",e instanceof Error?e.message:String(e));
    return json({error:"isabella_presence_failed"},500);
  }
});
