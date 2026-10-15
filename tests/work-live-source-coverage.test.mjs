import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {currentWorkTextCoverage} from "../supabase/functions/_shared/work-source-coverage.mjs";

const src=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=src("supabase/functions/isabella-chat/index.ts");
const sql=src("supabase/migrations/20261015113500_minds_work_search_current_source_v01.sql");
const a={id:"a",name:"Presentation.pdf",index_status:"indexed",
 metadata:{knowledge_intake:{source_version:"current"}}};
const b={id:"b",name:"Claims.pdf",index_status:"indexed",
 metadata:{knowledge_intake:{source_version:"current"}}};
const c={id:"c",name:"Pending.pdf",index_status:"waiting_parser",
 metadata:{knowledge_intake:{source_version:"new"}}};

test("coverage separates indexed Claims from readable current-version originals",()=>{
 const result=currentWorkTextCoverage([a,b,c],[
  {file_id:"a",source_version:"current",coverage:"partial_text",segment_count:3,content_chars:481,locator_class:"pdf_page"},
  {file_id:"b",source_version:"OLD",coverage:"complete_text",segment_count:8,content_chars:23000},
  {file_id:"c",source_version:"old",coverage:"complete_text",segment_count:8,content_chars:23000}
 ]);
 assert.equal(result.summary.files_seen,3);
 assert.equal(result.summary.indexed,2);
 assert.equal(result.summary.text_materialized,1);
 assert.equal(result.summary.text_partial,1);
 assert.equal(result.summary.indexed_without_current_text,1);
 assert.equal(result.summary.without_current_text,2);
 assert.equal(result.byFile.get("a").content_chars,481);
 assert.equal(result.byFile.get("b").coverage,"no_current_text_receipt");
 assert.equal(result.byFile.get("c").version_current,false);
 assert.equal(result.summary.indexing_is_not_full_understanding,true);
});
test("tiny complete-labelled extraction is explicitly sparse, not comprehension",()=>{
 const r=currentWorkTextCoverage([a],[{file_id:"a",source_version:"current",
  coverage:"complete_text",segment_count:1,content_chars:3,locator_class:"pdf_page"}]);
 assert.equal(r.summary.text_complete_labelled,1);
 assert.equal(r.byFile.get("a").sparse_text,true);
 assert.equal(r.byFile.get("a").semantic_understanding_verified,false);
});
test("invalid, empty, other-owner or non-current receipts never inflate coverage",()=>{
 for(const receipts of [[{file_id:"other",source_version:"current",segment_count:12,content_chars:500,coverage:"complete_text"}],
  [{file_id:"a",source_version:"current",segment_count:0,content_chars:500,coverage:"complete_text"}],
  [{file_id:"a",source_version:"current",segment_count:5,content_chars:0,coverage:"complete_text"}]]){
  const r=currentWorkTextCoverage([a],receipts);
  assert.equal(r.summary.text_materialized,0);
 }
 assert.throws(()=>currentWorkTextCoverage(null,[]),/invalid_work_coverage_input/);
});
test("Isabella search_work joins owner-guarded current coverage, not indexed label alone",()=>{
 const start=server.indexOf("async function searchWork(req:Request,args:any)");
 const end=server.indexOf("async function compareProjectSource(",start);
 assert.ok(start>=0&&end>start);
 const impl=server.slice(start,end);
 assert.match(impl,/minds_work_source_text_receipts/);
 assert.match(impl,/currentWorkTextCoverage\(sourceRows,textReceiptRows\|\|\[\]\)/);
 assert.match(impl,/source_text:textCoverage\.byFile\.get\(String\(x\.id\)\)/);
 assert.match(impl,/knowledge_coverage:knowledgeCoverage/);
 assert.match(impl,/minds_search_work_source_segments/);
});
test("canonical segment search is owner-scoped and version-bound before scoring",()=>{
 assert.match(sql,/s\.user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/s\.source_version=coalesce\(f\.metadata->'knowledge_intake'->>'source_version',''\)/);
 assert.match(sql,/s\.project_id=p_project_id/);
 assert.match(sql,/RETURNS TABLE/);
 assert.match(sql,/LIMIT greatest\(1,least\(coalesce\(p_limit,12\),16\)\)/);
});
