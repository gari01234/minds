create or replace function minds_private.sweep_expectations()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.minds_expectations;
  n integer:=0;
begin
  for e in
    select * from public.minds_expectations
    where status='active' and due_at<=now()
    order by due_at
    for update skip locked
  loop
    begin
      update public.minds_expectations
      set status='due_unconfirmed',due_detected_at=coalesce(due_detected_at,now()),updated_at=now()
      where id=e.id and status='active'
      returning * into e;
      if not found then continue; end if;

      perform public.minds_publish_attention(
        e.user_id,
        jsonb_build_object(
          'event_key','expectation:'||e.id::text||':due:'||extract(epoch from e.due_at)::bigint::text,
          'source_type','expectation',
          'source_id',e.id::text,
          'event_type','expectation_due',
          'title','Algo que esperabas ya debería haber ocurrido',
          'body','“'||left(e.expected_event,900)||'” ya alcanzó la fecha acordada. No tengo evidencia suficiente para decir si ocurrió. Está pendiente de comprobar.',
          'urgency','attention',
          'requires_user',false,
          'user_requested',false,
          'deadline_at',e.due_at,
          'metadata',jsonb_build_object(
            'expectation_id',e.id,
            'epistemic_state','unknown',
            'human_label','Pendiente de comprobar'
          )
        )
      );
      n:=n+1;
    exception when others then
      raise warning 'Expectation sweep failed for %: %',e.id,sqlerrm;
    end;
  end loop;
  return n;
end $$;
