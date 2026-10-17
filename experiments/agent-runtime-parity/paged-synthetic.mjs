// Synthetic-only 2x2: Responses vs Agents SDK; paged discovery vs verified enumeration.
// Deliberately no real documents, Supabase, network browser or write tools.
// Do not confuse this research contract smoke with quality on private architecture sources.
import {performance} from "node:perf_hooks";
import OpenAI from "openai";
import {z} from "zod";
process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
const {Agent,run,tool,setTracingDisabled}=await import("@openai/agents");
setTracingDisabled(true);
if(!process.env.OPENAI_API_KEY)throw Error("separate_parity_test_credential_required");
const model=process.env.PARITY_OPENAI_MODEL||"gpt-5.6-luna";
if(!/^[A-Za-z0-9._-]+$/.test(model))throw Error("invalid_model");
const terms="Sala Azul";
const kinds=["room","room","void","room","program","room","room","void","room","room","program","room","room","room","void","room","room","program","room","room","room"];
const records=kinds.map((kind,i)=>({
 id:"fictional-"+String(i+1).padStart(2,"0"),
 file_id:"demo-doc-"+String(Math.floor(i/5)+1),
 source_version:"fictional-source-"+String(Math.floor(i/5)+1)+"-current",
 page: i%5+1,
 kind,
 label:(kind==="void"?"Luftraum ":kind==="program"?"Raumprogramm ":"")+"Sala Azul",
 quantity:(kind==="void"?53.2:kind==="program"?55:61.1)+i/100
}));
const missing=["demo-no-parser"];
const truth=new Map(records.map(r=>[r.id,r]));
const pageSize=3;
const requiredOffsets=Array.from({length:Math.ceil(records.length/pageSize)},(_,i)=>i*pageSize);
const modelInstructions=[
 "You are researching an entirely FICTIONAL project; tools contain all current extracted text.",
 "Always use the sole available tool. Never infer the number of matches from a top-ranked excerpt.",
 "Keep room (room), double-height void (void) and program estimate (program) types separate.",
 "Do not invent a chronological evolution between unrelated variants.",
 "Return ONLY JSON: {evidence:[{id,kind}], unavailable:[file_id],",
 "extracted_text_traversed:boolean, full_originals_verified:false, chronology_verified:false}.",
 "You must list each record exactly once by its exact tool ID. List missing-parser files.",
 "Do NOT claim full extracted-text traversal until every tool page has been reviewed."
].join(" ");
const prompt="Compile an inventory of EVERY documented Sala Azul value across all versions of the fictional architectural project; distinguish void, room and program; give source evidence IDs, and state what could not be parsed. Do not infer chronology.";
function resultFor(mode,args){
 if(args.term!=="Sala Azul")return {error:"unknown_term",expected_term:"Sala Azul"};
 if(mode==="complete")return {scope:"all_current_extracted_text",total:records.length,
   returned:records.length,has_more:false,records,unavailable:missing,source_versions_verified:true};
 const offset=Number(args.offset);
 if(!Number.isSafeInteger(offset)||offset<0||offset>records.length)return {error:"invalid_offset"};
 return {scope:"all_current_extracted_text",total:records.length,offset,
   returned:Math.min(pageSize,Math.max(0,records.length-offset)),has_more:offset+pageSize<records.length,
   next_offset:offset+pageSize<records.length?offset+pageSize:null,
   records:records.slice(offset,offset+pageSize),unavailable:missing,source_versions_verified:true};
}
function score(text,mode,offsets){
 let answer;
 try{
  let s=String(text||"").trim();
  if(s.startsWith(String.fromCharCode(96).repeat(3)))s=s.replace(/^.{3}(?:json)?\s*/i,"").replace(/\s*.{3}$/,"");
  answer=JSON.parse(s);
 }catch(e){return {parsed:false,issue:"non_json_final",excerpt_length:String(text||"").length}};
 const found=Array.isArray(answer.evidence)?answer.evidence:[];
 const ids=found.map(x=>x.id);
 const duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
 const missingRecords=records.filter(x=>!ids.includes(x.id)).map(x=>x.id);
 const unsupported=ids.filter(id=>!truth.has(id));
 const wrongKind=found.filter(x=>truth.has(x.id)&&truth.get(x.id).kind!==x.kind).map(x=>x.id);
 const skipped=missing.filter(x=>!(answer.unavailable||[]).includes(x));
 const traversed=mode==="complete"?offsets.length>=1:requiredOffsets.every(x=>offsets.includes(x));
 const correct=missingRecords.length===0&&duplicates.length===0&&unsupported.length===0&&wrongKind.length===0&&
   skipped.length===0&&traversed&&answer.extracted_text_traversed===true&&answer.full_originals_verified!==true&&answer.chronology_verified!==true;
 return {parsed:true,complete:correct,expected:records.length,reported:found.length,missing_count:missingRecords.length,
   duplicate_count:duplicates.length,unsupported_count:unsupported.length,wrong_kind_count:wrongKind.length,
   parser_gaps_unreported:skipped.length,all_pages_actually_traversed:traversed,
   claimed_text_complete:answer.extracted_text_traversed===true,
   false_visual_claim:answer.full_originals_verified===true,
   unsupported_chronology:answer.chronology_verified===true};
}
async function runNative(mode){
 const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:80000,maxRetries:0});
 const offsets=[];let calls=0,inTokens=0,outTokens=0,answer="",toolCalls=0;
 const input=[{role:"user",content:prompt}];
 const schema={type:"function",name:"read_all_evidence",description:mode==="paged"?
  "Browse project text matches in pages of exactly 3. Start offset=0, continue using next_offset until has_more=false.":
  "Exhaustively enumerate every current-version occurrence, source identity and parser gap in one verified receipt.",
  strict:true,parameters:{type:"object",properties:{
   term:{type:"string"},...(mode==="paged"?{offset:{type:"integer"}}:{})
  },required:mode==="paged"?["term","offset"]:["term"],additionalProperties:false}};
 const start=performance.now();
 for(let turn=0;turn<14;turn++){
  const r=await client.responses.create({model,store:false,instructions:modelInstructions,input,tools:[schema],
    reasoning:{effort:"medium"},max_output_tokens:3800});
  calls++;inTokens+=r.usage?.input_tokens||0;outTokens+=r.usage?.output_tokens||0;
  if(r.status!=="completed")throw Error("provider_status_"+r.status);
  const functionCalls=(r.output||[]).filter(x=>x.type==="function_call");
  if(functionCalls.length===0){answer=r.output_text||"";break}
  input.push(...r.output);
  for(const fc of functionCalls){
   if(fc.name!=="read_all_evidence")throw Error("unauthorized_tool");
   const a=JSON.parse(fc.arguments||"{}");const returned=resultFor(mode,a);
   offsets.push(mode==="paged"?a.offset:0);toolCalls++;
   input.push({type:"function_call_output",call_id:fc.call_id,output:JSON.stringify(returned)});
  }
 }
 if(!answer)throw Error("no_final_within_14_rounds");
 return {engine:"responses_loop",mode,elapsed_ms:Math.round(performance.now()-start),
  model_calls:calls,tool_calls:toolCalls,offsets,usage:{input_tokens:inTokens,output_tokens:outTokens},
  grade:score(answer,mode,offsets)};
}
async function runSdk(mode){
 const offsets=[];
 const fn=tool({name:"read_all_evidence",description:mode==="paged"?
  "Browse pages of 3. Start offset=0; call again with next_offset while has_more=true. Never stop early.":
  "Get all occurrences and parser gaps in one complete version-pinned evidence set.",
  parameters:mode==="paged"?z.object({term:z.string(),offset:z.number().int().nonnegative()}):z.object({term:z.string()}),
  async execute(args){offsets.push(mode==="paged"?args.offset:0);return JSON.stringify(resultFor(mode,args));}
 });
 const agent=new Agent({name:"Synthetic document researcher",instructions:modelInstructions,model,tools:[fn],
  modelSettings:{reasoning:{effort:"medium"}}});
 const start=performance.now();
 const result=await run(agent,prompt,{maxTurns:14});
 return {engine:"agents_sdk",mode,elapsed_ms:Math.round(performance.now()-start),tool_calls:offsets.length,
  offsets,grade:score(result.finalOutput,mode,offsets)};
}
const trials=[];
for(const mode of ["paged","complete"]){
 for(const step of [runNative,runSdk]){
  try{trials.push(await step(mode))}
  catch(e){trials.push({engine:step===runNative?"responses_loop":"agents_sdk",mode,
   error:String(e?.message||e).slice(0,210)})}
 }
}
console.log(JSON.stringify({experiment:"synthetic-paginated-v0.1",synthetic_only:true,model,
 expected_records:records.length,required_offsets:requiredOffsets,trial_count:trials.length,
 trials},null,2));
if(trials.some(x=>x.error))process.exitCode=1;
