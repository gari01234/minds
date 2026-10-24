import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('apps/isabella/app.js');
const sync=read('apps/isabella/sync.js');
const html=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const begin=sync.indexOf('function mergeConversationMessages(remote=[],local=[]){');
const end=sync.indexOf('\nasync function pullConversation()',begin);
assert.ok(begin>=0&&end>begin);
const ctx={};
vm.runInNewContext(sync.slice(begin,end)+'\nthis.merge=mergeConversationMessages;',ctx);
const merge=ctx.merge;
const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const receiptId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const review={kind:'task',action:'update',request_id:requestId,date:'2026-10-27'};
const msg=(status,receipt=receiptId,request=requestId)=>({
 id:'msg-1',role:'assistant',text:'Aún falta tu confirmación.',at:'2026-10-23T21:01:32Z',
 metadata:{review_proposals:[{...review,request_id:request}],
  ...(status?{review_state:status}:{}),...(receipt?{review_receipt_id:receipt}:{})}
});

test('remote pending echo cannot overwrite local receipt-backed verified acknowledgement',()=>{
 const result=merge([msg(null,null)],[msg('applied_verified')]);
 assert.equal(result.length,1);
 assert.equal(result[0].metadata.review_state,'applied_verified');
 assert.equal(result[0].metadata.review_receipt_id,receiptId);
 assert.equal(result[0].metadata.review_proposals[0].request_id,requestId);
});
test('verified status cannot leak across different request ids',()=>{
 const result=merge([msg(null,null)],[msg('applied_verified',receiptId,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc')]);
 assert.equal(result.length,1);
 assert.equal(result[0].metadata.review_state,undefined);
});
test('unverified, malformed or missing receipts never override remote state',()=>{
 for(const local of [
   msg(null,receiptId),
   msg('applied_verified',null),
   msg('applied_verified','bogus'),
   {...msg('applied_verified'),metadata:{review_state:'applied_verified',review_receipt_id:receiptId}}
 ]){
   const result=merge([msg(null,null)],[local]);
   assert.equal(result[0].metadata.review_state,undefined);
 }
});
test('remote verified result remains authoritative if local is still pending',()=>{
 const result=merge([msg('applied_verified')],[msg(null,null)]);
 assert.equal(result[0].metadata.review_state,'applied_verified');
});
test('every successful sync rechecks owner receipts without executing an action',()=>{
 assert.match(app,/window\.addEventListener\('isabella:synced',\(\)=>\{\s*\/\/[^]*?void recoverReviewedTaskReceipts\(\)/);
 assert.match(app,/async function recoverReviewedTaskReceipts\(\)/);
 const segment=app.slice(app.indexOf('async function recoverReviewedTaskReceipts(){'),
   app.indexOf('\nfunction finalizeInlineReview',app.indexOf('async function recoverReviewedTaskReceipts(){')));
 assert.doesNotMatch(segment,/\.rpc\(|applyProposal\(|applyVerifiedTaskUpdate\(/);
 assert.match(segment,/r\.action==='update_task'&&accepted\.has\(r\.request_id\)/);
 assert.match(segment,/Date\.parse\(t\.updated_at\)!==Date\.parse\(r\.after_state\.updated_at\)/);
 assert.match(html,/app\.js\?v=128/);
 assert.match(html,/sync\.js\?v=pwa39/);
 assert.match(sw,/isabella-shell-v164/);
 assert.match(sw,/app\.js\?v=128/);
 assert.match(sw,/sync\.js\?v=pwa39/);
});
