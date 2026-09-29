
alter table public.isabella_categories alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_projects alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_tasks alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_events alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_memories alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_people alter column client_key set default gen_random_uuid()::text;
alter table public.isabella_followups alter column client_key set default gen_random_uuid()::text;

update public.isabella_categories set client_key = id::text where client_key is null;
update public.isabella_projects set client_key = id::text where client_key is null;
update public.isabella_tasks set client_key = id::text where client_key is null;
update public.isabella_events set client_key = id::text where client_key is null;
update public.isabella_memories set client_key = id::text where client_key is null;
update public.isabella_people set client_key = id::text where client_key is null;
update public.isabella_followups set client_key = id::text where client_key is null;

alter table public.isabella_categories alter column client_key set not null;
alter table public.isabella_projects alter column client_key set not null;
alter table public.isabella_tasks alter column client_key set not null;
alter table public.isabella_events alter column client_key set not null;
alter table public.isabella_memories alter column client_key set not null;
alter table public.isabella_people alter column client_key set not null;
alter table public.isabella_followups alter column client_key set not null;

alter table public.isabella_categories drop constraint if exists isabella_categories_user_client_key_key;
alter table public.isabella_projects drop constraint if exists isabella_projects_user_client_key_key;
alter table public.isabella_tasks drop constraint if exists isabella_tasks_user_client_key_key;
alter table public.isabella_events drop constraint if exists isabella_events_user_client_key_key;
alter table public.isabella_memories drop constraint if exists isabella_memories_user_client_key_key;
alter table public.isabella_people drop constraint if exists isabella_people_user_client_key_key;
alter table public.isabella_followups drop constraint if exists isabella_followups_user_client_key_key;

alter table public.isabella_categories add constraint isabella_categories_user_client_key_key unique (user_id, client_key);
alter table public.isabella_projects add constraint isabella_projects_user_client_key_key unique (user_id, client_key);
alter table public.isabella_tasks add constraint isabella_tasks_user_client_key_key unique (user_id, client_key);
alter table public.isabella_events add constraint isabella_events_user_client_key_key unique (user_id, client_key);
alter table public.isabella_memories add constraint isabella_memories_user_client_key_key unique (user_id, client_key);
alter table public.isabella_people add constraint isabella_people_user_client_key_key unique (user_id, client_key);
alter table public.isabella_followups add constraint isabella_followups_user_client_key_key unique (user_id, client_key);

alter table public.isabella_tasks drop constraint if exists isabella_tasks_category_owner_fk;
alter table public.isabella_tasks drop constraint if exists isabella_tasks_project_owner_fk;
alter table public.isabella_events drop constraint if exists isabella_events_category_owner_fk;
alter table public.isabella_events drop constraint if exists isabella_events_project_owner_fk;

alter table public.isabella_tasks
  add constraint isabella_tasks_category_owner_fk
  foreign key (category_id, user_id)
  references public.isabella_categories(id, user_id)
  on delete set null (category_id);

alter table public.isabella_tasks
  add constraint isabella_tasks_project_owner_fk
  foreign key (project_id, user_id)
  references public.isabella_projects(id, user_id)
  on delete set null (project_id);

alter table public.isabella_events
  add constraint isabella_events_category_owner_fk
  foreign key (category_id, user_id)
  references public.isabella_categories(id, user_id)
  on delete set null (category_id);

alter table public.isabella_events
  add constraint isabella_events_project_owner_fk
  foreign key (project_id, user_id)
  references public.isabella_projects(id, user_id)
  on delete set null (project_id);
