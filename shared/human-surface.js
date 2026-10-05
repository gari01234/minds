(()=>{'use strict';

const known=(value,fallback='')=>String(value??fallback).trim();

function state(code,headline,detail='',options={}){
  return Object.freeze({
    code,
    headline,
    detail:known(detail),
    owner:options.owner||'none',
    certainty:options.certainty||'known',
    action:options.action||'none',
    tone:options.tone||'neutral',
    technical:options.technical||null
  });
}

function commitment(status){
  const s=known(status);
  if(s==='active')return state('alive','Esto sigue vivo.','Lo mantengo presente mientras siga abierto.',{owner:'isabella',tone:'active',technical:{kind:'commitment',status:s}});
  if(s==='waiting')return state('waiting','Esto sigue pendiente.','Estoy esperando que ocurra algo antes de poder avanzar.',{owner:'external',tone:'waiting',technical:{kind:'commitment',status:s}});
  if(s==='paused')return state('paused','Lo has pausado.','No lo reactivaré por mi cuenta.',{owner:'you',action:'resume',tone:'muted',technical:{kind:'commitment',status:s}});
  if(s==='completed')return state('done','Esto ya está cerrado.','No requiere seguimiento adicional.',{tone:'complete',technical:{kind:'commitment',status:s}});
  if(s==='cancelled')return state('cancelled','Ya no estoy siguiendo esto.','Se conserva el historial, pero no permanece activo.',{tone:'muted',technical:{kind:'commitment',status:s}});
  return state('unknown','No tengo un estado claro para esto.','Puedes abrir el detalle técnico para comprobarlo.',{certainty:'uncertain',action:'review',tone:'attention',technical:{kind:'commitment',status:s}});
}

function workspace(status){
  const s=known(status);
  if(s==='active')return state('working','Estoy trabajando sobre este asunto.','El progreso se conserva entre conversaciones.',{owner:'isabella',tone:'active',technical:{kind:'mission_workspace',status:s}});
  if(s==='paused')return state('paused','Este trabajo está pausado.','Conservo lo avanzado, pero no seguiré hasta que lo reanudes.',{owner:'you',action:'resume',tone:'muted',technical:{kind:'mission_workspace',status:s}});
  if(s==='completed')return state('done','Este trabajo ya terminó.','El resultado y el historial siguen disponibles.',{tone:'complete',technical:{kind:'mission_workspace',status:s}});
  return state('quiet','No estoy avanzando este trabajo ahora mismo.','El contexto sigue guardado.',{tone:'muted',technical:{kind:'mission_workspace',status:s}});
}

function mission(run={},subject=''){
  const s=known(run.status),name=known(subject);
  const suffix=name?' sobre “'+name+'”':'';
  if(s==='queued')return state('queued','Voy a trabajar en esto.','Está preparado y empezará en cuanto haya capacidad.',{owner:'isabella',tone:'active',technical:{kind:'mission_run',status:s}});
  if(s==='running')return state('working','Estoy trabajando en esto.','Puedes salir de MINDS; el trabajo continuará en el servidor.',{owner:'isabella',tone:'active',technical:{kind:'mission_run',status:s}});
  if(s==='waiting'){
    const kind=known(run.wait_kind);
    if(kind==='expectation')return state('waiting','Estoy esperando que ocurra algo antes de seguir.','No necesitas hacer nada ahora. Retomaré el trabajo cuando esa expectativa quede resuelta.',{owner:'external',tone:'waiting',technical:{kind:'mission_run',status:s,wait_kind:kind}});
    if(kind==='capability')return state('waiting','Estoy preparando una parte de este trabajo.','No necesitas hacer nada ahora. Retomaré el objetivo cuando ese trabajo material termine.',{owner:'isabella',tone:'waiting',technical:{kind:'mission_run',status:s,wait_kind:kind}});
    return state('waiting','Esto sigue en marcha.','No necesitas hacer nada ahora. Lo retomaré en el momento previsto.',{owner:'isabella',tone:'waiting',technical:{kind:'mission_run',status:s,wait_kind:kind||'time'}});
  }
  if(s==='waiting_for_user')return state('waiting_on_you','Necesito que decidas algo antes de poder seguir.',known(run.blocker_question)||'Sin esa decisión no puedo avanzar'+suffix+'.',{owner:'you',action:'decide',tone:'attention',technical:{kind:'mission_run',status:s}});
  if(s==='paused')return state('paused','Este trabajo está pausado.','Conservo lo avanzado y puedo continuar cuando tú quieras.',{owner:'you',action:'resume',tone:'muted',technical:{kind:'mission_run',status:s}});
  if(s==='completed')return state('done','He terminado este trabajo.',known(run.result_summary)||'El resultado ya está disponible.',{tone:'complete',technical:{kind:'mission_run',status:s}});
  if(s==='failed')return state('stopped','No pude terminar este trabajo.','El progreso sigue guardado. Puedes pedirme que lo revise o volver a intentarlo.',{owner:'you',action:'review',tone:'error',technical:{kind:'mission_run',status:s}});
  if(s==='cancelled')return state('cancelled','Este trabajo se canceló.','Lo avanzado sigue guardado, pero no continuaré.',{tone:'muted',technical:{kind:'mission_run',status:s}});
  return state('unknown','No tengo un estado claro para este trabajo.','Puedes abrir el detalle técnico para comprobarlo.',{certainty:'uncertain',action:'review',tone:'attention',technical:{kind:'mission_run',status:s}});
}

function autonomy(unit={}){
  const e=known(unit.eligibility);
  if(e==='eligible')return state('permission_ready','Puedo dejar de preguntarte en este caso, si tú quieres.','He visto suficiente consistencia para proponerte un permiso; solo tú puedes activarlo.',{owner:'you',action:'review',tone:'attention',technical:{kind:'contextual_permission_evidence',status:e}});
  if(e==='needs_review'){
    const post=Number(unit.outcome_corrections||0)>0;
    return state('keep_asking','Aquí todavía conviene que te pregunte.',post?'Después de actuar tuviste que corregirme en un caso de este tipo, así que volveré a pedir confirmación.':'Has corregido o rechazado propuestas de este tipo, así que no reduciré la confirmación.',{owner:'isabella',tone:'neutral',technical:{kind:'contextual_permission_evidence',status:e}});
  }
  if(e==='stale_evidence')return state('keep_asking','Seguiré preguntándote por ahora.','Lo que aprendí sobre este caso ya es antiguo y necesita evidencia reciente.',{owner:'isabella',tone:'neutral',technical:{kind:'contextual_permission_evidence',status:e}});
  if(e==='excluded')return state('always_confirm','En este tipo de acción seguiré preguntándote.','Esta versión no permite convertirla en una acción autónoma.',{owner:'isabella',tone:'muted',technical:{kind:'contextual_permission_evidence',status:e}});
  return state('learning','Todavía estoy aprendiendo cómo prefieres resolver este caso.','Hasta tener suficiente evidencia, seguiré pidiendo confirmación.',{owner:'isabella',tone:'neutral',technical:{kind:'contextual_permission_evidence',status:e||'insufficient_evidence'}});
}

function systemSummary(input={}){
  const errors=Number(input.errors||0),waiting=Number(input.waiting||0),working=Number(input.working||0),briefing=Number(input.briefing||0);
  if(errors>0)return state('needs_attention','Hay algo en MINDS que conviene revisar.',errors===1?'He detectado un problema operativo reciente.':`He detectado ${errors} problemas operativos recientes.`,{owner:'you',action:'review',tone:'error'});
  if(waiting>0)return state('waiting_on_you','Hay trabajo esperando una decisión tuya.',waiting===1?'Necesito tu respuesta para poder continuar una cosa.':`Necesito tu respuesta para poder continuar ${waiting} cosas.`,{owner:'you',action:'decide',tone:'attention'});
  if(working>0)return state('working','Estoy trabajando en segundo plano.',working===1?'Hay un trabajo activo.':`Hay ${working} trabajos activos.`,{owner:'isabella',tone:'active'});
  if(briefing>0)return state('quiet','Hay cosas pendientes, pero no necesitas hacer nada ahora.','Las guardaré para el próximo resumen.',{owner:'isabella',tone:'neutral'});
  return state('clear','Todo está funcionando con normalidad.','No necesito nada de ti ahora mismo.',{tone:'complete'});
}

function metaLabels(value={}){
  const owner={isabella:'Isabella',you:'Tú',external:'Esperando fuera',none:'Nadie'}[value.owner]||value.owner;
  const certainty={known:'Confirmado',uncertain:'Por comprobar',checking:'Comprobando'}[value.certainty]||value.certainty;
  const action={none:'No necesitas hacer nada',decide:'Necesito una decisión tuya',review:'Conviene que lo revises',resume:'Puedes reanudarlo cuando quieras'}[value.action]||value.action;
  return {owner,certainty,action};
}

window.MINDS_HUMAN_SURFACE=Object.freeze({commitment,workspace,mission,autonomy,systemSummary,metaLabels});
})();