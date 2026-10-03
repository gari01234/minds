create table public.minds_runtime_capability_grants (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.minds_mission_runtime_executions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  capabilities text[] not null check (
    cardinality(capabilities) between 1 and 3
    and capabilities <@ array[
      'read_mission_workspace',
      'read_relevant_artifacts',
      'read_project_context'
    ]::text[]
  ),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null check (expires_at > created_at),
  last_used_at timestamptz null,
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index minds_runtime_capability_grants_execution_idx
  on public.minds_runtime_capability_grants(execution_id,status,expires_at);

create or replace function public.minds_runtime_capability_grant_guard()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_user uuid;
  v_provider text;
  v_mode text;
begin
  select user_id,provider,mode into v_user,v_provider,v_mode
  from public.minds_mission_runtime_executions
  where id=new.execution_id;

  if v_user is null then raise exception 'runtime_capability_execution_missing'; end if;
  if v_provider<>'openai_agents' then raise exception 'runtime_capability_provider_not_allowed'; end if;
  if v_mode<>'shadow' then raise exception 'runtime_capability_primary_not_allowed'; end if;

  new.user_id:=v_user;

  if tg_op='INSERT' then
    if new.status<>'active' then raise exception 'runtime_capability_must_start_active'; end if;
    new.use_count:=0;
    new.last_used_at:=null;
    new.revoked_at:=null;
  else
    if new.execution_id<>old.execution_id
       or new.token_hash<>old.token_hash
       or new.capabilities<>old.capabilities
       or new.expires_at<>old.expires_at
    then raise exception 'runtime_capability_identity_immutable'; end if;

    if new.status<>old.status then
      if old.status='active' and new.status in ('revoked','expired') then null;
      else raise exception 'runtime_capability_invalid_transition:%->%',old.status,new.status;
      end if;
    end if;

    if new.status='revoked' then new.revoked_at:=coalesce(new.revoked_at,now()); end if;
  end if;

  new.updated_at:=now();
  return new;
end $$;

revoke all on function public.minds_runtime_capability_grant_guard() from public,anon,authenticated;

create trigger minds_runtime_capability_grant_guard_trg
before insert or update on public.minds_runtime_capability_grants
for each row execute function public.minds_runtime_capability_grant_guard();

alter table public.minds_runtime_capability_grants enable row level security;
revoke all on public.minds_runtime_capability_grants from anon,authenticated;
grant select,insert,update,delete on public.minds_runtime_capability_grants to service_role;
