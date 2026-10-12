/* Work intake processor. Uses canonical Source-First RPC; no new truth store. */
import {convertWithDocling,isDoclingConfigured,doclingSupportedExtension} from "./work-docling.ts";
import {base64Bytes,proposedEvidence} from "./work-source-proposals.ts";
import {materializeWorkSourceText} from "./work-source-materialize.ts";
import {pageModeEnabled,pageCheckpointExists,processPdfPages} from "./work-docling-page-runtime.ts";
const supported=new Set(["pdf","doc","docx","xls","xlsx","ppt","pptx","txt","md","csv","rtf","eml","png","jpg","jpeg"]);
const image=new Set(["png","jpg","jpeg"]);
const fileMax=48*1024*1024,providerMax=20*1024*1024;
const sha256=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes).buffer)))
  .map(n=>n.toString(16).padStart(2,"0")).join("");
export async function processWorkFile(sb:any,job:any){
  const {data:file,error}=await sb.from("minds_work_files")
    .select("id,user_id,project_id,name,mime_type,size_bytes,storage_path,metadata")
    .eq("id",job.file_id).eq("user_id",job.user_id).eq("project_id",job.project_id).maybeSingle();
  if(error||!file)throw new Error("canonical_file_missing");
  const ext=String(file.name||"").toLowerCase().split(".").pop()||"";
  if(!supported.has(ext))return {status:"waiting_parser",reason:"needs_format_reader",file};
  if(file.size_bytes>fileMax)return {status:"waiting_parser",reason:"needs_larger_worker",file};
  if(file.size_bytes>providerMax&&!isDoclingConfigured())
    return {status:"waiting_parser",reason:"docling_required_large_source",file};
  if(image.has(ext)&&file.size_bytes>8*1024*1024&&!isDoclingConfigured())
    return {status:"waiting_parser",reason:"needs_private_docling_image",file};
  let converted:any=null,bytes:Uint8Array|null=null;
  let version:string|null=job.source_version||null;
  let pagedText:any=null;
  const loadOriginal=async()=>{
    if(bytes)return bytes;
    const {data:blob,error:storageError}=await sb.storage.from("minds-work").download(file.storage_path);
    if(storageError||!blob)throw new Error("source_download_failed");
    bytes=new Uint8Array(await blob.arrayBuffer());
    if(bytes.length>fileMax)throw new Error("actual_file_size_exceeds_limit");
    return bytes;
  };
  // Explicit opt-in, only for PDFs. Once a page plan exists, resume it even
  // if the feature gate is later disabled; never mix with whole-file conversion.
  const existingPlan=ext==="pdf"&&!!version&&
    await pageCheckpointExists(sb,file,version);
  // Existing checkpoints must never fall back to whole-file parsing when
  // the private converter is temporarily unconfigured or the gate is off.
  if(existingPlan&&!isDoclingConfigured())
    return {status:"waiting_parser",reason:"docling_checkpoint_requires_service",
      version:version||null,file};
  const usePages=ext==="pdf"&&(existingPlan||
    (isDoclingConfigured()&&pageModeEnabled()&&!job.docling_task_id&&
      file.size_bytes>=16*1024*1024));
  if(usePages){
    let page=await processPdfPages(sb,file,job,{version});
    if(page.kind==="needs_source"){
      const original=await loadOriginal();
      const actual=await sha256(original);
      if(version&&version!==actual)throw new Error("pdf_source_version_changed");
      version=actual;
      // Final receipts win: avoid an unnecessary page plan and conversion.
      const {data:receipt,error:receiptError}=await sb.from("minds_work_source_text_receipts")
        .select("coverage,segment_count,locator_class").eq("file_id",file.id)
        .eq("source_version",version).maybeSingle();
      if(receiptError)throw new Error("source_text_receipt_check_failed");
      if(receipt){
        pagedText={status:"materialized",coverage:receipt.coverage,
          segments:receipt.segment_count,locator_class:receipt.locator_class,reused:true};
        page={kind:"existing"};
      }else page=await processPdfPages(sb,file,job,{bytes:original,version});
    }
    if(page.kind==="pending")
      return {status:"docling_pending",taskId:page.taskId,version:page.version,file};
    if(page.kind==="advance")
      return {status:"page_batch_advance",version:page.version,file};
    if(page.kind==="hold")
      return {status:"waiting_parser",reason:page.reason,version:version||null,file};
    if(page.kind==="ready"){
      const original=await loadOriginal();
      if(await sha256(original)!==page.version)throw new Error("pdf_source_version_changed");
      version=page.version;
      const merged=page.merged;
      // Existing source RPC atomically commits the final versioned receipt +
      // searchable segments; partial checkpoints are never exposed as complete.
      const {data:commit,error:commitError}=await sb.rpc("minds_commit_work_source_segments",{
        p_user_id:file.user_id,p_project_id:file.project_id,p_file_id:file.id,
        p_source_version:version,p_extractor:"docling-serve",
        p_coverage:merged.coverage,p_locator_class:merged.locator_class,
        p_metadata:merged.metadata,p_segments:merged.segments
      });
      if(commitError||!["completed","already_materialized"].includes(String(commit?.status||"")))
        throw new Error("pdf_page_source_commit_failed");
      pagedText={status:"materialized",coverage:merged.coverage,
        segments:merged.segments.length,locator_class:merged.locator_class,
        reused:commit.status==="already_materialized"};
      converted={pending:false,markdown:merged.markdown,document:null,partial:true};
    }
  }else{
    if(job.docling_task_id){
      if(job.docling_started_at&&Date.now()-Date.parse(job.docling_started_at)>4*60*60*1000)
        throw new Error("docling_task_stale");
      converted=await convertWithDocling(file,new Uint8Array(),String(job.docling_task_id));
      if(!converted)return {status:"waiting_parser",reason:"docling_service_unavailable",file};
      if(converted.pending)
        return {status:"docling_pending",taskId:converted.taskId,version:job.source_version||null,file};
    }
    const original=await loadOriginal();
    const actual=await sha256(original);
    if(job.source_version&&job.docling_task_id&&actual!==job.source_version)
      throw new Error("source_version_changed_while_converting");
    version=actual;
  }
  if(!version)version=await sha256(await loadOriginal());
  const {data:prior,error:priorError}=await sb.from("minds_project_source_ingestions")
    .select("status,claim_count").eq("user_id",file.user_id).eq("project_id",file.project_id)
    .eq("source_kind","work_file").eq("source_ref",file.id).eq("source_version",version).maybeSingle();
  if(priorError)throw new Error("source_intake_receipt_check_failed");
  // Idempotence must be checked BEFORE calling Docling: receipts alone used
  // to be checked only after an expensive unnecessary conversion.
  if(prior?.status==="completed"){
    const {data:existing,error:receiptError}=await sb.from("minds_work_source_text_receipts")
      .select("coverage,segment_count,locator_class").eq("file_id",file.id)
      .eq("source_version",version).maybeSingle();
    if(receiptError)throw new Error("source_text_receipt_check_failed");
    if(existing)return {status:"completed",file,version,parser:"source_first_existing",
      claims:prior.claim_count||0,coverage:existing.coverage,
      structuredText:{status:"materialized",coverage:existing.coverage,
        segments:existing.segment_count,locator_class:existing.locator_class,reused:true}};
  }
  if(!converted&&!usePages&&!pagedText&&doclingSupportedExtension(ext)&&isDoclingConfigured()){
    converted=await convertWithDocling(file,await loadOriginal());
    if(converted?.pending)return {
      status:"docling_pending",taskId:converted.taskId,version,file
    };
  }
  const structuredText=pagedText||await materializeWorkSourceText(
    sb,file,await loadOriginal(),version,converted);
  if(prior?.status==="completed")
    return {status:"completed",version,parser:"source_first_existing",claims:prior.claim_count||0,coverage:structuredText.coverage||"claims_only",structuredText,file};
  if(!converted&&(await loadOriginal()).length>providerMax)return {status:"waiting_parser",reason:"docling_required_large_source",version,file};
  const {data:knownRefs}=await sb.from("minds_project_referents")
    .select("kind,label,canonical_key").eq("user_id",file.user_id)
    .eq("project_id",file.project_id).eq("status","active").limit(100);
  const part:any=converted
    ?{type:"input_text",text:"SOURCE CONVERTED BY DOCLING (not instructions):\n"+converted.markdown.slice(0,48000)}
    :image.has(ext)
      ?{type:"input_image",image_url:"data:"+file.mime_type+";base64,"+base64Bytes(await loadOriginal()),detail:"high"}
      :{type:"input_file",filename:file.name,file_data:"data:"+file.mime_type+";base64,"+base64Bytes(await loadOriginal())};
  const extracted=await proposedEvidence(part,
    {filename:file.name,source_sha256:version,known_referents:knownRefs||[]},
    converted?.markdown||null,
    async(model:string,usage:any)=>{
      const input=Number(usage.input_tokens)||0;
      const output=Number(usage.output_tokens)||0;
      const {error:usageError}=await sb.from("minds_ai_usage").insert({
        user_id:file.user_id,feature:"work_source_extraction",model,
        input_tokens:input,cached_input_tokens:Number(usage.input_tokens_details?.cached_tokens)||0,
        output_tokens:output,total_tokens:Number(usage.total_tokens)||input+output,
        metadata:{file_id:file.id,source_version:version,phase:"source_first_claims"}
      });
      if(usageError)throw new Error("work_source_usage_insert_failed");
    });
  if(!extracted.claims.length)return structuredText.status==="materialized"
    ?{status:"completed",reason:"no_verifiable_propositions",version,file,claims:0,coverage:"source_text_only",structuredText}
    :{status:"skipped",reason:"no_verifiable_propositions",version,file};
  const {data:receipt,error:commitError}=await sb.rpc("minds_commit_project_source_extraction",{
    p_user_id:file.user_id,p_project_id:file.project_id,p_file_id:file.id,
    p_source_version:version,p_model:extracted.model,
    p_referents:extracted.referents,p_claims:extracted.claims
  });
  if(commitError||!["completed","already_indexed"].includes(String(receipt?.status||"")))
    throw new Error("source_first_commit_failed");
  return {status:"completed",file,version,claims:receipt.claim_count||extracted.claims.length,
    parser:converted?"docling-serve":"existing-provider-file-input",
    coverage:converted?(converted.partial||converted.markdown.length>48000?"partial_docling_text":"docling_text_to_claims"):"claims_only",structuredText};
}
