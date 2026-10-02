import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushNotification, WebPushError } from "npm:@mmmike/web-push@1.3.0/send";
import { ensureVapidKeys, VAPID_SUBJECT, humanPushBody, endpointHash } from "../_shared/webpush.ts";

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  let body:any={};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:secret,error:secretError}=await sb.from("isabella_runtime_secrets")
    .select("value").eq("key","delivery_runner").maybeSingle();
  if(secretError||!secret?.value||String(body?.secret||"")!==String(secret.value))return json({error:"unauthorized"},401);

  let vapid;
  try{vapid=await ensureVapidKeys(sb)}
  catch(e){return json({error:"vapid_unavailable",detail:e instanceof Error?e.message:String(e)},500)}

  const {data:intents,error:claimError}=await sb.rpc("minds_claim_delivery_intents",{p_limit:12});
  if(claimError)return json({error:"claim_failed",detail:claimError.message},500);

  const results:any[]=[];
  for(const intent of intents||[]){
    const attempts:any[]=[];
    try{
      const {data:subscriptions,error:subError}=await sb.from("minds_push_subscriptions")
        .select("id,endpoint,p256dh,auth_key,expiration_time")
        .eq("user_id",intent.user_id).eq("active",true)
        .order("last_seen_at",{ascending:false}).limit(8);
      if(subError)throw subError;

      for(const sub of subscriptions||[]){
        const hash=await endpointHash(String(sub.endpoint||""));
        try{
          const accepted=await sendPushNotification(
            {
              endpoint:String(sub.endpoint),
              expirationTime:sub.expiration_time??null,
              keys:{p256dh:String(sub.p256dh),auth:String(sub.auth_key)}
            },
            {
              title:"Isabella",
              body:humanPushBody(intent.payload),
              url:String(intent.payload?.url||"/minds/isabella/"),
              tag:"attention-"+String(intent.attention_event_id)
            },
            {publicKey:vapid.publicKey,privateKey:vapid.privateKey,subject:VAPID_SUBJECT},
            {
              ttl:Math.max(60,Math.min(86400,Math.floor((new Date(intent.expires_at).getTime()-Date.now())/1000))),
              urgency:intent.payload?.requires_user||intent.payload?.user_requested?"high":"normal"
            }
          );
          attempts.push({
            subscription_id:sub.id,
            status:accepted?"accepted":"gone",
            http_status:accepted?201:410,
            endpoint_hash:hash
          });
        }catch(e){
          const status=e instanceof WebPushError?Number(e.statusCode||0):0;
          attempts.push({
            subscription_id:sub.id,
            status:status===404||status===410?"gone":"failed",
            http_status:status||null,
            error:e instanceof Error?e.message:String(e),
            endpoint_hash:hash
          });
        }
      }

      const {data:finished,error:finishError}=await sb.rpc("minds_finish_delivery_intent",{
        p_intent_id:intent.id,
        p_lease_token:intent.lease_token,
        p_results:attempts
      });
      if(finishError)throw finishError;
      results.push({id:intent.id,status:finished?.status||"unknown",attempts:attempts.length});
    }catch(e){
      const fallback=[{status:"failed",error:e instanceof Error?e.message:String(e)}];
      const {data:finished}=await sb.rpc("minds_finish_delivery_intent",{
        p_intent_id:intent.id,
        p_lease_token:intent.lease_token,
        p_results:fallback
      });
      results.push({id:intent.id,status:finished?.status||"error",error:e instanceof Error?e.message:String(e)});
    }
  }

  return json({ok:true,claimed:(intents||[]).length,results});
});
