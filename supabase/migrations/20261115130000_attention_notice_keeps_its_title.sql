-- Un aviso lleva su título (15.11.2026).
--
-- minds_publish_attention escribía en la conversación solo v_event.body, de modo que un aviso de
-- calendario llegaba como «Empieza a las 14:00.» sin decir qué empieza. El título estaba ahí desde
-- el principio: el heartbeat arma cada aviso con title y body, y la tarjeta del Feed los muestra
-- juntos. El chat se quedaba con la mitad.
--
-- Cambia exactamente un sitio: el content del mensaje insertado. El enrutado, las horas de
-- silencio, el presupuesto de interrupciones y todos los valores devueltos quedan línea por línea
-- como estaban. La misma corrección está en Office desde el 14.11
-- (20261114120000_office_attention_notice_keeps_its_title.sql).
begin;

create or replace function public.minds_publish_attention(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_key text:=left(trim(coalesce(p_candidate->>'event_key','')),500);
  v_decision jsonb;
  v_event public.minds_attention_events;
  v_existing boolean:=false;
  v_route text;
  v_conv uuid;
  v_mid uuid;
  v_sid uuid;
  v_status text;
begin
  if p_user is null or v_key='' then raise exception 'attention candidate requires user and event_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||v_key,0));
  v_decision:=public.minds_route_attention(p_user,p_candidate);
  v_route:=v_decision->>'route';

  select * into v_event
  from public.minds_attention_events
  where user_id=p_user and event_key=v_key
  for update;

  if found then
    v_existing:=true;
    if v_event.status in ('delivered','consumed','dismissed','resolved') then
      return jsonb_build_object('status',v_event.status,'id',v_event.id,'route',v_event.route,'duplicate',true,'message_id',v_event.message_id,'surface_item_id',v_event.surface_item_id);
    end if;

    update public.minds_attention_events set
      source_type=coalesce(nullif(p_candidate->>'source_type',''),source_type),
      source_id=coalesce(nullif(p_candidate->>'source_id',''),source_id),
      event_type=coalesce(nullif(p_candidate->>'event_type',''),event_type),
      title=left(coalesce(nullif(p_candidate->>'title',''),title),500),
      body=left(coalesce(p_candidate->>'body',body),12000),
      urgency=case when p_candidate->>'urgency' in ('info','attention','urgent') then p_candidate->>'urgency' else urgency end,
      requires_user=coalesce((p_candidate->>'requires_user')::boolean,requires_user),
      user_requested=coalesce((p_candidate->>'user_requested')::boolean,user_requested),
      deadline_at=coalesce(nullif(p_candidate->>'deadline_at','')::timestamptz,deadline_at),
      route=v_route,
      reason_code=v_decision->>'reason_code',
      reason=v_decision->>'reason',
      policy_version='attention_v1',
      status=case when v_route='silent' then 'suppressed' else 'pending' end,
      factors=v_decision,
      metadata=metadata||coalesce(p_candidate->'metadata','{}'::jsonb),
      updated_at=now()
    where id=v_event.id
    returning * into v_event;
  else
    insert into public.minds_attention_events(
      user_id,event_key,source_type,source_id,event_type,title,body,urgency,requires_user,user_requested,deadline_at,
      route,reason_code,reason,policy_version,status,factors,metadata
    ) values (
      p_user,v_key,
      coalesce(nullif(p_candidate->>'source_type',''),'system'),
      nullif(p_candidate->>'source_id',''),
      coalesce(nullif(p_candidate->>'event_type',''),'unknown'),
      left(coalesce(nullif(p_candidate->>'title',''),'Actualización de Isabella'),500),
      left(coalesce(p_candidate->>'body',''),12000),
      case when p_candidate->>'urgency' in ('info','attention','urgent') then p_candidate->>'urgency' else 'info' end,
      coalesce((p_candidate->>'requires_user')::boolean,false),
      coalesce((p_candidate->>'user_requested')::boolean,false),
      nullif(p_candidate->>'deadline_at','')::timestamptz,
      v_route,v_decision->>'reason_code',v_decision->>'reason','attention_v1',
      case when v_route='silent' then 'suppressed' else 'pending' end,
      v_decision,coalesce(p_candidate->'metadata','{}'::jsonb)
    ) returning * into v_event;
  end if;

  if v_route='silent' then
    return jsonb_build_object('status','suppressed','id',v_event.id,'route',v_route,'duplicate',v_existing,'reason_code',v_event.reason_code);
  elsif v_route='briefing' then
    return jsonb_build_object('status','pending','id',v_event.id,'route',v_route,'duplicate',v_existing,'reason_code',v_event.reason_code);
  elsif v_route='ambient' then
    insert into public.minds_surface_items(user_id,surface,agent,title,body,status,lifecycle_state,icon,generated_at,expires_at,metadata)
    values(
      p_user,'feed','isabella',v_event.title,v_event.body,'active','new',
      case when v_event.urgency='urgent' then '!' else '·' end,now(),
      coalesce(v_event.deadline_at+interval '2 hours',now()+interval '18 hours'),
      jsonb_build_object(
        'source','attention_runtime','attention_event_id',v_event.id,'attention_route','ambient',
        'reason_code',v_event.reason_code,'source_type',v_event.source_type,'source_id',v_event.source_id
      )||v_event.metadata
    ) returning id into v_sid;
    update public.minds_attention_events
    set status='delivered',surface_item_id=v_sid,delivered_at=now(),updated_at=now()
    where id=v_event.id returning status into v_status;
    return jsonb_build_object('status',v_status,'id',v_event.id,'route',v_route,'surface_item_id',v_sid,'reason_code',v_event.reason_code);
  else
    select id into v_conv from public.conversations
    where user_id=p_user and app_scope='isabella'
    order by updated_at desc limit 1;

    if v_conv is null then
      insert into public.conversations(user_id,app_scope,origin_kind,origin_anchor,title,mode,metadata)
      values(p_user,'isabella','global','{"type":"assistant","id":"isabella","label":"Isabella"}','Isabella','memory','{"app":"isabella"}')
      returning id into v_conv;
    end if;

    insert into public.conversation_messages(user_id,conversation_id,role,content,provisional,citations,metadata,client_key)
    values(
      p_user,v_conv,'assistant',
      -- Un aviso lleva su título (15.11.2026, Gari lo vio en Romy). El heartbeat lo arma con dos
      -- campos: title («Próximo: …») y body («Empieza a las 14:00.»). Aquí se escribía solo el
      -- body, así que en el chat quedaba la hora sin decir qué empieza. En Window se notaba menos
      -- porque el Feed de arriba sí muestra los dos. Si el título ya está dentro del texto
      -- —watch_fired escribe ambos desde el mismo reminder_text— no se repite.
      case
        when coalesce(btrim(v_event.title),'')='' then v_event.body
        when coalesce(btrim(v_event.body),'')='' then v_event.title
        when position(btrim(v_event.title) in v_event.body)>0 then v_event.body
        else btrim(v_event.title)||' · '||v_event.body
      end,
      false,'[]'::jsonb,
      jsonb_build_object(
        'app','isabella','source','attention_runtime','attention_event_id',v_event.id,'attention_route','interrupt',
        'attention_reason',v_event.reason_code,'source_type',v_event.source_type,'source_id',v_event.source_id
      )||v_event.metadata,
      'attention:'||v_event.id
    )
    on conflict(user_id,conversation_id,client_key) do update set content=excluded.content
    returning id into v_mid;

    update public.conversations set updated_at=now() where id=v_conv and user_id=p_user;
    update public.minds_attention_events
    set status='delivered',message_id=v_mid,delivered_at=now(),updated_at=now()
    where id=v_event.id returning status into v_status;
    return jsonb_build_object('status',v_status,'id',v_event.id,'route',v_route,'message_id',v_mid,'reason_code',v_event.reason_code);
  end if;
end $$;

revoke all on function public.minds_publish_attention(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_attention(uuid,jsonb) to service_role;

commit;
