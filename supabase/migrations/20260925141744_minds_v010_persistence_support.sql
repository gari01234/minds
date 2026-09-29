
-- MINDS - Theory · v0.10 persistence support

create table public.mind_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null,
  quote text not null,
  note text not null default '',
  selectors jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_id, user_id)
    references public.mind_threads(id, user_id)
    on delete cascade
);

create index mind_annotations_user_thread_idx
  on public.mind_annotations(user_id, thread_id, created_at desc);

create index mind_annotations_thread_user_fk_idx
  on public.mind_annotations(thread_id, user_id);

create trigger mind_annotations_set_updated_at
before update on public.mind_annotations
for each row execute function public.set_updated_at();

alter table public.mind_annotations enable row level security;
revoke all on public.mind_annotations from anon;
grant select, insert, update, delete on public.mind_annotations to authenticated;

create policy mind_annotations_select_own on public.mind_annotations
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_annotations_insert_own on public.mind_annotations
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_annotations_update_own on public.mind_annotations
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_annotations_delete_own on public.mind_annotations
for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

alter table public.conversation_messages
  add column if not exists client_key text;

create unique index if not exists conversation_messages_client_key_uq
  on public.conversation_messages(user_id, conversation_id, client_key)
  where client_key is not null;
