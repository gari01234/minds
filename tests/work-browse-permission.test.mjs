import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
test("Work browse must be exposed, allowed and dispatched, without write authorization",()=>{
 const policy=src.slice(src.indexOf("const ACTION_POLICY:"),src.indexOf("function policyMode("));
 assert.match(policy,/browse_work_sources:"allow"/);
 assert.match(src,/name:"browse_work_sources"/);
 assert.match(src,/call.name==="browse_work_sources"/);
 assert.match(src,/const result=await browseWorkSources/);
 assert.match(src,/eq\("user_id",user\.id\)/);
});
