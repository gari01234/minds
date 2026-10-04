alter table public.conversations
  drop constraint if exists conversations_app_scope_check;

alter table public.conversations
  add constraint conversations_app_scope_check
  check (app_scope = any (array[
    'theory'::text,
    'isabella'::text,
    'sofia'::text,
    'work_thread'::text
  ]));

create table if not exists public.minds_work_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  title text not null,
  summary text not null default '',
  status text not null default 'active'
    check (status in ('active','archived')),
  capability_profile jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  last_activity_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) between 1 and 160)
);

create index if not exists minds_work_threads_project_idx
  on public.minds_work_threads(user_id,project_id,status,sort_order,updated_at desc);

create index if not exists minds_work_threads_project_fk_idx
  on public.minds_work_threads(project_id);

create index if not exists minds_work_threads_conversation_idx
  on public.minds_work_threads(conversation_id)
  where conversation_id is not null;

create unique index if not exists minds_work_threads_active_title_uidx
  on public.minds_work_threads(user_id,project_id,lower(title))
  where status='active';

alter table public.minds_work_threads enable row level security;

drop policy if exists "work_threads_select_own" on public.minds_work_threads;
create policy "work_threads_select_own"
  on public.minds_work_threads for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "work_threads_insert_own_project" on public.minds_work_threads;
create policy "work_threads_insert_own_project"
  on public.minds_work_threads for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.isabella_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "work_threads_update_own_project" on public.minds_work_threads;
create policy "work_threads_update_own_project"
  on public.minds_work_threads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.isabella_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "work_threads_delete_own" on public.minds_work_threads;
create policy "work_threads_delete_own"
  on public.minds_work_threads for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select,insert,update,delete on table public.minds_work_threads to authenticated;
revoke all on table public.minds_work_threads from anon;

create or replace function public.minds_ensure_work_thread_conversation(p_thread_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_thread public.minds_work_threads%rowtype;
  v_conversation uuid;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select *
  into v_thread
  from public.minds_work_threads
  where id = p_thread_id
    and user_id = v_user
    and status = 'active'
  for update;

  if not found then
    raise exception 'work_thread_not_found' using errcode='P0002';
  end if;

  if v_thread.conversation_id is not null then
    return v_thread.conversation_id;
  end if;

  insert into public.conversations(
    user_id,
    app_scope,
    origin_kind,
    origin_anchor,
    title,
    mode,
    metadata
  )
  values (
    v_user,
    'work_thread',
    'global',
    jsonb_build_object(
      'type','work_thread',
      'id',v_thread.id::text,
      'label',v_thread.title
    ),
    v_thread.title,
    'memory',
    jsonb_build_object(
      'app','work_thread',
      'work_thread_id',v_thread.id,
      'project_id',v_thread.project_id
    )
  )
  returning id into v_conversation;

  update public.minds_work_threads
  set conversation_id = v_conversation,
      updated_at = now()
  where id = v_thread.id
    and user_id = v_user;

  return v_conversation;
end;
$$;

revoke all on function public.minds_ensure_work_thread_conversation(uuid) from public;
revoke all on function public.minds_ensure_work_thread_conversation(uuid) from anon;
grant execute on function public.minds_ensure_work_thread_conversation(uuid) to authenticated;

insert into public.minds_work_threads(
  user_id,
  project_id,
  title,
  sort_order,
  capability_profile,
  metadata
)
select
  p.user_id,
  p.id,
  v.title,
  v.sort_order,
  v.profile,
  '{"seed":"build_78"}'::jsonb
from public.isabella_projects p
cross join (
  values
    ('HLS & TWP',10,'{"preferred_specialists":["work","document","planning"]}'::jsonb),
    ('Controlling',20,'{"preferred_specialists":["work","planning","document"]}'::jsonb),
    ('Aufzug',30,'{"preferred_specialists":["work","document"]}'::jsonb),
    ('Garderobe',40,'{"preferred_specialists":["work","document"]}'::jsonb),
    ('Fragen Normen',50,'{"preferred_specialists":["research","document","work"]}'::jsonb)
) as v(title,sort_order,profile)
where p.client_key = 'bernried'
  and p.archived = false
on conflict do nothing;
