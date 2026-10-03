create or replace function minds_private.capture_post_action_feedback_candidate()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare
  x public.minds_autonomy_executions;
  p public.minds_contextual_permissions;
  fields text[];
begin
  if new.source<>'manual' or new.entity_type<>'task' or new.action not in ('update','delete') then
    return new;
  end if;

  select * into x
  from public.minds_autonomy_executions
  where user_id=new.user_id
    and ('autonomy:'||request_id::text)=new.entity_key
    and created_at<=new.created_at
    and created_at>=new.created_at-interval '48 hours'
  order by created_at desc
  limit 1;

  if not found then return new; end if;

  if exists(
    select 1
    from public.minds_post_action_feedback_candidates c
    where c.user_id=new.user_id
      and c.autonomy_execution_id=x.id
  ) then
    return new;
  end if;

  fields:=minds_private.post_action_changed_fields(new.before_state,new.after_state,new.action);
  if cardinality(fields)=0 then return new; end if;

  select * into p from public.minds_contextual_permissions
  where id=x.permission_id and user_id=new.user_id;
  if not found then return new; end if;

  insert into public.minds_post_action_feedback_candidates(
    user_id,autonomy_execution_id,activity_id,permission_id,permission_revision,
    action,context_key,scope_key,scope_label,entity_type,entity_key,mutation_action,
    changed_fields,before_state,after_state
  ) values (
    new.user_id,x.id,new.id,x.permission_id,x.permission_revision,
    p.action,p.context_key,p.scope_key,p.scope_label,'task',new.entity_key,new.action,
    fields,new.before_state,new.after_state
  )
  on conflict(autonomy_execution_id) do nothing;

  return new;
end $$;

revoke all on function minds_private.capture_post_action_feedback_candidate()
from public,anon,authenticated,service_role;