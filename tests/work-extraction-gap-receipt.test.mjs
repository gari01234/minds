import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeWorkExtractionGaps} from "../supabase/functions/_shared/work-source-coverage.mjs";

function sampleCatalog(){
 const files=Array.from({length:28},(_,i)=>({
   file_id:"fictional-file-"+(i+1),file_name:"fictional-"+(i+1)+".pdf",
   index_status:i<25?"indexed":"waiting_parser",
   source_text:{coverage:i===24||i>=25?"no_current_receipt":i<21?"partial_text":"complete_text",segment_count:i<24?2:null}
 }));
 return {status:"ok",mode:"catalog",files,page:{offset:0,total:28,returned:28,has_more:false,next_offset:null}};
}
test("first-page catalog surfaces claims-only indexed gap and pending parser files without overstating understanding",()=>{
 const s=summarizeWorkExtractionGaps(sampleCatalog());
 assert.equal(s.catalog_status,"complete");
 assert.equal(s.files_total,28);
 assert.equal(s.without_current_text_or_pending_seen,4);
 assert.equal(s.partial_text_seen,21);
 assert.equal(s.gaps.length,4);
 assert.equal(s.gaps.filter(x=>x.index_status==="indexed").length,1);
 assert.equal(s.gaps.filter(x=>x.index_status==="waiting_parser").length,3);
 assert.equal(s.full_originals_verified,false);
 assert.equal(s.semantics_verified,false);
 assert.equal(JSON.stringify(s).includes("Fictional extracted text"),false);
});
test("catalog pagination cannot claim complete gap inventory",()=>{
 const s=sampleCatalog();s.files=s.files.slice(0,10);
 s.page={offset:0,total:28,returned:10,has_more:true,next_offset:10};
 const v=summarizeWorkExtractionGaps(s);
 assert.equal(v.catalog_status,"partial");
 assert.equal(v.gap_list_truncated,true);
 assert.equal(v.files_examined,10);
});
test("unavailable catalog fails closed and never invents a zero-gap result",()=>{
 for(const c of [null,{status:"error"},{status:"ok",mode:"segments",files:[]}])
   assert.deepEqual(summarizeWorkExtractionGaps(c),{catalog_status:"unavailable",full_originals_verified:false});
});
test("more than twelve missing originals is explicitly truncated",()=>{
 const s=sampleCatalog();
 s.files=s.files.map(f=>({...f,index_status:"waiting_parser",source_text:{coverage:"no_current_receipt"}}));
 const v=summarizeWorkExtractionGaps(s);
 assert.equal(v.gaps.length,12);
 assert.equal(v.without_current_text_or_pending_seen,28);
 assert.equal(v.gap_list_truncated,true);
});
test("read-only native occurrence tool attaches gap catalog once, never upgrades extraction to original verification",()=>{
 const edge=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
 assert.match(edge,/import \{currentWorkTextCoverage,summarizeWorkExtractionGaps\}/);
 assert.match(edge,/const catalog=result.status==="ok"&&offset===0/);
 assert.match(edge,/browseWorkSources\(req,\{project:project.name,limit:50\}\)/);
 assert.match(edge,/extraction_catalog:extractionCatalog/);
 assert.match(edge,/current_source_text_only:true/);
});
