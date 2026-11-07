/* Isabella Live → canonical MINDS reply admission.
 * No model, network, memory or action authority in this module.
 * Spoken facts require the server's typed turn outcome and validated receipts.
 */
(function(root){
  'use strict';
  function textForVoice(value){
    return String(value||'').replace(/`{3}[\s\S]*?`{3}/g,'')
      .replace(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g,m=>m.slice(1,m.indexOf(']')))
      .replace(/https?:\/\/\S+/g,'')
      .replace(/\*\*|__|[>#]/g,'')
      .replace(/\s+/g,' ').trim().slice(0,1200);
  }
  function admission(result,validator,summary){
    if(!result||typeof result!=='object'||result.error||result.incomplete||result.fallback)
      return {ok:false,reason:'incomplete_or_failed'};
    if(typeof validator!=='function')return {ok:false,reason:'missing_integrity_contract'};
    const check=validator(result);
    if(!check?.ok||!check.typed)return {ok:false,reason:check?.reason||'untyped_outcome'};
    const reply=String(result.reply||'').trim();
    if(!reply)return {ok:false,reason:'empty_canonical_reply'};
    let spoken='';
    switch(check.outcome){
      case 'answered':
        spoken=textForVoice(reply);break;
      case 'needs_clarification':
        spoken=textForVoice(reply);break;
      case 'proposal_created':
        spoken='He preparado una propuesta, pero necesita tu revisión en el chat de Isabella. No he aplicado ningún cambio.';break;
      case 'action_applied':
        if(!(check.applied_count>0))return {ok:false,reason:'missing_action_receipts'};
        spoken=typeof summary==='function'?textForVoice(summary(check)):'';
        if(!spoken)return {ok:false,reason:'missing_verified_action_summary'};
        break;
      case 'failed':
        spoken='MINDS no ha confirmado ningún cambio. Revisa el resultado en el chat de Isabella.';break;
      default:return {ok:false,reason:'unknown_canonical_outcome'};
    }
    if(!spoken)return {ok:false,reason:'empty_speech'};
    return {ok:true,outcome:check.outcome,reply,spoken,
      hasReview:check.outcome==='proposal_created',hasSources:Array.isArray(result.sources)&&result.sources.length>0};
  }
  root.ISABELLA_LIVE_CANONICAL=Object.freeze({admission,textForVoice});
})(typeof window!=='undefined'?window:globalThis);
