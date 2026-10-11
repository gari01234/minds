-- Knowledge Intake 0.2: bounded source-first worker, one file per five minutes.
-- A dedicated runtime secret is checked inside the Edge Function.
-- Existing Desktop files are deliberately not enqueued in this migration.
insert into public.isabella_runtime_secrets(key,value)
values('work_ingest_runner',md5(gen_random_uuid()::text||clock_timestamp()::text))
on conflict(key) do nothing;
select cron.schedule('minds-work-ingest-runner','*/5 * * * *',
$$select net.http_post(
  url:='https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-work-ingest-runner',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('secret',
    (select value from public.isabella_runtime_secrets where key='work_ingest_runner')),
  timeout_milliseconds:=115000
)$$);
