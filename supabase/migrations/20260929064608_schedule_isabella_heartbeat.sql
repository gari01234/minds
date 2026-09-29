
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='isabella-heartbeat' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;
select cron.schedule(
  'isabella-heartbeat',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-heartbeat',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'secret',
        (select value from public.isabella_runtime_secrets where key='heartbeat_runner')
      )
    );
  $cron$
);
