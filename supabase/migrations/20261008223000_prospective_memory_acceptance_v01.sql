-- Build 86.5 — acceptance hardening for deterministic expiry.
-- Expiry is a lifecycle transition, not something that should wait for a reminder to match again.

create or replace function public.minds_expire_prospective_memory(
  p_user uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer:=0;
  v_reminders integer:=0;
  v_watches integer:=0;
begin
  if p_user is null then raise exception 'user_required'; end if;

  with expired as (
    update public.minds_standing_intents
    set status='expired',expired_at=coalesce(expired_at,p_now),updated_at=p_now
    where user_id=p_user
      and status in ('pending','armed','fired')
      and expires_at is not null
      and expires_at<=p_now
    returning mode
  )
  select count(*),
         count(*) filter (where mode='reminder'),
         count(*) filter (where mode='watch')
  into v_count,v_reminders,v_watches
  from expired;

  return jsonb_build_object(
    'status','ok',
    'expired',v_count,
    'reminders',v_reminders,
    'watches',v_watches,
    'at',p_now
  );
end $$;

revoke all on function public.minds_expire_prospective_memory(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.minds_expire_prospective_memory(uuid,timestamptz) to service_role;

-- Heartbeat must wake even when prospective memory is the user's only live future state.
create or replace function public.minds_heartbeat_users()
returns table(user_id uuid, timezone text)
language sql
set search_path=public,pg_temp
as $$
  with ids as (
    select user_id from public.isabella_routines where enabled
    union select user_id from public.isabella_tasks where archived_at is null
    union select user_id from public.isabella_events where starts_at>=now()-interval '1 hour'
    union select user_id from public.isabella_projects where not archived
    union select user_id from public.minds_expectations where status in ('active','due_unconfirmed')
    union select user_id from public.minds_standing_intents where status in ('pending','armed','fired')
  )
  select i.user_id,
         coalesce(
           (select r.timezone from public.isabella_routines r where r.user_id=i.user_id and r.enabled order by r.created_at limit 1),
           (select e.timezone from public.minds_expectations e where e.user_id=i.user_id and e.status in ('active','due_unconfirmed') order by e.created_at limit 1),
           'Europe/Berlin'
         )
  from ids i;
$$;