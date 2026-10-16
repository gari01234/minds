import test from "node:test";
import assert from "node:assert/strict";
import {contextSectionSizes,workSourceAdmission,toolAdmission} from "../supabase/functions/_shared/cognitive-coverage-observability.mjs";

test("context footprint records numeric sizes, never data",()=>{
  const confidential="STRICTLY_PRIVATE_ORIGINAL_TEXT";
  const got=contextSectionSizes({routed_work_context:{claims:[{statement:confidential}]},recalled_memory:[confidential],empty:null});
  assert.equal(got.version,"component_chars_v1");
  assert.equal(got.sections.recalled_memory.items,1);
  assert.ok(got.sections.routed_work_context.chars>0);
  assert.equal(JSON.stringify(got).includes(confidential),false);
  assert.equal(JSON.stringify(got).includes("statement"),false);
});
test("source admission distinguishes versioned source from literal content",()=>{
  const segment={file_id:"da4c65a1-2170-4c88-a223-5e99912fd30d",source_version:"sha256:abc123",segment_no:17,locator:{page:12,verified:true,sheet:"private"},content:"PRIVATE_TEXT",file_name:"Private.pdf"};
  const record=workSourceAdmission("routed_work",[segment]);
  assert.deepEqual(record.sources[0],{file_id:segment.file_id,source_version:segment.source_version,segment_no:17,page:12,page_verified:true});
  assert.equal(record.segment_count,1);
  assert.equal(JSON.stringify(record).includes("PRIVATE_TEXT"),false);
  assert.equal(JSON.stringify(record).includes("Private.pdf"),false);
  assert.equal(JSON.stringify(record).includes("private"),false);
});
test("page locator verification accepts Docling verified and rejects unpaged evidence",()=>{
  const file_id="da4c65a1-2170-4c88-a223-5e99912fd30d";
  const records=workSourceAdmission("routed_work",[
    {file_id,source_version:"sha256:abc123",segment_no:14,locator:{page:12,verified:true}},
    {file_id,source_version:"sha256:abc123",segment_no:15,locator:{sequence:6,page_verified:false}},
    {file_id,source_version:"sha256:abc123",segment_no:17,locator:{page:14,verified:false,page_verified:true}}
  ]);
  assert.deepEqual(records.sources.map(x=>({page:x.page,verified:x.page_verified})),[
    {page:12,verified:true},{page:null,verified:false},{page:14,verified:false}
  ]);
});
test("unknown or malformed identifiers cannot be logged",()=>{
  const record=workSourceAdmission("tool_search_work",[{file_id:"name_of_a_private_person",source_version:"source value with spaces",segment_no:-4,locator:{page:"bad"}}]);
  assert.equal(record.segment_count,1);
  assert.deepEqual(record.sources,[]);
});
test("empty admitted candidates and tool errors stay distinguishable",()=>{
  assert.deepEqual(workSourceAdmission("routed_work",null).sources,[]);
  const x=toolAdmission("read_work_file",{status:"download_failed"},"c06c8f4e-6780-4c4b-a8f6-43929abcc230");
  assert.equal(x.status,"download_failed");
  assert.equal(x.file_id,"c06c8f4e-6780-4c4b-a8f6-43929abcc230");
  assert.equal(x.locator_verified,false);
  assert.equal(x.source_version,null);
});
test("memory trace keeps counts, not autobiographical contents",()=>{
  const r=toolAdmission("search_memory",{lexical:[{content:"owner secret"}],semantic:[],entities:[{name:"private"}]});
  assert.deepEqual(r.items,{lexical:1,semantic:0,entities:1});
  assert.equal(JSON.stringify(r).includes("secret"),false);
});
