// Trusted orchestration only. Candidate code runs exclusively inside Docker.
import {readFileSync,writeFileSync,mkdtempSync,existsSync,lstatSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {allowedPath,validateEdits,REPOSITORY,AUDIENCE} from '../supabase/functions/_shared/window-code-contract.mjs';
const endpoint='https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-code-preparation';
const sha=process.env.GITHUB_SHA;
if(process.env.GITHUB_REPOSITORY!==REPOSITORY||process.env.GITHUB_REF!=='refs/heads/main'||!/^[a-f0-9]{40}$/.test(sha||''))throw Error('untrusted_checkout');
async function api(operation,params={}){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience',AUDIENCE);
 const auth=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
 const oidc=await auth.json();if(!auth.ok||!oidc.value)throw Error('oidc_unavailable');
 const r=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(115000),headers:{Authorization:'Bearer '+oidc.value,'Content-Type':'application/json'},body:JSON.stringify({operation,...params})});
 if(!r.ok)throw Error('window_api_'+operation+'_'+r.status);return r.json();
}
async function github(path,body){
 const r=await fetch('https://api.github.com/repos/'+REPOSITORY+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error('github_'+r.status);return r.json();
}
const {job}=await api('claim');if(!job){console.log('Window: no eligible proposal.');process.exit(0);}
const binding={job_id:job.id,lease_token:job.lease_token};
let dir,commitSha;
try{
 const paths=execFileSync('git',['ls-tree','-r','--name-only',sha],{encoding:'utf8'}).trim().split('\n').filter(allowedPath);
 const plan=await api('plan',{...binding,paths});
 const sources=plan.paths.map(path=>{if(!paths.includes(path)||!allowedPath(path))throw Error('invalid_source');return {path,content:execFileSync('git',['show',sha+':'+path],{encoding:'utf8',maxBuffer:1500000})};});
 const patch=await api('patch',{...binding,sources});
 if(patch.outcome!=='change'){
  await api('finish',{...binding,status:patch.outcome,reason:patch.reason});console.log('Window: '+patch.outcome);process.exit(0);
 }
 const changed=validateEdits(patch,sources);
 dir=mkdtempSync(join(tmpdir(),'window-code-'));chmodSync(dir,0o755);
 const archive=execFileSync('git',['archive',sha],{maxBuffer:100000000});execFileSync('tar',['-x','-C',dir],{input:archive});
 for(const f of changed){
  const target=join(dir,f.path);
  if(existsSync(target)&&(lstatSync(target).isSymbolicLink()||(!sources.some(s=>s.path===f.path))))throw Error('unsafe_file_target');
  writeFileSync(target,f.content);
 }
 // No credentials, no host sockets, no network, read-only source, nonroot user.
 const run=spawnSync('docker',['run','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=2g','--cpus=2','--read-only','--user=1000:1000','--tmpfs','/tmp:rw,exec,size=768m','--mount','type=bind,source='+dir+',target=/source,readonly','--env','GITHUB_SHA='+sha,'node:24-bookworm-slim','sh','-c','cp -R /source /tmp/work && cd /tmp/work && node --test --test-reporter=tap tests/*.test.mjs && node scripts/build.mjs'],{encoding:'utf8',timeout:480000,maxBuffer:12000000});
 const testExit=run.status??-1;
 console.log('Window isolated tests/build exit: '+testExit);
 if(testExit!==0){await api('finish',{...binding,status:'failed',test_exit_code:testExit,reason:'Candidate failed isolated regression tests/build. No branch or PR was published.'});process.exitCode=1;}
 else{
  const base=await github('/git/commits/'+sha);
  const tree=await github('/git/trees',{base_tree:base.tree.sha,tree:changed.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
  const commit=await github('/git/commits',{message:'Window: prepare reviewed improvement '+job.id,tree:tree.sha,parents:[sha]});commitSha=commit.sha;
  const branch='isabella/window-'+job.id;
  await github('/git/refs',{ref:'refs/heads/'+branch,sha:commitSha});
  const pr=await github('/pulls',{title:'Window: proposed code improvement '+job.id.slice(0,8),head:branch,base:'main',draft:true,body:'Prepared by the Window code runner. The private proposal and evaluation remain in Work.\n\nValidation: Node regression suite and PWA build passed in a container without network or credentials. This is not an authenticated acceptance test; Deno and SQL integration have not been run by this preparation job.\n\nReview the diff and its intended behavior before merging. No automatic merge or deployment is configured.\n\nPreparation run: https://github.com/'+REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID});
  await api('finish',{...binding,status:'review_ready',test_exit_code:0,commit_sha:commitSha,pr_number:pr.number,reason:'Draft PR prepared; independent human review and remaining checks required.'});
  console.log('Window draft: '+pr.html_url);
 }
}catch(e){
 const reason=e instanceof Error?e.message:'runner_failed';
 console.error('Window preparation failed: '+reason);
 try{await api('finish',{...binding,status:commitSha?'blocked':'failed',commit_sha:commitSha||null,reason})}catch{console.error('Window could not record completion; lease expiry will mark the attempt failed.');}
 process.exitCode=1;
}finally{if(dir)rmSync(dir,{recursive:true,force:true});}
