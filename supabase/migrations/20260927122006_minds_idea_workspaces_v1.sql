
create table if not exists public.minds_idea_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_item_id uuid null references public.minds_surface_items(id) on delete set null,
  title text not null,
  brief text not null default '',
  why text not null default '',
  agent text not null default 'minds',
  status text not null default 'active' check (status in ('active','done','archived')),
  artifact_title text null,
  artifact_content text null,
  artifact_format text null default 'markdown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists minds_idea_workspaces_user_status_idx
  on public.minds_idea_workspaces(user_id,status,updated_at desc);

create unique index if not exists minds_idea_workspaces_source_unique
  on public.minds_idea_workspaces(user_id,source_item_id)
  where source_item_id is not null;

alter table public.minds_idea_workspaces enable row level security;

drop policy if exists "minds idea workspaces own" on public.minds_idea_workspaces;
create policy "minds idea workspaces own"
on public.minds_idea_workspaces for all
to authenticated
using (auth.uid()=user_id)
with check (auth.uid()=user_id);

create table if not exists public.minds_idea_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.minds_idea_workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists minds_idea_messages_workspace_idx
  on public.minds_idea_messages(workspace_id,created_at asc);

alter table public.minds_idea_messages enable row level security;

drop policy if exists "minds idea messages own" on public.minds_idea_messages;
create policy "minds idea messages own"
on public.minds_idea_messages for all
to authenticated
using (
  auth.uid()=user_id
  and exists (
    select 1 from public.minds_idea_workspaces w
    where w.id=workspace_id and w.user_id=auth.uid()
  )
)
with check (
  auth.uid()=user_id
  and exists (
    select 1 from public.minds_idea_workspaces w
    where w.id=workspace_id and w.user_id=auth.uid()
  )
);
