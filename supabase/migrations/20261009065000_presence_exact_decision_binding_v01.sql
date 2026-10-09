-- Build 88.1 — exact Presence decision binding.

alter table public.minds_attention_events
  add column if not exists request_revision integer not null default 1;

alter table public.minds_attention_events
  drop constraint if exists minds_attention_events_request_revision_check;
alter table public.minds_attention_events
  add constraint minds_attention_events_request_revision_check
  check (request_revision >= 1);

create or replace function public.minds_attention_request_revision_guard()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.requires_user is distinct from new.requires_user
     or old.route is distinct from new.route
     or old.source_type is distinct from new.source_type
     or old.source_id is distinct from new.source_id
     or old.event_type is distinct from new.event_type
     or old.title is distinct from new.title
     or old.body is distinct from new.body then
    new.request_revision:=greatest(old.request_revision+1,coalesce(new.request_revision,1));
  else
    new.request_revision:=old.request_revision;
  end if;
  return new;
end $$;

drop trigger if exists attention_request_revision_guard on public.minds_attention_events;
create trigger attention_request_revision_guard
before update on public.minds_attention_events
for each row execute function public.minds_attention_request_revision_guard();

create or replace function public.minds_validate_presence_reply_v01(
  p_attention_id uuid,
  p_request_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_event public.minds_attention_events%rowtype;
  v_mission public.minds_mission_runs%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into v_event
  from public.minds_attention_events
  where id=p_attention_id and user_id=v_uid;

  if not found then
    return jsonb_build_object('status','stale','reason','attention_missing');
  end if;

  if coalesce(p_request_revision,0)<>v_event.request_revision then
    return jsonb_build_object(
      'status','stale','reason','revision_mismatch',
      'current_revision',v_event.request_revision
    );
  end if;

  if v_event.status not in ('pending','delivered')
     or v_event.route<>'interrupt'
     or v_event.requires_user is not true then
    return jsonb_build_object(
      'status','stale','reason','request_not_live',
      'current_status',v_event.status,'current_revision',v_event.request_revision
    );
  end if;

  if v_event.source_type='mission' then
    begin
      select * into v_mission
      from public.minds_mission_runs
      where id=v_event.source_id::uuid and user_id=v_uid;
    exception when invalid_text_representation then
      return jsonb_build_object('status','stale','reason','mission_source_invalid');
    end;

    if not found or v_mission.status<>'waiting_for_user' then
      return jsonb_build_object(
        'status','stale','reason','mission_no_longer_waiting',
        'current_revision',v_event.request_revision
      );
    end if;
  end if;

  return jsonb_build_object(
    'status','ok',
    'reply_context',jsonb_build_object(
      'attention_id',v_event.id,
      'request_revision',v_event.request_revision,
      'source_type',v_event.source_type,
      'source_id',v_event.source_id,
      'mission_run_id',case when v_event.source_type='mission' then v_event.source_id else null end,
      'title',v_event.title,
      'question',v_event.body
    )
  );
end $$;

revoke all on function public.minds_validate_presence_reply_v01(uuid,integer) from public,anon;
grant execute on function public.minds_validate_presence_reply_v01(uuid,integer) to authenticated;