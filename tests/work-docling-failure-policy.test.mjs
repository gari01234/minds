import test from "node:test";
import assert from "node:assert/strict";
import {costlyDocumentImage,decideDoclingFailure,DOC_TIMEOUT_RECHECK} from "../supabase/functions/_shared/work-docling-failure-policy.mjs";

test("a first 404 on an existing task causes exactly one status recheck without resubmission",()=>{
  assert.deepEqual(decideDoclingFailure({reason:"docling_task_lost",previousError:null,
    taskId:"task-example",costlyImage:true,attempts:1}),
    {action:"repoll",reason:DOC_TIMEOUT_RECHECK});
  assert.deepEqual(decideDoclingFailure({reason:"docling_task_lost",previousError:DOC_TIMEOUT_RECHECK,
    taskId:"task-example",costlyImage:true,attempts:1}),
    {action:"hold",reason:"docling_image_task_unavailable"});
});
test("high-cost images with known parser failure or no readable text go to explicit review",()=>{
  for(const reason of ["docling_task_failed","docling_no_readable_content","docling_conversion_failed",
                       "docling_result_expired","docling_task_stale"]){
    const x=decideDoclingFailure({reason,taskId:"x",costlyImage:true,attempts:1});
    assert.equal(x.action,"hold");
  }
});
test("temporary network errors do not become false OCR conclusions",()=>{
  for(const reason of ["docling_http_502","docling_http_503","source_download_failed"]){
    assert.equal(decideDoclingFailure({reason,costlyImage:true,attempts:1}).action,"retry");
  }
});
test("normal PDF task loss retains bounded recovery",()=>{
  const q=decideDoclingFailure({reason:"docling_task_lost",previousError:DOC_TIMEOUT_RECHECK,
    taskId:"id",costlyImage:false,attempts:2});
  assert.equal(q.action,"retry");
  const exhausted=decideDoclingFailure({reason:"docling_task_lost",previousError:DOC_TIMEOUT_RECHECK,
    taskId:"id",costlyImage:false,attempts:4});
  assert.deepEqual(exhausted,{action:"hold",reason:"docling_task_unavailable"});
});
test("image threshold and file type are explicit",()=>{
  assert.equal(costlyDocumentImage("drawing.PNG",12*1024*1024),true);
  assert.equal(costlyDocumentImage("drawing.jpg",9*1024*1024),true);
  assert.equal(costlyDocumentImage("drawing.png",8*1024*1024),false);
  assert.equal(costlyDocumentImage("drawing.pdf",34*1024*1024),false);
  assert.equal(costlyDocumentImage("unknown",99*1024*1024),false);
});
test("absent async task ID cannot be re-polled",()=>{
  assert.equal(decideDoclingFailure({reason:"docling_task_lost",previousError:null,
    taskId:null,costlyImage:true,attempts:1}).action,"hold");
});
