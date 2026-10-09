-- Build 89.1 — frozen model-independence experiment ledger.

create table if not exists public.minds_model_independence_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_kind text not null check (experiment_kind in ('model_swap','cold_reconstruction')),
  fixture_version text not null,
  relationship_policy_version text not null,
  relationship_policy_hash text not null check (relationship_policy_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  model_a text not null,
  model_b text not null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot)='object'),
  output_a jsonb null,
  output_b jsonb null,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics)='object'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  error text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists minds_model_independence_runs_user_idx
  on public.minds_model_independence_runs(user_id,created_at desc);

alter table public.minds_model_independence_runs enable row level security;

drop policy if exists "model_independence_runs_select_own" on public.minds_model_independence_runs;
create policy "model_independence_runs_select_own" on public.minds_model_independence_runs
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_model_independence_runs from anon,authenticated;
grant select on public.minds_model_independence_runs to authenticated;
grant select,insert,update,delete on public.minds_model_independence_runs to service_role;

insert into public.isabella_runtime_secrets(key,value)
values ('model_independence_runner',gen_random_uuid()::text)
on conflict (key) do nothing;