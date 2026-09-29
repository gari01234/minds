alter table public.isabella_tasks
         add column if not exists reminder_time time without time zone;