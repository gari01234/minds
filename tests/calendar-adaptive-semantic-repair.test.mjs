import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
test("semantic repair is only triggered after a grounded claim fails validation",()=>{
 assert.match(s,/const repairingSemantics=round>0&&temporalGroundingIssues\.length>0&&/);
 assert.match(s,/!toolProposals\.length/);
 assert.match(s,/reasoning:\{effort:repairingSemantics\?"medium":reasoningEffort\}/);
 assert.match(s,/max_output_tokens:repairingSemantics\?Math\.max\(budget\.maxOutput,2200\):budget\.maxOutput/);
 assert.match(s,/semantic_repair_rounds:semanticRepairRounds/);
 assert.match(s,/semantic_repair:repairingSemantics/);
});
test("semantic repair does not bypass review, receipts or semantic source constraints",()=>{
 assert.match(s,/verifyCalendarSemanticProposal\(rawProposal,args\?\.temporal_grounding/);
 assert.match(s,/exactOwnerExcerpt\(sourceText,quoted\)/);
 assert.match(s,/recordShadowDecision\(req/);
 assert.match(s,/toolProposals\.push\(proposalForReview\)/);
 assert.match(s,/create_event:"confirm"/);
 assert.match(s,/request_clarification/);
});
