create or replace function public.minds_rename_work_thread(
  p_thread_id uuid,
  p_title text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_title text := trim(coalesce(p_title,''));
  v_conversation uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if length(v_title) < 1 or length(v_title) > 160 then
    raise exception 'invalid_thread_title' using errcode='22023';
  end if;

  update public.minds_work_threads
  set title=v_title, updated_at=now()
  where id=p_thread_id and user_id=v_user
  returning conversation_id into v_conversation;

  if not found then
    raise exception 'work_thread_not_found' using errcode='P0002';
  end if;

  if v_conversation is not null then
    update public.conversations
    set title=v_title,
        origin_anchor=coalesce(origin_anchor,'{}'::jsonb) || jsonb_build_object('label',v_title),
        updated_at=now()
    where id=v_conversation and user_id=v_user and app_scope='work_thread';
  end if;

  return v_title;
end;
$$;

create or replace function public.minds_set_work_thread_status(
  p_thread_id uuid,
  p_status text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status,'')));
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if v_status not in ('active','archived') then
    raise exception 'invalid_thread_status' using errcode='22023';
  end if;

  update public.minds_work_threads
  set status=v_status, updated_at=now()
  where id=p_thread_id and user_id=v_user;

  if not found then
    raise exception 'work_thread_not_found' using errcode='P0002';
  end if;

  return v_status;
end;
$$;

revoke all on function public.minds_rename_work_thread(uuid,text) from public;
revoke all on function public.minds_rename_work_thread(uuid,text) from anon;
grant execute on function public.minds_rename_work_thread(uuid,text) to authenticated;

revoke all on function public.minds_set_work_thread_status(uuid,text) from public;
revoke all on function public.minds_set_work_thread_status(uuid,text) from anon;
grant execute on function public.minds_set_work_thread_status(uuid,text) to authenticated;
