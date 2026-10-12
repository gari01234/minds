/* Docling page batches: finite, deterministic and fail-closed.
 * A page number is verified only when Docling's JSON provenance reports
 * an absolute original PDF page inside the requested range. Never guess.
 */
import {fromDoclingDocument} from "./work-text-segments.mjs";
export const PAGE_BATCH_SIZE=4, MAX_BATCH_PAGES=200, MAX_FINAL_SEGMENTS=250;
export function pageBatches(total,pagesPerBatch=PAGE_BATCH_SIZE){
  if(!Number.isSafeInteger(total)||total<1||total>MAX_BATCH_PAGES)
    throw Error("pdf_page_count_unaccepted");
  if(!Number.isSafeInteger(pagesPerBatch)||pagesPerBatch<1||pagesPerBatch>12)
    throw Error("pdf_batch_size_invalid");
  const out=[];
  for(let start=1;start<=total;start+=pagesPerBatch)
    out.push({page_start:start,page_end:Math.min(total,start+pagesPerBatch-1),total_pages:total});
  return out;
}
export function convertPageBatch(markdown,doc,{page_start,page_end,total_pages},partial=false){
  const b=pageBatches(total_pages).some(r=>r.page_start===page_start&&r.page_end===page_end);
  if(!b)throw Error("pdf_batch_range_invalid");
  const out=fromDoclingDocument(markdown,doc,{partial});
  if(!out.segments.length)throw Error("pdf_batch_no_readable_text");
  // Small ranges must fit their own bounded receipt; never truncate silently.
  if(out.segments.length>250)throw Error("pdf_batch_segments_exceeded");
  const segments=out.segments.map(s=>{
    const page=s.locator?.page;
    if(s.locator?.verified===true&&
       (!Number.isSafeInteger(page)||page<page_start||page>page_end))
      throw Error("pdf_batch_page_provenance_ambiguous");
    return {...s,locator:{
      ...s.locator,
      batch_range:{start:page_start,end:page_end},
      ...(s.locator?.verified===true?{}:{page_verified:false})
    }};
  });
  if(String(markdown).length>48000)throw Error("pdf_batch_text_exceeds_limit");
  return {segments,markdown:String(markdown),metadata:out.metadata};
}
export function assemblePageBatches(chunks,total){
  const plan=pageBatches(total);
  if(!Array.isArray(chunks)||chunks.length!==plan.length)throw Error("pdf_batches_incomplete");
  const ordered=[...chunks].sort((a,b)=>a.page_start-b.page_start);
  const segments=[],texts=[];
  for(let i=0;i<ordered.length;i++){
    const c=ordered[i],expected=plan[i];
    if(c.status!=="completed"||c.page_start!==expected.page_start||
       c.page_end!==expected.page_end||c.total_pages!==total||
       !Array.isArray(c.segments)||c.segments.length<1)
      throw Error("pdf_batch_checkpoint_invalid");
    const text=String(c.markdown||"");
    if(!text)throw Error("pdf_batch_checkpoint_empty");
    texts.push(text);
    for(const s of c.segments){
      if(!["page_text","unpaged_text"].includes(s.segment_kind)||
         !s.locator||typeof s.content!=="string"||!s.content.trim()||s.content.length>6500)
        throw Error("pdf_batch_segment_invalid");
      const page=s.locator?.page;
      if(s.locator.verified===true&&
         (!Number.isSafeInteger(page)||page<c.page_start||page>c.page_end))
        throw Error("pdf_batch_page_provenance_ambiguous");
      segments.push({...s,segment_no:segments.length});
      if(segments.length>MAX_FINAL_SEGMENTS)throw Error("pdf_batch_final_segments_exceeded");
    }
  }
  // Complete conversion of all ranges is not proof of complete text coverage.
  const markdown=texts.join("\n\n");
  return {segments,markdown,coverage:"partial_text",locator_class:"pdf_page",
    metadata:{batch_size:PAGE_BATCH_SIZE,expected_pages:total,completed_batches:ordered.length,
      verified_pages:[...new Set(segments.filter(s=>s.locator?.verified===true)
        .map(s=>s.locator.page))].length,partial_text:true,source:"docling_page_ranges_v01"}};
}
