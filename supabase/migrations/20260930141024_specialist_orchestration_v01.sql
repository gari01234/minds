insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority,enabled,metadata)
select null,'isabella','orchestrate_specialists','allow','Read-only specialist orchestration with bounded evidence routing; no mutation capability',10,true,
       '{"runtime":"specialist_orchestration_v1","read_only":true,"max_steps":3,"dependency_ordered":true}'::jsonb
where not exists (
  select 1 from public.minds_action_policies
  where user_id is null and app_scope='isabella' and action='orchestrate_specialists' and enabled
);
