// Isolated SDK process-restart experiment. Synthetic read-only tools only.
// Durable store here is a server-owned test directory, NOT Supabase.
// No credentials, professional content or OpenAI network calls.
import {readFileSync,writeFileSync,openSync,closeSync,renameSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {Agent,run,tool,RunState,Usage,setTracingDisabled} from "@openai/agents";
import {z} from "zod";
process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
setTracingDisabled(true);

const [command,dir,owner,scope,lease,operation]=process.argv.slice(2);
const runId="fictional-mission-001",version="sdk-test-checkpoint-v1";
const file=dir+"/checkpoint.json",receipt=dir+"/consumption.json",approval=dir+"/approval.json";
function digest(x){return createHash("sha256").update(x).digest("hex")}
function emit(x){process.stdout.write(JSON.stringify(x)+"\n")}
function read(path){return JSON.parse(readFileSync(path,"utf8"))}
function fail(reason){emit({status:"blocked",reason});return 0}

class Model{
  name="fictional-model-no-network";
  calls=0;
  async getResponse(){
    this.calls++;
    if(this.calls>1)return {output:[{type:"message",status:"completed",role:"assistant",
      content:[{type:"output_text",text:"Read-only checkpoint resumed."}]}],usage:new Usage()};
    return {output:[{type:"function_call",name:"read_demo_evidence",callId:"synthetic-read-001",
      arguments:JSON.stringify({term:"Sala Azul"})}],usage:new Usage()};
  }
  async *getStreamedResponse(){throw Error("no_streaming")}
}
let reads=0;
const model=new Model();
const readOnly=tool({name:"read_demo_evidence",
  description:"Read a fictional evidence record, only after test review.",
  needsApproval:true,parameters:z.object({term:z.string()}),
  async execute({term}){reads++;return JSON.stringify({scope:"fictional",term,documents:["doc-a"],source_version:"v1"})}
});
const agent=new Agent({name:"Synthetic MINDS resumed reader",model,tools:[readOnly],instructions:"No mutations or external data."});

if(command==="pause"){
  if(!owner||!scope||!lease||!operation)throw Error("missing_binding");
  const first=await run(agent,"Read the fictional Sala Azul evidence.",{maxTurns:4});
  if(first.interruptions.length!==1||reads!==0)throw Error("review_interruption_failed");
  const state=first.state.toString();
  const envelope={
    version,run_id:runId,owner_id:owner,scope,lease_token:lease,
    operation_id:operation,tool_policy:"read_only",
    expires_at:Date.now()+60000,state,sha256:digest(state)
  };
  writeFileSync(file+".tmp",JSON.stringify(envelope),{mode:0o600});
  renameSync(file+".tmp",file);
  emit({status:"checkpointed",interruptions:first.interruptions.length,read_calls:reads,version});
}else if(command==="resume"){
  if(!existsSync(file)){fail("checkpoint_not_found");process.exit(0)}
  const envelope=read(file);
  if(envelope.version!==version||envelope.run_id!==runId||envelope.tool_policy!=="read_only"){fail("unsupported_checkpoint");process.exit(0)}
  if(envelope.owner_id!==owner||envelope.scope!==scope||envelope.operation_id!==operation){fail("binding_mismatch");process.exit(0)}
  if(envelope.lease_token!==lease){fail("stale_lease");process.exit(0)}
  if(typeof envelope.expires_at!=="number"||envelope.expires_at<=Date.now()){fail("expired");process.exit(0)}
  if(typeof envelope.state!=="string"||digest(envelope.state)!==envelope.sha256){fail("checkpoint_corrupt");process.exit(0)}
  if(!existsSync(approval)){fail("review_not_found");process.exit(0)}
  const grant=read(approval);
  if(grant.reviewed!==true||grant.run_id!==runId||grant.owner_id!==owner||
     grant.scope!==scope||grant.lease_token!==lease||grant.operation_id!==operation||
     grant.action!=="read_demo_evidence"){fail("review_mismatch");process.exit(0)}
  // Server-owned exclusive receipt is a synthetic at-most-once *claim*.
  // If the process dies after this line, the next attempt fails closed:
  // exactly-once progress / lease recycling still require canonical DB RPCs.
  let claim;
  try{claim=openSync(receipt,"wx",0o600)}
  catch(e){if(e.code==="EEXIST"){emit({status:"replay_suppressed",read_calls:0});process.exit(0)}throw e}
  closeSync(claim);
  model.calls=1; // reconstructed deterministic model is now on its second turn
  const restored=await RunState.fromString(agent,envelope.state);
  const requests=restored.getInterruptions();
  if(requests.length!==1)throw Error("interruption_missing");
  restored.approve(requests[0]);
  const result=await run(agent,restored,{maxTurns:4});
  const outcome={status:"completed",read_calls:reads,final:String(result.finalOutput||"")};
  writeFileSync(receipt,JSON.stringify(outcome),{mode:0o600});
  emit(outcome);
}else{
  throw Error("expected_pause_or_resume");
}
