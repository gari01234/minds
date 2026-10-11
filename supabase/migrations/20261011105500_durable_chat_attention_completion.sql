-- Build 90.8.5: attention-governed completion Push for durable Chat.
CREATE OR REPLACE FUNCTION public.minds_route_attention(p_user uuid, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      when 'chat_reply_ready' then v_route:='interrupt';v_reason:='chat_reply_ready';
      when 'mission_completed' then v_route:=coalesce(nullif(v_profile->>'missionCompleted',''),'briefing');v_reason:='mission_completed';
      when 'mission_failed' then v_route:=coalesce(nullif(v_profile->>'missionFailed',''),'briefing');v_reason:='mission_failed';
      when 'mission_waiting_for_user' then v_route:='interrupt';v_reason:='needs_user_input';v_hard:=true;
      when 'upcoming_event' then v_route:=coalesce(nullif(v_profile->>'imminentEvent',''),'interrupt');v_reason:='imminent_event';
      when 'overdue_digest' then v_route:=coalesce(nullif(v_profile->>'overdueTasks',''),'ambient');v_reason:='overdue_tasks';
      when 'routine_failure' then v_route:=coalesce(nullif(v_profile->>'routineFailure',''),'briefing');v_reason:='routine_failure';
      when 'expectation_due' then v_route:='ambient';v_reason:='expectation_due';
      when 'review_required' then v_route:='briefing';v_reason:='review_required';
      when 'review_window_closing' then v_route:='ambient';v_reason:='review_window_closing';
      when 'situational_review' then
        v_route:=case when p_candidate->>'urgency'='urgent' then 'interrupt' else 'ambient' end;
        v_reason:='contextual_reassessment';
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
      when 'chat_reply_ready' then 'Isabella terminó una respuesta de Chat.'
      when 'mission_completed' then 'El trabajo terminó, pero no requiere una decisión inmediata.'
      when 'mission_failed' then 'El trabajo se detuvo y conviene incluirlo en el próximo resumen.'
      when 'imminent_event' then 'Hay un evento próximo cuyo valor depende del tiempo.'
      when 'overdue_tasks' then 'Es una señal personal/productiva útil, pero no exige interrumpir.'
      when 'routine_failure' then 'Conviene conocer el fallo, pero normalmente puede esperar al briefing.'
      when 'expectation_due' then 'Algo que esperabas alcanzó su fecha límite y todavía no está confirmado.'
      when 'review_required' then 'Hay una revisión importante pendiente, pero no bloquea el trabajo inmediato.'
      when 'review_window_closing' then 'Una revisión reversible está cerca de perder utilidad por el paso del tiempo.'
      when 'contextual_reassessment' then 'Una circunstancia contrastada puede hacer recomendable revisar un plan.'
      when 'quiet_hours' then 'La señal no era bloqueante y cayó dentro de las horas silenciosas.'
      when 'interruption_budget' then 'Ya hubo suficientes interrupciones no bloqueantes durante la última hora.'
      else 'No existe una razón suficiente para ocupar tu atención ahora.'
    end,
    'base_route',v_base_route,'base_reason_code',v_base_reason,'hard_interrupt',v_hard,
    'quiet_hours_applied',v_quiet,'recent_interruptions',v_recent,
    'max_interruptions_per_hour',v_max,'policy_version','attention_v1'
  );
end $function$

-- A terminal durable job produces one attention event, never an extra Chat message.
-- The existing route policy retains quiet hours and hourly interruption budget.
create or replace function public.minds_notify_durable_chat_v01()
returns trigger
language plpgsql security definer
set search_path to 'public','pg_temp'
as $chat$
declare
  v_decision jsonb;
  v_route text;
  v_title text;
  v_body text;
begin
  if new.status not in ('completed','incomplete','failed')
      or new.status is not distinct from old.status then return new; end if;
  if new.status='completed' and nullif(btrim(coalesce(new.reply,'')),'') is null then return new; end if;
  v_decision:=public.minds_route_attention(new.user_id,
    jsonb_build_object('event_type','chat_reply_ready','urgency','attention','timezone','Europe/Berlin'));
  v_route:=v_decision->>'route';
  v_title:=case when new.status='completed' then 'Isabella terminó de responder'
    else 'Isabella necesita que revises una respuesta' end;
  v_body:=case when new.status='completed' then 'Tu respuesta está lista en Chat.'
    when new.status='incomplete' then 'La respuesta quedó incompleta. Puedes revisarla en Chat.'
    else 'Una respuesta no pudo completarse. Puedes revisarla en Chat.' end;
  insert into public.minds_attention_events
    (user_id,event_key,source_type,source_id,event_type,title,body,urgency,
     requires_user,user_requested,route,reason_code,reason,policy_version,status,factors,metadata)
  values
    (new.user_id,'chat_reply:'||new.id::text,'chat',new.id::text,'chat_reply_ready',
     v_title,v_body,'attention',false,false,
     v_route,v_decision->>'reason_code',v_decision->>'reason','attention_v1',
     case when v_route='interrupt' then 'delivered'
          when v_route='silent' then 'suppressed' else 'pending' end,
     v_decision,jsonb_build_object('url','/minds/isabella/','chat_request_id',new.request_id::text,
       'chat_terminal_status',new.status,'notification_only',true))
  on conflict (user_id,event_key) do nothing;
  return new;
end $chat$;
drop trigger if exists minds_chat_job_attention_on_completion on public.minds_chat_jobs;
create trigger minds_chat_job_attention_on_completion
  after update of status on public.minds_chat_jobs
  for each row
  when (old.status is distinct from new.status and new.status in ('completed','incomplete','failed'))
  execute function public.minds_notify_durable_chat_v01();
