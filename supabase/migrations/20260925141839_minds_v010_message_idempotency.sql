
drop index if exists public.conversation_messages_client_key_uq;
alter table public.conversation_messages
  alter column client_key set not null;
alter table public.conversation_messages
  add constraint conversation_messages_client_key_unique
  unique (user_id, conversation_id, client_key);
