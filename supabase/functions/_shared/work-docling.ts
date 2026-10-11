/** Private, authenticated, asynchronous Docling Serve v1 bridge.
 * Submit once; poll task status on later server runs; no browser involvement.
 */
import {doclingConnection,validDoclingTaskId,doclingTaskState,doclingConvertResult} from "./work-docling-contract.mjs";
const settings=()=>doclingConnection(Deno.env.get("DOCLING_SERVE_URL"),Deno.env.get("DOCLING_SERVE_API_KEY"));
export const isDoclingConfigured=()=>!!settings();
const secureFetch=async(url:string,key:string,init:RequestInit={},ms=35000)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{
    const result=await fetch(url,{...init,signal:controller.signal,redirect:"error",
      headers:{"Accept":"application/json","X-Api-Key":key,...(init.headers||{})}});
    if(!result.ok)throw Error("docling_http_"+result.status);
    return result.json();
  }finally{clearTimeout(timer)}
};
export async function isDoclingReady(){
  const conf=settings();if(!conf)return false;
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(conf.origin+"/ready",{
        method:"GET",headers:{"X-Api-Key":conf.key,"Accept":"application/json"},
        redirect:"error",signal:controller.signal
      });
      return response.status===200;
    }finally{clearTimeout(timer)}
  }catch{return false}
}
export function doclingSupportedExtension(ext:string){
  return ["pdf","docx","pptx","png","jpg","jpeg"].includes(ext);
}
export async function convertWithDocling(
 file:{name:string;mime_type:string},bytes:Uint8Array,taskId:string|null=null
){
  const conf=settings();if(!conf)return null;
  if(taskId){
    if(!validDoclingTaskId(taskId))throw Error("docling_invalid_task_id");
    const state=doclingTaskState(await secureFetch(
      conf.origin+"/v1/status/poll/"+encodeURIComponent(taskId),conf.key,{},20000));
    if(state.kind==="pending")return {pending:true,taskId};
    const result=await secureFetch(conf.origin+"/v1/result/"+encodeURIComponent(taskId),conf.key,{},65000);
    return doclingConvertResult(result);
  }
  // No signed URL is passed to Docling. The original is streamed by MINDS
  // as multipart data from private Storage to the authenticated converter.
  const data=new FormData();
  const original=new ArrayBuffer(bytes.byteLength);new Uint8Array(original).set(bytes);
  data.append("files",new File([original],file.name,
    {type:file.mime_type||"application/octet-stream"}));
  data.append("to_formats","md");
  data.append("to_formats","json");
  data.append("image_export_mode","placeholder");
  data.append("do_ocr","true");
  data.append("abort_on_error","false");
  const started=doclingTaskState(await secureFetch(
    conf.origin+"/v1/convert/file/async",conf.key,{method:"POST",body:data},60000));
  return {pending:true,taskId:started.taskId};
}
