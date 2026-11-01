/* Build 99A · Proposal → preview → explicit user approval → verified calendar insert.
 * Supabase is authoritative; not an automatic teammate calendar or a worked-time log. */
(()=>{
'use strict';
const M=window.MINDS_TIME_PLAN_MODEL,sb=window.MINDS_SUPABASE;
const $=s=>document.querySelector(s);
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uid=()=>window.crypto?.randomUUID?.()||'plan-'+Date.now()+'-'+Math.random().toString(36).slice(2);
let generation=0,submitting=false;
const msg=(value,bad=false)=>{const el=$('#mindsTimePlanStatus');if(el){el.textContent=value;el.dataset.error=bad?'true':'false'}};
const reasonText={
  invalid_hours:'La franja horaria debe tener al menos 30 minutos.',
  invalid_limits:'Revisa los límites por sesión y por día (múltiplos de 15 minutos).',
  missing_deadline:'Esta tarea necesita una fecha de entrega para planificarla.',
  missing_estimate:'Añade primero una estimación de esfuerzo a la tarea.',
  invalid_today:'La fecha actual no es válida.',
  inconsistent_dates:'El inicio es posterior a la entrega. Corrige las fechas.',
  overdue:'El plazo ya ha vencido. Cambia la entrega antes de reservar sesiones.',
  horizon_too_long:'El horizonte supera 90 días. Acota la ventana en la ficha.',
  already_reserved:'La estimación ya está cubierta por sesiones reservadas.',
  partial:'No cabe todo el esfuerzo en los huecos mostrados.',
  ready:'Estos huecos evitan los eventos ya registrados en tu calendario.'
};
async function readSnapshot(taskId){
  const auth=await sb.auth.getSession();
  if(!auth.data?.session?.user)throw new Error('Se necesita una sesión autenticada.');
  const [{data:task,error:te},{data:events,error:ee,count}]=await Promise.all([
    sb.from('isabella_tasks').select('*').eq('id',taskId).maybeSingle(),
    sb.from('isabella_events')
      .select('client_key,title,starts_at,ends_at,all_day,metadata,recurrence',{count:'exact'})
      .order('starts_at',{ascending:false}).limit(2000)
  ]);
  if(te||ee)throw te||ee;
  if(!task||task.archived_at||task.completed_at)throw new Error('La tarea ya no está disponible como pendiente.');
  if(count>2000)throw new Error('Hay demasiados eventos para comprobar la agenda completa.');
  if((events||[]).some(e=>!M.rangeMs(e)))
    throw new Error('Hay un evento con un intervalo inválido. Revisa Tiempo antes de planificar.');
  const today=M.dateKey(new Date()),limit=M.addDays(today,90);
  const until=M.validDate(task.due_date)&&task.due_date<limit?task.due_date:limit;
  const expanded=M.expandRecurrence(events||[],today,until);
  if(expanded.unsupported)throw new Error(
    'Hay una recurrencia que no podemos expandir con seguridad. Revisa esa agenda antes de proponer.');
  return {task,events:expanded.events};
}
function formSettings(){
  return {from:$('#mindsPlanFrom')?.value,until:$('#mindsPlanUntil')?.value,
    block:Number($('#mindsPlanBlock')?.value),dailyCap:Number($('#mindsPlanCap')?.value),
    skipWeekends:!!$('#mindsPlanWeekends')?.checked};
}
const formatMin=n=>Math.floor(n/60)+' h '+String(n%60).padStart(2,'0')+' min';
function render(ctx){
  if(ctx.ticket!==generation)return;
  const initial=M.defaults(),t=ctx.snapshot.task;
  window.ISABELLA_APP?.openModal?.('Isabella · Planificar tiempo',
    '<div class="minds-time-plan"><div class="minds-time-plan-heading"><strong>'+E(t.title)+'</strong>'+
    '<p>Propuesta para <b>tu calendario personal</b>, no para el calendario del responsable de la tarea. Nada se reservará hasta que lo apruebes.</p></div>'+
    '<div class="minds-time-plan-inputs">'+
    '<label>Desde<input type="time" id="mindsPlanFrom" value="'+initial.from+'"></label>'+
    '<label>Hasta<input type="time" id="mindsPlanUntil" value="'+initial.until+'"></label>'+
    '<label>Máximo por sesión (min)<input type="number" id="mindsPlanBlock" min="15" max="180" step="15" value="'+initial.block+'"></label>'+
    '<label>Máximo por día (min)<input type="number" id="mindsPlanCap" min="15" max="720" step="15" value="'+initial.dailyCap+'"></label></div>'+
    '<label class="minds-time-plan-weekends"><input type="checkbox" id="mindsPlanWeekends" checked> Evitar fines de semana</label>'+
    '<div id="mindsTimePlanOverview"></div>'+
    '<div id="mindsTimePlanStatus" aria-live="polite"></div>'+
    '<div class="minds-time-plan-actions"><button type="button" id="mindsTimePlanConfirm" disabled>Reservar sesiones propuestas</button>'+
    '<button type="button" id="mindsTimePlanBack">Volver a la tarea</button></div></div>'
  );
  for(const id of ['mindsPlanFrom','mindsPlanUntil','mindsPlanBlock','mindsPlanCap','mindsPlanWeekends']){
    const el=$('#'+id);if(el)el.addEventListener('change',()=>preview(ctx));
  }
  $('#mindsTimePlanBack').onclick=()=>void window.MINDS_TASK_DETAIL?.open({taskId:ctx.taskId});
  $('#mindsTimePlanConfirm').onclick=()=>void commit(ctx);
  preview(ctx);
}
function preview(ctx){
  if(ctx.ticket!==generation)return;
  const settings=formSettings(),today=M.validDate(ctx.today)?ctx.today:null;
  const result=M.suggest({task:ctx.snapshot.task,events:ctx.snapshot.events,
    settings,today:today||undefined,now:new Date()});
  ctx.proposal=result;ctx.settings=settings;
  const slots=(result.slots||[]).map(slot=>
    '<div class="minds-time-plan-slot"><time>'+E(slot.date)+' · '+E(slot.start)+'</time>'+
    '<strong>'+E(formatMin(slot.duration))+'</strong></div>').join('');
  const summary=(result.estimatedMinutes?
    '<p>Estimación total: '+E(formatMin(result.estimatedMinutes))+
    ' · ya reservado: '+E(formatMin(result.alreadyReservedMinutes||0))+'</p>':'')+
    (result.plannedMinutes?'<p>Propuesta: '+result.slots.length+' sesiones · '+E(formatMin(result.plannedMinutes))+'</p>':'')+
    (result.unplannedMinutes?'<p class="is-warning">No cabe: '+E(formatMin(result.unplannedMinutes))+'</p>':'');
  $('#mindsTimePlanOverview').innerHTML='<p>'+E(reasonText[result.reason]||result.reason)+'</p>'+summary+
    '<div class="minds-time-plan-slots">'+slots+'</div>';
  $('#mindsTimePlanConfirm').disabled=!result.slots?.length||submitting;
  $('#mindsTimePlanConfirm').textContent='Reservar '+(result.slots?.length||0)+' sesiones (confirmar)';
  msg('Puedes cambiar la franja y revisar los bloques antes de confirmar.');
}
async function open({taskId}={}){
  const ticket=++generation;
  if(!taskId||!M||!sb)return;
  submitting=false;
  window.ISABELLA_APP?.openModal?.('Isabella · Planificar tiempo','<p class="minds-time-plan-loading">Comprobando compromisos y plazos…</p>');
  try{
    // First flush any pending changes made in the canonical task editor.
    const ok=await window.ISABELLA_SYNC_NOW?.();
    if(ok!==true)throw new Error('No se pudo confirmar la sincronización de MINDS. Inténtalo de nuevo.');
    const snapshot=await readSnapshot(taskId);
    if(ticket!==generation)return;
    render({ticket,taskId,snapshot});
  }catch(error){if(ticket===generation)window.ISABELLA_APP?.openModal?.('No se pudo planificar',
    '<div class="minds-time-plan-error">'+E(error?.message||error)+'</div>')}
}
async function commit(ctx){
  if(submitting||ctx.ticket!==generation||!ctx.proposal?.slots?.length)return;
  const slots=ctx.proposal.slots,settings=ctx.settings;
  // The explicit 'Reservar N sesiones' button is the user's authorization.
  submitting=true;
  $('#mindsTimePlanConfirm').disabled=true;
  msg('Comprobando el calendario de nuevo…');
  try{
    const flushed=await window.ISABELLA_SYNC_NOW?.();
    if(flushed!==true)throw new Error('No se pudo sincronizar la agenda antes de reservar.');
    const fresh=await readSnapshot(ctx.taskId);
    const rebuilt=M.suggest({task:fresh.task,events:fresh.events,settings,now:new Date()});
    if(fresh.task.updated_at!==ctx.snapshot.task.updated_at||
      !M.sameSlots(slots,rebuilt.slots)){
      ctx.snapshot=fresh;ctx.proposal=rebuilt;submitting=false;
      preview(ctx);
      msg('La tarea o agenda cambió. Revisa la propuesta actualizada antes de confirmar.',true);
      return;
    }
    const inserted=slots.map(slot=>({
      client_key:uid(),title:fresh.task.title,
      starts_at:new Date(slot.startsMs).toISOString(),ends_at:new Date(slot.endsMs).toISOString(),
      all_day:false,category_id:fresh.task.category_id,project_id:fresh.task.project_id,
      metadata:{kind:'task_work_session_v1',task_client_key:fresh.task.client_key,
        origin:'isabella_time_planning_v1',approval:'user_confirmed'}
    }));
    const {data,error}=await sb.from('isabella_events').insert(inserted).select('client_key');
    if(error||!data||data.length!==inserted.length)
      throw error||new Error('El servidor no confirmó todas las reservas. Comprueba Tiempo.');
    msg('Sesiones guardadas; sincronizando…');
    const synced=await window.ISABELLA_SYNC_PULL_NOW?.();
    const keys=new Set(inserted.map(x=>x.client_key));
    const seen=(window.ISABELLA_APP?.getState?.().events||[]).filter(e=>keys.has(e.id)).length;
    if(synced!==true||seen!==keys.size){
      msg('Sesiones guardadas. Recarga Tiempo para verlas; no hace falta crearlas otra vez.',true);
      return;
    }
    msg(inserted.length+' sesiones guardadas y verificadas.');
    $('#mindsTimePlanConfirm').textContent='Reservas confirmadas';
    const back=$('#mindsTimePlanBack');if(back)back.textContent='Ver tarea y sesiones';
    ctx.proposal={...ctx.proposal,slots:[]};
  }catch(error){msg('No se pudo confirmar el plan: '+(error?.message||error),true)}
  finally{submitting=false}
}
window.MINDS_TIME_PLANNING={open};
})();