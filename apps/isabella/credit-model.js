/* MINDS · OpenAI credit estimate (browser copy).
   The block between the markers is byte-identical to supabase/functions/_shared/credit-model.mjs;
   tests/minds-credit.test.mjs enforces it. */
(function(root){
'use strict';
/* credit-model:begin */
// OpenAI list prices, USD per 1M tokens (standard tier). Update when OpenAI changes them.
const PRICES_AS_OF='2026-10-31';
const PRICE_TABLE=[
  {id:'gpt-5.6-luna',input:0.20,cached:0.02,output:1.20},
  {id:'gpt-5.6-terra',input:2,cached:0.20,output:12},
  {id:'gpt-5.6-sol',input:4,cached:0.40,output:20},
  {id:'gpt-6-astra',input:10,cached:1,output:50},
  {id:'text-embedding-3-small',input:0.02,cached:0.02,output:0}
];
// Above this many input tokens OpenAI bills the whole request at 2x input and 1.5x output.
const LONG_CONTEXT_INPUT=272000;
function priceFor(model){
  const m=String(model||'').trim().toLowerCase();
  if(!m)return null;
  if(m.startsWith('gpt-5.6-luna'))return PRICE_TABLE[0];
  if(m.startsWith('gpt-5.6-terra'))return PRICE_TABLE[1];
  // The bare gpt-5.6 alias routes to Sol.
  if(m==='gpt-5.6'||m.startsWith('gpt-5.6-sol')||/^gpt-5\.6-\d{4}/.test(m))return PRICE_TABLE[2];
  if(m.startsWith('gpt-6-astra'))return PRICE_TABLE[3];
  if(m.startsWith('text-embedding-3-small'))return PRICE_TABLE[4];
  return null;
}
function tokensOf(row){
  let input=Math.max(0,Number(row&&row.input_tokens)||0);
  const output=Math.max(0,Number(row&&row.output_tokens)||0);
  // Embedding usage only reports a total.
  if(!input&&!output)input=Math.max(0,Number(row&&row.total_tokens)||0);
  const cached=Math.min(input,Math.max(0,Number(row&&row.cached_input_tokens)||0));
  return {input,cached,output};
}
function costOf(row){
  const p=priceFor(row&&row.model);
  if(!p)return null;
  const t=tokensOf(row),long=p.output>0&&t.input>LONG_CONTEXT_INPUT,inMul=long?2:1,outMul=long?1.5:1;
  return ((t.input-t.cached)*p.input*inMul+t.cached*p.cached*inMul+t.output*p.output*outMul)/1e6;
}
function dayKey(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timeZone||'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=t=>(parts.find(x=>x.type===t)||{}).value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
// Window daily reviews recorded their usage in the report before they wrote to minds_ai_usage.
function reviewRows(reports,usageRows){
  const logged=new Set((usageRows||[]).map(r=>r&&r.metadata&&r.metadata.report_id).filter(Boolean).map(String));
  const out=[];
  for(const r of reports||[]){
    const m=r&&r.coverage&&r.coverage.model;
    if(!m||!m.usage||logged.has(String(r.id)))continue;
    const u=m.usage,input=Number(u.input_tokens)||0,output=Number(u.output_tokens)||0;
    out.push({feature:'window_review',model:String(m.model||''),input_tokens:input,
      cached_input_tokens:Number(u.input_tokens_details&&u.input_tokens_details.cached_tokens)||0,
      output_tokens:output,total_tokens:Number(u.total_tokens)||input+output,
      created_at:r.completed_at||r.created_at,metadata:{report_id:r.id}});
  }
  return out;
}
function readBalance(value){
  const v=value||{},amount=Number(v.balance_usd),at=new Date(v.balance_at);
  if(!isFinite(amount)||amount<0||isNaN(at.getTime()))return null;
  return {amount,at};
}
function summarize(rows,opts){
  const o=opts||{},now=o.now?new Date(o.now):new Date(),tz=o.timeZone||'Europe/Berlin';
  const balance=readBalance(o.credit),windowDays=Number(o.windowDays)||7,lowDays=Number(o.credit&&o.credit.low_days)||7;
  const since=new Date(now.getTime()-windowDays*864e5);
  let windowUsd=0,spentSince=0,unpricedCalls=0;
  const byDay={},byFeature={},unpricedModels={};
  for(const r of rows||[]){
    const at=new Date(r&&r.created_at);
    if(isNaN(at.getTime())||at>now)continue;
    const usd=costOf(r),feature=String(r.feature||'otro'),day=dayKey(at,tz);
    const d=byDay[day]||(byDay[day]={usd:0,calls:0,unpriced:0,features:{}});
    d.calls++;
    if(usd===null){d.unpriced++;unpricedCalls++;unpricedModels[String(r.model||'?')]=true;continue}
    d.usd+=usd;d.features[feature]=(d.features[feature]||0)+usd;
    if(at>=since){
      windowUsd+=usd;
      const f=byFeature[feature]||(byFeature[feature]={usd:0,calls:0,tokens:0});
      const t=tokensOf(r);f.usd+=usd;f.calls++;f.tokens+=t.input+t.output;
    }
    if(balance&&at>=balance.at)spentSince+=usd;
  }
  const burnPerDay=windowUsd/windowDays;
  const remaining=balance?balance.amount-spentSince:null;
  const daysLeft=remaining===null?null:burnPerDay>0?Math.max(0,remaining)/burnPerDay:Infinity;
  let level='unset';
  if(balance){
    if(remaining<=0)level='empty';
    else if(remaining<1||daysLeft<2)level='critical';
    else if(remaining<3||daysLeft<lowDays)level='low';
    else level='ok';
  }
  return {level,balance:balance?{amount:balance.amount,at:balance.at.toISOString()}:null,spentSince,remaining,
    burnPerDay,daysLeft,windowUsd,windowDays,byDay,byFeature,unpricedCalls,unpricedModels:Object.keys(unpricedModels),pricesAsOf:PRICES_AS_OF};
}
function money(n){return '$'+(Math.round((Number(n)||0)*100)/100).toFixed(2)}
function daysText(n){
  if(n===Infinity||n===null)return '';
  const d=Math.max(1,Math.floor(n));
  return d===1?'1 día':d+' días';
}
// One plain sentence Isabella can say. Empty when nothing needs saying.
function alertSentence(s){
  if(!s)return '';
  if(s.level==='empty')return 'Según mi estimación, tu saldo de OpenAI ya se agotó o está a punto. Si dejo de responder, recárgalo en platform.openai.com → Billing y actualiza el saldo en Uso IA.';
  if(s.level==='critical')return 'Tu saldo de OpenAI está casi agotado: quedan unos '+money(s.remaining)+(s.daysLeft!==Infinity?' (≈'+daysText(s.daysLeft)+' al ritmo actual)':'')+'. Recárgalo en platform.openai.com → Billing para que pueda seguir respondiéndote.';
  if(s.level==='low')return 'Tu saldo de OpenAI va bajando: quedan unos '+money(s.remaining)+' y, al ritmo de los últimos '+s.windowDays+' días (~'+money(s.burnPerDay)+'/día), alcanza para unos '+daysText(s.daysLeft)+'. Puedes recargarlo en platform.openai.com → Billing.';
  return '';
}
const CREDIT_MODEL={PRICES_AS_OF,PRICE_TABLE,LONG_CONTEXT_INPUT,priceFor,costOf,dayKey,reviewRows,readBalance,summarize,money,daysText,alertSentence};
/* credit-model:end */
if(typeof module==='object'&&module.exports)module.exports=CREDIT_MODEL;
root.MINDS_CREDIT_MODEL=CREDIT_MODEL;
})(typeof self!=='undefined'?self:globalThis);
