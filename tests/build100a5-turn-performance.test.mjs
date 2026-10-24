import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {promptComponentSizes,contextFootprintSignal,leanConversationEligible}
 from '../supabase/functions/_shared/light-conversation-context.mjs';
const edge=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');
const numberOnly=x=>!JSON.stringify(x).includes('private source details');
test('instrumentation adds neither hidden prompt text nor privileges',()=>{
 const input={instructions:'system',context:{private:'private source details'},tools:[]};
 const sizes=promptComponentSizes(input);
 const signal=contextFootprintSignal('lean',sizes,{sections:{private_notes:{chars:1234,items:1}}});
 assert.equal(signal.tier,'lean');assert.equal(signal.above_envelope,false);
 assert.equal(signal.dominant_context_section,'private_notes');
 assert.equal(signal.dominant_context_chars,1234);
 assert.ok(numberOnly(signal));
 assert.equal(leanConversationEligible({complexity:'light',depth:'light'}),true);
 assert.match(edge,/context_signal=contextFootprintSignal\(/);
 assert.match(edge,/agent_run_id:run\?\.id\|\|null/);
 assert.match(edge,/recordUsage\(req,background\?"isabella_background":"isabella_chat"/);
});
test('calendar and lean preliminary envelopes are reported, never enforced',()=>{
 const low={instructions_chars:2669,context_chars:6586,tools_chars:10643,input_chars:2000,tools_count:13};
 const cal=contextFootprintSignal('calendar_fast',low);
 assert.equal(cal.budget_kind,'observational_envelope');
 assert.equal(cal.above_envelope,false);
 const elevated=contextFootprintSignal('calendar_fast',{...low,context_chars:24000});
 assert.equal(elevated.above_envelope,true);
 assert.deepEqual(elevated.exceeding_fields,['context_chars']);
 const lean=contextFootprintSignal('lean',{...low,context_chars:28709,tools_count:50,tools_chars:38843,instructions_chars:10024});
 assert.equal(lean.above_envelope,false);
 assert.match(edge,/Monitoring only/);
});
test('Work full-context outliers identify dominant section without dropping evidence',()=>{
 const sections={sections:{routed_work_context:{chars:263888,items:null},recalled_memory:{chars:32320,items:18}}};
 const full=contextFootprintSignal('full',{context_chars:344475},sections);
 assert.equal(full.budget_kind,'profile_only');
 assert.equal(full.needs_work_prefetch_profile,true);
 assert.equal(full.routed_work_chars,263888);
 assert.equal(full.dominant_context_section,'routed_work_context');
 assert.equal(full.above_envelope,false);
 assert.doesNotMatch(edge,/context_signal\.above_envelope\s*\?/);
 assert.match(edge,/sourceFirstWorkPrefetchEligible\(\{route,message:effectiveMessage/);
});