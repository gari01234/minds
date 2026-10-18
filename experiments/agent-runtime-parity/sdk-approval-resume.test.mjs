// Build 93 runtime-delegation spike: actual Agents SDK approval/resume, synthetic only.
// No API keys, Supabase, browser, secrets, professional documents or network model.
// The SDK can pause/restart a tool call; MINDS must still independently authorize
// every canonical write against the exact request, scope and idempotency key.
import test from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";

process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
const {Agent,run,tool,Usage,setTracingDisabled}=await import("@openai/agents");
setTracingDisabled(true);

const REQUEST=Object.freeze({
  turn_id:"fictional-turn-001",scope:"fictional-calendar",action:"create_task",
  operation_id:"fictional-operation-001",owner_id:"fictional-owner"
});

class ScriptedActionModel {
  name="fictional-no-network-action-model";
  calls=0;
  async getResponse(request){
    this.calls++;
    // After the reviewed interruption, the same model instance is resumed.
    // We intentionally do not assume an OpenAI wire-format for the SDK's
    // internal history; authorization and side effects are asserted below.
    if(this.calls>1){
      return {output:[{
        type:"message",status:"completed",role:"assistant",
        content:[{type:"output_text",text:"SDK resumed from the reviewed tool result."}]
      }],usage:new Usage()};
    }
    return {output:[{
      type:"function_call",name:"create_demo_task",callId:"fictional-call-001",
      arguments:JSON.stringify({title:"Fictional review task"})
    }],usage:new Usage()};
  }
  async *getStreamedResponse(){throw Error("streaming_not_used")}
}

function scenario(grant=null){
  const canonicalWrites=new Map();
  let attempted=0;
  const sensitive=tool({
    name:"create_demo_task",
    description:"Fictional write requiring human review and a separate canonical MINDS authorization.",
    parameters:z.object({title:z.string()}),
    needsApproval:true,
    async execute({title}){
      attempted++;
      // This is NOT the SDK's approval. This models MINDS's own separately
      // persisted and request-bound permission/receipt check at the tool edge.
      const authorized=grant?.turn_id===REQUEST.turn_id &&
        grant?.scope===REQUEST.scope &&
        grant?.action===REQUEST.action &&
        grant?.owner_id===REQUEST.owner_id &&
        grant?.operation_id===REQUEST.operation_id &&
        grant?.title===title;
      if(!authorized)return JSON.stringify({status:"blocked_by_minds_authority"});
      const key=REQUEST.owner_id+":"+REQUEST.operation_id;
      if(!canonicalWrites.has(key)){
        canonicalWrites.set(key,{title,scope:REQUEST.scope,receipt:"canonical-once"});
      }
      return JSON.stringify({status:"applied",receipt:canonicalWrites.get(key).receipt});
    }
  });
  const model=new ScriptedActionModel();
  const agent=new Agent({
    name:"MINDS synthetic review parity",
    instructions:"Use only the fictional tool. Never call real services.",
    model,tools:[sensitive]
  });
  return {agent,model,canonicalWrites,getAttempts:()=>attempted};
}
async function paused(s){
  const initial=await run(s.agent,"Create the fictional review task.",{maxTurns:4});
  assert.ok(initial.interruptions?.length>0,"SDK must interrupt before the sensitive tool");
  assert.equal(s.getAttempts(),0,"SDK must not run tool before human review");
  assert.equal(s.canonicalWrites.size,0,"canonical truth cannot change before review");
  assert.ok(initial.state,"SDK must return resumable state");
  return initial;
}

test("SDK pauses for human review without any canonical write",async()=>{
  const s=scenario();
  const initial=await paused(s);
  assert.equal(initial.interruptions.length,1);
  assert.equal(s.model.calls,1);
});

test("SDK approval alone cannot grant MINDS write authority",async()=>{
  const s=scenario();
  const initial=await paused(s);
  initial.state.approve(initial.interruptions[0]);
  const final=await run(s.agent,initial.state,{maxTurns:4});
  assert.equal(s.getAttempts(),1,"the SDK may request execution after its approval");
  assert.equal(s.canonicalWrites.size,0,"separate MINDS authorization must fail closed");
  assert.match(String(final.finalOutput),/SDK resumed/);
});

test("exact MINDS grant permits one canonical write after SDK resume",async()=>{
  const s=scenario({...REQUEST,title:"Fictional review task"});
  const initial=await paused(s);
  initial.state.approve(initial.interruptions[0]);
  const final=await run(s.agent,initial.state,{maxTurns:4});
  assert.equal(s.getAttempts(),1);
  assert.equal(s.canonicalWrites.size,1);
  assert.deepEqual([...s.canonicalWrites.values()],[{
    title:"Fictional review task",scope:REQUEST.scope,receipt:"canonical-once"
  }]);
  assert.match(String(final.finalOutput),/SDK resumed/);
});

test("approval for another scope must not authorize a write",async()=>{
  const s=scenario({...REQUEST,scope:"fictional-other-scope",title:"Fictional review task"});
  const initial=await paused(s);
  initial.state.approve(initial.interruptions[0]);
  await run(s.agent,initial.state,{maxTurns:4});
  assert.equal(s.canonicalWrites.size,0);
});
