import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateSelfReview,evidencePacket} from '../supabase/functions/_shared/self-review.mjs';
const finding={problem_key:'scope',title:'Scope',observation:'Observed',suspected_cause:'Hypothesis',change:'Compare scope',acceptance_test:'Paraphrases and negative cases',owner_action:'Review',change_type:'context',confidence:'low',evidence_refs:['message:1'],existing_proposal_id:null};
const report=()=>({summary:'Summary',what_worked:'Success',limitations:'Partial evidence',findings:[{...finding}]});
test('review rejects fabricated evidence, proposals and invalid categories',()=>{
 const evidence=[{ref:'message:1'}];assert.equal(validateSelfReview(report(),evidence,[]).findings.length,1);
 assert.throws(()=>validateSelfReview(report(),[],[]),/unknown_review_evidence/);
 const r=report();r.findings[0].existing_proposal_id='other-owner';assert.throws(()=>validateSelfReview(r,evidence,[]),/unknown_existing/);
 r.findings[0].existing_proposal_id=null;r.findings[0].change_type='grant_admin';assert.throws(()=>validateSelfReview(r,evidence,[]),/category/);
});
test('bounded evidence leaves room for outcome receipts and exposes truncation/errors',()=>{
 const packet=evidencePacket([{kind:'message',rows:[{id:'1',content:'x'.repeat(600)}],count:1},{kind:'receipt',rows:[{id:'2',ok:true}],count:1},{kind:'run',error:'query failed'}],900);
 assert.equal(packet.coverage.message.complete,false);assert.equal(packet.coverage.receipt.complete,true);
 assert.equal(packet.coverage.run.status,'unavailable');assert.equal(packet.evidence[0].ref,'receipt:2');
});
test('Window UI loads dynamic projects, renders escaped evidence and reports read failure honestly',async()=>{
 const nodes=new Map();const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',classList:{toggle(){}},addEventListener(){}});return nodes.get(s)};
 let fail=false;const calls=[];
 const rows={isabella_projects:[{id:'p',name:'Window',client_key:'window'}],minds_self_review_settings:{enabled:true,timezone:'Europe/Berlin',local_hour:4},minds_self_review_reports:[{id:'r',review_key:'baseline',status:'completed',window_start:'2026-01-01',window_end:'2026-01-02',report:{summary:'<script>bad()</script>',what_worked:'Read receipt',limitations:'Partial'},coverage:{},evidence:[]}],minds_self_review_proposals:[]};
 const sb={auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:t=>{calls.push(t);let single=false;const q={then:(a,b)=>Promise.resolve({data:single&&Array.isArray(rows[t])?rows[t][0]:rows[t],count:Array.isArray(rows[t])?rows[t].length:1,error:fail&&t==='minds_self_review_reports'?{message:'offline'}:null}).then(a,b)};for(const m of ['select','eq','order','limit'])q[m]=()=>q;q.maybeSingle=()=>{single=true;return q};return q}};
 const c=vm.createContext({window:{MINDS_SUPABASE:sb},document:{querySelector:node,querySelectorAll:()=>[],body:{dataset:{section:'work'}}},localStorage:{getItem:()=>null,setItem(){}},console:{error(){}},Date,Map,Set,setTimeout,clearTimeout});
 vm.runInContext(readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8'),c);
 await c.window.MINDS_WORK.render();
 assert.match(node('.work-project-switch').innerHTML,/Window/);assert.match(node('#workBody').innerHTML,/Revisión inicial/);
 assert.match(node('#workBody').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(node('#workBody').innerHTML,/<script>/);
 fail=true;await c.window.MINDS_WORK.render();assert.match(node('#workBody').innerHTML,/No pude abrir Work/);
});
