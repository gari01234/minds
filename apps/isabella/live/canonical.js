/* Isabella Live → canonical MINDS reply admission.
 * No model, network, memory or action authority in this module.
 * Spoken facts require the server's typed turn outcome and validated receipts.
 */
(function(root){
  'use strict';
  const voiceLabel=(spanish,german)=>root.APP_PROFILE==='office'?german:spanish;
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
        spoken=voiceLabel('Te dejé la propuesta en el chat para que la confirmes.','Ich habe den Vorschlag im Romy-Chat zur Bestätigung vorbereitet.');break;
      case 'action_applied':
        if(!(check.applied_count>0))return {ok:false,reason:'missing_action_receipts'};
        spoken=typeof summary==='function'?textForVoice(summary(check)):'';
        let short='',bytes=0;
    for(const char of spoken){const size=new TextEncoder().encode(char).length;if(bytes+size>460)break;short+=char;bytes+=size}
    spoken=short;
    if(!spoken)return {ok:false,reason:'missing_verified_action_summary'};
        break;
      case 'failed':
        spoken=voiceLabel('MINDS no ha confirmado ningún cambio. Revisa el resultado en el chat de Isabella.','Romy hat keine Änderung bestätigt. Bitte das Ergebnis im Chat prüfen.');break;
      default:return {ok:false,reason:'unknown_canonical_outcome'};
    }
    let short='',bytes=0;
    for(const char of spoken){const size=new TextEncoder().encode(char).length;if(bytes+size>460)break;short+=char;bytes+=size}
    spoken=short;
    if(!spoken)return {ok:false,reason:'empty_speech'};
    return {ok:true,outcome:check.outcome,reply,spoken,
      hasReview:check.outcome==='proposal_created',hasSources:Array.isArray(result.sources)&&result.sources.length>0};
  }
  // Navigation only. The destination app revalidates ownership and pending
  // status; a voice transcript or model prose never authorizes a proposal.
  function reviewLink(result,liveLocation){
    const candidates=result?.proposal!=null?[result.proposal]:
      Array.isArray(result?.proposals)?result.proposals:[];
    if(candidates.length!==1)return null;
    const id=String(candidates[0]?.request_id||"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      return null;
    try{
      const destination=new URL("../",liveLocation);
      destination.searchParams.set("review",id);
      return destination.href;
    }catch{return null}
  }
  root.ISABELLA_LIVE_CANONICAL=Object.freeze({admission,textForVoice,reviewLink});
})(typeof window!=='undefined'?window:globalThis);
