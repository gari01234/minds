-- Build 74 canonical behavioral contract. All fixtures roll back.
begin;

insert into auth.users(id,aud,role,email)
values ('f7400000-0000-4000-8000-000000000074','authenticated','authenticated','pom74-test@example.invalid');

select set_config('request.jwt.claim.sub','f7400000-0000-4000-8000-000000000074',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  u uuid:='f7400000-0000-4000-8000-000000000074';
  proposed jsonb;
  reviewed jsonb;
  repeated jsonb;
  hid uuid;
  cid uuid;
  q_accept uuid:='f7400000-0000-4000-8000-000000000081';
  q_retire uuid:='f7400000-0000-4000-8000-000000000082';
  q_claim uuid:='f7400000-0000-4000-8000-000000000083';
  q_replace uuid:='f7400000-0000-4000-8000-000000000084';
  failed boolean:=false;
  i integer;
  model jsonb;
begin
  if has_table_privilege('authenticated','public.isabella_model_claims','INSERT')
     or has_table_privilege('authenticated','public.isabella_model_claims','UPDATE')
     or has_table_privilege('authenticated','public.minds_operating_model_hypotheses','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_model_observations','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_model_reviews','INSERT') then
    raise exception 'TEST74 direct model writes exposed';
  end if;

  -- Explicit user statements can become confirmed immediately.
  proposed:=public.minds_record_explicit_model_claim(
    'preference',
    'Prefiero revisar los cambios importantes antes de aplicarlos.',
    'Explicit test',
    'conversation'
  );
  cid:=(proposed->>'claim_id')::uuid;
  if not exists(
    select 1 from public.isabella_model_claims
    where id=cid and user_id=u and status='confirmed' and source_type='explicit'
  ) then raise exception 'TEST74 explicit claim not confirmed'; end if;

  -- A conversational inference stays proposed and does not materialize as truth.
  proposed:=public.minds_propose_operating_model_hypothesis(
    'planning','working_style',
    'Suelo preferir que Isabella explique qué cambiaría antes de ejecutar una propuesta.',
    'Inferencia revisable de conversación.',
    'conversation','test:conversation','El usuario pidió claridad antes de ejecutar.'
  );
  hid:=(proposed->>'hypothesis_id')::uuid;
  if not exists(
    select 1 from public.minds_operating_model_hypotheses
    where id=hid and user_id=u and status='proposed'
  ) then raise exception 'TEST74 hypothesis not proposed'; end if;
  if exists(
    select 1 from public.isabella_model_claims
    where user_id=u and claim='Suelo preferir que Isabella explique qué cambiaría antes de ejecutar una propuesta.'
  ) then raise exception 'TEST74 proposal became claim without review'; end if;

  -- Confirmation is mandatory.
  failed:=false;
  begin
    perform public.minds_review_operating_model_hypothesis(hid,'accept',null,q_accept,false);
  exception when others then failed:=true; end;
  if not failed then raise exception 'TEST74 operating review confirmation not required'; end if;

  reviewed:=public.minds_review_operating_model_hypothesis(hid,'accept',null,q_accept,true);
  repeated:=public.minds_review_operating_model_hypothesis(hid,'accept',null,q_accept,true);
  if reviewed->>'decision'<>'accept' or repeated->>'status'<>'already_reviewed' then
    raise exception 'TEST74 operating review idempotency failed';
  end if;
  cid:=(reviewed->>'resulting_claim_id')::uuid;
  if not exists(
    select 1 from public.isabella_model_claims
    where id=cid and user_id=u and status='confirmed' and source_type='observed'
  ) then raise exception 'TEST74 accepted hypothesis not materialized'; end if;

  -- Accepted rule can later be explicitly retired; both receipts remain.
  reviewed:=public.minds_review_operating_model_hypothesis(hid,'retire',null,q_retire,true);
  if reviewed->>'decision'<>'retire' then raise exception 'TEST74 retire failed'; end if;
  if (select status from public.isabella_model_claims where id=cid)<>'stale' then
    raise exception 'TEST74 retired derived claim remained active';
  end if;
  if (select count(*) from public.minds_operating_model_reviews where hypothesis_id=hid)<>2 then
    raise exception 'TEST74 accept plus retire receipts missing';
  end if;

  -- Rejected hypotheses never create claims.
  proposed:=public.minds_propose_operating_model_hypothesis(
    'review','pattern','Prefiero revisar siempre dos veces cada tarea.',
    'Rejected test','conversation','test:reject','Only a test'
  );
  hid:=(proposed->>'hypothesis_id')::uuid;
  perform public.minds_review_operating_model_hypothesis(
    hid,'reject',null,'f7400000-0000-4000-8000-000000000085'::uuid,true
  );
  if exists(
    select 1 from public.isabella_model_claims
    where user_id=u and claim='Prefiero revisar siempre dos veces cada tarea.'
  ) then raise exception 'TEST74 rejected hypothesis materialized'; end if;

  -- A correction of a proposed hypothesis becomes explicit, not observed.
  proposed:=public.minds_propose_operating_model_hypothesis(
    'communication','interaction','Prefiero respuestas extremadamente breves.',
    'Replacement test','conversation','test:replace','Only a test'
  );
  hid:=(proposed->>'hypothesis_id')::uuid;
  reviewed:=public.minds_review_operating_model_hypothesis(
    hid,'replace','Prefiero respuestas concisas, pero con detalle cuando el trabajo lo exige.',q_replace,true
  );
  if not exists(
    select 1 from public.isabella_model_claims
    where id=(reviewed->>'resulting_claim_id')::uuid
      and source_type='explicit' and status='confirmed'
  ) then raise exception 'TEST74 corrected hypothesis not explicit'; end if;

  -- Confirmed claim review is durable and idempotent.
  proposed:=public.minds_record_explicit_model_claim(
    'preference','Prefiero cambios reversibles.','Claim review test','conversation'
  );
  cid:=(proposed->>'claim_id')::uuid;
  reviewed:=public.minds_review_model_claim(
    cid,'confirmed',null,'preference','Reviewed',q_claim,true
  );
  repeated:=public.minds_review_model_claim(
    cid,'confirmed',null,'preference','Reviewed',q_claim,true
  );
  if reviewed->>'status'<>'updated' or repeated->>'status'<>'already_reviewed' then
    raise exception 'TEST74 confirmed claim review idempotency failed';
  end if;
  if (select count(*) from public.minds_model_claim_reviews where user_id=u and request_id=q_claim)<>1 then
    raise exception 'TEST74 model claim review receipt missing';
  end if;

  -- Sensitive inference must fail closed.
  failed:=false;
  begin
    perform public.minds_propose_operating_model_hypothesis(
      'planning','pattern',
      'El usuario tiene un diagnóstico médico que cambia su planificación.',
      'Sensitive test','conversation','test:sensitive','medical'
    );
  exception when others then failed:=true; end;
  if not failed then raise exception 'TEST74 sensitive inference allowed'; end if;

  -- A transparent deterministic pattern may only become a proposal.
  for i in 1..8 loop
    insert into public.minds_operating_model_observations(
      user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
    ) values (
      u,'task_management','proposal_outcome','shadow_decision','synthetic:'||i,
      'task proposal accepted',
      '{"outcome":"accepted","timing_mode":"all_day"}'::jsonb,
      md5('synthetic:'||i),
      now()-(i%3)*interval '1 day'
    );
  end loop;
  perform minds_private.refresh_task_timing_hypothesis(u);
  if not exists(
    select 1 from public.minds_operating_model_hypotheses
    where user_id=u and pattern_key='task_timing_mode' and status='proposed'
      and (evidence_summary->>'support_count')::int=8
      and (evidence_summary->>'observation_days')::int>=3
  ) then raise exception 'TEST74 deterministic pattern did not produce transparent proposal'; end if;

  model:=public.minds_get_personal_operating_model();
  if jsonb_array_length(model->'confirmed_claims')<1 then
    raise exception 'TEST74 confirmed claims missing from model';
  end if;
  if jsonb_array_length(model->'proposed')<1 then
    raise exception 'TEST74 pending proposals missing from review surface';
  end if;
end $$;

select 'PASS: Build 74 evidence → hypothesis → explicit review → confirmed claim is bounded and reviewable' as result;
rollback;
