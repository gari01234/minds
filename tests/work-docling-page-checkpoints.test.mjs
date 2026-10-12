import test from "node:test";
import assert from "node:assert/strict";
import {pageBatches,convertPageBatch,assemblePageBatches} from
  "../supabase/functions/_shared/work-docling-pages.mjs";

test("finite plan has exactly one visit to each original page",()=>{
  assert.deepEqual(pageBatches(9),[
    {page_start:1,page_end:4,total_pages:9},
    {page_start:5,page_end:8,total_pages:9},
    {page_start:9,page_end:9,total_pages:9}
  ]);
  assert.throws(()=>pageBatches(0),/unaccepted/);
  assert.throws(()=>pageBatches(201),/unaccepted/);
  assert.throws(()=>pageBatches(9,0),/invalid/);
});
test("page anchors must come from the original document's absolute numbering",()=>{
  const doc={texts:[{text:"Door at original page 6",prov:[{page_no:6}]}]};
  const result=convertPageBatch("Door at original page 6",doc,
    {page_start:5,page_end:8,total_pages:9});
  assert.deepEqual(result.segments[0].locator,{
    page:6,verified:true,batch_range:{start:5,end:8}
  });
  assert.throws(()=>convertPageBatch("Door at original page 1",
    {texts:[{text:"Door",prov:[{page_no:1}]}]},
    {page_start:5,page_end:8,total_pages:9}),/provenance_ambiguous/);
});
test("markdown fallback is retained without fabricating a page number",()=>{
  const d=convertPageBatch("Caption outside JSON",null,{page_start:1,page_end:2,total_pages:2});
  assert.equal(d.segments[0].segment_kind,"unpaged_text");
  assert.equal(d.segments[0].locator.page_verified,false);
  assert.equal(d.segments[0].locator.page,undefined);
});
test("only all completed, contiguous, source-matching batches are finalized",()=>{
  const chunks=pageBatches(5).map(({page_start,page_end,total_pages})=>({
    page_start,page_end,total_pages,status:"completed",
    markdown:"Source page "+page_start,
    segments:[{segment_no:0,segment_kind:"page_text",content:"Source page "+page_start,
      locator:{page:page_start,verified:true,batch_range:{start:page_start,end:page_end}}}]
  }));
  const merged=assemblePageBatches(chunks.reverse(),5);
  assert.equal(merged.segments.length,2);
  assert.deepEqual(merged.segments.map(s=>s.segment_no),[0,1]);
  assert.equal(merged.coverage,"partial_text");
  assert.equal(merged.metadata.expected_pages,5);
  assert.throws(()=>assemblePageBatches(chunks.slice(0,1),5),/incomplete/);
  assert.throws(()=>assemblePageBatches(chunks.map((c,i)=>i?{...c,status:"submitted"}:c),5),
    /checkpoint_invalid/);
});
test("final merging rejects verified locators from another PDF page",()=>{
  assert.throws(()=>assemblePageBatches([{page_start:1,page_end:1,total_pages:1,
    status:"completed",markdown:"text",
    segments:[{segment_kind:"page_text",content:"text",locator:{page:3,verified:true}}]}],1),
    /provenance_ambiguous/);
});
