/* UI boundary: model prose is not an action receipt.
 * Keep this browser/Node compatible; server owns authority and proposals.
 */
(function(root){
  'use strict';
  function validate(result){
    if(!result||typeof result!=='object')return {ok:false,reason:'missing_result',proposals:[]};
    const hasSingle=result.proposal!=null;
    const hasMany=Array.isArray(result.proposals)&&result.proposals.length>0;
    if(hasSingle&&hasMany)return {ok:false,reason:'ambiguous_proposal_shape',proposals:[]};
    const proposals=hasSingle?[result.proposal]:hasMany?result.proposals:[];
    if(proposals.length>12)return {ok:false,reason:'too_many_proposals',proposals:[]};
    const keys=new Set();
    for(const p of proposals){
      if(!p||typeof p!=='object'||typeof p.request_id!=='string'||
         !p.request_id.trim()||p.request_id.length>200||keys.has(p.request_id))
        return {ok:false,reason:'missing_or_duplicate_proposal_receipt',proposals:[]};
      keys.add(p.request_id);
    }
    const outcome=result.outcome;
    if(outcome!=null){
      if(typeof outcome!=='object'||typeof outcome.outcome!=='string')
        return {ok:false,reason:'malformed_outcome',proposals:[]};
      const name=outcome.outcome;
      if(!['answered','proposal_created','action_applied','failed','needs_clarification'].includes(name))
        return {ok:false,reason:'unknown_outcome',proposals:[]};
      if(!Number.isSafeInteger(outcome.proposal_count)||outcome.proposal_count!==proposals.length)
        return {ok:false,reason:'proposal_count_mismatch',proposals:[]};
      if(name==='needs_clarification'){
        const p=result.pending_clarification;
        if(proposals.length||!p||p.version!==1||typeof p.source_turn_id!=='string'||
          typeof p.receipt_id!=='string'||!p.question||
          String(p.question).trim()!==String(result.reply||'').trim())
          return {ok:false,reason:'missing_or_mismatched_clarification_receipt',proposals:[]};
      }
      if(name==='proposal_created'&&proposals.length===0)
        return {ok:false,reason:'missing_review_candidate',proposals:[]};
      if(name!=='proposal_created'&&proposals.length>0)
        return {ok:false,reason:'unexpected_review_candidate',proposals:[]};
      if(name==='action_applied'&&(!Number.isSafeInteger(outcome.applied_count)||
          outcome.applied_count<1||
          !(result.autonomy_execution?.id||
            (Array.isArray(result.action_receipts)&&
              result.action_receipts.some(r=>r&&typeof r.receipt_id==='string'&&r.receipt_id)))))
        return {ok:false,reason:'missing_execution_receipt',proposals:[]};
    }
    // Older fast-action and contextual paths supply a canonical request_id
    // but no outcome field. Permit review, never infer action_applied.
    return {ok:true,proposals,typed:outcome!=null,
      outcome:outcome?.outcome||(proposals.length?'proposal_created':'answered')};
  }
  function summary(check){
    if(!check?.ok)return 'No pude verificar el resultado de esta operación. No he confirmado ningún cambio.';
    if(!check.proposals?.length)return null;
    const p=check.proposals[0],n=check.proposals.length;
    if(n!==1)return 'He preparado '+n+' propuestas para tu revisión. Ninguna se ha aplicado todavía.';
    const title=String(p.target_title||p.title||'').trim().slice(0,180);
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||''))?String(p.date):'';
    const item=p.kind==='task'?'la tarea':p.kind==='event'?'el evento':'el cambio';
    return 'He preparado la revisión de '+item+(title?' «'+title+'»':'')+
      (date?' para '+date:'')+'. Aún falta tu confirmación.';
  }
  root.MINDS_TURN_INTEGRITY={validate,summary};
})(typeof window!=='undefined'?window:globalThis);
