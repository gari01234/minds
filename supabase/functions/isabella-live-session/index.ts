// Isabella Live · owner-authenticated WebRTC SDP broker.
// Audio pilot only: no separate MINDS memory, tool authority or persistent transcripts.
// https://developers.openai.com/api/docs/guides/voice-webrtc
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const ORIGIN="https://gari01234.github.io";
const MAX_BODY=64*1024;
const MAX_SDP=56*1024;

function cors(origin:string|null){
  const approved=origin===ORIGIN;
  return {
    ...(approved?{"Access-Control-Allow-Origin":ORIGIN}:{}),
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin",
    "Cache-Control":"no-store"
  };
}
function json(value:unknown,status:number,origin:string|null){
  return new Response(JSON.stringify(value),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});
}
function publishableKey(){
  try{
    const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
    if(typeof keys?.default==="string"&&keys.default)return keys.default;
  }catch{}
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
}
function identity(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token||token.length>4096)return null;
  const url=Deno.env.get("SUPABASE_URL")||"",key=publishableKey();
  if(!url||!key)return null;
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return {client,token};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("Origin");
  if(origin!==ORIGIN)return json({error:"origin_not_allowed"},403,origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405,origin);

  const id=identity(req);
  if(!id)return json({error:"auth_required"},401,origin);
  const {data:{user},error}=await id.client.auth.getUser(id.token);
  if(error||!user||user.is_anonymous)return json({error:"invalid_session"},401,origin);

  const length=Number(req.headers.get("Content-Length")||0);
  if(length>MAX_BODY)return json({error:"offer_too_large"},413,origin);
  let body:any;
  try{
    const text=await req.text();
    if(text.length>MAX_BODY)return json({error:"offer_too_large"},413,origin);
    body=JSON.parse(text);
  }catch{return json({error:"invalid_json"},400,origin)}
  const sdp=body?.sdp;
  if(typeof sdp!=="string"||!sdp.startsWith("v=0\r\n")||
     sdp.length>MAX_SDP||sdp.length<100||!/\nm=audio /m.test(sdp)){
    return json({error:"invalid_audio_sdp"},400,origin);
  }
  const key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!key)return json({error:"live_not_configured"},503,origin);

  // Explicitly do not supply personal facts, sources, memories or tool privileges.
  // This pilot verifies *real output audio* on Safari before adding the governed
  // client-delegation bridge to MINDS. Never imply that it can act on the user's data.
  const session={
    model:"gpt-live-1",
    instructions:[
      "Hablas como Isabella en una prueba técnica y limitada de conversación oral.",
      "Sé natural, cálida, directa y concisa. Habla en español o alemán según el interlocutor.",
      "Se puede conversar informalmente e interrumpir. No necesitas prolongar la conversación.",
      "No tienes acceso a la memoria, calendario, proyectos, documentos ni herramientas de MINDS en esta prueba.",
      "No inventes datos personales ni afirmes que has recordado, buscado, creado, enviado o modificado nada.",
      "Si piden datos, acciones, programación o información externa, dilo brevemente y remite al chat escrito de Isabella.",
      "No te atribuyas consciencia, emociones humanas ni capacidades que no están conectadas.",
      "La app es dueña de permisos y datos; no tienes ninguna capacidad de acción ni confirmación."
    ].join(" "),
    audio:{output:{voice:"marin"}},
    delegation:{type:"client",acknowledgement_delay_ms:800},
    store:false
  };

  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    let response:Response;
    try{
      response=await fetch("https://api.openai.com/v1/live/sessions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
        body:JSON.stringify({session,transport:{type:"webrtc",sdp}}),
        signal:controller.signal
      });
    }finally{clearTimeout(timeout)}
    const result:any=await response.json().catch(()=>null);
    if(!response.ok){
      // No user credential or upstream error detail leaves this endpoint.
      console.error("isabella_live_session_rejected",response.status);
      return json({error:response.status===429?"live_capacity_unavailable":"live_provider_unavailable"},502,origin);
    }
    const answer=result?.transport?.sdp,sessionId=result?.session?.id;
    if(typeof answer!=="string"||!answer.startsWith("v=0")||typeof sessionId!=="string"||
       !sessionId.startsWith("live_")){
      return json({error:"live_invalid_answer"},502,origin);
    }
    return json({session:{id:sessionId},transport:{type:"webrtc",sdp:answer}},201,origin);
  }catch(e){
    console.error("isabella_live_session_error",e instanceof Error?e.name:"unknown");
    return json({error:"live_connection_failed"},502,origin);
  }
});
