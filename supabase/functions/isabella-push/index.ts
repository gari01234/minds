import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVapidKeys,VAPID_SUBJECT } from "../_shared/webpush.ts";
import { sendPushNotification,WebPushError } from "npm:@mmmike/web-push@1.3.0/send";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8"
};

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors});}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const auth=req.headers.get("Authorization")||"";
  if(!url||!anon||!service)return json({error:"server_not_configured"},503);
  if(!auth)return json({error:"unauthorized"},401);

  const userClient=createClient(url,anon,{
    global:{headers:{Authorization:auth}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:"unauthorized"},401);

  let body:any={};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const action=String(body?.action||"config");
  if(!["config","test"].includes(action))return json({error:"unsupported_action"},400);

  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(action==="test"){
    // An explicit user click is the only way to send a diagnostic Push.
    const {data:requestId,error:claimError}=await sb.rpc("minds_claim_push_test",{p_user:user.id});
    if(claimError)return json({error:"push_test_unavailable",detail:claimError.message},503);
    if(!requestId)return json({error:"push_test_rate_limited",message:"Espera 90 segundos antes de repetir la prueba."},429);
    const {data:sub,error:subError}=await sb.from("minds_push_subscriptions")
      .select("id,endpoint,p256dh,auth_key").eq("user_id",user.id).eq("active",true)
      .order("last_seen_at",{ascending:false}).limit(1).maybeSingle();
    if(subError||!sub){
      await sb.from("minds_push_test_requests").update({result:{status:"no_active_subscription"}}).eq("id",requestId);
      return json({error:"no_active_subscription",message:"Este dispositivo no tiene una suscripción activa en MINDS."},409);
    }
    try{
      const vapid=await ensureVapidKeys(sb);
      const accepted=await sendPushNotification(
        {endpoint:String(sub.endpoint),keys:{p256dh:String(sub.p256dh),auth:String(sub.auth_key)}},
        {title:"Isabella · prueba",body:"Esta es una notificación de prueba solicitada desde MINDS.",
          url:"/minds/isabella/",tag:"isabella-user-requested-push-test"},
        {publicKey:vapid.publicKey,privateKey:vapid.privateKey,subject:VAPID_SUBJECT},
        {ttl:300,urgency:"high"}
      );
      await sb.from("minds_push_test_requests").update({
        result:{status:accepted?"accepted_by_push_service":"subscription_gone",
          http_status:accepted?201:410,subscription_id:sub.id}
      }).eq("id",requestId);
      return json({ok:accepted,status:accepted?"accepted_by_push_service":"subscription_gone",
        message:accepted?"El servicio Push aceptó el aviso. Comprueba ahora el iPhone.":"La suscripción ya no es válida; renueva el registro."});
    }catch(e){
      const code=e instanceof WebPushError?Number(e.statusCode||0):0;
      const reason=e instanceof Error?e.message:String(e);
      await sb.from("minds_push_test_requests").update({
        result:{status:"failed",http_status:code||null,error:reason.slice(0,200)}
      }).eq("id",requestId);
      return json({error:"push_test_failed",detail:reason},502);
    }
  }
  try{
    const keys=await ensureVapidKeys(sb);
    return json({ok:true,public_key:keys.publicKey,transport:"web_push_v1",user_id:user.id});
  }catch(e){
    return json({error:"push_config_failed",detail:e instanceof Error?e.message:String(e)},500);
  }
});
