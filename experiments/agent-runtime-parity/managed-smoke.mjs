// OpenAI Agents API: managed-session smoke only; 100% fictional input.
// No real project/memory, MCP, tools, sandbox, files or production integration.
// A managed session persists with the provider until retention/deletion policies apply.
import OpenAI from "openai";
const key=process.env.OPENAI_API_KEY;
if(!key)throw Error("dedicated_test_key_required");
const client=new OpenAI({apiKey:key,maxRetries:0,timeout:75000});
let sessionId=null;
let sourceStream=null;
let deletion={attempted:false,success:false};
const events=[];
const started=Date.now();
try{
 if(!client.beta?.agents?.sessions?.create)throw Error("sdk_missing_agents_api_beta");
 sourceStream=await client.beta.agents.sessions.create({
  agent:{
   model:"gpt-6-astra",
   instructions:"This is a constrained synthetic session smoke. Do not call tools or claim access to any files. The user input is entirely fictional. Answer in one short sentence distinguishing a room from a double-height void; do not invent facts or request private content."
  },
  environment:{type:"none"},
  input:"Fictional ATENEA-DEMO: Sala Azul is a room, while Luftraum Sala Azul designates a void; both labels exist. Confirm the distinction without asserting area or chronology.",
  stream:true
 });
 sourceStream.withResultCollection();
 for await (const event of sourceStream){
  if(events.length<35)events.push(String(event?.type||"unknown"));
  const candidate=event?.session_id||event?.session?.id;
  if(typeof candidate==="string"&&candidate.startsWith("sess_"))sessionId=candidate;
 }
 const final=await sourceStream.finalResult();
 sessionId=String(final?.session_id||sessionId||"")||null;
 const output=String(final?.output_text||"");
 const verified=output.toLowerCase().includes("sala azul")&&output.length>20;
 console.log(JSON.stringify({mode:"managed_agents_api_synthetic_smoke",synthetic_only:true,
  environment:"none",session_created:!!sessionId,turn_completed:!!final,
  output_nonempty:output.length>0,fictional_subject_present:verified,
  duration_ms:Date.now()-started,events:events.slice(0,18),
  content_not_exported:true,managed_data_residency:"US-only per platform documentation"}));
 if(!sessionId||!verified)process.exitCode=1;
}catch(e){
 const status=Number(e?.status)||null;
 console.log(JSON.stringify({mode:"managed_agents_api_synthetic_smoke",synthetic_only:true,status:"blocked_or_failed",
  provider_status:status,provider_code:typeof e?.code==="string"?e.code:null,
  error_type:e?.constructor?.name||"Error",duration_ms:Date.now()-started,
  note:"No claim of functional managed Agents API until an actual completed session is observed"}));
 process.exitCode=1;
}finally{
 try{sourceStream?.controller?.abort?.()}catch{}
 if(sessionId){
  deletion.attempted=true;
  try{
   const d=await client.beta.agents.sessions.delete(sessionId);
   deletion.success=d?.deleted===true;
  }catch(e){deletion.error_type=e?.constructor?.name||"Error";process.exitCode=1;}
 }
 console.log(JSON.stringify({managed_session_cleanup:deletion}));
}
