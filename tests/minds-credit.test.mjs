import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const M=require('../apps/isabella/credit-model.js');
const block=s=>s.slice(s.indexOf('/* credit-model:begin */'),s.indexOf('/* credit-model:end */'));

test('Browser and server credit models are the same code',()=>{
  const client=block(read('apps/isabella/credit-model.js')),server=block(read('supabase/functions/_shared/credit-model.mjs'));
  assert.ok(client.length>2000);
  assert.equal(client,server);
});

test('Cost follows OpenAI list prices, cache discounts and the long-context rule',()=>{
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);
  near(M.costOf({model:'gpt-5.6-luna',input_tokens:2e5,output_tokens:0}),0.04);
  near(M.costOf({model:'gpt-5.6-luna',input_tokens:2e5,cached_input_tokens:2e5,output_tokens:1e5}),0.004+0.12);
  near(M.costOf({model:'gpt-5.6',input_tokens:1e5,output_tokens:1e4}),0.4+0.2);
  near(M.costOf({model:'gpt-5.6-sol-2026-09-03',input_tokens:3e5,output_tokens:0}),0.3*4*2);
  near(M.costOf({model:'gpt-6-astra',input_tokens:0,output_tokens:1e6}),50);
  near(M.costOf({model:'text-embedding-3-small',input_tokens:0,output_tokens:0,total_tokens:1e6}),0.02);
  assert.equal(M.costOf({model:'gpt-image-2.5-flare',input_tokens:10}),null);
});

test('Estimated balance, burn rate and alert levels',()=>{
  const now=new Date('2026-11-08T09:00:00Z');
  const day=n=>new Date(now.getTime()-n*864e5).toISOString();
  // $1 per day for the last 7 days (gpt-6-astra, 100k uncached input tokens = $1).
  const rows=[1,2,3,4,5,6,7].map(n=>({feature:'isabella_chat',model:'gpt-6-astra',input_tokens:1e5,output_tokens:0,created_at:day(n-0.5)}));
  const credit=amount=>({balance_usd:amount,balance_at:day(3)});
  const s=M.summarize(rows,{now,credit:credit(20)});
  assert.equal(Math.round(s.burnPerDay*100)/100,1);
  assert.equal(Math.round(s.spentSince*100)/100,3);
  assert.equal(s.level,'ok');
  assert.equal(M.summarize(rows,{now,credit:credit(8)}).level,'low');
  assert.equal(M.summarize(rows,{now,credit:credit(4)}).level,'critical');
  assert.equal(M.summarize(rows,{now,credit:credit(2)}).level,'empty');
  assert.equal(M.summarize(rows,{now,credit:null}).level,'unset');
  assert.match(M.alertSentence(M.summarize(rows,{now,credit:credit(8)})),/quedan unos \$5\.00[\s\S]*unos 5 días[\s\S]*Billing/);
  assert.equal(M.alertSentence(s),'');
  assert.equal(Object.values(s.byDay).reduce((a,d)=>a+d.calls,0),7);
});

test('Window reviews that predate usage logging are counted once',()=>{
  const reports=[
    {id:'r1',created_at:'2026-10-30T16:00:00Z',completed_at:'2026-10-30T16:02:00Z',coverage:{model:{model:'gpt-5.6-sol-2026-09-03',usage:{input_tokens:100000,output_tokens:6000}}}},
    {id:'r2',created_at:'2026-10-31T03:00:00Z',coverage:{model:{model:'gpt-5.6-sol',usage:{input_tokens:1000,output_tokens:10}}}},
    {id:'r3',created_at:'2026-10-31T03:00:00Z',coverage:{}}
  ];
  const rows=M.reviewRows(reports,[{feature:'window_review',metadata:{report_id:'r2'}}]);
  assert.deepEqual(rows.map(r=>r.metadata.report_id),['r1']);
  assert.equal(rows[0].feature,'window_review');
  assert.ok(Math.abs(M.costOf(rows[0])-(0.4+0.12))<1e-9);
});

test('Every Window model call now lands in the usage log',()=>{
  const review=read('supabase/functions/isabella-self-review/index.ts');
  const code=read('supabase/functions/isabella-code-preparation/index.ts');
  assert.match(review,/from\("minds_ai_usage"\)\.insert\(\{user_id:job\.user_id,feature:"window_review"/);
  assert.match(review,/metadata:\{report_id:job\.id/);
  assert.match(code,/feature:'window_code'/);
  assert.match(code,/if\(record\)await record\(payload\);/);
  assert.equal((code.match(/p=>recordUsage\(sb,job,/g)||[]).length,2,'plan and patch/repair are both metered');
});

test('Routines say it once a day when credit runs low, and say it plainly when it is gone',()=>{
  const runner=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(runner,/import CREDIT from "\.\.\/_shared\/credit-model\.mjs";/);
  assert.match(runner,/status!\.credit\.last_alert_date===today\)return message;/);
  assert.match(runner,/message=await withCreditNotice\(sb,routine\.user_id,tz,today,message\);/);
  assert.match(runner,/la cuenta de OpenAI que uso se quedó sin créditos/);
  assert.match(runner,/response\.status===429&&\/credit\|quota\|billing\/i/);
});

test('Uso IA shows the estimate and Ahora flags a low balance',async()=>{
  const html=read('apps/isabella/index.html'),sw=read('apps/isabella/sw.js'),app=read('apps/isabella/app.js');
  assert.match(html,/dashboard-model\.js\?v=5"><\/script>\s*<script src="\.\/credit-model\.js\?v=1"><\/script>\s*<script src="\.\/credit\.js\?v=1"><\/script>/);
  assert.match(sw,/'\.\/credit-model\.js\?v=1',\s*'\.\/credit\.js\?v=1'/);
  assert.match(app,/if\(window\.MINDS_CREDIT\?\.panel\)return window\.MINDS_CREDIT\.panel\(modal\);/);
  assert.match(app,/openAiUsage:\(\)=>void aiUsagePanel\(\),/);
  // Ahora renders the credit row only when the estimate needs attention.
  const source=read('apps/isabella/situation.js');
  const node={innerHTML:'',querySelector(){return {addEventListener(){}}}};
  const q=()=>{const o={};for(const m of ['select','eq','is','not','in','order','limit','lte'])o[m]=()=>o;o.then=(r,j)=>Promise.resolve({data:[],count:0,error:null}).then(r,j);return o};
  const make=level=>{const window={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:q},MINDS_CREDIT_MODEL:M,
    MINDS_CREDIT:{status:async()=>({level,remaining:2.4,daysLeft:3.2,burnPerDay:0.75,windowDays:7})}};
    vm.runInNewContext(source,{window,document:{querySelector:s=>s==='#situationLedger'?node:null},Promise,Date,console});return window};
  await make('low').MINDS_SITUATION.render();
  assert.match(node.innerHTML,/Saldo de IA[\s\S]*Saldo de OpenAI bajo[\s\S]*≈ \$2\.40 · unos 3 días al ritmo actual/);
  await make('ok').MINDS_SITUATION.render();
  assert.doesNotMatch(node.innerHTML,/Saldo de IA/);
});
