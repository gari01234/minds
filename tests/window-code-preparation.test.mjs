import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {trustedWorkflow,allowedPath,validateEdits} from '../supabase/functions/_shared/window-code-contract.mjs';
const valid={repository:'gari01234/minds',repository_id:'1387794687',ref:'refs/heads/main',workflow_ref:'gari01234/minds/.github/workflows/window-code.yml@refs/heads/main',event_name:'schedule',run_id:'123',sha:'a'.repeat(40)};
test('code worker admits only the pinned main workflow, never pull requests or forks',()=>{
 assert.equal(trustedWorkflow(valid),true);
 for(const patch of [{repository:'someone/minds'},{repository_id:'1'},{ref:'refs/pull/3/merge'},{workflow_ref:'gari01234/minds/.github/workflows/other.yml@refs/heads/main'},{event_name:'pull_request_target'},{sha:'oops'}])assert.equal(trustedWorkflow({...valid,...patch}),false);
});
test('edits are exact and bounded; existing regression tests and infrastructure are immutable',()=>{
 for(const path of ['.github/workflows/verify.yml','scripts/window-code-runner.mjs','apps/isabella/../../secret','/etc/passwd','supabase/migrations/change.sql','supabase/functions/_shared/window-code-contract.mjs'])assert.equal(allowedPath(path),false,path);
 const sources=[{path:'apps/isabella/work.js',content:'const a=1;\n'}];
 assert.deepEqual(validateEdits({outcome:'change',edits:[{path:sources[0].path,before:'a=1',after:'a=2'}]},sources),[{path:sources[0].path,content:'const a=2;\n'}]);
 assert.throws(()=>validateEdits({outcome:'change',edits:[{path:sources[0].path,before:'missing',after:'x'}]},sources),/stale/);
 assert.throws(()=>validateEdits({outcome:'change',edits:[{path:'tests/existing.test.mjs',before:'assert',after:'ignore'}]},[{path:'tests/existing.test.mjs',content:'assert'}]),/immutable/);
 assert.throws(()=>validateEdits({outcome:'no_change',edits:[{}]},[]),/nonchange/);
});
test('generated tests run without credentials, sockets, network or root privileges',()=>{
 const script=readFileSync(new URL('../scripts/window-code-runner.mjs',import.meta.url),'utf8');
 for(const part of ['--network=none','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--user=1000:1000','draft:true'])assert.ok(script.includes(part));
 const sandbox=script.slice(script.indexOf("spawnSync('docker'"),script.indexOf('const testExit='));
 assert.doesNotMatch(sandbox,/GH_TOKEN|ACTION.*TOKEN|docker.sock|SERVICE_ROLE/);
 assert.ok(script.indexOf('if(testExit!==0)')<script.indexOf("github('/git/trees'"));
 assert.doesNotMatch(script,/\/merge['"`]|git.*push.*main/);
});
