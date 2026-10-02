-- Build 71 — activate the custom-authenticated delivery runner after deployment.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='minds-delivery-runner' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'minds-delivery-runner',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-delivery-runner',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'secret',
      (select value from public.isabella_runtime_secrets where key='delivery_runner')
    )
  );
  $cron$
);
