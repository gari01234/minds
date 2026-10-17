// This test exercises the REAL @openai/agents Runner with a deterministic
// synthetic Model. It does NOT test intelligence/model quality or call OpenAI.
// No API key, user data, Supabase connection, network tools, or write-capability.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {collectEvidence,gradeEvidence} from "../../scripts/agent-runtime-parity-core.mjs";
import {z} from "zod";

process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
const {Agent,run,tool,Usage}=await import("@openai/agents");
const corpus=JSON.parse(readFileSync(new URL("../../tests/fixtures/agent-runtime-parity-synthetic-v01.json",import.meta.url),"utf8"));

class ScriptedEvidenceModel {
  name="synthetic-model-no-network";
  calls=0;
  sawToolResult=false;
  async getResponse(request){
    this.calls++;
    if(this.calls===1){
      return {
        output:[{type:"function_call",name:"find_all_occurrences",
          callId:"call_synthetic_001",arguments:JSON.stringify({term:"Sala Azul"})}],
        usage:new Usage()
      };
    }
    const text=JSON.stringify(request.input);
    this.sawToolResult=text.includes("doc-a")&&text.includes("doc-e")&&text.includes("segment_no");
    return {
      output:[{type:"message",status:"completed",role:"assistant",content:[{type:"output_text",
        text:this.sawToolResult?"I received the full synthetic evidence set.":"NO_TOOL_RESULT"}]}],
      usage:new Usage()
    };
  }
  async *getStreamedResponse(){throw Error("streaming_not_used_in_mock_test")}
}

test("real Agents SDK runner invokes owner-independent synthetic read-only tool and re-enters model",async()=>{
  const trace=[];
  const find=tool({
    name:"find_all_occurrences",
    description:"Exhaustively collect versioned matches over ONLY the synthetic fixture, showing missing-parser files.",
    parameters:z.object({term:z.string()}),
    async execute({term}){
      trace.push({tool:"find_all_occurrences",term});
      return JSON.stringify(collectEvidence(corpus,term,2));
    }
  });
  const model=new ScriptedEvidenceModel();
  const agent=new Agent({
    name:"MINDS synthetic coverage parity",
    instructions:"Only use fixture tool. Do not request or execute mutations. No private data.",
    model,
    tools:[find]
  });
  const result=await run(agent,"Encuentra todas las superficies de Sala Azul y conserva la evidencia.",{maxTurns:4});
  assert.equal(model.calls,2,"SDK should handle function call and re-enter mock Model");
  assert.equal(model.sawToolResult,true,"model must receive actual tool result");
  assert.deepEqual(trace,[{tool:"find_all_occurrences",term:"Sala Azul"}]);
  assert.match(String(result.finalOutput),/full synthetic evidence/);
  assert.equal(agent.tools.length,1);
  assert.equal(agent.tools[0].name,"find_all_occurrences");
});

test("a complete tool read is not itself a verified semantic final answer",()=>{
  const rows=collectEvidence(corpus,"Sala Azul",2);
  const all={evidence:rows.records,unavailable:rows.unavailable,extracted_text_traversed:true};
  const covered=gradeEvidence(corpus,"Sala Azul",all);
  assert.equal(covered.coverage_complete,true);
  assert.equal(covered.full_originals_verified,false);
  assert.equal(covered.measure_types_reviewed,false);
  assert.equal(covered.chronology_verified,false);
  assert.equal(rows.records.some(x=>x.segment_no===15),true);
});
