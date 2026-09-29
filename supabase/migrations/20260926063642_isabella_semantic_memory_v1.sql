
create extension if not exists vector with schema extensions;

create table if not exists public.isabella_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_type text not null check (source_type in ('memory','conversation')),
  source_id text not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now(),
  unique(user_id,source_type,source_id)
);

create index if not exists isabella_embeddings_user_idx
  on public.isabella_embeddings(user_id,source_type);

alter table public.isabella_embeddings enable row level security;

drop policy if exists "isabella_embeddings_select_own" on public.isabella_embeddings;
create policy "isabella_embeddings_select_own"
  on public.isabella_embeddings for select
  using (auth.uid()=user_id);

drop policy if exists "isabella_embeddings_insert_own" on public.isabella_embeddings;
create policy "isabella_embeddings_insert_own"
  on public.isabella_embeddings for insert
  with check (auth.uid()=user_id);

drop policy if exists "isabella_embeddings_update_own" on public.isabella_embeddings;
create policy "isabella_embeddings_update_own"
  on public.isabella_embeddings for update
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

drop policy if exists "isabella_embeddings_delete_own" on public.isabella_embeddings;
create policy "isabella_embeddings_delete_own"
  on public.isabella_embeddings for delete
  using (auth.uid()=user_id);

grant select,insert,update,delete on public.isabella_embeddings to authenticated;

create or replace function public.isabella_semantic_recall(
  p_embedding extensions.vector(1536),
  p_limit integer default 10
)
returns table(
  source_type text,
  source_id text,
  content text,
  score real
)
language sql
stable
security invoker
set search_path=public,extensions
as $$
  select
    e.source_type,
    e.source_id,
    e.content,
    (1 - (e.embedding <=> p_embedding))::real as score
  from public.isabella_embeddings e
  where e.user_id=auth.uid()
  order by e.embedding <=> p_embedding
  limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_semantic_recall(extensions.vector,integer) to authenticated;
