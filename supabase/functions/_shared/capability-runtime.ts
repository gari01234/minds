import {normalizeSkillTrace} from "./skill-registry.ts";

export const CAPABILITY_RUNTIME_VERSION="capability-runtime-v0.3.0";
export const GENERAL_EXECUTION_MODEL="gpt-6-astra";

const KIND_BY_EXT:Record<string,{kind:string,mime:string}>={
  docx:{kind:"docx",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
  pdf:{kind:"pdf",mime:"application/pdf"},
  xlsx:{kind:"xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
  pptx:{kind:"pptx",mime:"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
  csv:{kind:"csv",mime:"text/csv"},
  zip:{kind:"zip",mime:"application/zip"},
  html:{kind:"html",mime:"text/html"},
  htm:{kind:"html",mime:"text/html"},
  txt:{kind:"txt",mime:"text/plain"},
  json:{kind:"json",mime:"application/json"},
  md:{kind:"markdown",mime:"text/markdown"},
  png:{kind:"image",mime:"image/png"},
  jpg:{kind:"image",mime:"image/jpeg"},
  jpeg:{kind:"image",mime:"image/jpeg"},
  webp:{kind:"image",mime:"image/webp"}
};
const OUTPUT_KINDS=new Set(Object.values(KIND_BY_EXT).map(x=>x.kind));
const TERMINAL=new Set(["completed","failed","cancelled","incomplete"]);

function safeName(v:string){
  return String(v||"output").split("/").pop()!.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,180)||"output";
}
function extOf(name:string){const m=String(name||"").toLowerCase().match(/\.([a-z0-9]+)$/);return m?.[1]||""}
function outputText(payload:any){
  const parts:string[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[])if(part?.type==="output_text"&&typeof part?.text==="string")parts.push(part.text);
  }
  return parts.join("\n").trim();
}
function responseStatus(payload:any){
  const raw=String(payload?.status||"").toLowerCase();
  return ["queued","in_progress","completed","failed","cancelled","incomplete"].includes(raw)?raw:"failed";
}
function citationFiles(payload:any){
  const out:any[]=[];
  for(const item of payload?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item?.content||[]){
      for(const a of part?.annotations||[]){
        if(a?.type!=="container_file_citation")continue;
        const fileId=String(a?.file_id||"").trim(),containerId=String(a?.container_id||"").trim();
        const filename=safeName(String(a?.filename||a?.file_name||"output"));
        if(fileId&&containerId)out.push({file_id:fileId,container_id:containerId,filename});
      }
    }
  }
  return out.filter((x,i,a)=>a.findIndex(y=>y.file_id===x.file_id&&y.container_id===x.container_id)===i);
}
function containerIds(payload:any){
  const ids:string[]=[];
  for(const item of payload?.output||[]){
    const id=String(item?.container_id||item?.container?.id||"").trim();
    if(item?.type==="code_interpreter_call"&&id&&!ids.includes(id))ids.push(id);
  }
  for(const c of citationFiles(payload))if(c.container_id&&!ids.includes(c.container_id))ids.push(c.container_id);
  return ids;
}
async function listContainerOutputs(apiKey:string,containerId:string){
  try{
    const response=await fetch(`https://api.openai.com/v1/containers/${encodeURIComponent(containerId)}/files?limit=100&order=desc`,{
      headers:{Authorization:`Bearer ${apiKey}`}
    });
    if(!response.ok)return [];
    const payload=await response.json();
    return (payload?.data||[]).map((x:any)=>({
      file_id:String(x?.id||""),container_id:containerId,
      filename:safeName(String(x?.path||x?.filename||"output")),
      source:String(x?.source||"")
    })).filter((x:any)=>x.file_id&&KIND_BY_EXT[extOf(x.filename)]&&x.source!=="user");
  }catch{return []}
}
async function allOutputFiles(apiKey:string,payload:any){
  const cited=citationFiles(payload).filter(x=>KIND_BY_EXT[extOf(x.filename)]);
  const generated:any[]=[];
  for(const containerId of containerIds(payload).slice(0,2)){
    for(const x of await listContainerOutputs(apiKey,containerId)){
      if(!generated.some(y=>y.file_id===x.file_id))generated.push(x);
    }
  }
  if(generated.length){
    const citedIds=new Set(cited.map(x=>x.file_id));
    return generated.sort((a:any,b:any)=>Number(citedIds.has(b.file_id))-Number(citedIds.has(a.file_id))).slice(0,10);
  }
  // Citation fallback is retained for provider responses where the container listing is unavailable.
  return cited.slice(0,10);
}
async function downloadContainerFile(apiKey:string,file:any){
  const response=await fetch(`https://api.openai.com/v1/containers/${encodeURIComponent(file.container_id)}/files/${encodeURIComponent(file.file_id)}/content`,{
    headers:{Authorization:`Bearer ${apiKey}`}
  });
  if(!response.ok)throw new Error("container_file_download_failed:"+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length||bytes.length>20*1024*1024)throw new Error("container_file_size_invalid");
  return bytes;
}
async function artifactRows(sb:any,ids:string[]){
  if(!ids.length)return [];
  const {data}=await sb.from("minds_artifacts")
    .select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at")
    .in("id",ids);
  const rows=data||[];
  return await Promise.all(rows.map(async(row:any)=>{
    const {data:signed}=await sb.storage.from("minds-artifacts").createSignedUrl(row.storage_path,7*24*60*60);
    return {...row,url:signed?.signedUrl||null};
  }));
}
async function storeOutputs(sb:any,apiKey:string,run:any,payload:any){
  const existing=Array.isArray(run?.artifact_ids)?run.artifact_ids.filter(Boolean):[];
  if(existing.length)return await artifactRows(sb,existing);

  const files=await allOutputFiles(apiKey,payload);
  const rows:any[]=[];
  for(const file of files){
    const spec=KIND_BY_EXT[extOf(file.filename)];
    if(!spec||!OUTPUT_KINDS.has(spec.kind))continue;
    const filename=safeName(file.filename),storagePath=`${run.user_id}/capability/${run.id}/${safeName(file.file_id)}-${filename}`;
    let row:any=null;
    try{
      const bytes=await downloadContainerFile(apiKey,file);
      const {error:uploadError}=await sb.storage.from("minds-artifacts").upload(storagePath,bytes,{contentType:spec.mime,upsert:false});
      if(uploadError&&!String(uploadError.message||"").toLowerCase().includes("exist"))throw uploadError;
      const {data:inserted,error:insertError}=await sb.from("minds_artifacts").insert({
        user_id:run.user_id,workspace_id:null,source_kind:"capability",kind:spec.kind,title:filename,mime_type:spec.mime,storage_path:storagePath,
        metadata:{
          capability_run_id:run.id,provider:"openai_responses",provider_response_id:run.provider_response_id,
          provider_container_id:file.container_id,provider_file_id:file.file_id,
          provenance_class:"generated_deliverable",accepted_fact:false,promotion_required_for_project_truth:true,
          derived_from:Array.isArray(run?.metadata?.input_files)?run.metadata.input_files:[],
          skill_trace:normalizeSkillTrace(run?.metadata?.skill_trace)
        }
      }).select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at").single();
      if(insertError){
        const {data:found}=await sb.from("minds_artifacts").select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at").eq("storage_path",storagePath).maybeSingle();
        row=found||null;
      }else row=inserted;
    }catch{}
    if(row){
      const {data:signed}=await sb.storage.from("minds-artifacts").createSignedUrl(row.storage_path,7*24*60*60);
      rows.push({...row,url:signed?.signedUrl||null});
    }
  }
  return rows;
}
async function deliverCompletion(sb:any,run:any,artifacts:any[],summary:string){
  if(!run?.conversation_id)return;
  const clientKey="capability:"+run.id;
  const content=summary||(`He terminado ${run.title}.`);
  const metadata={
    app:run.origin_kind==="work_thread"?"work_thread":"isabella",
    capability_run_id:run.id,generated_deliverable:true,
    skill_trace:normalizeSkillTrace(run?.metadata?.skill_trace),
    artifacts:artifacts.map((x:any)=>({
      id:x.id,workspace_id:x.workspace_id,source_kind:x.source_kind,kind:x.kind,title:x.title,
      mime_type:x.mime_type,storage_path:x.storage_path,metadata:x.metadata,created_at:x.created_at
    }))
  };
  await sb.from("conversation_messages").upsert({
    user_id:run.user_id,conversation_id:run.conversation_id,client_key:clientKey,role:"assistant",
    content,provisional:false,citations:[],metadata
  },{onConflict:"user_id,conversation_id,client_key"});
  await sb.from("conversations").update({updated_at:new Date().toISOString()}).eq("id",run.conversation_id).eq("user_id",run.user_id);
}
async function recordUsage(sb:any,run:any,payload:any){
  const usage=payload?.usage;if(!usage)return;
  try{
    const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0);
    await sb.from("minds_ai_usage").insert({
      user_id:run.user_id,feature:"capability_general_execution",model:String(run.metadata?.model||GENERAL_EXECUTION_MODEL),
      input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:Number(usage.total_tokens||input+output),
      metadata:{capability_run_id:run.id,provider_response_id:run.provider_response_id}
    });
  }catch{}
}

export function generalExecutionInstructions(){
  return [
    "You are a bounded material execution worker for Isabella/MINDS.",
    "Your job is to finish the requested deliverable, not merely explain how to make it.",
    "Use the python tool and the container filesystem whenever that materially improves the result.",
    "Choose professional, usable output formats from the user's goal even when they did not name a file extension.",
    "For a printable form or office document, prefer a polished PDF and an editable DOCX when both are useful.",
    "For data, comparisons, calculations or tabular work, prefer XLSX or CSV as appropriate.",
    "For a presentation, create PPTX. For bundles, ZIP is allowed.",
    "Generate real structured files: tables must be real tables/cells, spreadsheets real workbooks, presentations real slides.",
    "When input files are provided, inspect and work from those files. Edit or transform them directly when that is the user's goal; do not replace them with a generic reconstruction unless necessary.",
    "Preserve source content, formulas, structure and formatting that the user did not ask to change whenever practical.",
    "Inspect the generated material for obvious layout/content errors before finishing.",
    "Do not access external systems, credentials, email, browser sessions, or network resources.",
    "Do not write to MINDS, project knowledge, memory or any external application.",
    "Final files are user-requested deliverables, not verified facts. Preserve uncertainty in their content when evidence is uncertain.",
    "Reference every final file in the final answer so the host receives container file citations."
  ].join(" ");
}
export async function startGeneralExecution(apiKey:string,input:{objective:string;title:string;desired_outputs:string[];context?:any;model?:string;input_files?:Array<{name:string;mime:string;file_data:string;source?:string;id?:string}>}){
  const model=String(input.model||GENERAL_EXECUTION_MODEL);
  const desired=(input.desired_outputs||[]).filter(x=>OUTPUT_KINDS.has(x));
  const text=[
    `TASK TITLE: ${input.title}`,
    `OBJECTIVE: ${input.objective}`,
    desired.length?`PREFERRED OUTPUTS: ${desired.join(", ")}`:"OUTPUT FORMAT: choose the format or formats that best complete the real-world task.",
    input.context&&Object.keys(input.context).length?`CONTEXT: ${JSON.stringify(input.context)}`:"",
    "Complete the task now. Save final deliverables in the container and reference every final file in your final answer."
  ].filter(Boolean).join("\n\n");
  const inputFiles=(input.input_files||[]).slice(0,6).filter(x=>x?.name&&x?.mime&&x?.file_data);
  const content:any[]=[
    ...inputFiles.map(file=>({type:"input_file",filename:safeName(file.name),file_data:file.file_data})),
    {type:"input_text",text}
  ];
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,background:true,store:true,
      reasoning:{effort:"medium",summary:"auto"},max_output_tokens:3200,max_tool_calls:24,
      tools:[{type:"code_interpreter",container:{type:"auto",memory_limit:"4g"}}],
      instructions:generalExecutionInstructions(),
      input:[{role:"user",content}]
    })
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(String(payload?.error?.message||`capability_start_http_${response.status}`).slice(0,2000));
  return payload;
}
export async function retrieveGeneralExecution(apiKey:string,responseId:string){
  const response=await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`,{
    headers:{Authorization:`Bearer ${apiKey}`}
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(String(payload?.error?.message||`capability_retrieve_http_${response.status}`).slice(0,2000));
  return payload;
}
export async function cancelGeneralExecution(apiKey:string,responseId:string){
  const response=await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}/cancel`,{
    method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"}
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(String(payload?.error?.message||`capability_cancel_http_${response.status}`).slice(0,2000));
  return payload;
}
export async function reconcileCapabilityRun(sb:any,apiKey:string,run:any,{deliver=false}:{deliver?:boolean}={}){
  if(!run?.provider_response_id)return {run,status:"queued",artifacts:[]};
  const payload=await retrieveGeneralExecution(apiKey,run.provider_response_id);
  const providerStatus=responseStatus(payload),now=new Date().toISOString();
  if(providerStatus==="queued"||providerStatus==="in_progress"){
    const containers=containerIds(payload);
    const patch:any={status:"in_progress",updated_at:now,metadata:{...(run.metadata||{}),provider_status:providerStatus}};
    if(containers[0])patch.provider_container_id=containers[0];
    const {data}=await sb.from("minds_capability_runs").update(patch).eq("id",run.id).select("*").single();
    return {run:data||{...run,...patch},status:"in_progress",artifacts:[]};
  }
  if(providerStatus!=="completed"){
    const status=providerStatus==="cancelled"?"cancelled":"failed";
    const error=String(payload?.error?.message||payload?.incomplete_details?.reason||providerStatus).slice(0,4000);
    const patch={status,error,completed_at:now,updated_at:now,metadata:{...(run.metadata||{}),provider_status:providerStatus}};
    const {data}=await sb.from("minds_capability_runs").update(patch).eq("id",run.id).select("*").single();
    return {run:data||{...run,...patch},status,artifacts:[]};
  }

  const artifacts=await storeOutputs(sb,apiKey,run,payload);
  const summary=outputText(payload)||`He terminado ${run.title}.`;
  const containers=containerIds(payload);
  if(!artifacts.length){
    const patch={status:"failed",error:"no_deliverable_files",summary,completed_at:now,updated_at:now,metadata:{...(run.metadata||{}),provider_status:"completed"}};
    const {data}=await sb.from("minds_capability_runs").update(patch).eq("id",run.id).select("*").single();
    await recordUsage(sb,run,payload);
    return {run:data||{...run,...patch},status:"failed",artifacts:[]};
  }
  const patch:any={
    status:"completed",summary,error:null,artifact_ids:artifacts.map((x:any)=>x.id),
    completed_at:now,updated_at:now,metadata:{...(run.metadata||{}),provider_status:"completed"}
  };
  if(containers[0])patch.provider_container_id=containers[0];
  const {data}=await sb.from("minds_capability_runs").update(patch).eq("id",run.id).select("*").single();
  await recordUsage(sb,run,payload);
  if(deliver)await deliverCompletion(sb,data||{...run,...patch},artifacts,summary);
  return {run:data||{...run,...patch},status:"completed",artifacts};
}
