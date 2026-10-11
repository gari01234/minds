-- Build 90.8: provider-backed durable text-only Chat turns.
-- No client can insert or mutate run state. The originating user can read only
-- their own jobs; service workers reconcile provider state by response id.
create table public.minds_chat_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  user_message text not null check (char_length(user_message) between 1 and 16000),
  status text not null default 'preparing'
    check (status in ('preparing','running','completed','failed','incomplete')),
  provider_response_id text,
  provider_conversation_id text,
  agent_run_id uuid,
  reply text,
  incomplete_reason text,
  exposure_scope jsonb not null default '{}'::jsonb,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
-- A conversation requires ordered turns. Do not start a second provider response
-- while the previous one may still be mutating that conversation.
create unique index minds_chat_jobs_one_active_user_idx on public.minds_chat_jobs(user_id)
  where status in ('preparing','running');
create index minds_chat_jobs_reconcile_idx on public.minds_chat_jobs(status,created_at)
  where status in ('preparing','running');
alter table public.minds_chat_jobs enable row level security;
revoke all on public.minds_chat_jobs from public, anon, authenticated;
grant select on public.minds_chat_jobs to authenticated;
create policy minds_chat_jobs_owner_read on public.minds_chat_jobs
for select to authenticated using(user_id=auth.uid());

-- A completed response may be read from the user's own database even after
-- the OpenAI polling period; no background model output is silently learned.
-- Older terminal jobs may be pruned only after a conservative 90-day retention.
select cron.schedule('minds-chat-jobs-retention','44 3 * * *',
$$delete from public.minds_chat_jobs
  where status in ('completed','failed','incomplete')
    and completed_at < now() - interval '90 days'$$);

-- User-initiated Push diagnostics: explicit, rate limited, no automatic
-- interruption-policy bypass or unsolicited test deliveries.
create table public.minds_push_test_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now(),
 result jsonb not null default '{}'::jsonb
);
create index minds_push_test_requests_user_time_idx on public.minds_push_test_requests(user_id,requested_at desc);
alter table public.minds_push_test_requests enable row level security;
revoke all on public.minds_push_test_requests from public,anon,authenticated;
grant select on public.minds_push_test_requests to authenticated;
create policy minds_push_test_requests_owner_read on public.minds_push_test_requests
  for select to authenticated using(user_id=auth.uid());

create function public.minds_claim_push_test(p_user uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  -- This function is not available to the browser. The authenticated Edge
  -- Function calls it with a verified user id through service role.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,61408));
  if exists(select 1 from public.minds_push_test_requests
    where user_id=p_user and requested_at>now()-interval '90 seconds') then
    return null;
  end if;
  insert into public.minds_push_test_requests(user_id) values(p_user) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.minds_claim_push_test(uuid) from public,anon,authenticated;
grant execute on function public.minds_claim_push_test(uuid) to service_role;

-- own runtime secret
insert into public.isabella_runtime_secrets(key,value) values('chat_runner',md5(gen_random_uuid()::text||clock_timestamp()::text)) on conflict(key) do nothing;
select cron.schedule('minds-chat-runner','* * * * *', $$select net.http_post(url:='https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-chat-runner',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('secret',(select value from public.isabella_runtime_secrets where key='chat_runner')),timeout_milliseconds:=30000)$$);
