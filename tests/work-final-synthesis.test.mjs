import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const begin=src.indexOf("for(let round=0;round<=budget.rounds;round++){");
const end=src.indexOf("if(!response.ok){",begin);
const cycle=src.slice(begin,end);

test("final output cap applies only after multi-tool Work exploration, never by phrase",()=>{
  assert.ok(begin>0&&end>begin);
  assert.match(cycle,/const finalWorkSynthesis=!background&&route\.work&&round===budget\.rounds&&usedTools\.length>0;/);
  assert.match(cycle,/const outputCap=finalWorkSynthesis\?Math\.max\(budget\.maxOutput,8000\):budget\.maxOutput;/);
  assert.match(cycle,/max_output_tokens:repairingSemantics\?Math\.max\(outputCap,2200\):outputCap/);
  assert.match(cycle,/tool_choice:"none"/);
});

test("incomplete Work output retains source admissions and tool trail, not raw text",()=>{
  assert.match(cycle,/source_admission:sourceAdmissions/);
  assert.match(cycle,/tools:usedTools/);
  assert.match(cycle,/prompt_components:footprint/);
  assert.match(cycle,/final_synthesis_output_cap:outputCap/);
  assert.match(cycle,/incomplete_reason:reason/);
  assert.match(cycle,/return json\(\{reply:partial,incomplete:true/);
  assert.doesNotMatch(cycle,/partial_content:/);
});
