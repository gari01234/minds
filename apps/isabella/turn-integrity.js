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
      // A claim of execution is not evidence. Only a complete one-to-one list
      // of server-origin action receipts can support action_applied.
      const applied=outcome.applied_count;
      if(!Number.isSafeInteger(applied)||applied<0)
        return {ok:false,reason:'invalid_applied_count',proposals:[]};
      if(result.action_receipts!=null&&!Array.isArray(result.action_receipts))
        return {ok:false,reason:'malformed_action_receipts',proposals:[]};
      const receipts=Array.isArray(result.action_receipts)?result.action_receipts:[];
      const receiptIds=new Set();
      for(const r of receipts){
        if(!r||typeof r!=='object'||typeof r.receipt_id!=='string'||
           !r.receipt_id.trim()||typeof r.request_id!=='string'||!r.request_id.trim()||
           receiptIds.has(r.receipt_id))
          return {ok:false,reason:'invalid_or_duplicate_action_receipt',proposals:[]};
        receiptIds.add(r.receipt_id);
      }
      if(name==='action_applied'){
        if(!applied||receipts.length!==applied)
          return {ok:false,reason:'missing_execution_receipt',proposals:[]};
      }else if(applied!==0||receipts.length){
        return {ok:false,reason:'unexpected_execution_receipt',proposals:[]};
      }
    }
    // Older fast-action and contextual paths supply a canonical request_id
    // but no outcome field. Permit review, never infer action_applied.
    return {ok:true,proposals,typed:outcome!=null,
      outcome:outcome?.outcome||(proposals.length?'proposal_created':'answered'),
      applied_count:outcome?.applied_count||0};
  }
  // Natural dates for the person, never storage formats.
  function naturalDay(day,now){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return '';
    now=now||new Date();
    const parts=String(day).split('-').map(Number),target=new Date(parts[0],parts[1]-1,parts[2]),base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const diff=Math.round((target-base)/864e5);
    if(diff===0)return 'hoy';if(diff===1)return 'mañana';if(diff===-1)return 'ayer';
    const weekday=target.toLocaleDateString('es-ES',{weekday:'long'});
    return diff>1&&diff<7?'el '+weekday:'el '+weekday+' '+parts[2]+' de '+target.toLocaleDateString('es-ES',{month:'long'});
  }
  // Office chat labels are German; Window's summary below is byte-identical to the previous implementation.
  function naturalDayOffice(day,now=new Date()){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return '';
    const [y,m,d]=String(day).split('-').map(Number),target=new Date(y,m-1,d);
    const base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const diff=Math.round((target-base)/864e5);
    if(diff===0)return 'heute';if(diff===1)return 'morgen';if(diff===-1)return 'gestern';
    return 'am '+target.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',...(y===now.getFullYear()?{}:{year:'numeric'})});
  }
  function officeSummary(check){
    if(!check?.ok)return 'Die Speicherung konnte nicht bestätigt werden; es gilt keine Änderung als erledigt.';
    if(check.outcome==='action_applied')return check.applied_count===1?'Gespeichert.':check.applied_count+' Änderungen gespeichert.';
    if(!check.proposals?.length)return null;
    const p=check.proposals[0],n=check.proposals.length;
    if(n!==1)return n+' Änderungen vorbereitet · Bestätigung ausstehend.';
    const title=String(p.target_title||p.title||'').trim().slice(0,180);
    const when=naturalDayOffice(p.date),action=String(p.action||'create');
    if(p.kind==='task'&&action==='create')return 'Vorschlag: Aufgabe «'+(title||'neue Aufgabe')+'»'+(when?' für '+when:'')+' hinzufügen · Bestätigung ausstehend.';
    if(p.kind==='event'&&action==='create')return 'Vorschlag: Termin «'+(title||'neuer Termin')+'»'+(when?' für '+when:'')+' eintragen · Bestätigung ausstehend.';
    return 'Vorschlag: '+(title?'«'+title+'»':'Eintrag')+' ändern'+(when?' für '+when:'')+' · Bestätigung ausstehend.';
  }
  // System voice, not Isabella's (Phase 1, step 3): the app reports what is pending or saved.
  function summary(check){
    if(root.APP_PROFILE==='office')return officeSummary(check);
    if(!check?.ok)return 'No se pudo comprobar que esto se guardara; no se da por hecho.';
    if(check.outcome==='action_applied')
      return check.applied_count===1?'Guardado.':'Guardados '+check.applied_count+' cambios.';
    if(!check.proposals?.length)return null;
    const p=check.proposals[0],n=check.proposals.length;
    if(n!==1)return n+' cambios preparados · pendientes de tu confirmación.';
    const title=String(p.target_title||p.title||'').trim().slice(0,180);
    const when=naturalDay(p.date);
    const action=String(p.action||'create');
    if(p.kind==='task'&&action==='create')return 'Propuesta: añadir «'+(title||'la tarea')+'»'+(when?' para '+when:'')+' · pendiente de tu confirmación.';
    if(p.kind==='event'&&action==='create')return 'Propuesta: «'+(title||'el evento')+'» en el calendario'+(when?' '+when:'')+' · pendiente de tu confirmación.';
    const item=p.kind==='task'?'la tarea':p.kind==='event'?'el evento':'el cambio';
    return 'Propuesta: cambiar '+item+(title?' «'+title+'»':'')+(when?' para '+when:'')+' · pendiente de tu confirmación.';
  }
  // Mirror of supabase/functions/_shared/system-notice.mjs (a test keeps both identical):
  // fixed app texts are rendered as system lines, also in older history.
  const SYSTEM_NOTICE_PATTERNS=[
    // Legacy wording (before step 3) — still in the history, still recognised.
    /^listo[.,]/i,/^empieza a las/i,/^próximo:/i,/^hola\. soy isabella\.?$/i,/^¿(añado|pongo) «/i,/^te preparé \d+ cambios/i,
    /^tengo listo el cambio/i,/^no pude (comprobar|guardar|verificar|identificar|registrar)/i,/^isabella sigue trabajando/i,
    /^de acuerdo, no hice ningún cambio/i,/^creación autorizada/i,/^no hubo una respuesta de texto/i,/^he preparado la /i,
    /^isabella no pudo terminar esta respuesta/i,/^la respuesta quedó interrumpida/i,
    // System wording (step 3 onward).
    /^propuesta: /i,/^\d+ cambios preparados/i,/^guardados?( \d+ cambios)?\.?$/i,/^sin cambios\.?$/i,
    /^(agregado|actualizado|eliminado|archivada|marcada como completada)\.$/i,/^no se pudo (comprobar|verificar|responder)/i,
    /^falta la hora del evento/i,/^no quedó claro qué elemento/i,/^«[^»]{1,200}» (está en tus tareas|está en tu calendario|queda para)/i,
    /^\d+ (tareas|eventos|elementos) añadid[oa]s/i,/^actualizad[oa]: «/i,
  // Office system lines; do not present them as Romy's own prose.
  /^hinweis der app:/i,/^bestätigt: /i,/^verworfen: /i,
  /^keine antwort möglich:/i,/^vorschlag: /i,/^\d+ änderungen vorbereitet/i,/^gespeichert\.?$/i,/^\d+ änderungen gespeichert/i,
  /^die speicherung konnte nicht bestätigt werden/i
  ];
  function isSystemNotice(text){
    const t=String(text||'').trim();
    return t.length>0&&t.length<400&&SYSTEM_NOTICE_PATTERNS.some(r=>r.test(t));
  }
  root.MINDS_TURN_INTEGRITY={validate,summary,isSystemNotice,SYSTEM_NOTICE_PATTERNS};
})(typeof window!=='undefined'?window:globalThis);
