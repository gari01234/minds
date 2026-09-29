
create index if not exists isabella_projects_category_user_fk_idx
  on public.isabella_projects(category_id, user_id);

create index if not exists isabella_tasks_category_user_fk_idx
  on public.isabella_tasks(category_id, user_id);

create index if not exists isabella_tasks_project_user_fk_idx
  on public.isabella_tasks(project_id, user_id);

create index if not exists isabella_task_reminders_task_user_fk_idx
  on public.isabella_task_reminders(task_id, user_id);

create index if not exists isabella_events_category_user_fk_idx
  on public.isabella_events(category_id, user_id);

create index if not exists isabella_events_project_user_fk_idx
  on public.isabella_events(project_id, user_id);
