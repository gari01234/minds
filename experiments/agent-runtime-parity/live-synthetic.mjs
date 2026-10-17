// Optional REAL-model parity run: synthetic fixture ONLY, bounded cost and tools.
// No private MINDS documents or Supabase access. No API keys in logs.
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import OpenAI from "openai";
import {z} from "zod";
import {collectEvidence,gradeEvidence} from "../../scripts/agent-runtime-parity-core.mjs";
process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
const {Agent,run,tool,setTracingDisabled}=await import("@openai/agents");
setTracingDisabled(true);
const key=process.env.OPENAI_API_KEY;
if(!key||!/^[A-Za-z0-9_-]{12,}$/.test(key))throw Error("Dedicated OPENAI_API_KEY required; no production fallback");
const model=process.env.PARITY_OPENAI_MODEL||"gpt-5.6-luna";
if(!/^[A-Za-z0-9._-]+$/.test(model))throw Error("invalid_model");
const corpus=JSON.parse(readFileSync(new URL("../../tests/fixtures/agent-runtime-parity-synthetic-v01.json",import.meta.url),"utf8"));
if(corpus.classification!=="public-synthetic-fixture-never-user-work")throw Error("synthetic_only");
const term="Sala Azul";
const instructions=[
  "You are a synthetic-data-only evidence investigator.",
  "Call find_all_occurrences to retrieve all current-version textual occurrences; do not guess.",
  "Keep room measurements, Luftraum and program needs distinct; do not infer chronology.",
  "Return ONLY JSON with extracted_text_traversed boolean, full_originals_verified false,",
  "evidence objects {file_id,version,segment_no,locator}, unavailable objects {file_id,status,reason}.",
  "Include every tool occurrence, never claim complete visual inspection."
].join(" ");
const prompts=[
 "Find all documented occurrences of "+term+" in this fictional project. Identify every file and page, interpret measurement types and disclose sources waiting for parsing.",
 "Review the entire current-version extracted corpus for "+term+". Give the complete evidence inventory, including late pages, distinct voids, and documents that cannot be parsed.",
 "The fictional room "+term+" appears in variants, void labels and a program table. Compile all source occurrences, keep their page/version provenance, and state extraction gaps; do not invent project chronology."
];
const schema={
  type:"function",name:"find_all_occurrences",
  description:"Deterministically enumerate all textual occurrences in a fictional corpus with version and source identity.",
  parameters:{type:"object",properties:{term:{type:"string"}},required:["term"],additionalProperties:false},
  strict:true
};
const lookup=(t)=>JSON.stringify(collectEvidence(corpus,t,2));
const grade=(s)=>{
 let t=String(s||"").trim();
 const fence=String.fromCharCode(96).repeat(3);
 if(t.startsWith(fence))t=t.replace(/^.{3}(?:json)?\s*/i,"").replace(/\s*.{3}$/,"");
 return gradeEvidence(corpus,term,JSON.parse(t));
};
async function sdkRun(prompt){
 let toolsUsed=0;
 const fn=tool({name:"find_all_occurrences",description:schema.description,parameters:z.object({term:z.string()}),
   async execute({term}){toolsUsed++;return lookup(term)}});
 const agent=new Agent({name:"Synthetic MINDS agent",model,instructions,tools:[fn],
   modelSettings:{reasoning:{effort:"medium"}}});
 const t=performance.now();
 const result=await run(agent,prompt,{maxTurns:6});
 return {engine:"agents_sdk",model,elapsed_ms:Math.round(performance.now()-t),
   tool_calls:toolsUsed,score:grade(result.finalOutput)};
}
async function nativeRun(prompt){
 const client=new OpenAI({apiKey:key,timeout:75000,maxRetries:0});
 const input=[{role:"user",content:prompt}];
 let toolCalls=0,modelCalls=0,final="";
 let usageIn=0,usageOut=0;
 const t=performance.now();
 for(let turn=0;turn<6;turn++){
  const r=await client.responses.create({model,instructions,input,tools:[schema],
   store:false,tool_choice:"auto",reasoning:{effort:"medium"},max_output_tokens:3000});
  modelCalls++;usageIn+=r.usage?.input_tokens||0;usageOut+=r.usage?.output_tokens||0;
  if(r.status!=="completed")throw Error("responses_status_"+r.status);
  const calls=(r.output||[]).filter(x=>x.type==="function_call");
  if(!calls.length){final=r.output_text||"";break;}
  input.push(...r.output);
  for(const call of calls){
   if(call.name!=="find_all_occurrences")throw Error("unknown_tool");
   const args=JSON.parse(call.arguments||"{}");
   if(typeof args.term!=="string")throw Error("invalid_args");
   toolCalls++;
   input.push({type:"function_call_output",call_id:call.call_id,output:lookup(args.term)});
  }
 }
 if(!final)throw Error("responses_no_final");
 return {engine:"responses_loop",model,elapsed_ms:Math.round(performance.now()-t),
   tool_calls:toolCalls,model_calls:modelCalls,
   usage:{input_tokens:usageIn,output_tokens:usageOut},score:grade(final)};
}
const results=[];
const repetitions=2;
for(let repetition=0;repetition<repetitions;repetition++){
 for(let scenario=0;scenario<prompts.length;scenario++){
  const prompt=prompts[scenario];
  for(const entry of [{name:"responses_loop",fn:nativeRun},{name:"agents_sdk",fn:sdkRun}]){
   try{results.push({scenario,repetition,...await entry.fn(prompt)})}
   catch(e){results.push({scenario,repetition,engine:entry.name,model,error:String(e?.message||e).slice(0,180)})}
  }
 }
}
const summary={};
for(const engine of ["responses_loop","agents_sdk"]){
 const trials=results.filter(x=>x.engine===engine);
 const times=trials.filter(x=>!x.error).map(x=>x.elapsed_ms).sort((a,b)=>a-b);
 summary[engine]={
   trials:trials.length,errors:trials.filter(x=>x.error).length,
   coverage_passes:trials.filter(x=>x.score?.coverage_complete).length,
   duplicate_runs:trials.filter(x=>x.score?.duplicates?.length>0).length,
   provenance_error_runs:trials.filter(x=>x.score?.provenance_errors?.length>0).length,
   median_latency_ms:times.length?Math.round((times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2):null
 };
}
console.log(JSON.stringify({fixture:corpus.version,synthetic_only:true,model,prompts:prompts.length,repetitions,sample_count:results.length,summary,results},null,2));
if(results.some(r=>r.error))process.exitCode=1;
