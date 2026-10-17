import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeWorkOccurrenceCoverage} from "../supabase/functions/_shared/work-occurrence-coverage-ledger.mjs";
const fp="0123456789abcdef0123456789abcdef";
const p="00000000-0000-4000-8000-000000000003";
const page=(offset,returned,total,has_more,next_offset)=>({status:"ok",project_id:p,fingerprint:fp,offset,returned,total,has_more,next_offset});
test("only actual contiguous version-pinned server page receipts prove text traversal",()=>{
 const a=summarizeWorkOccurrenceCoverage([page(0,2,5,true,2),page(2,2,5,true,4),page(4,1,5,false,null)]);
 assert.equal(a.status,"complete");
 assert.equal(a.queried_scopes,1);
 assert.deepEqual(a.scopes.map(x=>({total:x.total,admitted:x.admitted,page_count:x.page_count,complete:x.complete})),[{total:5,admitted:5,page_count:3,complete:true}]);
 assert.equal(a.full_originals_verified,false);
 assert.match(a.scope,/explicit_terms_only/);
});
test("query final-page omissions remain partial even if tool searched first page",()=>{
 const x=summarizeWorkOccurrenceCoverage([page(0,2,5,true,2)]);
 assert.equal(x.status,"incomplete");
 assert.equal(x.scopes[0].status,"partial");
 assert.equal(x.scopes[0].admitted,2);
});
test("a gap, duplicate page, inconsistent counts, or impossible has_more cannot be declared complete",()=>{
 const cases=[
 [page(0,2,5,true,2),page(4,1,5,false,null)],
 [page(0,2,2,false,null),page(0,2,2,false,null)],
 [page(0,2,5,true,2),page(2,3,8,true,5)],
 [page(0,5,5,true,5)],
 [page(0,5,5,false,5)],
 ];
 for(const arr of cases)assert.equal(summarizeWorkOccurrenceCoverage(arr).status,"incomplete");
});
test("empty matches are complete only with an actual zero-total receipt",()=>{
 assert.equal(summarizeWorkOccurrenceCoverage([]).status,"not_queried");
 const s=summarizeWorkOccurrenceCoverage([page(0,0,0,false,null)]);
 assert.equal(s.status,"complete");
 assert.equal(s.scopes[0].admitted,0);
});
test("never treat version_changed or malformed receipts as complete",()=>{
 const r=summarizeWorkOccurrenceCoverage([page(0,2,2,false,null),{status:"version_changed",project_id:p,fingerprint:fp}]);
 assert.equal(r.status,"incomplete");
 assert.ok(r.issues.includes("version_changed"));
 assert.equal(summarizeWorkOccurrenceCoverage([page(0,2,2,false,0)]).status,"incomplete");
 const bad=page(0,1,1,false,null);bad.fingerprint="fake";
 assert.equal(summarizeWorkOccurrenceCoverage([bad]).status,"incomplete");
});
test("separate corpora never combine incomplete pages into one complete result",()=>{
 const fp2="ffffffffffffffffffffffffffffffff";
 const mixed=[page(0,2,4,true,2),{...page(2,2,4,false,null),fingerprint:fp2}];
 const x=summarizeWorkOccurrenceCoverage(mixed);
 assert.equal(x.status,"incomplete");
 assert.equal(x.queried_scopes,2);
});
test("run metadata records read-only server results but no private source text",()=>{
 const edge=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
 assert.match(edge,/import \{summarizeWorkOccurrenceCoverage\} from "\.\.\/_shared\/work-occurrence-coverage-ledger\.mjs"/);
 assert.match(edge,/occurrenceCoverageEvents\.push/);
 assert.match(edge,/occurrenceCoverageEvents\.length<80/);
 assert.match(edge,/work_occurrence_coverage:summarizeWorkOccurrenceCoverage\(occurrenceCoverageEvents\)/);
 assert.doesNotMatch(edge,/occurrenceCoverageEvents\.push\(\{[^}]*content:/);
});
