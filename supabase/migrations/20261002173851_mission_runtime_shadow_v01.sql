alter table public.minds_mission_runtime_executions
  add column if not exists result_payload jsonb not null default '{}'::jsonb
  check (jsonb_typeof(result_payload)='object');

insert into public.isabella_runtime_secrets(key,value)
values ('agent_shadow_runner',encode(gen_random_bytes(32),'hex'))
on conflict(key) do nothing;
