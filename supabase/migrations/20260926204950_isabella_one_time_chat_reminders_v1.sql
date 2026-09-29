
alter table public.isabella_routines
  drop constraint if exists isabella_routines_schedule_check,
  drop constraint if exists isabella_routines_schedule_check1;

alter table public.isabella_routines
  add constraint isabella_routines_schedule_kind_check
    check ((schedule->>'kind') in ('once','daily','weekly')),
  add constraint isabella_routines_schedule_time_check
    check ((schedule->>'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint isabella_routines_schedule_date_check
    check (
      (schedule->>'kind') <> 'once'
      or (schedule->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    );

create or replace function public.isabella_next_routine_run(
  p_schedule jsonb,
  p_timezone text,
  p_after timestamptz default now()
) returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_kind text := coalesce(p_schedule->>'kind','daily');
  v_time time := coalesce(nullif(p_schedule->>'time','')::time,'08:00'::time);
  v_weekdays int[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_schedule->'weekdays','[]'::jsonb))::int), '{}'::int[]);
  v_local_after timestamp;
  v_date date;
  v_candidate timestamp;
  i int;
begin
  v_local_after := p_after at time zone p_timezone;

  if v_kind = 'once' then
    v_date := nullif(p_schedule->>'date','')::date;
    if v_date is null then return null; end if;
    v_candidate := v_date + v_time;
    if v_candidate > v_local_after then
      return v_candidate at time zone p_timezone;
    end if;
    return null;
  end if;

  for i in 0..14 loop
    v_date := v_local_after::date + i;
    if v_kind = 'daily'
       or (v_kind = 'weekly' and extract(dow from v_date)::int = any(v_weekdays)) then
      v_candidate := v_date + v_time;
      if v_candidate > v_local_after then
        return v_candidate at time zone p_timezone;
      end if;
    end if;
  end loop;
  return null;
exception when others then
  return null;
end;
$$;
