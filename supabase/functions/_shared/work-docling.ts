/** Optional private Docling Serve adapter (MIT-licensed Docling project).
 * Never send confidential files to a public or unconfigured endpoint.
 */
export async function convertWithDocling(file:{name:string;mime_type:string},bytes:Uint8Array){
  const endpoint=Deno.env.get("DOCLING_SERVE_URL");
  if(!endpoint)return null;
  const base=new URL(endpoint);
  if(base.protocol!=="https:")throw new Error("docling_requires_https");
  const body=new FormData();
  body.append("files",new File([bytes],file.name,{type:file.mime_type||"application/octet-stream"}));
  body.append("to_formats","md");
  body.append("image_export_mode","placeholder");
  body.append("do_ocr","true");
  const headers:Record<string,string>={"Accept":"application/json"};
  const key=Deno.env.get("DOCLING_SERVE_API_KEY");
  if(key)headers["X-Api-Key"]=key;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),85000);
  try{
    const res=await fetch(new URL("/v1/convert/file",base),{method:"POST",headers,body,signal:controller.signal});
    if(!res.ok)throw new Error("docling_http_"+res.status);
    const data=await res.json();
    const markdown=String(data?.document?.md_content||"").trim();
    if(!["success","partial_success"].includes(String(data?.status||""))||!markdown)
      throw new Error("docling_no_readable_content");
    return {markdown,partial:data.status==="partial_success"};
  }finally{clearTimeout(timeout)}
}
