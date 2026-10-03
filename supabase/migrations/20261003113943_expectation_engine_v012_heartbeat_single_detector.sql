do $$
begin
  if exists(select 1 from cron.job where jobname='minds-expectation-sweep') then
    perform cron.unschedule('minds-expectation-sweep');
  end if;
end $$;

drop function if exists minds_private.sweep_expectations();
