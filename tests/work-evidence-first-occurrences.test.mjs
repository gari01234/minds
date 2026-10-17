import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {collectEvidence,enumerateCorpus,gradeEvidence} from "../scripts/agent-runtime-parity-core.mjs";
const migration=readFileSync(new URL("../supabase/migrations/20261017192500_minds_work_source_occurrence_inventory_v01.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const obs=readFileSync(new URL("../supabase/functions/_shared/cognitive-coverage-observability.mjs",import.meta.url),"utf8");
const corpus=JSON.parse(readFileSync(new URL("./fixtures/agent-runtime-parity-synthetic-v01.json",import.meta.url),"utf8"));

test("read-only owner RLS and current original version, never SECURITY DEFINER",()=>{
 assert.match(migration,/LANGUAGE sql STABLE SECURITY INVOKER/);
 assert.doesNotMatch(migration,/SECURITY DEFINER|service_role|UPDATE public|DELETE FROM|INSERT INTO/i);
 assert.match(migration,/s\.user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/f\.user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(migration,/f\.project_id=s\.project_id/);
 assert.match(migration,/s\.source_version=coalesce\(f\.metadata->'knowledge_intake'->>'source_version',''\)/);
 assert.match(migration,/REVOKE ALL.*FROM PUBLIC,anon/i);
 assert.match(migration,/GRANT EXECUTE.*TO authenticated/i);
});
test("all explicit term hits across project, exact count and continuation fingerprint",()=>{
 assert.match(migration,/EXISTS\(SELECT 1 FROM terms t WHERE strpos\(lower\(s\.content\),t\.term\)>0\)/);
 assert.match(migration,/count\(\*\)::integer AS total/);
 assert.match(migration,/md5\(/);
 assert.match(migration,/p_expected_fingerprint/);
 assert.match(migration,/version_changed/);
 assert.match(migration,/'has_more'/);
 assert.match(migration,/'next_offset'/);
 assert.match(migration,/'extraction_gaps_are_separate',true/);
 assert.match(migration,/'full_originals_verified',false/);
 assert.match(migration,/ORDER BY h\.file_id,h\.segment_no/);
});
test("bounded terms, max 50 hits per call, caller cannot silently change versions mid-pagination",()=>{
 assert.match(migration,/cardinality\(p_terms\),0\) BETWEEN 1 AND 12/);
 assert.match(migration,/BETWEEN 2 AND 120/);
 assert.match(migration,/coalesce\(p_limit,25\) BETWEEN 1 AND 50/);
 assert.match(migration,/coalesce\(p_offset,0\)=0 OR length\(coalesce\(p_expected_fingerprint,''\)\)=32/);
 assert.match(edge,/offset>0&&!cursor/);
 assert.match(edge,/terms\.length<1\|\|terms\.length>12/);
 assert.match(edge,/findWorkOccurrences\(req/);
});
test("tool is routed, read-only, observable and recoverable in browser without auto-authority",()=>{
 assert.match(edge,/find_work_occurrences:"allow"/);
 assert.match(edge,/name:"find_work_occurrences"/);
 assert.match(edge,/call\.name==="find_work_occurrences"/);
 assert.match(edge,/sb\.rpc\("minds_find_work_source_occurrences"/);
 assert.match(edge,/RECOVERABLE_READ_TOOLS=new Set\(\[[^\n]*"find_work_occurrences"/);
 assert.match(edge,/sourceAdmissions\.push\(workSourceAdmission\("tool_find_work_occurrences"/);
 assert.match(obs,/"tool_find_work_occurrences"/);
 assert.doesNotMatch(edge.slice(edge.indexOf("async function findWorkOccurrences"),edge.indexOf("async function browseWorkSources")),/serviceClient\(|service_role|\.insert\(|\.update\(|\.delete\(/);
});
test("synthetic benchmark catches late mentions, parsing gaps and unsupported absoluteness",()=>{
 const p1=enumerateCorpus(corpus,"Sala Azul",{offset:0,limit:2});
 assert.equal(p1.has_more,true);
 const p2=enumerateCorpus(corpus,"Sala Azul",{offset:p1.next_offset,limit:2});
 assert.equal(p2.has_more,true);
 const all=collectEvidence(corpus,"Sala Azul",2);
 assert.equal(all.records.length,5);
 assert.equal(all.records.some(x=>x.file_id==="doc-a"&&x.segment_no===15),true);
 assert.equal(all.unavailable.length,1);
 assert.equal(gradeEvidence(corpus,"Sala Azul",{evidence:all.records,unavailable:all.unavailable,extracted_text_traversed:true}).coverage_complete,true);
 assert.equal(gradeEvidence(corpus,"Sala Azul",{evidence:p1.records,unavailable:all.unavailable,extracted_text_traversed:true}).coverage_complete,false);
});
