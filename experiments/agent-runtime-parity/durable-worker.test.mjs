// Compare durability / canonical idempotence over independent OS processes.
// NOT a real-model quality, Supabase RLS, cost, latency or net-LOC parity test.
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const script=fileURLToPath(new URL("./durable-worker.mjs",import.meta.url));

function call(path,backend,op,owner="demo-owner",scope="demo-scope",crash=false){
  const child=spawnSync(process.execPath,[script,path,backend,op,owner,scope],{
    encoding:"utf8",timeout:12000,env:{...process.env,OPENAI_AGENTS_DISABLE_TRACING:"1"}
  });
  if(crash){
    assert.equal(child.status,81,"expected interrupted worker, got "+child.status+" "+child.stderr);
    return {status:"worker_crashed"};
  }
  assert.equal(child.status,0,backend+" "+op+": "+child.stderr);
  const lines=child.stdout.trim().split("\n");
  return JSON.parse(lines.at(-1));
}
for(const backend of ["native","sdk"]){
  test(backend+": persistent owner-bound approval, process crash, lease expiry, at-most-one receipt",()=>{
    const dir=mkdtempSync(join(tmpdir(),"minds-"+backend+"-")),path=join(dir,"state.sqlite");
    try{
      const started=call(path,backend,"create");
      assert.equal(started.status,"awaiting_review");
      if(backend==="sdk")assert.ok(started.snapshot_bytes>100,"SDK state must be durable");
      else assert.equal(started.snapshot_bytes,0,"native mission has no SDK snapshot");
      assert.equal(call(path,backend,"approve","other-owner").status,"denied");
      assert.equal(call(path,backend,"approve","demo-owner","other-scope").status,"denied");
      assert.equal(call(path,backend,"inspect").receipts,0);
      assert.equal(call(path,backend,"resume").status,"not_claimed");
      assert.equal(call(path,backend,"approve").status,"approved");
      assert.equal(call(path,backend,"approve").status,"denied","approval consumed only once");
      call(path,backend,"resume_crash","demo-owner","demo-scope",true);
      let after=call(path,backend,"inspect");
      assert.equal(after.status,"running");
      assert.equal(after.lease_present,true);
      assert.equal(after.receipts,1,"effect was durably committed before crash");
      assert.equal(call(path,backend,"resume").status,"not_claimed","unexpired lease denies replay");
      assert.equal(call(path,backend,"expire").status,"expired");
      const recovered=call(path,backend,"resume");
      assert.deepEqual(recovered,{status:"completed",receipts:1});
      after=call(path,backend,"inspect");
      assert.equal(after.status,"completed");
      assert.equal(after.receipts,1,"replay must not duplicate canonical effect");
      assert.equal(call(path,backend,"resume").status,"not_claimed");
    }finally{rmSync(dir,{recursive:true,force:true})}
  });
}
