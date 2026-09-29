
-- MINDS - Theory · memory architecture v0.2
-- Aligned with product architecture v0.9.1.
-- Public schema: user-facing memory surfaces protected by RLS.
-- minds_private schema: server-side retrieval infrastructure, not exposed to browser roles.

create extension if not exists vector with schema extensions;

create schema if not exists minds_private;
revoke all on schema minds_private from anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- LECTURAS / DOCUMENTARY MEMORY
-- ---------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  external_key text,
  kind text not null default 'reading',
  title text not null,
  author text,
  language text not null default 'es',
  source_class text,
  access_state text,
  source_date date,
  source_url text,
  content text not null,
  content_hash text,
  partial boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_key),
  unique (id, user_id)
);

create index documents_user_kind_idx on public.documents(user_id, kind);
create index documents_user_source_class_idx on public.documents(user_id, source_class);
create index documents_user_updated_idx on public.documents(user_id, updated_at desc);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null,
  kind text not null default 'highlight'
    check (kind in ('highlight','note')),
  quote text not null,
  note text not null default '',
  selectors jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, user_id)
    references public.documents(id, user_id)
    on delete cascade
);

create index annotations_user_document_idx on public.annotations(user_id, document_id);
create index annotations_user_created_idx on public.annotations(user_id, created_at desc);

create trigger annotations_set_updated_at
before update on public.annotations
for each row execute function public.set_updated_at();

create table public.reading_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null,
  last_anchor jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz not null default now(),
  return_later boolean not null default false,
  return_count integer not null default 0 check (return_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id),
  foreign key (document_id, user_id)
    references public.documents(id, user_id)
    on delete cascade
);

create index reading_state_user_opened_idx on public.reading_state(user_id, last_opened_at desc);
create index reading_state_user_return_idx on public.reading_state(user_id, return_later)
where return_later = true;

create trigger reading_state_set_updated_at
before update on public.reading_state
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- MINDS / LONGITUDINAL THOUGHT
-- ---------------------------------------------------------------------

create table public.mind_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (id, user_id)
);

create index mind_threads_user_updated_idx on public.mind_threads(user_id, updated_at desc);

create trigger mind_threads_set_updated_at
before update on public.mind_threads
for each row execute function public.set_updated_at();

create table public.mind_thread_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null,
  parent_version_id uuid references public.mind_thread_versions(id) on delete set null,
  version_number integer not null check (version_number > 0),
  title text,
  body text not null,
  change_summary text,
  epistemic_status text not null default 'provisional'
    check (epistemic_status in (
      'documented',
      'derived',
      'interpreted',
      'provisional',
      'accepted',
      'contested',
      'deprioritized',
      'rejected',
      'superseded',
      'open'
    )),
  origin_kind text not null default 'collaborative'
    check (origin_kind in ('user','ai','collaborative','import')),
  provenance jsonb not null default '[]'::jsonb,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, version_number),
  foreign key (thread_id, user_id)
    references public.mind_threads(id, user_id)
    on delete cascade
);

create index mind_versions_user_thread_idx
  on public.mind_thread_versions(user_id, thread_id, version_number desc);
create index mind_versions_user_status_idx
  on public.mind_thread_versions(user_id, epistemic_status);

create trigger mind_thread_versions_set_updated_at
before update on public.mind_thread_versions
for each row execute function public.set_updated_at();

create table public.mind_thread_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null,
  event_type text not null,
  reason text,
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  foreign key (thread_id, user_id)
    references public.mind_threads(id, user_id)
    on delete cascade
);

create index mind_events_user_thread_time_idx
  on public.mind_thread_events(user_id, thread_id, occurred_at desc);
create index mind_events_user_type_time_idx
  on public.mind_thread_events(user_id, event_type, occurred_at desc);

-- Active/latent is a derived view over the event history, not a destructive archive flag.
create view public.mind_thread_current_state
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.slug,
  t.title,
  t.description,
  t.created_at,
  t.updated_at,
  coalesce(a.activation_state, 'latent') as activation_state,
  a.activation_reason,
  a.activation_changed_at,
  coalesce(p.is_pinned, false) as is_pinned,
  p.pin_changed_at,
  v.id as current_version_id,
  v.version_number as current_version_number,
  v.epistemic_status as current_epistemic_status
from public.mind_threads t
left join lateral (
  select
    case
      when e.event_type = 'deactivated' then 'latent'
      else 'active'
    end as activation_state,
    e.reason as activation_reason,
    e.occurred_at as activation_changed_at
  from public.mind_thread_events e
  where e.thread_id = t.id
    and e.user_id = t.user_id
    and e.event_type in ('created','activated','reactivated','deactivated')
  order by e.occurred_at desc, e.recorded_at desc, e.id desc
  limit 1
) a on true
left join lateral (
  select
    (e.event_type = 'pinned') as is_pinned,
    e.occurred_at as pin_changed_at
  from public.mind_thread_events e
  where e.thread_id = t.id
    and e.user_id = t.user_id
    and e.event_type in ('pinned','unpinned')
  order by e.occurred_at desc, e.recorded_at desc, e.id desc
  limit 1
) p on true
left join lateral (
  select mv.id, mv.version_number, mv.epistemic_status
  from public.mind_thread_versions mv
  where mv.thread_id = t.id
    and mv.user_id = t.user_id
  order by mv.version_number desc, mv.created_at desc, mv.id desc
  limit 1
) v on true;

-- ---------------------------------------------------------------------
-- CONVERSATIONS / UNIVERSAL ASKING
-- ---------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origin_kind text not null default 'global'
    check (origin_kind in ('global','mind','reading')),
  origin_thread_id uuid,
  origin_document_id uuid,
  origin_anchor jsonb not null default '{}'::jsonb,
  title text not null default 'Nueva conversación',
  mode text not null default 'memory'
    check (mode in ('memory','outside')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (origin_thread_id, user_id)
    references public.mind_threads(id, user_id)
    on delete set null,
  foreign key (origin_document_id, user_id)
    references public.documents(id, user_id)
    on delete set null,
  check (
    (origin_kind = 'global' and origin_thread_id is null and origin_document_id is null)
    or (origin_kind = 'mind' and origin_thread_id is not null and origin_document_id is null)
    or (origin_kind = 'reading' and origin_document_id is not null and origin_thread_id is null)
  )
);

create index conversations_user_updated_idx
  on public.conversations(user_id, updated_at desc);
create index conversations_user_thread_idx
  on public.conversations(user_id, origin_thread_id, updated_at desc)
  where origin_thread_id is not null;
create index conversations_user_document_idx
  on public.conversations(user_id, origin_document_id, updated_at desc)
  where origin_document_id is not null;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null
    check (role in ('user','assistant','system')),
  content text not null,
  model text,
  provisional boolean not null default false,
  citations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations(id, user_id)
    on delete cascade
);

create index conversation_messages_user_conversation_idx
  on public.conversation_messages(user_id, conversation_id, created_at);

-- ---------------------------------------------------------------------
-- TRANSVERSAL MEMORY / PROVENANCE / LINKS
-- ---------------------------------------------------------------------

create table public.memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null,
  subject_kind text,
  subject_id text,
  title text,
  body text,
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now()
);

create index memory_events_user_time_idx
  on public.memory_events(user_id, occurred_at desc);
create index memory_events_user_type_idx
  on public.memory_events(user_id, event_type, occurred_at desc);
create index memory_events_user_subject_idx
  on public.memory_events(user_id, subject_kind, subject_id);

create table public.memory_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_kind text not null,
  from_id text not null,
  relation_type text not null,
  to_kind text not null,
  to_id text not null,
  epistemic_status text not null default 'ai_suggested'
    check (epistemic_status in (
      'documented',
      'derived',
      'interpreted',
      'ai_suggested',
      'user_accepted',
      'contested',
      'rejected'
    )),
  provenance jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_links_user_from_idx
  on public.memory_links(user_id, from_kind, from_id);
create index memory_links_user_to_idx
  on public.memory_links(user_id, to_kind, to_id);
create index memory_links_user_relation_idx
  on public.memory_links(user_id, relation_type);

create trigger memory_links_set_updated_at
before update on public.memory_links
for each row execute function public.set_updated_at();

-- Server-side semantic retrieval. This schema is deliberately not exposed
-- to browser roles. Dimension is left flexible until an embedding model is chosen.
create table minds_private.memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  content text not null,
  embedding_model text,
  embedding extensions.vector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memory_chunks_user_source_idx
  on minds_private.memory_chunks(user_id, source_kind, source_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.documents enable row level security;
alter table public.annotations enable row level security;
alter table public.reading_state enable row level security;
alter table public.mind_threads enable row level security;
alter table public.mind_thread_versions enable row level security;
alter table public.mind_thread_events enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.memory_events enable row level security;
alter table public.memory_links enable row level security;
alter table minds_private.memory_chunks enable row level security;

-- No browser access when unauthenticated.
revoke all on public.documents from anon;
revoke all on public.annotations from anon;
revoke all on public.reading_state from anon;
revoke all on public.mind_threads from anon;
revoke all on public.mind_thread_versions from anon;
revoke all on public.mind_thread_events from anon;
revoke all on public.conversations from anon;
revoke all on public.conversation_messages from anon;
revoke all on public.memory_events from anon;
revoke all on public.memory_links from anon;

-- Mutable owner data.
grant select, insert, update on public.documents to authenticated;
grant select, insert, update, delete on public.annotations to authenticated;
grant select, insert, update on public.reading_state to authenticated;
grant select, insert, update on public.mind_threads to authenticated;
grant select, insert, update on public.mind_thread_versions to authenticated;
grant select, insert on public.mind_thread_events to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert on public.conversation_messages to authenticated;
grant select, insert on public.memory_events to authenticated;
grant select, insert, update on public.memory_links to authenticated;
grant select on public.mind_thread_current_state to authenticated;

-- Private retrieval stays server-only.
revoke all on minds_private.memory_chunks from anon, authenticated;
revoke all on schema minds_private from anon, authenticated;

-- Owner policies.
create policy documents_select_own on public.documents
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy documents_insert_own on public.documents
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy documents_update_own on public.documents
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy annotations_select_own on public.annotations
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy annotations_insert_own on public.annotations
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy annotations_update_own on public.annotations
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy annotations_delete_own on public.annotations
for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy reading_state_select_own on public.reading_state
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy reading_state_insert_own on public.reading_state
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy reading_state_update_own on public.reading_state
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_threads_select_own on public.mind_threads
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy mind_threads_insert_own on public.mind_threads
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy mind_threads_update_own on public.mind_threads
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_versions_select_own on public.mind_thread_versions
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy mind_versions_insert_own on public.mind_thread_versions
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy mind_versions_update_own on public.mind_thread_versions
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy mind_events_select_own on public.mind_thread_events
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy mind_events_insert_own on public.mind_thread_events
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy conversations_select_own on public.conversations
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy conversations_insert_own on public.conversations
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy conversations_update_own on public.conversations
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy conversation_messages_select_own on public.conversation_messages
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy conversation_messages_insert_own on public.conversation_messages
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy memory_events_select_own on public.memory_events
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy memory_events_insert_own on public.memory_events
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy memory_links_select_own on public.memory_links
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy memory_links_insert_own on public.memory_links
for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy memory_links_update_own on public.memory_links
for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Explicitly no browser policies for minds_private.memory_chunks.
