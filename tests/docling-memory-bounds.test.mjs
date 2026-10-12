import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const docker=readFileSync(new URL("../services/docling/Dockerfile",import.meta.url),"utf8");
const env=Object.fromEntries([...docker.matchAll(/^\s*([A-Z][A-Z0-9_]*)=(\S+)/gm)]
  .map(([,key,value])=>[key,value.replace(/\\$/,"")]));
test("CPU Docling remains pinned and private",()=>{
  assert.match(docker,/FROM quay\.io\/docling-project\/docling-serve-cpu:v1\.36\.0/);
  assert.equal(env.DOCLING_SERVE_ENABLE_API_DOCS,"false");
  assert.equal(env.DOCLING_SERVE_ENABLE_REMOTE_SERVICES,"false");
  assert.equal(env.DOCLING_SERVE_SINGLE_USE_RESULTS,"true");
  assert.equal(env.DOCLING_SERVE_LOAD_MODELS_AT_BOOT,"true");
});
test("4GB memory mitigation bounds concurrent convert tasks and page batches",()=>{
  assert.equal(Number(env.UVICORN_WORKERS),1);
  assert.equal(Number(env.DOCLING_SERVE_ENG_LOC_NUM_WORKERS),1);
  assert.equal(Number(env.DOCLING_SERVE_OPTIONS_CACHE_SIZE),1);
  assert.equal(env.DOCLING_SERVE_ENG_LOC_SHARE_MODELS,"true");
  assert.equal(Number(env.DOCLING_NUM_THREADS),2);
  assert.equal(Number(env.DOCLING_PERF_PAGE_BATCH_SIZE),1);
  assert.equal(Number(env.DOCLING_SERVE_OCR_BATCH_SIZE),1);
  assert.equal(Number(env.DOCLING_SERVE_LAYOUT_BATCH_SIZE),1);
  assert.equal(Number(env.DOCLING_SERVE_TABLE_BATCH_SIZE),1);
});
test("source upload limit is unchanged and the credentials are never embedded",()=>{
  assert.equal(Number(env.DOCLING_SERVE_MAX_FILE_SIZE),50331648);
  assert.match(docker,/DOCLING_SERVE_API_KEY must be set in the hosting secret manager/);
  assert.doesNotMatch(docker,/^\s*DOCLING_SERVE_API_KEY=/m);
});
