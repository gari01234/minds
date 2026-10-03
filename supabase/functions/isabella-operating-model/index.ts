import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const RESPONSES="https://api.openai.com/v1/responses";
const DIMS=["time_planning","task_management","focus","interruption","decision_making","autonomy","interaction"];

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});
}
function isoDay(d=new Date()){return d.toISOString().slice(0,10)}
async function sha256(text:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
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
    properties:{
      candidates:{type:"array",maxItems:2,items:{
        type:"object",additionalProperties:false,
        properties:{
          dimension:{type:"string",enum:DIMS},
          statement:{type:"string"},
          rationale:{type:"string"},
          evidence_ids:{type:"array",minItems:1,maxItems:12,items:{type:"string"}}
        },
        required:["dimension","statement","rationale","evidence_ids"]
      }}
    },
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
        "Create operating rules, not personality labels or psychological claims.",
        "Use only the supplied observations. Never infer health, politics, religion, sexuality, finances, exact location, identity traits, motives or emotions.",
        "A statement must say how Isabella should organize, interrupt, ask, plan, decide, or collaborate with the user.",
        "Do not restate a permission as a personality trait.",
        "Prefer no candidate over a weak candidate.",
        "Never use a blocked dimension.",
        "Each evidence_id must come from the observations of that same dimension."
      ].join(" "),
      text:{format:{type:"json_schema",name:"operating_hypotheses",strict:true,schema}},
      input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({blocked_dimensions:blocked,observations})}]}]
    })
  });
  let p:any={};try{p=await res.json()}catch{}
  if(!res.ok)throw new Error(String(p?.error?.message||`openai_http_${res.status}`).slice(0,1200));
  const text=responseText(p);
  return {value:JSON.parse(text||'{"candidates":[]}'),usage:p.usage||{}};
}
async function upsertObservation(sb:any,row:any){
  const {data,error}=await sb.from("minds_operating_observations")
    .upsert(row,{onConflict:"user_id,observation_key",ignoreDuplicates:true})
    .select("id,observation_key,dimension,provenance_class,source_type,source_ref,summary,data,window_start,window_end,observed_at")
    .maybeSingle();
  if(error)throw error;
  if(data)return data;
  const q=await sb.from("minds_operating_observations")
    .select("id,observation_key,dimension,provenance_class,source_type,source_ref,summary,data,window_start,window_end,observed_at")
    .eq("user_id",row.user_id).eq("observation_key",row.observation_key).maybeSingle();
  if(q.error)throw q.error;
  return q.data;
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
    const observations:any[]=[];

    const {data:prefs,error:prefsErr}=await sb.from("isabella_preferences")
      .select("id,preference_key,value,status,confidence,evidence,updated_at")
      .eq("user_id",userId).eq("status","confirmed")
      .in("preference_key",["assistant","personal_model_policy"]);
    if(prefsErr)throw prefsErr;

    for(const p of prefs||[]){
      if(p.preference_key==="assistant"){
        const v=p.value||{},rules=Array.isArray(v.behaviorRules)?v.behaviorRules.slice(0,20):[];
        const o=await upsertObservation(sb,{
          user_id:userId,
          observation_key:`pref:assistant:${p.updated_at}`,
          dimension:"interaction",
          provenance_class:"explicit",
          source_type:"assistant_preference",
          source_ref:`isabella_preferences:${p.id}`,
          summary:"El usuario confirmó reglas explícitas sobre cómo Isabella debe interactuar, interrumpir y pedir confirmación.",
          data:{behavior_rules:rules,attention:v.attention||{}},
          observed_at:p.updated_at
        });
        if(o)observations.push(o);
      }
      if(p.preference_key==="personal_model_policy"){
        const v=p.value||{};
        const o=await upsertObservation(sb,{
          user_id:userId,
          observation_key:`pref:personal_model_policy:${p.updated_at}`,
          dimension:"autonomy",
          provenance_class:"explicit",
          source_type:"assistant_preference",
          source_ref:`isabella_preferences:${p.id}`,
          summary:"El usuario confirmó que la autonomía debe ser gradual, las inferencias consecuentes deben confirmarse y las decisiones finales permanecen en el usuario.",
          data:{agency:v.agency||{},learning:v.learning||{},proactivity:v.proactivity||{}},
          observed_at:p.updated_at
        });
        if(o)observations.push(o);
      }
    }

    const {data:activity,error:actErr}=await sb.from("isabella_activity_log")
      .select("entity_type,action,source,created_at")
      .eq("user_id",userId).gte("created_at",windowStart).lte("created_at",windowEnd)
      .limit(5000);
    if(actErr)throw actErr;
    const manual=(activity||[]).filter((x:any)=>x.source==="manual");
    if(manual.length){
      const counts:Record<string,number>={};
      for(const x of manual){
        const k=`${x.entity_type}:${x.action}`;counts[k]=(counts[k]||0)+1;
      }
      const o=await upsertObservation(sb,{
        user_id:userId,
        observation_key:`activity_aggregate:30d:${day}`,
        dimension:"task_management",
        provenance_class:"behavioral",
        source_type:"activity_aggregate",
        source_ref:`isabella_activity_log:30d:${day}`,
        summary:`En los últimos 30 días se registraron ${manual.length} mutaciones manuales de tareas/calendario. Es un agregado factual, no una preferencia inferida.`,
        data:{counts,total:manual.length},
        window_start:windowStart,window_end:windowEnd,observed_at:windowEnd
      });
      if(o)observations.push(o);
    }

    const {data:feedback,error:fbErr}=await sb.from("isabella_proposal_feedback")
      .select("outcome,created_at").eq("user_id",userId)
      .gte("created_at",windowStart).lte("created_at",windowEnd).limit(2000);
    if(fbErr)throw fbErr;
    if((feedback||[]).length){
      const counts:Record<string,number>={};
      for(const x of feedback||[])counts[String(x.outcome||"unknown")]=(counts[String(x.outcome||"unknown")]||0)+1;
      const o=await upsertObservation(sb,{
        user_id:userId,
        observation_key:`proposal_feedback:30d:${day}`,
        dimension:"interaction",
        provenance_class:"behavioral",
        source_type:"proposal_feedback",
        source_ref:`isabella_proposal_feedback:30d:${day}`,
        summary:`En los últimos 30 días existen ${(feedback||[]).length} receipts explícitos de feedback sobre propuestas. El agregado no explica por sí solo por qué fueron aceptadas o rechazadas.`,
        data:{counts,total:(feedback||[]).length},
        window_start:windowStart,window_end:windowEnd,observed_at:windowEnd
      });
      if(o)observations.push(o);
    }

    const {data:outcomes,error:outErr}=await sb.from("minds_outcome_feedback")
      .select("id,action,context_key,scope_key,scope_label,feedback_type,changed_fields,created_at")
      .eq("user_id",userId).gte("created_at",new Date(now.getTime()-90*86400000).toISOString())
      .order("created_at",{ascending:true}).limit(200);
    if(outErr)throw outErr;
    for(const x of outcomes||[]){
      const o=await upsertObservation(sb,{
        user_id:userId,
        observation_key:`outcome_feedback:${x.id}`,
        dimension:"autonomy",
        provenance_class:"outcome",
        source_type:"outcome_feedback",
        source_ref:`minds_outcome_feedback:${x.id}`,
        summary:`Existe feedback causal confirmado tras una acción autónoma ${x.action}; se modificaron: ${(x.changed_fields||[]).join(", ")||"sin campos declarados"}.`,
        data:{action:x.action,context_key:x.context_key,scope_key:x.scope_key,scope_label:x.scope_label,feedback_type:x.feedback_type,changed_fields:x.changed_fields||[]},
        observed_at:x.created_at
      });
      if(o)observations.push(o);
    }

    const {data:permissions,error:permErr}=await sb.from("minds_contextual_permissions")
      .select("id,action,context_key,scope_key,scope_label,mode,revision,reviewed_at,expires_at")
      .eq("user_id",userId).not("reviewed_at","is",null).order("reviewed_at",{ascending:true}).limit(200);
    if(permErr)throw permErr;
    for(const x of permissions||[]){
      const o=await upsertObservation(sb,{
        user_id:userId,
        observation_key:`permission_review:${x.id}:${x.revision}`,
        dimension:"autonomy",
        provenance_class:"explicit",
        source_type:"permission_review",
        source_ref:`minds_contextual_permissions:${x.id}`,
        summary:`El usuario revisó explícitamente el permiso ${x.action} para ${x.scope_label||x.scope_key} y eligió modo ${x.mode}.`,
        data:{action:x.action,context_key:x.context_key,scope_key:x.scope_key,scope_label:x.scope_label,mode:x.mode,revision:x.revision,expires_at:x.expires_at},
        observed_at:x.reviewed_at
      });
      if(o)observations.push(o);
    }

    const {data:active,error:activeErr}=await sb.from("minds_operating_hypotheses")
      .select("id,dimension,status,accepted_statement,statement")
      .eq("user_id",userId).in("status",["proposed","accepted"]);
    if(activeErr)throw activeErr;
    const blocked=[...new Set((active||[]).map((x:any)=>String(x.dimension)))];

    const {data:allObs,error:obsErr}=await sb.from("minds_operating_observations")
      .select("id,dimension,provenance_class,source_type,source_ref,summary,data,observed_at")
      .eq("user_id",userId).order("observed_at",{ascending:false}).limit(80);
    if(obsErr)throw obsErr;

    const eligible=(allObs||[]).filter((o:any)=>!blocked.includes(String(o.dimension)));
    const byDim=new Map<string,any[]>();
    for(const o of eligible){
      const d=String(o.dimension);if(!byDim.has(d))byDim.set(d,[]);byDim.get(d)!.push(o);
    }
    const modelInput:any[]=[];
    for(const [dimension,rows] of byDim){
      const explicit=rows.some((x:any)=>x.provenance_class==="explicit");
      const sources=new Set(rows.map((x:any)=>String(x.source_type)));
      if(explicit||(rows.length>=2&&sources.size>=2)){
        for(const x of rows.slice(0,12))modelInput.push({...x,dimension});
      }
    }

    let generated=0,proposed=0,usage:any={};
    if(modelInput.length){
      const completion=await modelCandidates(openai,modelInput,blocked);
      usage=completion.usage;
      const lookup=new Map((allObs||[]).map((x:any)=>[String(x.id),x]));
      for(const candidate of completion.value?.candidates||[]){
        const dimension=String(candidate.dimension||"");
        if(!DIMS.includes(dimension)||blocked.includes(dimension))continue;
        const ids:string[]=[...new Set<string>((candidate.evidence_ids||[]).map((x:any)=>String(x)))].slice(0,12);
        const rows=ids.map(id=>lookup.get(id)).filter(Boolean).filter((x:any)=>x.dimension===dimension);
        if(rows.length!==ids.length||!rows.length)continue;
        const explicit=rows.some((x:any)=>x.provenance_class==="explicit");
        const sources=new Set(rows.map((x:any)=>String(x.source_type)));
        if(!explicit&&!(rows.length>=2&&sources.size>=2))continue;
        const statement=String(candidate.statement||"").trim(),rationale=String(candidate.rationale||"").trim();
        if(statement.length<1||statement.length>1000||rationale.length<1||rationale.length>3000)continue;
        const fingerprint=await sha256(dimension+"\n"+ids.slice().sort().join("\n"));
        const inserted=await sb.from("minds_operating_hypotheses").insert({
          user_id:userId,dimension,fingerprint,statement,rationale,evidence_ids:ids,
          metadata:{generator:"isabella-operating-model-v0.1",evidence_source_count:sources.size,has_explicit_evidence:explicit}
        }).select("id").maybeSingle();
        if(inserted.error){
          if(String(inserted.error.code)==="23505")continue;
          throw inserted.error;
        }
        if(!inserted.data)continue;
        generated++;
        const pub=await sb.rpc("minds_publish_operating_hypothesis",{p_user:userId,p_hypothesis_id:inserted.data.id});
        if(pub.error)throw pub.error;
        if(pub.data?.status==="proposed"||pub.data?.status==="already_proposed"){
          proposed++;blocked.push(dimension);
        }
      }
    }

    const {data:model,error:modelErr}=await sb.rpc("minds_get_personal_operating_model");
    if(modelErr){
      // service role has no auth.uid context; return a safe server-side projection instead.
      const [acceptedQ,proposedQ]=await Promise.all([
        sb.from("minds_operating_hypotheses").select("id,dimension,accepted_statement,accepted_at").eq("user_id",userId).eq("status","accepted").order("accepted_at",{ascending:false}),
        sb.from("minds_operating_hypotheses").select("id,dimension,statement,rationale,evidence_ids,proposed_at").eq("user_id",userId).eq("status","proposed").order("proposed_at",{ascending:false})
      ]);
      if(acceptedQ.error)throw acceptedQ.error;if(proposedQ.error)throw proposedQ.error;
      return json({ok:true,observations_seen:(allObs||[]).length,generated,proposed,accepted:acceptedQ.data||[],pending:proposedQ.data||[],usage});
    }
    return json({ok:true,observations_seen:(allObs||[]).length,generated,proposed,model,usage});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    console.log("OPERATING_MODEL_ERROR "+detail);
    return json({error:"operating_model_failed",detail},500);
  }
});