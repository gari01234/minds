import {liveConversation,loadVoiceContext,buildVoiceSessionContext,persistVoiceTurn} from "../_shared/live-context.mjs";
import {resolveAssistantProfile} from "../_shared/assistant-profile.mjs";
import {liveOriginAllowed,liveCorsOrigin,liveOwner,liveOriginalVoiceAllowed} from "../_shared/office-live-contract.mjs";
// Isabella Live · owner-authenticated WebRTC SDP broker.
// Window conserva los turnos de voz en su conversación global.
// https://developers.openai.com/api/docs/guides/voice-webrtc
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const ORIGIN="https://gari01234.github.io";
const ASSISTANT_PROFILE=resolveAssistantProfile(Deno.env.get("ASSISTANT_PROFILE")||"window");
const MAX_BODY=64*1024;
const MAX_SDP=56*1024;
const ORIGINAL_ALIAS="isabella-original-v1";
const ORIGINAL_PREF="live_voice_isabella_original_v1";
const ORIGINAL_NAME="Isabella · Original I";
const ORIGINAL_PROMPT=[
  "Create a distinct, original adult feminine voice. Do not emulate or imitate any real individual, celebrity, actor, character, existing synthetic voice or branded assistant.",
  "The voice is intimate in the acoustic sense: warm, clear, natural, and present, with a comfortable medium pitch and a gentle lower-mid resonance.",
  "Use a lightly airy texture and a subtle warm grain without excessive breathiness, exaggerated huskiness or artificial sultriness.",
  "Its rhythm is gently spontaneous: relaxed conversational tempo, flexible short pauses, a hint of dry humor and a naturally smiling, curious inflection.",
  "Speech should sound like a thoughtful conversation with a familiar person, not like narration, a call-center voice, an advertisement, or a whisper.",
  "Produce clear Spanish and German pronunciation, preserving the same recognizable vocal identity across both languages.",
  "Keep emotional modulation nuanced and restrained; allow a lightly playful edge without sounding performative."
].join(" ");
const isVoiceId=(id:unknown)=>typeof id==="string"&&/^voice_[A-Za-z0-9_-]{1,128}$/.test(id);
async function existingOriginalVoice(client:any,userId:string){
  const {data,error}=await client.from("isabella_preferences")
    .select("value").eq("user_id",userId).eq("preference_key",ORIGINAL_PREF)
    .eq("status","confirmed").maybeSingle();
  if(error)throw new Error("voice_preference_unavailable");
  const id=data?.value?.voice_id;
  return isVoiceId(id)?id:null;
}
// Documented built-in GPT-Live voices; server verifies every client choice.
const LIVE_VOICES=new Set(["alloy","ash","ballad","beacon","bossa","brise","cedar","cinder","coral","delta","echo","flitz","gleam","harema","juni","marin","meridian","nira","noeul","nuri","quartz","ripple","sage","shida","shimmer","sillage","stone","tempo","verse","vesper","willow"]);

function cors(origin:string|null){
  const allowed=liveCorsOrigin(origin,ASSISTANT_PROFILE.id);
  return {
    ...(allowed?{"Access-Control-Allow-Origin":allowed}:{}),
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
  const client=createClient(url,key,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  return {client,token};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("Origin");
  if(!liveOriginAllowed(origin,ASSISTANT_PROFILE.id))return json({error:"origin_not_allowed"},403,origin);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405,origin);

  const id=identity(req);
  if(!id)return json({error:"auth_required"},401,origin);
  const {data:{user},error}=await id.client.auth.getUser(id.token);
  if(error||!user||user.is_anonymous)return json({error:"invalid_session"},401,origin);
  const ownerName=await liveOwner(id.client,user.id,ASSISTANT_PROFILE.id);
  if(!ownerName)return json({error:"office_member_unavailable"},403,origin);

  const length=Number(req.headers.get("Content-Length")||0);
  if(length>MAX_BODY)return json({error:"offer_too_large"},413,origin);
  let body:any;
  try{
    const text=await req.text();
    if(text.length>MAX_BODY)return json({error:"offer_too_large"},413,origin);
    body=JSON.parse(text);
  }catch{return json({error:"invalid_json"},400,origin)}
  // Explicit first-use creation from a single fixed text prompt; no voice cloning.
  // The resulting ID is saved under the authenticated owner's existing RLS policy.
  if(body?.action==="ensure_original_voice"){
    if(!liveOriginalVoiceAllowed(ASSISTANT_PROFILE.id))return json({error:"original_voice_unavailable_for_office"},403,origin);
    try{
      const stored=await existingOriginalVoice(id.client,user.id);
      if(stored)return json({ready:true,reused:true},200,origin);
      const apiKey=(Deno.env.get("OPENAI_API_KEY")||Deno.env.get("TBA_OFFICE_OPENAI_API_KEY"))||"";
      if(!apiKey)return json({error:"live_not_configured"},503,origin);
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),30000);
      let reply:Response;
      try{
        reply=await fetch("https://api.openai.com/v1/audio/voices",{
          method:"POST",
          headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
          body:JSON.stringify({type:"prompt",name:ORIGINAL_NAME,prompt:ORIGINAL_PROMPT,model:"auto"}),
          signal:ctrl.signal
        });
      }finally{clearTimeout(timer)}
      if(!reply.ok){
        // A 400 can mean an invalid optional creation script/prompt, not a policy denial.
        // Never log personal content or expose provider diagnostics to the browser.
        const failure=await reply.json().catch(()=>null);
        const safe=(s:unknown)=>typeof s==="string"&&/^[a-zA-Z0-9_.-]{1,80}$/.test(s)?s:"unknown";
        console.error("isabella_original_voice_create_failed",
          reply.status,safe(failure?.error?.code),safe(failure?.error?.type),safe(failure?.error?.param));
        const kind=reply.status===400?"original_voice_invalid_request":
          reply.status===401||reply.status===403?"original_voice_access_denied":
          "original_voice_provider_unavailable";
        return json({error:kind},502,origin);
      }
      const created=await reply.json().catch(()=>null);
      if(created?.object!=="audio.voice"||created?.type!=="prompt"||!isVoiceId(created?.id))
        return json({error:"original_voice_invalid_response"},502,origin);
      const {error:writeError}=await id.client.from("isabella_preferences").upsert({
        user_id:user.id,preference_key:ORIGINAL_PREF,
        value:{voice_id:created.id,description_version:1,kind:"original_prompt"},
        status:"confirmed",confidence:1,
        evidence:[{kind:"explicit_user_request",source:"isabella_live_pilot"}]
      },{onConflict:"user_id,preference_key"});
      if(writeError){
        console.error("isabella_original_voice_preference_failed");
        return json({error:"original_voice_save_failed"},503,origin);
      }
      return json({ready:true,reused:false},201,origin);
    }catch(e){
      console.error("isabella_original_voice_create_error",
        e instanceof Error?e.message.slice(0,60):"unknown");
      return json({error:"original_voice_unavailable"},503,origin);
    }
  }
  if(body?.action==="save_transcript"){
    try{return json(await persistVoiceTurn(id.client,user.id,body,ASSISTANT_PROFILE.id),200,origin)}
    catch{return json({error:"voice_transcript_unconfirmed"},409,origin)}
  }
  if(body?.action!==undefined)return json({error:"invalid_action"},400,origin);
  const voice=body?.voice===undefined?"nuri":body.voice;
  if(typeof voice!=="string"||(!LIVE_VOICES.has(voice)&&(voice!==ORIGINAL_ALIAS||!liveOriginalVoiceAllowed(ASSISTANT_PROFILE.id))))
    return json({error:"invalid_voice"},400,origin);
  let voiceValue:string|{id:string}=voice;
  if(voice===ORIGINAL_ALIAS){
    try{
      const ownerVoice=await existingOriginalVoice(id.client,user.id);
      if(!ownerVoice)return json({error:"original_voice_not_ready"},409,origin);
      voiceValue={id:ownerVoice};
    }catch{
      return json({error:"original_voice_unavailable"},503,origin);
    }
  }
  const sdp=body?.sdp;
  if(typeof sdp!=="string"||!sdp.startsWith("v=0\r\n")||
     sdp.length>MAX_SDP||sdp.length<100||!/\nm=audio /m.test(sdp)){
    return json({error:"invalid_audio_sdp"},400,origin);
  }
  const key=(Deno.env.get("OPENAI_API_KEY")||Deno.env.get("TBA_OFFICE_OPENAI_API_KEY"))||"";
  if(!key)return json({error:"live_not_configured"},503,origin);

  // GPT-Live is solely Isabella's voice. MINDS retains all memory, facts,
  // tool permissions, action receipts, approval decisions and canonical state.
  let conversationId:string,voiceContext;
  try{
    conversationId=await liveConversation(id.client,user.id,null,ASSISTANT_PROFILE.id);
    const context=await loadVoiceContext(id.client,user.id,conversationId);
    voiceContext=buildVoiceSessionContext(context.data,context.recent,voice===ORIGINAL_ALIAS?ORIGINAL_PROMPT:"",{profile:ASSISTANT_PROFILE.id,owner:ownerName});
  }catch{return json({error:"live_context_unavailable"},503,origin)}
  const session={
    model:"gpt-live-1",
    ...voiceContext,
    audio:{output:{voice:voiceValue}},
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
    return json({session:{id:sessionId,conversation_id:conversationId},transport:{type:"webrtc",sdp:answer}},201,origin);
  }catch(e){
    console.error("isabella_live_session_error",e instanceof Error?e.name:"unknown");
    return json({error:"live_connection_failed"},502,origin);
  }
});
