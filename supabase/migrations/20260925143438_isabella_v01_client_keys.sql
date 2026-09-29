
alter table public.isabella_categories add column if not exists client_key text;
alter table public.isabella_projects add column if not exists client_key text;
alter table public.isabella_tasks add column if not exists client_key text;
alter table public.isabella_events add column if not exists client_key text;
alter table public.isabella_memories add column if not exists client_key text;
alter table public.isabella_people add column if not exists client_key text;
alter table public.isabella_followups add column if not exists client_key text;

create unique index if not exists isabella_categories_user_client_key_uq on public.isabella_categories(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_projects_user_client_key_uq on public.isabella_projects(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_tasks_user_client_key_uq on public.isabella_tasks(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_events_user_client_key_uq on public.isabella_events(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_memories_user_client_key_uq on public.isabella_memories(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_people_user_client_key_uq on public.isabella_people(user_id, client_key) where client_key is not null;
create unique index if not exists isabella_followups_user_client_key_uq on public.isabella_followups(user_id, client_key) where client_key is not null;
