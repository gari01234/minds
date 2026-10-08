-- Build 87.3 — consequence / reversibility review routing.
-- Review Economy decides what deserves review; Attention Economy decides whether that review interrupts.

create or replace view public.minds_review_routing_v1
with (security_invoker=true)
as
select
  q.*,
  case
    when q.review_class in ('authority','project_truth','behavior_rule','delegation')
      or q.consequence='high'
      or q.reversibility='low'
      then 'authority_boundary'
    when q.consequence='medium'
      then 'bounded_change'
    else 'cheap_reversible'
  end as review_lane,
  case
    when q.item_kind='shadow_decision'
      and (
        coalesce((q.metadata->'context'->>'requires_user')::boolean,false)
        or coalesce((q.metadata->'context'->>'blocking')::boolean,false)
        or coalesce(q.metadata->'context'->>'wait_kind','')='waiting_for_user'
      )
      then true
    else false
  end as dependency_blocking,
  case
    when q.review_expires_at is not null and q.review_expires_at<=now()+interval '24 hours' then true
    when q.item_kind='shadow_decision'
      and coalesce(q.metadata->'candidate'->>'date','') ~ '^\d{4}-\d{2}-\d{2}$'
      and (q.metadata->'candidate'->>'date')::date between current_date and current_date+1
      then true
    else false
  end as window_closing,
  case
    when q.item_kind='shadow_decision'
      and (
        coalesce((q.metadata->'context'->>'requires_user')::boolean,false)
        or coalesce((q.metadata->'context'->>'blocking')::boolean,false)
        or coalesce(q.metadata->'context'->>'wait_kind','')='waiting_for_user'
      )
      then 'blocking_dependency'
    when q.review_expires_at is not null and q.review_expires_at<=now()+interval '24 hours'
      then 'review_window_closing'
    when q.item_kind='shadow_decision'
      and coalesce(q.metadata->'candidate'->>'date','') ~ '^\d{4}-\d{2}-\d{2}$'
      and (q.metadata->'candidate'->>'date')::date between current_date and current_date+1
      then 'target_window_closing'
    when q.review_class in ('authority','project_truth','behavior_rule','delegation')
      or q.consequence='high'
      or q.reversibility='low'
      then 'authority_boundary_review'
    when q.consequence='medium'
      then 'bounded_review'
    else 'defer_reversible_review'
  end as routing_reason
from public.minds_review_queue_v2 q;

grant select on public.minds_review_routing_v1 to authenticated;


create or replace function public.minds_route_attention(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile jsonb:=public.minds_attention_profile(p_user);
  v_type text:=coalesce(p_candidate->>'event_type','unknown');
  v_route text:='silent'; v_base_route text:='silent';
  v_reason text:='default_silent'; v_base_reason text:='default_silent';
  v_hard boolean:=false; v_tz text:=nullif(p_candidate->>'timezone','');
  v_local_time time; v_quiet_start time; v_quiet_end time; v_quiet boolean:=false;
  v_max integer:=greatest(0,least(12,coalesce((v_profile->>'maxInterruptionsPerHour')::integer,3)));
  v_recent integer:=0;
begin
  if coalesce((p_candidate->>'requires_user')::boolean,false) then
    v_route:='interrupt';v_reason:='needs_user_input';v_hard:=true;
  elsif coalesce((p_candidate->>'user_requested')::boolean,false) then
    v_route:='interrupt';v_reason:='explicit_user_request';v_hard:=true;
  elsif coalesce((p_candidate->>'silent_requested')::boolean,false) then
    v_route:='silent';v_reason:='explicit_silence_request';
  elsif coalesce((p_candidate->>'suppress')::boolean,false) then
    v_route:='silent';v_reason:='source_suppressed';
  else
    case v_type
      when 'mission_completed' then v_route:=coalesce(nullif(v_profile->>'missionCompleted',''),'briefing');v_reason:='mission_completed';
      when 'mission_failed' then v_route:=coalesce(nullif(v_profile->>'missionFailed',''),'briefing');v_reason:='mission_failed';
      when 'mission_waiting_for_user' then v_route:='interrupt';v_reason:='needs_user_input';v_hard:=true;
      when 'upcoming_event' then v_route:=coalesce(nullif(v_profile->>'imminentEvent',''),'interrupt');v_reason:='imminent_event';
      when 'overdue_digest' then v_route:=coalesce(nullif(v_profile->>'overdueTasks',''),'ambient');v_reason:='overdue_tasks';
      when 'routine_failure' then v_route:=coalesce(nullif(v_profile->>'routineFailure',''),'briefing');v_reason:='routine_failure';
      when 'expectation_due' then v_route:='ambient';v_reason:='expectation_due';
      when 'review_required' then v_route:='briefing';v_reason:='review_required';
      when 'review_window_closing' then v_route:='ambient';v_reason:='review_window_closing';
      else v_route:='silent';v_reason:='default_silent';
    end case;
  end if;

  if v_route not in ('interrupt','briefing','ambient','silent') then v_route:='briefing'; end if;
  v_base_route:=v_route;v_base_reason:=v_reason;

  if v_route='interrupt' and not v_hard then
    if v_tz is null then
      select timezone into v_tz from public.isabella_routines where user_id=p_user and enabled order by created_at asc limit 1;
    end if;
    v_tz:=coalesce(v_tz,'Europe/Berlin');
    if coalesce((v_profile->>'quietHoursEnabled')::boolean,false) then
      begin
        v_local_time:=(now() at time zone v_tz)::time;
        v_quiet_start:=coalesce(nullif(v_profile->>'quietStart','')::time,'22:00'::time);
        v_quiet_end:=coalesce(nullif(v_profile->>'quietEnd','')::time,'07:00'::time);
        if v_quiet_start=v_quiet_end then v_quiet:=true;
        elsif v_quiet_start<v_quiet_end then v_quiet:=v_local_time>=v_quiet_start and v_local_time<v_quiet_end;
        else v_quiet:=v_local_time>=v_quiet_start or v_local_time<v_quiet_end;
        end if;
      exception when others then v_quiet:=false;
      end;
      if v_quiet then v_route:='briefing';v_reason:='quiet_hours'; end if;
    end if;
    if v_route='interrupt' then
      select count(*) into v_recent from public.minds_attention_events
      where user_id=p_user and route='interrupt' and delivered_at>=now()-interval '1 hour';
      if v_recent>=v_max then v_route:='briefing';v_reason:='interruption_budget'; end if;
    end if;
  end if;

  return jsonb_build_object(
    'route',v_route,'reason_code',v_reason,
    'reason',case v_reason
      when 'needs_user_input' then 'El trabajo está bloqueado hasta que decidas algo.'
      when 'explicit_user_request' then 'Pediste explícitamente que Isabella te avisara.'
      when 'explicit_silence_request' then 'Pediste explícitamente no recibir aviso al terminar.'
      when 'source_suppressed' then 'La fuente aún no ha alcanzado el umbral para mostrarse.'
      when 'mission_completed' then 'El trabajo terminó, pero no requiere una decisión inmediata.'
      when 'mission_failed' then 'El trabajo se detuvo y conviene incluirlo en el próximo resumen.'
      when 'imminent_event' then 'Hay un evento próximo cuyo valor depende del tiempo.'
      when 'overdue_tasks' then 'Es una señal personal/productiva útil, pero no exige interrumpir.'
      when 'routine_failure' then 'Conviene conocer el fallo, pero normalmente puede esperar al briefing.'
      when 'expectation_due' then 'Algo que esperabas alcanzó su fecha límite y todavía no está confirmado.'
      when 'review_required' then 'Hay una revisión importante pendiente, pero no bloquea el trabajo inmediato.'
      when 'review_window_closing' then 'Una revisión reversible está cerca de perder utilidad por el paso del tiempo.'
      when 'quiet_hours' then 'La señal no era bloqueante y cayó dentro de las horas silenciosas.'
      when 'interruption_budget' then 'Ya hubo suficientes interrupciones no bloqueantes durante la última hora.'
      else 'No existe una razón suficiente para ocupar tu atención ahora.'
    end,
    'base_route',v_base_route,'base_reason_code',v_base_reason,'hard_interrupt',v_hard,
    'quiet_hours_applied',v_quiet,'recent_interruptions',v_recent,
    'max_interruptions_per_hour',v_max,'policy_version','attention_v1'
  );
end $$;


create or replace function public.minds_review_attention_decision(
  p_item_kind text,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  q public.minds_review_routing_v1%rowtype;
  v_candidate jsonb;
  v_attention jsonb;
  v_event_type text;
  v_silent boolean:=false;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into q
  from public.minds_review_routing_v1 r
  where r.user_id=v_uid and r.item_kind=p_item_kind and r.item_id=p_item_id
  limit 1;

  if not found then return jsonb_build_object('status','missing'); end if;

  v_event_type:=case when q.window_closing then 'review_window_closing' else 'review_required' end;
  v_silent:=q.review_lane='cheap_reversible' and not q.window_closing and not q.dependency_blocking;

  v_candidate:=jsonb_build_object(
    'event_type',v_event_type,
    'title',coalesce(q.title,'Revisión pendiente'),
    'body',case
      when q.dependency_blocking then 'Hay una decisión pendiente que bloquea trabajo.'
      when q.window_closing then 'Esta propuesta puede perder utilidad si sigue esperando.'
      when q.review_lane='authority_boundary' then 'Esta revisión afecta autoridad, verdad de proyecto o una regla de comportamiento.'
      when q.review_lane='bounded_change' then 'Esta revisión puede esperar al próximo briefing.'
      else 'Esta revisión reversible puede esperar hasta que abras la superficie de revisión.'
    end,
    'requires_user',q.dependency_blocking,
    'silent_requested',v_silent,
    'metadata',jsonb_build_object(
      'review_item_kind',q.item_kind,
      'review_item_id',q.item_id,
      'review_lane',q.review_lane,
      'routing_reason',q.routing_reason,
      'consequence',q.consequence,
      'reversibility',q.reversibility,
      'batchable',q.batchable,
      'batch_key',q.batch_key
    )
  );

  v_attention:=public.minds_route_attention(v_uid,v_candidate);

  return jsonb_build_object(
    'status','ok',
    'item_kind',q.item_kind,
    'item_id',q.item_id,
    'review_lane',q.review_lane,
    'dependency_blocking',q.dependency_blocking,
    'window_closing',q.window_closing,
    'routing_reason',q.routing_reason,
    'attention',v_attention,
    'authority_changed',false
  );
end $$;

revoke all on function public.minds_review_attention_decision(text,uuid) from public,anon;
grant execute on function public.minds_review_attention_decision(text,uuid) to authenticated,service_role;
