import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {enumerateCorpus,collectEvidence,gradeEvidence} from "../scripts/agent-runtime-parity-core.mjs";
const corpus=JSON.parse(readFileSync(new URL("./fixtures/agent-runtime-parity-synthetic-v01.json",import.meta.url),"utf8"));
test("synthetic fixture alone; never embeds confidential Bernried text or file IDs",()=>{
 assert.equal(corpus.classification,"public-synthetic-fixture-never-user-work");
 assert.equal(corpus.files.length,5);
 assert.equal(corpus.files[0].segments.length,16);
});
test("source-scoped occurrence search traverses all files including late segments",()=>{
 const first=enumerateCorpus(corpus,"sala azul",{limit:2});
 assert.equal(first.total,5);
 assert.equal(first.has_more,true);
 const complete=collectEvidence(corpus,"SALA AZUL",2);
 assert.equal(complete.records.length,5);
 assert.equal(complete.records.some(x=>x.file_id==="doc-a"&&x.segment_no===15),true);
 assert.equal(complete.records.some(x=>x.file_id==="doc-b"&&x.content.includes("Luftraum")),true);
 assert.deepEqual(complete.unavailable.map(x=>x.file_id),["doc-e"]);
 assert.equal(complete.full_originals_verified,false);
});
test("full provenance is needed to pass extracted-text coverage check",()=>{
 const result=collectEvidence(corpus,"sala azul",2);
 const honest={evidence:result.records.map(x=>({...x})),unavailable:result.unavailable,
   extracted_text_traversed:true,full_originals_verified:false};
 assert.equal(gradeEvidence(corpus,"sala azul",honest).coverage_complete,true);
 const missed={...honest,evidence:honest.evidence.filter(x=>x.file_id!=="doc-a")};
 const grade=gradeEvidence(corpus,"sala azul",missed);
 assert.equal(grade.coverage_complete,false);
 assert.deepEqual(grade.missing,["doc-a:test-source-a-1:15"]);
});
test("never conflate a void with a tabular room just because the number matches",()=>{
 const result=collectEvidence(corpus,"Sala Azul");
 const sameNumeric=result.records.filter(x=>x.content.includes("53,20"));
 assert.equal(sameNumeric.length,2);
 assert.notEqual(sameNumeric[0].file_id,sameNumeric[1].file_id);
 assert.equal(sameNumeric.some(x=>x.content.startsWith("Luftraum")),true);
 assert.equal(gradeEvidence(corpus,"Sala Azul",{evidence:result.records,unavailable:result.unavailable,
   extracted_text_traversed:true}).measure_types_reviewed,false);
});
test("detect duplicate or stale evidence and incomplete source coverage",()=>{
 const b=collectEvidence(corpus,"Sala Azul");
 const good={evidence:b.records,unavailable:b.unavailable,extracted_text_traversed:true};
 assert.equal(gradeEvidence(corpus,"Sala Azul",{...good,evidence:[...b.records,b.records[0]]}).coverage_complete,false);
 const stale=b.records.map(x=>({...x}));
 stale[0]={...stale[0],version:"obsolete-sha"};
 assert.equal(gradeEvidence(corpus,"Sala Azul",{...good,evidence:stale}).coverage_complete,false);
 assert.equal(gradeEvidence(corpus,"Sala Azul",{...good,unavailable:[]}).coverage_complete,false);
 assert.equal(gradeEvidence(corpus,"Sala Azul",{...good,full_originals_verified:true}).overclaimed_absolute_completeness,true);
});
test("reject nonadvancing and excessive cursors",()=>{
 assert.throws(()=>enumerateCorpus(corpus,"Sala Azul",{offset:-1}),/invalid_cursor/);
 assert.throws(()=>enumerateCorpus(corpus,"Sala Azul",{limit:1001}),/invalid_cursor/);
 assert.throws(()=>enumerateCorpus(corpus," ",{}),/missing_term/);
});

test("equivalent locators with reordered keys are not provenance errors",()=>{
 const b=collectEvidence(corpus,"Sala Azul");
 const reordered=b.records.map(x=>({...x,locator:Object.fromEntries(Object.entries(x.locator).reverse())}));
 const result=gradeEvidence(corpus,"Sala Azul",{evidence:reordered,unavailable:b.unavailable,extracted_text_traversed:true});
 assert.deepEqual(result.provenance_errors,[]);
 assert.equal(result.coverage_complete,true);
});
test("absolute visual-completeness claim fails even with all extracted text",()=>{
 const b=collectEvidence(corpus,"Sala Azul");
 const result=gradeEvidence(corpus,"Sala Azul",{evidence:b.records,unavailable:b.unavailable,extracted_text_traversed:true,full_originals_verified:true});
 assert.equal(result.coverage_complete,false);
 assert.equal(result.overclaimed_absolute_completeness,true);
});
