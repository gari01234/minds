insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','delegate_specialist','allow','Read-only internal specialist delegation; specialists cannot mutate user state',10,true,
       '{"runtime":"invisible_specialist_v1","read_only":true,"max_per_turn":3}'::jsonb
where not exists (
  select 1 from public.minds_action_policies
  where user_id is null and app_scope='isabella' and action='delegate_specialist' and enabled
);
