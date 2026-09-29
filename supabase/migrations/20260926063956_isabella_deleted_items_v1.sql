
create table if not exists public.isabella_deleted_items (
  user_id uuid not null default auth.uid(),
  entity_type text not null check (entity_type in ('task','event')),
  client_key text not null,
  deleted_at timestamptz not null default now(),
  primary key(user_id,entity_type,client_key)
);

alter table public.isabella_deleted_items enable row level security;

drop policy if exists "isabella_deleted_select_own" on public.isabella_deleted_items;
create policy "isabella_deleted_select_own"
  on public.isabella_deleted_items for select
  using (auth.uid()=user_id);

drop policy if exists "isabella_deleted_insert_own" on public.isabella_deleted_items;
create policy "isabella_deleted_insert_own"
  on public.isabella_deleted_items for insert
  with check (auth.uid()=user_id);

drop policy if exists "isabella_deleted_update_own" on public.isabella_deleted_items;
create policy "isabella_deleted_update_own"
  on public.isabella_deleted_items for update
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

grant select,insert,update on public.isabella_deleted_items to authenticated;
