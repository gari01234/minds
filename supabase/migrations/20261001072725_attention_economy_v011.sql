create or replace function public.minds_consume_attention_briefing(
  p_user uuid,
  p_event_ids uuid[],
  p_delivery_id uuid
)
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_count integer:=0;
  e public.minds_attention_events;
begin
  for e in
    update public.minds_attention_events
    set status='consumed',delivery_ref='routine:'||p_delivery_id::text,
        delivered_at=coalesce(delivered_at,now()),consumed_at=now(),updated_at=now()
    where user_id=p_user and id=any(coalesce(p_event_ids,'{}'::uuid[]))
      and route='briefing' and status='pending'
    returning *
  loop
    v_count:=v_count+1;
    if e.source_type='mission' and e.source_id is not null then
      update public.minds_mission_runs
      set notified_at=coalesce(notified_at,now()),updated_at=now()
      where id=e.source_id::uuid and user_id=p_user;
      if not exists(
        select 1 from public.minds_mission_run_events
        where run_id=e.source_id::uuid and event_type='delivered'
          and payload->>'event'=coalesce(e.metadata->>'mission_event',e.event_type)
      ) then
        insert into public.minds_mission_run_events(run_id,user_id,event_type,payload)
        values(
          e.source_id::uuid,p_user,'delivered',
          jsonb_build_object('event',coalesce(e.metadata->>'mission_event',e.event_type),'attention_event_id',e.id,'route','briefing')
        );
      end if;
    elsif e.source_type='heartbeat' and e.source_id is not null then
      update public.minds_heartbeat_events
      set status='surfaced',surfaced_at=coalesce(surfaced_at,now())
      where id=e.source_id::uuid and user_id=p_user and status='new';
    end if;
  end loop;
  return v_count;
end $$;

revoke all on function public.minds_consume_attention_briefing(uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.minds_consume_attention_briefing(uuid,uuid[],uuid) to service_role;

update public.minds_surface_items
set metadata=jsonb_set(metadata,'{source}','"situational_feed"'::jsonb,true)
where surface='feed' and agent='isabella'
  and metadata ? 'generation_id'
  and not (metadata ? 'source');
