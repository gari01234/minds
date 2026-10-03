begin;

insert into auth.users(id,aud,role,email)
values ('f7630000-0000-4000-8000-000000000076','authenticated','authenticated','expectation-engine-test@example.invalid');

select set_config('request.jwt.claim.sub','f7630000-0000-4000-8000-000000000076',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  u uuid:='f7630000-0000-4000-8000-000000000076';
  created jsonb;
  reviewed jsonb;
  eid uuid;
  failed boolean:=false;
  create_request uuid:='f7630000-0000-4000-8000-000000000001';
  reschedule_request uuid:='f7630000-0000-4000-8000-000000000002';
  resolve_request uuid:='f7630000-0000-4000-8000-000000000003';
  route jsonb;
begin
  begin
    perform public.minds_create_expectation(
      '{"title":"Respuesta del proveedor","expected_event":"El proveedor debería enviar la confirmación","due_date":"2099-01-02","due_precision":"date","timezone":"Europe/Berlin","expectation_type":"reply"}'::jsonb,
      create_request,false
    );
  exception when others then failed:=true; end;
  if not failed then raise exception 'expectation_confirmation_required'; end if;

  created:=public.minds_create_expectation(
    '{"title":"Respuesta del proveedor","expected_event":"El proveedor debería enviar la confirmación","due_date":"2099-01-02","due_precision":"date","timezone":"Europe/Berlin","expectation_type":"reply"}'::jsonb,
    create_request,true
  );
  eid:=(created->'expectation'->>'id')::uuid;

  if created->'expectation'->>'status'<>'active' then raise exception 'expectation_not_active'; end if;
  if created->'expectation'->>'resolution_source' is not null then raise exception 'expectation_resolution_source_should_be_null'; end if;

  if (public.minds_create_expectation(
    '{"title":"Duplicado","expected_event":"Ignorar","due_date":"2099-01-03","due_precision":"date","timezone":"Europe/Berlin","expectation_type":"other"}'::jsonb,
    create_request,true
  )->'expectation'->>'id')::uuid<>eid then
    raise exception 'expectation_create_not_idempotent';
  end if;

  set local role authenticated;
  failed:=false;
  begin update public.minds_expectations set status='not_occurred' where id=eid; exception when others then failed:=true; end;
  reset role;
  if not failed then raise exception 'expectation_direct_update_exposed'; end if;

  failed:=false;
  begin
    perform public.minds_review_expectation(
      eid,'not_occurred','No debería permitirse antes de la fecha',null,null,null,null,null,
      'f7630000-0000-4000-8000-000000000004'::uuid,true
    );
  exception when others then failed:=true; end;
  if not failed then raise exception 'expectation_future_not_occurred_allowed'; end if;

  reviewed:=public.minds_review_expectation(
    eid,'reschedule','Sigue previsto',null,'2099-01-04',null,'date','Europe/Berlin',
    reschedule_request,true
  );
  if reviewed->'expectation'->>'status'<>'active' then raise exception 'expectation_reschedule_failed'; end if;

  update public.minds_expectations
  set status='due_unconfirmed',due_at=now()-interval '1 minute',due_detected_at=now()
  where id=eid;

  if (select resolution_source from public.minds_expectations where id=eid) is not null then
    raise exception 'expectation_due_unconfirmed_claimed_resolution';
  end if;
  if (select not_occurred_at from public.minds_expectations where id=eid) is not null then
    raise exception 'expectation_due_unconfirmed_claimed_absence';
  end if;

  reviewed:=public.minds_review_expectation(
    eid,'not_occurred','El usuario confirma que no ocurrió',null,null,null,null,null,
    resolve_request,true
  );
  if reviewed->'expectation'->>'status'<>'not_occurred' then raise exception 'expectation_not_occurred_failed'; end if;
  if reviewed->'expectation'->>'resolution_source'<>'user' then raise exception 'expectation_resolution_source_not_user'; end if;

  if public.minds_review_expectation(
    eid,'not_occurred','duplicado',null,null,null,null,null,resolve_request,true
  )->>'status'<>'already_reviewed' then
    raise exception 'expectation_review_not_idempotent';
  end if;

  route:=public.minds_route_attention(
    u,
    jsonb_build_object(
      'event_type','expectation_due',
      'urgency','attention',
      'requires_user',false,
      'user_requested',false
    )
  );
  if route->>'route'<>'ambient' then raise exception 'expectation_due_not_ambient'; end if;

  if exists(select 1 from public.isabella_tasks where user_id=u) then raise exception 'expectation_created_task'; end if;
  if exists(select 1 from public.minds_commitments where user_id=u) then raise exception 'expectation_created_commitment'; end if;
  if exists(select 1 from cron.job where jobname='minds-expectation-sweep') then raise exception 'parallel_expectation_cron_exists'; end if;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='minds_private' and p.proname='sweep_expectations'
  ) then raise exception 'parallel_expectation_sweep_exists'; end if;
end $$;

rollback;
