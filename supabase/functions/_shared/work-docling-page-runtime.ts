/* Opt-in, serialized Docling PDF page batches.
 * Supabase is authoritative for the page checkpoints; Docling tasks are
 * disposable. A chunk result is NEVER exposed as a complete source receipt.
 */
import {pageBatches,convertPageBatch,assemblePageBatches} from "./work-docling-pages.mjs";
import {convertWithDocling} from "./work-docling.ts";

type PageResult =
  | {kind:"needs_source"}
  | {kind:"pending";taskId:string;version:string}
  | {kind:"advance";version:string}
  | {kind:"hold";reason:string}
  | {kind:"ready";version:string;merged:any};
type Planned={kind:"planned"}|{kind:"hold";reason:string};

const EGRESS_BUDGET_BYTES=512*1024*1024;
const MAX_PDF_BYTES=48*1024*1024;
const isRecoverableTaskLoss=(error:string)=>["docling_task_lost","docling_result_expired",
  "docling_task_failed","docling_no_readable_content","docling_conversion_failed",
  "pdf_batch_page_provenance_ambiguous","pdf_batch_no_readable_text"].includes(error);
const err=(message:string):never=>{throw Error(message)};
const checks=(result:{error?:any},label:string)=>{if(result.error)err(label)};

export const pageModeEnabled=()=>Deno.env.get("DOCLING_PAGE_BATCHES_ENABLED")==="true";

export async function pageCheckpointExists(sb:any,file:any,version:string|null){
  if(!version)return false;
  const r=await sb.from("minds_work_docling_page_chunks").select("id")
    .eq("file_id",file.id).eq("user_id",file.user_id)
    .eq("source_version",version).limit(1);
  checks(r,"pdf_page_checkpoint_lookup_failed");
  return (r.data||[]).length>0;
}
export async function readPdfPageCount(bytes:Uint8Array):Promise<number>{
  if(!bytes?.length||bytes.byteLength>MAX_PDF_BYTES)err("pdf_page_source_out_of_bounds");
  try{
    const module=await import("npm:pdf-lib@1.17.1");
    const doc=await module.PDFDocument.load(bytes,
      {ignoreEncryption:false,updateMetadata:false});
    return doc.getPageCount();
  }catch{throw new Error("pdf_page_count_unavailable")}
}
async function checkpoints(sb:any,file:any,version:string):Promise<any[]>{
  const r=await sb.from("minds_work_docling_page_chunks")
    .select("id,page_start,page_end,total_pages,status,docling_task_id,segments,markdown,attempts,reason")
    .eq("file_id",file.id).eq("user_id",file.user_id)
    .eq("source_version",version).order("page_start",{ascending:true}).limit(200);
  checks(r,"pdf_checkpoint_fetch_failed");
  return r.data||[];
}
async function writeCheckpoint(sb:any,row:any,patch:Record<string,unknown>,status:string){
  const r=await sb.from("minds_work_docling_page_chunks").update({
    ...patch,updated_at:new Date().toISOString()
  }).eq("id",row.id).eq("status",status).select("id");
  if(r.error||!Array.isArray(r.data)||r.data.length!==1)err("pdf_checkpoint_conflict");
}
async function review(sb:any,row:any,reason:string):Promise<PageResult>{
  await writeCheckpoint(sb,row,{status:"needs_review",docling_task_id:null,
    reason:String(reason).slice(0,120)},"submitted");
  return {kind:"hold",reason:"pdf_batch_"+String(reason).slice(0,85)};
}
function ready(rows:any[],total:number,version:string):PageResult{
  const merged=assemblePageBatches(rows,total);
  return {kind:"ready",version,merged};
}
async function ensurePlan(sb:any,file:any,bytes:Uint8Array,version:string):Promise<Planned>{
  const pages=await readPdfPageCount(bytes);
  let plan;
  try{plan=pageBatches(pages)}catch{return {kind:"hold",reason:"pdf_page_count_unaccepted"}}
  if(plan.length*bytes.byteLength>EGRESS_BUDGET_BYTES)
    return {kind:"hold",reason:"pdf_page_transfer_budget_exceeded"};
  const records=plan.map((p:any)=>({...p,user_id:file.user_id,project_id:file.project_id,
    file_id:file.id,source_version:version,status:"queued"}));
  const r=await sb.from("minds_work_docling_page_chunks").upsert(records,{
    onConflict:"file_id,source_version,page_start,page_end",ignoreDuplicates:true
  });
  checks(r,"pdf_checkpoint_plan_failed");
  return {kind:"planned"};
}
export async function processPdfPages(sb:any,file:any,job:any,
  {bytes=null,version=null}:{bytes?:Uint8Array|null;version?:string|null}={}):Promise<PageResult>{
  const hash=version||job.source_version;
  if(!hash||!/^[a-f0-9]{64}$/.test(hash))
    return {kind:"needs_source"};
  let rows=await checkpoints(sb,file,hash);
  if(!rows.length){
    if(!bytes?.length)return {kind:"needs_source"};
    const created=await ensurePlan(sb,file,bytes,hash);
    if(created.kind==="hold")return created;
    rows=await checkpoints(sb,file,hash);
  }
  if(!rows.length)err("pdf_checkpoint_plan_empty");
  const total=rows[0].total_pages;
  let expected;
  try{expected=pageBatches(total)}catch{return {kind:"hold",reason:"pdf_checkpoint_plan_invalid"}}
  if(rows.length!==expected.length||
    rows.some((r:any,i:number)=>r.page_start!==expected[i].page_start||
       r.page_end!==expected[i].page_end||r.total_pages!==total))
    return {kind:"hold",reason:"pdf_checkpoint_plan_invalid"};
  if(rows.some((r:any)=>r.status==="needs_review"))
    return {kind:"hold",reason:"pdf_batch_requires_review"};
  if(rows.every((r:any)=>r.status==="completed"))
    return ready(rows,total,hash);
  const next=rows.find((r:any)=>r.status!=="completed");
  if(next.status==="submitted"){
    if(!next.docling_task_id)return {kind:"hold",reason:"pdf_batch_task_id_missing"};
    let converted:any;
    try{
      converted=await convertWithDocling(file,new Uint8Array(),next.docling_task_id);
      if(!converted)err("docling_service_unavailable");
      if(converted.pending)return {kind:"pending",taskId:converted.taskId,version:hash};
      const parsed=convertPageBatch(converted.markdown,converted.document,next,converted.partial);
      await writeCheckpoint(sb,next,{status:"completed",docling_task_id:null,
        segments:parsed.segments,markdown:parsed.markdown,reason:null},"submitted");
    }catch(error){
      const why=String(error instanceof Error?error.message:error);
      if(why==="docling_task_lost"&&next.reason!=="docling_task_missing_once"){
        // One extra poll of the SAME task, no fresh PDF transfer or retry cost.
        await writeCheckpoint(sb,next,{reason:"docling_task_missing_once"},"submitted");
        return {kind:"pending",taskId:next.docling_task_id,version:hash};
      }
      if(isRecoverableTaskLoss(why))return await review(sb,next,why);
      throw error; // transient HTTP/network errors retain the same task ID
    }
    rows=await checkpoints(sb,file,hash);
    if(rows.every((r:any)=>r.status==="completed"))return ready(rows,total,hash);
    return {kind:"advance",version:hash};
  }
  if(next.status!=="queued")err("pdf_checkpoint_unexpected_status");
  if(!bytes?.length)return {kind:"needs_source"};
  // The file is not uploaded repeatedly unless there is a NEW page range.
  const pending:any=await convertWithDocling(file,bytes,null,{
    page_range:[next.page_start,next.page_end]
  });
  if(!pending?.pending||!pending.taskId)err("pdf_batch_submit_invalid");
  await writeCheckpoint(sb,next,{status:"submitted",docling_task_id:pending.taskId,
    attempts:next.attempts+1,reason:null},"queued");
  return {kind:"pending",taskId:pending.taskId,version:hash};
}
