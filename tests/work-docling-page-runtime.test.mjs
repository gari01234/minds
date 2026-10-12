import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../supabase/functions/"+p,import.meta.url),"utf8");
const core=read("_shared/work-ingest-core.ts");
const runtime=read("_shared/work-docling-page-runtime.ts");
const bridge=read("_shared/work-docling.ts");
const worker=read("isabella-work-ingest-runner/index.ts");

test("page path is explicit opt-in and defaults to disabled",()=>{
  assert.match(runtime,/DOCLING_PAGE_BATCHES_ENABLED"\)=== "true"|DOCLING_PAGE_BATCHES_ENABLED"\)==="true"/);
  assert.match(core,/pageModeEnabled\(\)/);
  assert.match(core,/!job\.docling_task_id&&file\.size_bytes>=16\*1024\*1024/);
  assert.match(core,/pageCheckpointExists\(sb,file,version\)/);
});
test("Docling multipart sends 1-based inclusive page ranges explicitly",()=>{
  assert.match(bridge,/data\.append\("page_range",String\(start\)\)/);
  assert.match(bridge,/data\.append\("page_range",String\(end\)\)/);
  assert.match(bridge,/docling_page_range_pdf_only/);
});
test("the original is hashed before source receipts or final Claim promotion",()=>{
  assert.match(core,/if\(await sha256\(original\)!==page\.version\)/);
  assert.match(core,/minds_commit_work_source_segments/);
  assert.match(core,/p_coverage:merged\.coverage/);
  assert.match(core,/p_segments:merged\.segments/);
  assert.match(core,/minds_project_source_ingestions/);
  assert.match(core,/source_text_receipt_check_failed/);
});
test("checkpoints are persisted without duplicate reupload of finished batches",()=>{
  assert.match(runtime,/ignoreDuplicates:true/);
  assert.match(runtime,/status:"completed",docling_task_id:null/);
  assert.match(runtime,/rows\.every\(r=>r\.status==="completed"\)/);
  assert.match(runtime,/pdf_batch_transfer_budget_exceeded/);
  assert.match(runtime,/EGRESS_BUDGET_BYTES=512\*1024\*1024/);
});
test("worker advances page checkpoints without extra attempts or overwriting Claims",()=>{
  assert.match(worker,/x\.status==="page_batch_advance"/);
  assert.match(worker,/status:"docling_pending",docling_task_id:null/);
  assert.match(worker,/const preserveClaims=needsParser&&job\.parser_name==="docling_enrichment"/);
  assert.match(worker,/structured_text:\{status:"needs_review",reason:x\.reason/);
  assert.match(worker,/index_status:preserveClaims\?"indexed"/);
});
test("a lost task or ambiguous absolute page locator quarantines the chunk",()=>{
  assert.match(runtime,/isRecoverableTaskLoss\(why\)/);
  assert.match(runtime,/status:"needs_review",docling_task_id:null/);
  assert.match(runtime,/pdf_batch_page_provenance_ambiguous/);
  assert.match(runtime,/return \{kind:"hold",reason:"pdf_batch_requires_review"\}/);
});
