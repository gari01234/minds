// Managed Agents API beta smoke; exclusively fictitious data.
// OpenAI-managed sessions are US-hosted/non-ZDR. No real MINDS sources.
import {readFileSync} from "node:fs";
import {collectEvidence,gradeEvidence} from "../../scripts/agent-runtime-parity-core.mjs";
const key=process.env.OPENAI_API_KEY;
if(!key)throw Error("dedicated_parity_key_not_configured");
const corpus=JSON.parse(readFileSync(new URL("../../tests/fixtures/agent-runtime-parity-synthetic-v01.json",import.meta.url),"utf8"));
if(corpus.classification!=="public-synthetic-fixture-never-user-work")throw Error("synthetic_only");
const model=process.env.MANAGED_PARITY_MODEL||"gpt-6-astra";
const base="https://api.openai.com/v1/agents/sessions";
const headers={"Authorization":"Bearer "+key,"OpenAI-Beta":"agents=v1","Content-Type":"application/json"};
const toolDef={type:"function",name:"find_all_occurrences",
 description:"Enumerate every extracted-text occurrence with source, version and page in a fictional corpus.",
 parameters:{type:"object",properties:{term:{type:"string"}},required:["term"],additionalProperties:false}};
const instructions="Only use the fictional project and find_all_occurrences. Return JSON: evidence records {file_id,version,segment_no,locator}, unavailable files, extracted_text_traversed:true, full_originals_verified:false. Preserve every original locator, do not duplicate sources.";
const prompt="Find every Sala Azul occurrence in fictional ATENEA documents, including late pages. Distinguish the Luftraum and missing-parser sources.";
const delay=t=>new Promise(resolve=>setTimeout(resolve,t));
async function api(path,method="GET",body=null){
 const r=await fetch(path,{method,headers,
  body:body===null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error("http_"+r.status+":"+String(d?.error?.code||d?.error?.type||d?.error?.message||"unknown").slice(0,160));
 return d;
}
let sessionId=null,toolCalls=0,status=null,issue=null,output="",score=null,items=[];
const started=Date.now();
try{
 const initial=await api(base,"POST",{agent:{model,instructions,tools:[toolDef]},
   environment:{type:"none"},input:prompt,stream:false});
 sessionId=initial.session_id||initial.session?.id||initial.id||null;
 if(typeof sessionId!=="string"||!sessionId.startsWith("sess_"))
  throw Error("unexpected_session_shape:"+Object.keys(initial).sort().join(",").slice(0,110));
 const delivered=new Set();
 for(let step=0;step<45;step++){
  const session=await api(base+"/"+encodeURIComponent(sessionId));
  status=session.status||null;
  const actions=Array.isArray(session.required_actions)?session.required_actions:[];
  if(actions.length){
   const events=[];
   for(const action of actions){
    if(action.type!=="function_call"||action.name!=="find_all_occurrences")
      throw Error("unexpected_function:"+String(action.name||"null").slice(0,55));
    if(delivered.has(action.call_id))continue;
    if(toolCalls>=3)throw Error("function_call_limit");
    const args=typeof action.arguments==="string"?JSON.parse(action.arguments):action.arguments;
    if(typeof args?.term!=="string")throw Error("invalid_function_args");
    events.push({type:"agent.session.input.tool_result",turn_id:action.turn_id,
      call_id:action.call_id,success:true,output:JSON.stringify(collectEvidence(corpus,args.term,2))});
    delivered.add(action.call_id);toolCalls++;
   }
   if(events.length)await api(base+"/"+encodeURIComponent(sessionId)+"/events","POST",{events});
  }
  if(["idle","completed"].includes(status)&&actions.length===0)break;
  if(["failed","cancelled","expired"].includes(status))throw Error("session_"+status);
  await delay(2000);
 }
 const listed=await api(base+"/"+encodeURIComponent(sessionId)+"/items?order=asc&limit=100");
 items=Array.isArray(listed.data)?listed.data:Array.isArray(listed.items)?listed.items:[];
 output=items.filter(x=>x.role==="assistant"||x.type==="message")
  .flatMap(x=>Array.isArray(x.content)?x.content:[])
  .filter(x=>x.type==="output_text"||x.type==="text")
  .map(x=>x.text||"").join("\n");
 if(output){
  try{
   const fence=String.fromCharCode(96).repeat(3);
   let plain=output.trim();
   if(plain.startsWith(fence))plain=plain.slice(3).replace(/^json\s*/,"").replace(/\s*.{3}$/,"");
   score=gradeEvidence(corpus,"Sala Azul",JSON.parse(plain));
  }catch{issue="not_machine_gradeable"}
 }else issue="assistant_text_not_found";
 console.log(JSON.stringify({engine:"agents_api_managed",synthetic_only:true,
  model,session_started:true,tool_calls:toolCalls,final_status:status,
  elapsed_ms:Date.now()-started,item_count:items.length,output_present:!!output,score,issue},null,2));
 if(!score?.coverage_complete)process.exitCode=1;
}catch(e){
 console.log(JSON.stringify({engine:"agents_api_managed",synthetic_only:true,model,
  session_started:!!sessionId,tool_calls:toolCalls,final_status:status,
  elapsed_ms:Date.now()-started,error:String(e?.message||e).slice(0,180)},null,2));
 process.exitCode=1;
}
