import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const file=fileURLToPath(new URL("../scripts/eval-calendar-semantics.mjs",import.meta.url));
const server=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
test("read-only real model evaluator consumes production schema without network in dry-run",()=>{
 const run=spawnSync(process.execPath,[file,"--dry-run"],{
   encoding:"utf8",timeout:20000,env:{...process.env,OPENAI_API_KEY:""}
 });
 assert.equal(run.status,0,run.stderr);
 const result=JSON.parse(run.stdout);
 assert.equal(result.mode,"schema_check");
 assert.ok(result.results.length>=9);
 assert.ok(result.results.every(x=>x.tool_available===true));
 assert.ok(result.results.some(x=>x.id==="es.complete"));
 assert.ok(result.results.some(x=>x.id==="es.contradiction"));
 assert.ok(result.results.some(x=>x.id==="es.tomorrow.morning"));
});
test("evaluator cannot mutate real MINDS or retrieve runtime keys",()=>{
 const s=readFileSync(file,"utf8");
 assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL|supabaseClient|isabella_tasks|minds_calendar_action_receipts/);
 assert.match(s,/OPENAI_API_KEY/);
 assert.match(s,/verifyCalendarSemanticProposal/);
 assert.match(s,/validatedCalendarClock/);
 assert.match(s,/const literal=source\.slice/);
 assert.match(server,/const fastCalendarInstructions=/);
});
