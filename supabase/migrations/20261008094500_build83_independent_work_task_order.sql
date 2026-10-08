-- Build 83 follow-up: Work bucket order and Calendar day order are different user intents.
-- Keep one canonical task row, but give Work its own ordering coordinate instead of overloading
-- isabella_tasks.sort_order, which remains the Calendar/list execution order.

alter table public.isabella_tasks
  add column if not exists work_sort_order integer;

update public.isabella_tasks
set work_sort_order = sort_order
where work_sort_order is null
  and project_id is not null;

create index if not exists isabella_tasks_project_bucket_work_order_idx
  on public.isabella_tasks(project_id, work_bucket_id, work_sort_order)
  where archived_at is null;
