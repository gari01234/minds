// Synthetic durable-worker experiment: independent OS processes + file-backed SQLite.
// SQLite is ONLY a CI stand-in for a persistence boundary; it is NOT MINDS's
// PostgreSQL/RLS/lease runtime and must not be deployed as a production store.
import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {Agent,run,tool,RunState,Usage,setTracingDisabled} from "@openai/agents";
import {z} from "zod";

process.env.OPENAI_AGENTS_DISABLE_TRACING="1";
setTracingDisabled(true);

const [dbPath,backend,operation,owner="demo-owner",scope="demo-scope"]=process.argv.slice(2);
if(!dbPath||!["native","sdk"].includes(backend)||!operation)throw Error("synthetic_arguments_required");
const ID="demo-mission-001", OP_ID="demo-action-001", TITLE="Fictional task";
const db=new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,backend TEXT NOT NULL,owner_id TEXT NOT NULL,scope TEXT NOT NULL,operation_id TEXT NOT NULL,status TEXT NOT NULL,snapshot TEXT,approval_owner TEXT,approval_scope TEXT,lease_token TEXT,lease_until INTEGER); CREATE TABLE IF NOT EXISTS receipts(operation_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,scope TEXT NOT NULL,receipt TEXT NOT NULL);");
const row=()=>db.prepare("SELECT * FROM runs WHERE id=?").get(ID);
const receipts=()=>Number(db.prepare("SELECT count(*) n FROM receipts").get().n);
function result(value){console.log(JSON.stringify(value))}
function transaction(fn){
  db.exec("BEGIN IMMEDIATE");
  try{const x=fn();db.exec("COMMIT");return x}
  catch(e){db.exec("ROLLBACK");throw e}
}
function exactAuthorization(r){
  return !!r&&r.backend===backend&&r.status==="running" &&
    r.owner_id===owner && r.scope===scope &&
    r.operation_id===OP_ID &&
    r.approval_owner===owner && r.approval_scope===scope;
}
function writeCanonicalReceipt(title){
  return transaction(()=>{
    const r=row();
    if(!exactAuthorization(r)||title!==TITLE)
      return {status:"blocked_by_minds_authority"};
    db.prepare("INSERT OR IGNORE INTO receipts(operation_id,owner_id,scope,receipt) VALUES(?,?,?,?)")
      .run(OP_ID,owner,scope,"demo-canonical-receipt");
    return {status:"applied",receipt:"demo-canonical-receipt"};
  });
}
class ScriptedModel {
  name="fictional-model-no-network";
  calls;
  constructor(resuming=false){this.calls=resuming?1:0}
  async getResponse(){
    this.calls++;
    return this.calls===1
      ? {output:[{type:"function_call",name:"demo_action",callId:"demo-call-001",
          arguments:JSON.stringify({title:TITLE})}],usage:new Usage()}
      : {output:[{type:"message",status:"completed",role:"assistant",
          content:[{type:"output_text",text:"Synthetic agent resumed."}]}],usage:new Usage()};
  }
  async *getStreamedResponse(){throw Error("streaming_forbidden")}
}
function agent(resuming=false){
  return new Agent({
    name:"Fictional SDK agent",
    instructions:"Only operate on fictional data. MINDS owns authority.",
    model:new ScriptedModel(resuming),
    tools:[tool({
      name:"demo_action",description:"Fictional approval-required canonical action.",
      parameters:z.object({title:z.string()}),needsApproval:true,
      async execute({title}){return JSON.stringify(writeCanonicalReceipt(title))}
    })]
  });
}
if(operation==="create"){
  if(row())throw Error("already_exists");
  let snapshot=null;
  if(backend==="sdk"){
    const initial=await run(agent(),"Create the fictional task.",{maxTurns:4});
    if(initial.interruptions.length!==1||receipts()!==0)throw Error("sdk_initial_interrupt_failed");
    snapshot=initial.state.toString();
  }
  transaction(()=>db.prepare(
    "INSERT INTO runs(id,backend,owner_id,scope,operation_id,status,snapshot) VALUES(?,?,?,?,?,?,?)")
    .run(ID,backend,owner,scope,OP_ID,"awaiting_review",snapshot));
  result({status:"awaiting_review",snapshot_bytes:Buffer.byteLength(snapshot||"")});
}else if(operation==="approve"){
  const changed=transaction(()=>db.prepare(
    "UPDATE runs SET status='approved',approval_owner=?,approval_scope=? WHERE id=? AND backend=? AND owner_id=? AND scope=? AND status='awaiting_review'")
    .run(owner,scope,ID,backend,owner,scope).changes);
  result({status:changed===1?"approved":"denied"});
}else if(operation==="expire"){
  // CI-only clock injection: do not wait four real minutes.
  const changed=transaction(()=>db.prepare(
    "UPDATE runs SET lease_until=0 WHERE id=? AND backend=? AND status='running'")
    .run(ID,backend).changes);
  result({status:changed===1?"expired":"no_running_lease"});
}else if(operation==="inspect"){
  const r=row();
  result({status:r?.status??"missing",receipts:receipts(),
    snapshot_bytes:Buffer.byteLength(r?.snapshot||""),
    lease_present:!!r?.lease_token});
}else if(operation==="resume"||operation==="resume_crash"){
  const lease=randomUUID();
  const claimed=transaction(()=>db.prepare(
    "UPDATE runs SET status='running',lease_token=?,lease_until=? WHERE id=? AND backend=? AND owner_id=? AND scope=? AND (status='approved' OR (status='running' AND lease_until<=?))")
    .run(lease,Date.now()+240000,ID,backend,owner,scope,Date.now()).changes);
  if(claimed!==1){result({status:"not_claimed"});process.exit(0)}
  if(backend==="sdk"){
    const r=row(), a=agent(true);
    const restored=await RunState.fromString(a,r.snapshot);
    const interruptions=restored.getInterruptions();
    if(interruptions.length!==1)throw Error("unexpected_sdk_interruptions");
    restored.approve(interruptions[0]);
    await run(a,restored,{maxTurns:4});
  }else{
    writeCanonicalReceipt(TITLE); // existing MINDS transactional lease baseline
  }
  if(operation==="resume_crash"){
    // Real OS process termination after committed receipt but before final
    // run completion. It exercises restart/replay, not Supabase production.
    process.exit(81);
  }
  const finished=transaction(()=>{
    if(receipts()!==1)return false;
    return db.prepare(
      "UPDATE runs SET status='completed',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND status='running'")
      .run(ID,lease).changes===1;
  });
  result({status:finished?"completed":"stale",receipts:receipts()});
}else{
  throw Error("unsupported_operation");
}
