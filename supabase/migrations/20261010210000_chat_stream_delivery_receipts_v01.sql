-- Restore a successfully generated Chat response after an interrupted browser SSE connection.
-- This is an expiring transport receipt, not a second conversational memory.
create table if not exists public.minds_chat_stream_delivery_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  status text not null check (status in ('completed','incomplete')),
  reply text not null,
  incomplete_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '1 day'),
  primary key(user_id,request_id)
);
create index if not exists minds_chat_stream_delivery_receipts_expiry_idx
  on public.minds_chat_stream_delivery_receipts(expires_at);
alter table public.minds_chat_stream_delivery_receipts enable row level security;
revoke all on public.minds_chat_stream_delivery_receipts from anon,authenticated;
grant select on public.minds_chat_stream_delivery_receipts to authenticated;
drop policy if exists minds_chat_stream_receipts_owner_select on public.minds_chat_stream_delivery_receipts;
create policy minds_chat_stream_receipts_owner_select
  on public.minds_chat_stream_delivery_receipts
  for select to authenticated using (
    user_id = auth.uid() and expires_at > now()
  );
-- Only the server-side service role may insert or update delivery receipts.
-- The server verifies the JWT and derives user_id independently of client-provided fields.
do $$
begin
  if not exists(select 1 from cron.job where jobname='minds-chat-stream-receipts-expiry') then
    perform cron.schedule('minds-chat-stream-receipts-expiry',
      '13 3 * * *',
      'delete from public.minds_chat_stream_delivery_receipts where expires_at < now()');
  end if;
end $$;
