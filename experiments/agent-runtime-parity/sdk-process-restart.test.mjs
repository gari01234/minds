import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,fileURLToPath} from "node:url";
import {resolve} from "node:path";

const worker=fileURLToPath(new URL("./sdk-process-worker.mjs",import.meta.url));
const owner="fictional-owner",scope="fictional-project",lease="fictional-lease-001",operation="fictional-operation-001";
function sandbox(){return mkdtempSync(resolve(tmpdir(),"minds-sdk-restart-"))}
function invoke(dir,command,who=owner,where=scope,token=lease,op=operation){
  const p=spawnSync(process.execPath,[worker,command,dir,who,where,token,op],{
    encoding:"utf8",timeout:16000,env:{...process.env,OPENAI_AGENTS_DISABLE_TRACING:"1"}
  });
  assert.equal(p.error,undefined,"child process must launch");
  assert.equal(p.status,0,"worker failed: "+(p.stderr||p.stdout).slice(-1800));
  return JSON.parse(p.stdout.trim().split("\n").at(-1));
}
function grant(dir,overrides={}){
  const row={reviewed:true,run_id:"fictional-mission-001",owner_id:owner,
    scope,lease_token:lease,operation_id:operation,action:"read_demo_evidence",...overrides};
  writeFileSync(resolve(dir,"approval.json"),JSON.stringify(row),{mode:0o600});
}
test("SDK snapshot survives an actual child process exit and resumes under a different PID",t=>{
  const dir=sandbox();t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const paused=invoke(dir,"pause");
  assert.equal(paused.status,"checkpointed");
  assert.equal(paused.read_calls,0);
  grant(dir);
  const done=invoke(dir,"resume");
  assert.equal(done.status,"completed");
  assert.equal(done.read_calls,1);
  assert.match(done.final,/checkpoint resumed/);
  const replay=invoke(dir,"resume");
  assert.equal(replay.status,"replay_suppressed");
  assert.equal(replay.read_calls,0);
});
test("owner/scope/lease/operation mismatches fail closed before SDK tool",t=>{
  const dir=sandbox();t.after(()=>rmSync(dir,{recursive:true,force:true}));
  invoke(dir,"pause");grant(dir);
  assert.deepEqual(invoke(dir,"resume","other-owner"),{status:"blocked",reason:"binding_mismatch"});
  assert.deepEqual(invoke(dir,"resume",owner,"other-scope"),{status:"blocked",reason:"binding_mismatch"});
  assert.deepEqual(invoke(dir,"resume",owner,scope,"stale-lease"),{status:"blocked",reason:"stale_lease"});
  assert.deepEqual(invoke(dir,"resume",owner,scope,lease,"other-operation"),{status:"blocked",reason:"binding_mismatch"});
  assert.equal(invoke(dir,"resume").status,"completed","invalid attempts must not consume checkpoint");
});
test("no reviewed MINDS grant, modified checkpoint, and expiry fail closed",t=>{
  const dir=sandbox();t.after(()=>rmSync(dir,{recursive:true,force:true}));
  invoke(dir,"pause");
  assert.equal(invoke(dir,"resume").reason,"review_not_found");
  grant(dir,{reviewed:false});
  assert.equal(invoke(dir,"resume").reason,"review_mismatch");
  grant(dir);
  const path=resolve(dir,"checkpoint.json");
  const original=JSON.parse(readFileSync(path,"utf8"));
  writeFileSync(path,JSON.stringify({...original,state:original.state+" altered"}),{mode:0o600});
  assert.equal(invoke(dir,"resume").reason,"checkpoint_corrupt");
  writeFileSync(path,JSON.stringify({...original,expires_at:Date.now()-1000}),{mode:0o600});
  assert.equal(invoke(dir,"resume").reason,"expired");
  writeFileSync(path,JSON.stringify(original),{mode:0o600});
  assert.equal(invoke(dir,"resume").status,"completed");
});
