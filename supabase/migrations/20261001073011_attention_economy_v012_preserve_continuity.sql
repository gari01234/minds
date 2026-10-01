create or replace function public.minds_publish_heartbeat(p_user uuid,p_candidate jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  e public.minds_heartbeat_events;
  fresh boolean:=false;
  a jsonb;
  continuity jsonb;
  suppress boolean:=false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||(p_candidate->>'fingerprint'),0));
  select * into e from public.minds_heartbeat_events
  where user_id=p_user and fingerprint=p_candidate->>'fingerprint'
  for update;

  if not found then
    insert into public.minds_heartbeat_events(user_id,event_type,fingerprint,severity,title,body,project_id,source,metadata)
    values(
      p_user,p_candidate->>'event_type',p_candidate->>'fingerprint',coalesce(p_candidate->>'severity','attention'),
      p_candidate->>'title',coalesce(p_candidate->>'body',''),nullif(p_candidate->>'project_id','')::uuid,
      coalesce(p_candidate->'source','{}'),coalesce(p_candidate->'metadata','{}')
    ) returning * into e;
    fresh:=true;
  else
    update public.minds_heartbeat_events set
      last_seen_at=now(),source=coalesce(p_candidate->'source','{}'),metadata=coalesce(p_candidate->'metadata','{}'),
      title=p_candidate->>'title',body=coalesce(p_candidate->>'body','')
    where id=e.id returning * into e;
  end if;

  suppress:=coalesce((p_candidate->>'surface')::boolean,true)=false;
  a:=public.minds_publish_attention(
    p_user,
    jsonb_build_object(
      'event_key','heartbeat:'||e.fingerprint,
      'source_type','heartbeat',
      'source_id',e.id::text,
      'event_type',e.event_type,
      'title',e.title,
      'body',e.body,
      'urgency',e.severity,
      'deadline_at',case when e.event_type='upcoming_event' then e.source->>'starts_at' else null end,
      'timezone',coalesce(p_candidate->>'timezone',''),
      'suppress',suppress,
      'metadata',jsonb_build_object('heartbeat_event_id',e.id,'fingerprint',e.fingerprint,'project_id',e.project_id)
    )
  );

  continuity:=public.minds_publish_continuity_signal(
    p_user,
    jsonb_build_object(
      'source_kind','heartbeat',
      'source_id',e.id::text,
      'fingerprint','heartbeat:'||e.fingerprint,
      'event_type',e.event_type,
      'title',e.title,
      'body',e.body,
      'project_id',e.project_id,
      'occurred_at',e.first_seen_at,
      'metadata',jsonb_build_object('heartbeat_event_id',e.id,'severity',e.severity,'attention_event_id',a->>'id','attention_route',a->>'route')
    )
  );

  if a->>'status' in ('delivered','consumed') and a->>'route' in ('interrupt','ambient') then
    update public.minds_heartbeat_events set status='surfaced',surfaced_at=coalesce(surfaced_at,now()) where id=e.id;
  end if;

  return jsonb_build_object(
    'id',e.id,'created',fresh,'surfaced',(a->>'status')='delivered',
    'attention_event_id',a->>'id','attention_route',a->>'route','attention_status',a->>'status',
    'continuity',continuity
  );
end $$;

revoke all on function public.minds_publish_heartbeat(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_heartbeat(uuid,jsonb) to service_role;
