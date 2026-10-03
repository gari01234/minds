import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const RESPONSES="https://api.openai.com/v1/responses";
const DIMS=["scheduling","task_management","work_rhythm","interruptions","planning","decision_style","communication","tooling","review"];
const CLAIM_TYPES=["preference","habit","pattern","goal","priority","value","working_style","interaction","constraint","other"];

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
function isoDay(d=new Date()){return d.toISOString().slice(0,10)}
async function hexDigest(text:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function fp32(text:string){return (await hexDigest(text)).slice(0,32)}
function responseText(p:any){
  if(typeof p?.output_text==="string")return p.output_text.trim();
  const out:string[]=[];
  for(const item of p?.output||[])if(item?.type==="message")
    for(const part of item?.content||[])if(typeof part?.text==="string")out.push(part.text);
  return out.join("").trim();
}
async function modelCandidates(key:string,observations:any[],blocked:string[]){
  const schema={
    type:"object",additionalProperties:false,
    properties:{candidates:{type:"array",maxItems:2,items:{
      type:"object",additionalProperties:false,
      properties:{
        dimension:{type:"string",enum:DIMS},
        claim_type:{type:"string",enum:CLAIM_TYPES},
        statement:{type:"string"},
        rationale:{type:"string"},
        evidence_ids:{type:"array",minItems:1,maxItems:12,items:{type:"string"}}
      },
      required:["dimension","claim_type","statement","rationale","evidence_ids"]
    }}},
    required:["candidates"]
  };
  const res=await fetch(RESPONSES,{
    method:"POST",
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"gpt-5.6-luna",
      reasoning:{effort:"low"},
      max_output_tokens:1800,
      instructions:[
        "You generate tentative Personal Operating Model hypotheses for Isabella.",
        "Create operational collaboration rules, never personality labels or psychological claims.",
        "Use only supplied observations. Never infer health, politics, religion, sexuality, finances, exact location, identity traits, motives or emotions.",
        "A statement must say how Isabella should organize, interrupt, ask, plan, decide or collaborate.",
        "Do not restate a permission as a personality trait.",
        "Prefer no candidate over a weak candidate.",
        "Never use a blocked dimension.",
        "Each evidence_id must belong to the same dimension as the candidate.",
        "Treat explicit_statement and manual_correction as explicit evidence; other signals remain observations, not preferences."
      ].join(" "),
      text:{format:{type:"json_schema",name:"operating_hypotheses",strict:true,schema}},
      input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({blocked_dimensions:blocked,observations})}]}]
    })
  });
  let p:any={};try{p=await res.json()}catch{}
  if(!res.ok)throw new Error(String(p?.error?.message||`openai_http_${res.status}`).slice(0,1200));
  return {value:JSON.parse(responseText(p)||'{"candidates":[]}'),usage:p.usage||{}};
}
async function upsertObservation(sb:any,row:any){
  const {data,error}=await sb.from("minds_operating_model_observations")
    .upsert(row,{onConflict:"user_id,fingerprint",ignoreDuplicates:true})
    .select("id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at")
    .maybeSingle();
  if(error)throw error;
  if(data)return data;
  const q=await sb.from("minds_operating_model_observations")
    .select("id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at")
    .eq("user_id",row.user_id).eq("fingerprint",row.fingerprint).maybeSingle();
  if(q.error)throw q.error;
  return q.data;
}
function explicitObservation(o:any){
  return o?.signal_type==="explicit_statement"||o?.signal_type==="manual_correction"||o?.source_kind==="manual";
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const auth=String(req.headers.get("Authorization")||"");
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({error:"auth_required"},401);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const openai=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!service||!openai)return json({error:"server_not_configured"},503);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userErr}=await sb.auth.getUser(token);
  const user=userData?.user;
  if(userErr||!user)return json({error:"invalid_session"},401);
  const userId=user.id;

  try{
    const now=new Date(),day=isoDay(now),windowStart=new Date(now.getTime()-30*86400000).toISOString(),windowEnd=now.toISOString();

    const {data:prefs,error:prefsErr}=await sb.from("isabella_preferences")
      .select("id,preference_key,value,status,updated_at")
      .eq("user_id",userId).eq("status","confirmed")
      .in("preference_key",["assistant","personal_model_policy"]);
    if(prefsErr)throw prefsErr;

    for(const p of prefs||[]){
      const v=p.value||{};
      if(p.preference_key==="assistant"){
        const signal="El usuario confirmó reglas explícitas sobre cómo Isabella debe interactuar, interrumpir y pedir confirmación.";
        await upsertObservation(sb,{
          user_id:userId,dimension:"communication",signal_type:"explicit_statement",source_kind:"system",
          source_ref:`isabella_preferences:${p.id}`,signal,
          payload:{behavior_rules:Array.isArray(v.behaviorRules)?v.behaviorRules.slice(0,20):[],attention:v.attention||{}},
          fingerprint:await fp32(`assistant_pref|${p.id}|${p.updated_at}`),observed_at:p.updated_at
        });
      }else{
        const signal="El usuario confirmó que la autonomía debe ser gradual y que las decisiones consecuentes requieren revisión explícita.";
        await upsertObservation(sb,{
          user_id:userId,dimension:"review",signal_type:"explicit_statement",source_kind:"system",
          source_ref:`isabella_preferences:${p.id}`,signal,
          payload:{agency:v.agency||{},learning:v.learning||{},proactivity:v.proactivity||{}},
          fingerprint:await fp32(`personal_model_policy|${p.id}|${p.updated_at}`),observed_at:p.updated_at
        });
      }
    }

    const {data:activity,error:actErr}=await sb.from("isabella_activity_log")
      .select("entity_type,action,source,created_at")
      .eq("user_id",userId).gte("created_at",windowStart).lte("created_at",windowEnd).limit(5000);
    if(actErr)throw actErr;
    const manual=(activity||[]).filter((x:any)=>x.source==="manual");
    if(manual.length){
      const counts:Record<string,number>={};
      for(const x of manual){const k=`${x.entity_type}:${x.action}`;counts[k]=(counts[k]||0)+1}
      await upsertObservation(sb,{
        user_id:userId,dimension:"task_management",signal_type:"pattern_summary",source_kind:"system",
        source_ref:`isabella_activity_log:30d:${day}`,
        signal:`En los últimos 30 días se registraron ${manual.length} mutaciones manuales de tareas/calendario. Es un agregado factual, no una preferencia.`,
        payload:{counts,total:manual.length,window_start:windowStart,window_end:windowEnd},
        fingerprint:await fp32(`activity_aggregate|30d|${day}|${JSON.stringify(counts)}`),observed_at:windowEnd
      });
    }

    const {data:feedback,error:fbErr}=await sb.from("isabella_proposal_feedback")
      .select("outcome,created_at").eq("user_id",userId)
      .gte("created_at",windowStart).lte("created_at",windowEnd).limit(2000);
    if(fbErr)throw fbErr;
    if((feedback||[]).length){
      const counts:Record<string,number>={};
      for(const x of feedback||[])counts[String(x.outcome||"unknown")]=(counts[String(x.outcome||"unknown")]||0)+1;
      await upsertObservation(sb,{
        user_id:userId,dimension:"review",signal_type:"pattern_summary",source_kind:"proposal_feedback",
        source_ref:`isabella_proposal_feedback:30d:${day}`,
        signal:`En los últimos 30 días existen ${(feedback||[]).length} receipts de feedback sobre propuestas. El agregado no explica por sí solo por qué fueron aceptadas o rechazadas.`,
        payload:{counts,total:(feedback||[]).length,window_start:windowStart,window_end:windowEnd},
        fingerprint:await fp32(`proposal_feedback|30d|${day}|${JSON.stringify(counts)}`),observed_at:windowEnd
      });
    }

    const {data:permissions,error:permErr}=await sb.from("minds_contextual_permissions")
      .select("id,action,context_key,scope_key,scope_label,mode,revision,reviewed_at,expires_at")
      .eq("user_id",userId).not("reviewed_at","is",null).order("reviewed_at",{ascending:true}).limit(200);
    if(permErr)throw permErr;
    for(const x of permissions||[]){
      await upsertObservation(sb,{
        user_id:userId,dimension:"review",signal_type:"explicit_statement",source_kind:"system",
        source_ref:`minds_contextual_permissions:${x.id}:${x.revision}`,
        signal:`El usuario revisó explícitamente el permiso ${x.action} para ${x.scope_label||x.scope_key} y eligió modo ${x.mode}.`,
        payload:{action:x.action,context_key:x.context_key,scope_key:x.scope_key,scope_label:x.scope_label,mode:x.mode,revision:x.revision,expires_at:x.expires_at},
        fingerprint:await fp32(`permission_review|${x.id}|${x.revision}`),observed_at:x.reviewed_at
      });
    }

    const {data:active,error:activeErr}=await sb.from("minds_operating_model_hypotheses")
      .select("id,dimension,status").eq("user_id",userId).in("status",["proposed","accepted","superseded"]);
    if(activeErr)throw activeErr;
    const blocked=[...new Set((active||[]).map((x:any)=>String(x.dimension)))];

    const {data:allObs,error:obsErr}=await sb.from("minds_operating_model_observations")
      .select("id,dimension,signal_type,source_kind,source_ref,signal,payload,observed_at")
      .eq("user_id",userId).order("observed_at",{ascending:false}).limit(100);
    if(obsErr)throw obsErr;

    const eligible=(allObs||[]).filter((o:any)=>!blocked.includes(String(o.dimension)));
    const byDim=new Map<string,any[]>();
    for(const o of eligible){const d=String(o.dimension);if(!byDim.has(d))byDim.set(d,[]);byDim.get(d)!.push(o)}
    const modelInput:any[]=[];
    for(const [dimension,rows] of byDim){
      const explicit=rows.some(explicitObservation);
      const sources=new Set(rows.map((x:any)=>String(x.source_kind)));
      if(explicit||(rows.length>=2&&sources.size>=2)){
        for(const x of rows.slice(0,12))modelInput.push({...x,dimension});
      }
    }

    let generated=0,usage:any={};
    if(modelInput.length){
      const completion=await modelCandidates(openai,modelInput,blocked);
      usage=completion.usage;
      const lookup=new Map((allObs||[]).map((x:any)=>[String(x.id),x]));
      for(const candidate of completion.value?.candidates||[]){
        const dimension=String(candidate.dimension||""),claimType=String(candidate.claim_type||"other");
        if(!DIMS.includes(dimension)||!CLAIM_TYPES.includes(claimType)||blocked.includes(dimension))continue;
        const ids:string[]=[...new Set<string>((candidate.evidence_ids||[]).map((x:any)=>String(x)))].slice(0,12);
        const rows=ids.map(id=>lookup.get(id)).filter(Boolean).filter((x:any)=>x.dimension===dimension);
        if(rows.length!==ids.length||!rows.length)continue;
        const explicit=rows.some(explicitObservation),sources=new Set(rows.map((x:any)=>String(x.source_kind)));
        if(!explicit&&!(rows.length>=2&&sources.size>=2))continue;
        const statement=String(candidate.statement||"").trim(),rationale=String(candidate.rationale||"").trim();
        if(statement.length<1||statement.length>2000||rationale.length>4000)continue;
        const patternKey="auto:"+(await hexDigest(dimension+"\n"+claimType+"\n"+ids.slice().sort().join("\n")));
        const existing=await sb.from("minds_operating_model_hypotheses")
          .select("id,status").eq("user_id",userId).eq("pattern_key",patternKey)
          .in("status",["proposed","accepted","superseded"]).maybeSingle();
        if(existing.error)throw existing.error;
        if(existing.data)continue;

        const inserted=await sb.from("minds_operating_model_hypotheses").insert({
          user_id:userId,dimension,claim_type:claimType,statement,
          inference_kind:"deterministic_pattern",pattern_key:patternKey,rationale,
          evidence_summary:{support_count:rows.length,source_types:[...sources],has_explicit_evidence:explicit,transparent:true},
          status:"proposed",
          metadata:{generator:"isabella-operating-model-v0.2",requires_explicit_review:true}
        }).select("id").single();
        if(inserted.error){
          if(String(inserted.error.code)==="23505")continue;
          throw inserted.error;
        }
        const evidenceRows=rows.map((x:any)=>({user_id:userId,hypothesis_id:inserted.data.id,observation_id:x.id,stance:"supports"}));
        const ev=await sb.from("minds_operating_model_evidence").insert(evidenceRows);
        if(ev.error)throw ev.error;
        generated++;blocked.push(dimension);
      }
    }

    const [acceptedQ,proposedQ,countQ]=await Promise.all([
      sb.from("minds_operating_model_hypotheses").select("id").eq("user_id",userId).in("status",["accepted","superseded"]),
      sb.from("minds_operating_model_hypotheses").select("id").eq("user_id",userId).eq("status","proposed"),
      sb.from("minds_operating_model_observations").select("id",{count:"exact",head:true}).eq("user_id",userId)
    ]);
    if(acceptedQ.error)throw acceptedQ.error;if(proposedQ.error)throw proposedQ.error;if(countQ.error)throw countQ.error;
    return json({ok:true,observations_seen:countQ.count||0,generated,accepted:(acceptedQ.data||[]).length,pending:(proposedQ.data||[]).length,usage});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    console.log("OPERATING_MODEL_ERROR "+detail);
    return json({error:"operating_model_failed",detail},500);
  }
});
