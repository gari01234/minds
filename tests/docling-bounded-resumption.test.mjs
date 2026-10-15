import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {heldPdfPageBatchEligible} from "../supabase/functions/_shared/work-ingest-policy.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const worker=read("supabase/functions/isabella-work-ingest-runner/index.ts");
const runtime=read("supabase/functions/_shared/work-docling-page-runtime.ts");
const core=read("supabase/functions/_shared/work-ingest-core.ts");
const held={file_id:"same",status:"waiting_parser",last_error:"pdf_page_batch_acceptance_pending"};
const file={id:"same",name:"Präsentation Kick-off Fachplaner.pdf",size_bytes:21*1024*1024};

test("explicit page-batch gate is fail-closed and requires matching original",()=>{
 assert.equal(heldPdfPageBatchEligible(held,file,true),true);
 assert.equal(heldPdfPageBatchEligible(held,file,false),false);
 assert.equal(heldPdfPageBatchEligible({...held,file_id:"another"},file,true),false);
 assert.equal(heldPdfPageBatchEligible({...held,status:"completed"},file,true),false);
 assert.equal(heldPdfPageBatchEligible({...held,last_error:"docling_task_lost"},file,true),false);
 assert.equal(heldPdfPageBatchEligible(held,{...file,name:"image.png"},true),false);
 assert.equal(heldPdfPageBatchEligible(held,{...file,size_bytes:50*1024*1024},true),false);
 assert.equal(heldPdfPageBatchEligible(held,{...file,size_bytes:4*1024*1024},true),false);
 assert.equal(heldPdfPageBatchEligible(held,{...file,size_bytes:NaN},true),false);
});
test("runtime approval comes only from private runner credentials and defaults off",()=>{
 assert.match(worker,/String\(body.secret\|\|""\)!==String\(secret.value\)/);
 assert.ok(worker.indexOf('String(body.secret||"")!==String(secret.value)')<
   worker.indexOf('"docling_page_batches_enabled"'));
 assert.match(runtime,/let approvedPageBatches=false/);
 assert.match(runtime,/approvedPageBatches=value==="true"/);
 assert.match(runtime,/export const pageModeEnabled=\(\)=>approvedPageBatches\|\|Deno.env.get/);
 assert.match(worker,/configurePageBatchRuntime\(credentials.get\("docling_page_batches_enabled"\)\|\|null\)/);
});
test("only gated held PDF triggers readiness, one-file CAS requeue, and bounded page pathway",()=>{
 assert.match(worker,/\.in\("last_error",pageModeEnabled\(\)/);
 assert.match(worker,/if\(doclingReady&&pageModeEnabled\(\)\)/);
 assert.match(worker,/heldPdfPageBatchEligible\(job,file,pageModeEnabled\(\)\)/);
 assert.match(worker,/\.eq\("last_error","pdf_page_batch_acceptance_pending"\)\.select\("id"\)/);
 assert.match(worker,/\.limit\(1\)/);
 assert.match(worker,/status:"queued",attempts:0,last_error:null/);
 assert.match(core,/pageCheckpointExists\(sb,file,version\)/);
 assert.match(core,/isDoclingConfigured\(\)&&pageModeEnabled\(\)&&!job.docling_task_id/);
 assert.match(runtime,/EGRESS_BUDGET_BYTES=512\*1024\*1024/);
 assert.match(runtime,/MAX_PDF_BYTES=48\*1024\*1024/);
});
test("no automatic retries of expensive images or old failed enrichment",()=>{
 assert.equal(heldPdfPageBatchEligible({...held,last_error:"docling_task_lost"},
   {id:"same",name:"Erdgeschoss 02.png",size_bytes:12*1024*1024},true),false);
 assert.equal(heldPdfPageBatchEligible({...held,status:"failed",last_error:"docling_http_404"},
   {...file,name:"Konzept.pdf"},true),false);
 assert.match(worker,/\.eq\("status","waiting_parser"\)/);
});
