import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const root={};
runInNewContext(read("apps/isabella/turn-integrity.js"),{window:root,globalThis:root});
const {validate,summary}=root.MINDS_TURN_INTEGRITY;
const proposal={kind:"task",action:"update",title:"Besprechungsnotiz",date:"2026-10-13",
  request_id:"review-1",target_title:"Besprechungsnotiz",target_date:"2026-10-11"};
test("one canonical review receipt becomes a visible reviewable proposal",()=>{
 const x=validate({reply:"Already done!",outcome:{outcome:"proposal_created",proposal_count:1,applied_count:0},
   proposal,proposals:[]});
 assert.equal(x.ok,true);
 assert.equal(x.proposals.length,1);
 assert.match(summary(x),/Besprechungsnotiz/);
 assert.match(summary(x),/2026-10-13/);
 assert.match(summary(x),/Aún falta tu confirmación/);
 assert.doesNotMatch(summary(x),/Ya quedó agregado|Already done/i);
});
test("typeless legacy fast proposal has an explicit review candidate, never inferred execution",()=>{
 const x=validate({reply:"Listo",proposal,fast_path:true});
 assert.equal(x.ok,true);assert.equal(x.outcome,"proposal_created");
 assert.equal(x.typed,false);
});
test("receipt mismatch fails closed and never gives the UI a proposal to apply",()=>{
 for(const x of [
  {outcome:{outcome:"proposal_created",proposal_count:1,applied_count:0},proposal:null},
  {outcome:{outcome:"answered",proposal_count:1,applied_count:0},proposal},
  {outcome:{outcome:"proposal_created",proposal_count:2,applied_count:0},proposal},
  {outcome:{outcome:"action_applied",proposal_count:0,applied_count:0}},
  {outcome:{outcome:"unknown",proposal_count:0,applied_count:0}},
  {proposal:{...proposal,request_id:""}},
  {proposal,proposals:[proposal]},
  {proposals:[proposal,{...proposal,kind:"event"}]}
 ]){
  const y=validate(x);
  assert.equal(y.ok,false,JSON.stringify(x));
  assert.deepEqual(y.proposals,[]);
  assert.match(summary(y),/No pude verificar/);
 }
});
test("read-only conversation has no invented proposals",()=>{
 const x=validate({outcome:{outcome:"answered",proposal_count:0,applied_count:0},
   reply:"Hoy tienes una cita"});
 assert.equal(x.ok,true);assert.equal(x.proposals.length,0);
 assert.equal(summary(x),null);
});
test("no browser response can claim applied through a count alone",()=>{
 const x=validate({outcome:{outcome:"action_applied",proposal_count:0,applied_count:1}});
 assert.equal(x.ok,false);
});
test("full browser chat shows and persists review actions from typed result",()=>{
 const app=read("apps/isabella/app.js"),html=read("apps/isabella/index.html"),sw=read("apps/isabella/sw.js");
 assert.match(app,/MINDS_TURN_INTEGRITY\?\.validate\(result\)/);
 assert.match(app,/integrity\.proposals\.length/);
 assert.match(app,/review_proposals:integrity\.proposals/);
 assert.match(app,/data-review-message/);
 assert.match(app,/confirmProposals\(items\)/);
 assert.match(app,/finalizeInlineReview\(/);
 assert.ok(html.indexOf("turn-integrity.js?v=1")<html.indexOf("app.js?v=116"));
 assert.match(sw,/isabella-shell-v142/);
 assert.match(sw,/turn-integrity\.js\?v=1/);
});
test("receipt validation is independent of magic Spanish correction phrases",()=>{
 const file=read("apps/isabella/turn-integrity.js");
 assert.doesNotMatch(file,/corrígelo|corrige la tarea|Besprechungsnotiz/);
});
