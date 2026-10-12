import test from "node:test";
import assert from "node:assert/strict";
import {hasDoclingWork,doclingTaskIsLost} from "../supabase/functions/_shared/work-ingest-policy.mjs";

const empty=()=>Array.from({length:4},()=>({data:[],error:null}));
test("finished queue does not wake Railway",()=>assert.equal(hasDoclingWork(empty()),false));
test("eligible queue or pending Docling task wakes Railway",()=>{
  for(let i=0;i<4;i++){
    const probes=empty();
    probes[i].data=[{id:"candidate"}];
    assert.equal(hasDoclingWork(probes),true);
  }
});
test("malformed probe set fails closed rather than silently skipping work",()=>{
  assert.throws(()=>hasDoclingWork(null),/invalid_work_probe/);
  assert.throws(()=>hasDoclingWork([]),/invalid_work_probe/);
});
test("lost, expired and stale async task results permit bounded resubmission",()=>{
  for(const reason of ["docling_result_expired","docling_task_lost","docling_task_stale"])
    assert.equal(doclingTaskIsLost(reason),true);
  for(const reason of ["docling_http_502","docling_http_503","source_download_failed"])
    assert.equal(doclingTaskIsLost(reason),false);
});
