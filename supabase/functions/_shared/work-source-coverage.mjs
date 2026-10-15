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
