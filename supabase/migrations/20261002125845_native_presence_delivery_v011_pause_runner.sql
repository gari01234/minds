-- Operational safety gate: keep the delivery cron disabled until the new
-- custom-authenticated Edge Function is deployed and verified.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='minds-delivery-runner' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
