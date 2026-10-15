import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const worker=readFileSync(new URL("../supabase/functions/isabella-work-ingest-runner/index.ts",import.meta.url),"utf8");
const contract=readFileSync(new URL("../supabase/functions/_shared/work-docling-contract.mjs",import.meta.url),"utf8");
const bridge=readFileSync(new URL("../supabase/functions/_shared/work-docling.ts",import.meta.url),"utf8");
test("worker checks existing task once before costly image resubmission",()=>{
  assert.match(worker,/decideDoclingFailure/);
  assert.match(worker,/costlyDocumentImage/);
  assert.match(worker,/status:"docling_pending",last_error:decision\.reason/);
  assert.match(worker,/docling_repoll_scheduled/);
  assert.match(worker,/decision\.action==="hold"/);
  assert.match(worker,/const enriched=job\.parser_name==="docling_enrichment"/);
  assert.match(worker,/structured_text:\{status:"needs_review"/);
});
test("failures and no text remain untrusted, not successful extraction",()=>{
  assert.match(contract,/state==="failure"\)throw Error\("docling_task_failed"\)/);
  assert.match(contract,/if\(!markdown\)throw Error\("docling_no_readable_content"\)/);
  assert.match(bridge,/docling_task_lost/);
  assert.doesNotMatch(worker,/console\.log\(.*content/);
});
