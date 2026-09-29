
-- MINDS - Theory · v0.2.1 hardening
-- Cover FK access paths and make the server-only chunk table explicitly deny browser roles.

create index if not exists annotations_document_user_fk_idx
  on public.annotations(document_id, user_id);

create index if not exists conversation_messages_conversation_user_fk_idx
  on public.conversation_messages(conversation_id, user_id);

create index if not exists conversations_origin_document_user_fk_idx
  on public.conversations(origin_document_id, user_id)
  where origin_document_id is not null;

create index if not exists conversations_origin_thread_user_fk_idx
  on public.conversations(origin_thread_id, user_id)
  where origin_thread_id is not null;

create index if not exists mind_thread_events_thread_user_fk_idx
  on public.mind_thread_events(thread_id, user_id);

create index if not exists mind_thread_versions_parent_fk_idx
  on public.mind_thread_versions(parent_version_id)
  where parent_version_id is not null;

create index if not exists mind_thread_versions_thread_user_fk_idx
  on public.mind_thread_versions(thread_id, user_id);

create index if not exists reading_state_document_user_fk_idx
  on public.reading_state(document_id, user_id);

create policy memory_chunks_browser_deny
on minds_private.memory_chunks
for all
to authenticated
using (false)
with check (false);
