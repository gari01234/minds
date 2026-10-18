/* Evidence-grounded Work source coverage, independent of Claims and index labels.
 * Never present an old source version or a tiny text extraction as semantic understanding.
 */
const numeric=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
export function currentWorkTextCoverage(files,receipts){
  if(!Array.isArray(files)||!Array.isArray(receipts))throw Error("invalid_work_coverage_input");
  const current=new Map();
  const index=new Map(files.map(f=>[String(f.id),f]));
  for(const r of receipts){
    const id=String(r?.file_id||""),f=index.get(id);
    const version=String(f?.metadata?.knowledge_intake?.source_version||"");
    if(!version||String(r?.source_version||"")!==version)continue;
    if(!current.has(id))current.set(id,r);
  }
  const details=new Map();
  const count={files_seen:files.length,stored_only:0,queued:0,indexed:0,
    failed:0,waiting_parser:0,text_materialized:0,text_partial:0,
    text_complete_labelled:0,without_current_text:0,
    indexed_without_current_text:0,
    indexing_is_not_full_understanding:true,
    complete_text_is_not_semantic_understanding:true};
  for(const f of files){
    const id=String(f.id),r=current.get(id);
    if(Object.prototype.hasOwnProperty.call(count,f.index_status))count[f.index_status]++;
    const materialized=!!r&&numeric(r.segment_count)>0&&numeric(r.content_chars)>0&&
      ["partial_text","complete_text"].includes(String(r.coverage||""));
    if(materialized){
      count.text_materialized++;
      if(r.coverage==="partial_text")count.text_partial++;
      if(r.coverage==="complete_text")count.text_complete_labelled++;
    }else{
      count.without_current_text++;
      if(f.index_status==="indexed")count.indexed_without_current_text++;
    }
    details.set(id,{
      version_current:materialized,
      coverage:materialized?r.coverage:"no_current_text_receipt",
      segments:materialized?numeric(r.segment_count):0,
      content_chars:materialized?numeric(r.content_chars):0,
      locator_class:materialized?String(r.locator_class||"unknown"):null,
      // Very short text is not proof of the image or document being understood.
      sparse_text:materialized&&numeric(r.content_chars)<80,
      semantic_understanding_verified:false
    });
  }
  return {summary:count,byFile:details};
}

// Lightweight, content-free warning attached to the FIRST Work occurrence page.
// Derived only from an owner-scoped browse_work_sources catalog receipt.
// "complete" below describes CATALOG pagination, not document understanding.
export function summarizeWorkExtractionGaps(catalog){
  const page=catalog?.page,files=catalog?.files;
  if(catalog?.status!=="ok"||catalog?.mode!=="catalog"||
    !Array.isArray(files)||!page||!Number.isSafeInteger(page.total)||
    !Number.isSafeInteger(page.returned)||!Number.isSafeInteger(page.offset))
    return {catalog_status:"unavailable",full_originals_verified:false};
  const full=page.offset===0&&!page.has_more&&
    page.returned===page.total&&files.length===page.returned;
  const gaps=files.filter(f=>f?.index_status!=="indexed"||
    !["complete_text","partial_text"].includes(String(f?.source_text?.coverage||"")));
  const partial=files.filter(f=>f?.source_text?.coverage==="partial_text").length;
  return {
    catalog_status:full?"complete":"partial",
    files_total:page.total,files_examined:files.length,
    without_current_text_or_pending_seen:gaps.length,
    partial_text_seen:partial,
    gaps:gaps.slice(0,12).map(f=>({
      file_id:String(f.file_id||""),file_name:String(f.file_name||"").slice(0,220),
      index_status:String(f.index_status||"unknown"),
      text_coverage:String(f?.source_text?.coverage||"no_current_receipt")
    })),
    gap_list_truncated:!full||gaps.length>12,
    full_originals_verified:false,
    semantics_verified:false,
    note:"Current extraction only; indexed, complete_text and a claim are not proof that an original was fully understood."
  };
}
