import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVapidKeys } from "../_shared/webpush.ts";

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
  if(String(body?.action||"config")!=="config")return json({error:"unsupported_action"},400);

  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const keys=await ensureVapidKeys(sb);
    return json({ok:true,public_key:keys.publicKey,transport:"web_push_v1",user_id:user.id});
  }catch(e){
    return json({error:"push_config_failed",detail:e instanceof Error?e.message:String(e)},500);
  }
});
