insert into public.isabella_runtime_secrets(key,value)
values (
  'capability_runner',
  replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
)
on conflict (key) do nothing;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='minds-capability-runner' limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'minds-capability-runner',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-capability-runner',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'secret',
        (select value from public.isabella_runtime_secrets where key='capability_runner')
      )
    );
  $cron$
);
