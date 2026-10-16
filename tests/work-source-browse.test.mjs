import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {workBrowseRequest,workBrowsePage,workBrowseSegmentView,workBrowseTextView} from "../supabase/functions/_shared/work-source-browse.mjs";

const file_id="99fe6adb-dac5-4c69-9ee5-ca9f74246e63";
const source_version="e20b8b0daa3477602a48371c07569a553089d921beea5ee8a734730bc4a3df2f";
test("catalog exposes deterministic bounded traversal, including page two",()=>{
  const req=workBrowseRequest({limit:50});
  assert.deepEqual([req.mode,req.offset,req.limit],["catalog",0,50]);
  const page=workBrowsePage(new Array(8).fill({}),18,0,8);
  assert.equal(page.has_more,true);assert.equal(page.next_offset,8);
  assert.equal(workBrowsePage(new Array(8).fill({}),18,8,8).has_more,true);
  const last=workBrowsePage(new Array(2).fill({}),18,16,8);
  assert.equal(last.has_more,false);assert.equal(last.complete_single_page,false);
});
test("segment browsing enforces a stable explicit file identity and source pin",()=>{
  assert.deepEqual(workBrowseRequest({file_id,expected_version:source_version,offset:8,limit:8}),
    {status:"ok",mode:"segments",file_id,segment_no:null,offset:8,limit:8,expected_version:source_version});
  assert.equal(workBrowseRequest({file_id:"../other-project"}).status,"invalid");
  assert.equal(workBrowseRequest({file_id,expected_version:"user text"}).status,"invalid");
  assert.equal(workBrowseRequest({file_id,offset:-1}).status,"invalid");
  assert.equal(workBrowseRequest({file_id,limit:999}).status,"invalid");
  assert.equal(workBrowseRequest({segment_no:1}).status,"invalid");
});
test("segment text supports continuation, never silently truncates the original",()=>{
  const content="a".repeat(22005);
  const row={file_id,source_version,segment_no:12,segment_kind:"page_text",locator:{page:11,verified:true},extractor:"Docling",content};
  const req=workBrowseRequest({file_id,segment_no:12,offset:12000});
  assert.equal(req.mode,"segment_text");
  const first=workBrowseTextView(row,0);
  const rest=workBrowseTextView(row,first.next_text_offset);
  assert.equal(first.has_more,true);
  assert.equal(first.content.length,12000);
  assert.equal(rest.has_more,false);
  assert.equal(first.content+rest.content,content);
  const preview=workBrowseSegmentView(row);
  assert.equal(preview.excerpt_truncated,true);
  assert.equal(preview.segment_chars,content.length);
  assert.equal(preview.excerpt.length,8000);
});
test("empty or middle pages cannot falsely claim whole-corpus completeness",()=>{
  assert.equal(workBrowsePage([],0,0,8).complete_single_page,true);
  assert.equal(workBrowsePage([],18,16,8).complete_single_page,false);
  assert.equal(workBrowsePage(new Array(8).fill({}),8,0,8).has_more,false);
});
test("source version, owner scoping and no raw-text telemetry are enforced in runtime",()=>{
  const src=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
  const fn=src.slice(src.indexOf("async function browseWorkSources"),src.indexOf("async function compareProjectSource"));
  assert.ok(fn.length>1000);
  for(const s of ['resolveWorkProject(req','sb.auth.getUser()','.eq("project_id",project.id)','.eq("user_id",user.id)','.eq("source_version",currentVersion)','expected_version',"workBrowsePage(","workBrowseTextView(",'_admitSourceRows'])assert.ok(fn.includes(s),s);
  assert.match(src,/name:"browse_work_sources"/);
  assert.match(src,/call.name==="browse_work_sources"/);
  assert.match(src,/workSourceAdmission\("tool_browse_work_sources"/);
});
