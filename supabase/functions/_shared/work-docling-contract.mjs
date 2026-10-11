/* Pure Docling bridge contract. Untrusted responses never become authoritative knowledge. */
export function doclingConnection(endpoint, apiKey){
  if(typeof endpoint!=="string"||typeof apiKey!=="string"||apiKey.length<32)return null;
  try{
    const url=new URL(endpoint);
    if(url.protocol!=="https:"||!url.hostname||url.username||url.password||
       url.pathname!=="/"||url.search||url.hash)return null;
    return {origin:url.origin,key:apiKey};
  }catch{return null}
}
export function validDoclingTaskId(id){
  return typeof id==="string"&&id.length>=8&&id.length<=192&&/^[a-zA-Z0-9_-]+$/.test(id);
}
export function doclingTaskState(body){
  if(!validDoclingTaskId(body?.task_id))throw Error("docling_invalid_task");
  const state=String(body?.task_status||"");
  if(state==="pending"||state==="started")return {kind:"pending",taskId:body.task_id};
  if(state==="success")return {kind:"ready",taskId:body.task_id};
  if(state==="failure")throw Error("docling_task_failed");
  throw Error("docling_invalid_task_state");
}
export function doclingConvertResult(body){
  const state=String(body?.status||"");
  if(state!=="success"&&state!=="partial_success")throw Error("docling_conversion_failed");
  const markdown=String(body?.document?.md_content||"").trim();
  if(!markdown)throw Error("docling_no_readable_content");
  let doc=body?.document?.json_content||null;
  if(typeof doc==="string"){try{doc=JSON.parse(doc)}catch{doc=null}}
  return {pending:false,markdown,document:doc,partial:state==="partial_success"};
}
