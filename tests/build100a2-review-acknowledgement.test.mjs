import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=file('apps/isabella/app.js'),sw=file('apps/isabella/sw.js'),html=file('apps/isabella/index.html');
const between=(a,b)=>{const x=app.indexOf(a),y=app.indexOf(b,x+1);assert.ok(x>=0&&y>x);return app.slice(x,y)};
const renderText=vm.runInNewContext(between('function resolvedReviewText(m){','function renderMessages(forceBottom=false){')+';resolvedReviewText');
const req='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pending=()=>({role:'assistant',text:'Aún falta tu confirmación.',metadata:{review_proposals:[{kind:'task',action:'update',date:'2026-10-27',request_id:req}]}});
test('rendered outcome overrides old model response without creating an unsupported success',()=>{
 const m=pending();assert.equal(renderText(m),null);
 m.metadata.review_state='applied_verified';
 assert.equal(renderText(m),'Cambio confirmado y verificado en Supabase · 2026-10-27.');
 m.metadata.review_state='rejected';assert.match(renderText(m),/cancelada/);
 assert.match(app,/resolvedReviewText\(m\)\?\?cleanGeneratedDeliverableText/);
 assert.match(html,/app\.js\?v=131/);assert.match(sw,/isabella-shell-v170/);
 assert.match(sw,/app\.js\?v=131/);
});
const recovery=between('let reviewReceiptRecoveryBusy=false;','function finalizeInlineReview(proposals,status){');
const make=(status='accepted',date='2026-10-27')=>{
 const m=pending(),count={save:0,render:0,rpc:0};
 const after={title:'Verificada',date:'2026-10-27',updated_at:'2026-10-23T21:03:47Z'};
 const rows={minds_calendar_action_receipts:[{id:'receipt',request_id:req,entity_id:'target',action:'update_task',after_state:after}],
 minds_shadow_decisions:[{request_id:req,status}],isabella_tasks:[{id:'target',title:'Verificada',due_date:date,updated_at:after.updated_at}]};
 const ctx={state:{messages:[m]},window:{MINDS_SUPABASE:{
 auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}},error:null})},
 from:table=>{const q={select(){return q},eq(){return q},in(){return q},then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)}};return q},
 rpc(){count.rpc++;throw Error('Recovery cannot execute RPC')}
 }},save:()=>count.save++,renderMessages:()=>count.render++,Date,Promise,Set,Map};
 vm.runInNewContext(recovery+';this.run=recoverReviewedTaskReceipts;',ctx);
 return {ctx,m,count};
};
test('owner receipt + accepted decision + matching canonical row restores acknowledgement without RPC',async()=>{
 const {ctx,m,count}=make();
 assert.equal(await ctx.run(),true);assert.equal(m.metadata.review_state,'applied_verified');
 assert.equal(m.metadata.review_receipt_id,'receipt');
 assert.deepEqual(count,{save:1,render:1,rpc:0});
 assert.equal(await ctx.run(),false);assert.equal(count.save,1);
});
test('pending decision or stale canonical date fails closed',async()=>{
 for(const [status,date] of [['pending','2026-10-27'],['accepted','2026-10-25']]){
  const {ctx,m,count}=make(status,date);
  assert.equal(await ctx.run(),false);
  assert.equal(m.metadata.review_state,undefined);
  assert.deepEqual(count,{save:0,render:0,rpc:0});
 }
});
