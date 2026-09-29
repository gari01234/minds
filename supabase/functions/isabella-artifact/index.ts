
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "npm:docx@9.5.1";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function cleanTitle(v:any){return String(v||"Artefacto").trim().slice(0,160)||"Artefacto"}
function safeName(v:string){return v.normalize("NFKD").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"artefacto"}
function b64Bytes(s:string){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function normalizeText(s:string){return String(s||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim()}
function docxParagraphs(content:string){
  const lines=normalizeText(content).split("\n");
  const out:any[]=[];
  for(const raw of lines){
    const line=raw.trimEnd();
    if(!line.trim()){out.push(new Paragraph({text:""}));continue}
    const h=line.match(/^(#{1,3})\s+(.+)$/);
    if(h){
      const level=h[1].length===1?HeadingLevel.HEADING_1:h[1].length===2?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3;
      out.push(new Paragraph({text:h[2],heading:level,spacing:{before:180,after:100}}));continue;
    }
    const bullet=line.match(/^[-*]\s+(.+)$/);
    if(bullet){out.push(new Paragraph({text:bullet[1],bullet:{level:0},spacing:{after:80}}));continue}
    out.push(new Paragraph({children:[new TextRun({text:line})],spacing:{after:100,line:300}}));
  }
  return out;
}
async function makeDocx(title:string,content:string){
  const doc=new Document({
    sections:[{properties:{},children:[
      new Paragraph({text:title,heading:HeadingLevel.TITLE,spacing:{after:260}}),
      ...docxParagraphs(content)
    ]}]
  });
  const buf=await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
function wrapLine(text:string,font:any,size:number,maxWidth:number){
  const words=text.split(/\s+/).filter(Boolean),lines:string[]=[];let line="";
  for(const word of words){
    const candidate=line?line+" "+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue}
    if(line)lines.push(line);
    if(font.widthOfTextAtSize(word,size)<=maxWidth){line=word;continue}
    let chunk="";
    for(const ch of word){
      const c=chunk+ch;
      if(font.widthOfTextAtSize(c,size)<=maxWidth)chunk=c;
      else{if(chunk)lines.push(chunk);chunk=ch}
    }
    line=chunk;
  }
  if(line)lines.push(line);
  return lines.length?lines:[""];
}
async function makePdf(title:string,content:string){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const width=595.28,height=841.89,margin=56,maxWidth=width-margin*2;
  let page=pdf.addPage([width,height]),y=height-margin;
  const addPage=()=>{page=pdf.addPage([width,height]);y=height-margin};
  const drawWrapped=(text:string,f:any,size:number,gap:number)=>{
    for(const line of wrapLine(text,f,size,maxWidth)){
      if(y<margin+size+8)addPage();
      page.drawText(line,{x:margin,y:y-size,font:f,size,color:rgb(0.08,0.08,0.08)});
      y-=gap;
    }
  };
  drawWrapped(title,bold,22,29);y-=8;
  for(const raw of normalizeText(content).split("\n")){
    const line=raw.trim();
    if(!line){y-=9;continue}
    const h=line.match(/^(#{1,3})\s+(.+)$/);
    if(h){y-=6;drawWrapped(h[2],bold,h[1].length===1?17:h[1].length===2?15:13,23);y-=4;continue}
    const bullet=line.match(/^[-*]\s+(.+)$/);
    if(bullet){drawWrapped("• "+bullet[1],font,11,16);continue}
    drawWrapped(line,font,11,16);y-=3;
  }
  return await pdf.save();
}
async function recordUsage(sb:any,userId:string,feature:string,model:string,usage:any,metadata:any={}){
  if(!usage)return;
  const input=Number(usage.input_tokens||0),cached=Number(usage?.input_tokens_details?.cached_tokens||0),output=Number(usage.output_tokens||0),total=Number(usage.total_tokens||input+output);
  try{await sb.from("minds_ai_usage").insert({user_id:userId,feature,model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,total_tokens:total,metadata})}catch{}
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("Authorization")||"";if(!auth)return json({error:"unauthorized"},401);
  let body:any={};try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const url=Deno.env.get("SUPABASE_URL")||"";
  let key=Deno.env.get("SUPABASE_ANON_KEY")||"";
  try{const keys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");key=keys?.default||key}catch{}
  if(!url||!key)return json({error:"server_not_configured"},503);
  const sb=createClient(url,key,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await sb.auth.getUser();if(userError||!user)return json({error:"unauthorized"},401);

  const kind=String(body?.kind||"").toLowerCase();
  if(!["image","docx","pdf"].includes(kind))return json({error:"unsupported_artifact_kind"},400);
  const title=cleanTitle(body?.title),workspaceId=/^[0-9a-f-]{36}$/i.test(String(body?.workspace_id||""))?String(body.workspace_id):null;
  const sourceKind=workspaceId?"idea":"chat";
  let bytes:Uint8Array,mime="",ext="",generation:any=null,model="";

  if(kind==="image"){
    const prompt=String(body?.instruction||body?.content||"").trim();
    if(!prompt)return json({error:"instruction_required"},400);
    const apiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!apiKey)return json({error:"openai_not_configured"},503);
    const size=["1024x1024","1536x1024","1024x1536"].includes(String(body?.size||""))?String(body.size):"1024x1024";
    const quality=["low","medium","high"].includes(String(body?.quality||""))?String(body.quality):"low";
    model="gpt-image-2.5-flare";
    const response=await fetch("https://api.openai.com/v1/images/generations",{
      method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({model,prompt,size,quality,output_format:"png",n:1})
    });
    generation=await response.json();
    if(!response.ok)return json({error:"image_generation_failed",detail:generation?.error?.message||"No pude generar la imagen."},502);
    const b64=String(generation?.data?.[0]?.b64_json||"");if(!b64)return json({error:"empty_image"},502);
    bytes=b64Bytes(b64);mime="image/png";ext="png";
    await recordUsage(sb,user.id,"artifact_image",model,generation?.usage,{quality,size});
  }else{
    const content=normalizeText(body?.content||"");
    if(!content)return json({error:"content_required"},400);
    if(kind==="docx"){bytes=await makeDocx(title,content);mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document";ext="docx"}
    else{bytes=await makePdf(title,content);mime="application/pdf";ext="pdf"}
  }

  const stamp=new Date().toISOString().replace(/[:.]/g,"-"),id=crypto.randomUUID();
  const path=`${user.id}/${workspaceId||"chat"}/${stamp}-${safeName(title)}-${id.slice(0,8)}.${ext}`;
  const {error:uploadError}=await sb.storage.from("minds-artifacts").upload(path,bytes,{contentType:mime,upsert:false});
  if(uploadError)return json({error:"artifact_upload_failed",detail:uploadError.message},500);
  const {data:row,error:insertError}=await sb.from("minds_artifacts").insert({
    user_id:user.id,workspace_id:workspaceId,source_kind:sourceKind,kind,title,mime_type:mime,storage_path:path,
    metadata:{model:model||null,revised_prompt:generation?.data?.[0]?.revised_prompt||null}
  }).select("id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata,created_at").single();
  if(insertError){await sb.storage.from("minds-artifacts").remove([path]);return json({error:"artifact_record_failed",detail:insertError.message},500)}
  const {data:signed}=await sb.storage.from("minds-artifacts").createSignedUrl(path,7*24*60*60);
  return json({artifact:{...row,url:signed?.signedUrl||null}});
});
