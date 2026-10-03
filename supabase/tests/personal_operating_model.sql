-- Build 74 consolidated Personal Operating Model contract. All fixtures roll back.
begin;

insert into auth.users(id,aud,role,email)
values ('f7400000-0000-4000-8000-000000000074','authenticated','authenticated','pom74-test@example.invalid');

insert into public.minds_operating_model_observations(
  id,user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
) values
(
  'f7400000-0000-4000-8000-000000000001',
  'f7400000-0000-4000-8000-000000000074',
  'communication','explicit_statement','manual','test:explicit',
  'El usuario confirmó una regla explícita de colaboración.',
  '{"test":true}'::jsonb,md5('test74-explicit'),now()
),
(
  'f7400000-0000-4000-8000-000000000002',
  'f7400000-0000-4000-8000-000000000074',
  'communication','proposal_outcome','proposal_feedback','test:behavioral',
  'Existe un receipt factual de feedback, sin inferir causa.',
  '{"test":true}'::jsonb,md5('test74-behavioral'),now()
);

insert into public.minds_operating_model_hypotheses(
  id,user_id,dimension,claim_type,statement,inference_kind,pattern_key,
  rationale,evidence_summary,status,metadata
) values (
  'f7400000-0000-4000-8000-000000000010',
  'f7400000-0000-4000-8000-000000000074',
  'communication','working_style',
  'Cuando haya pocas alternativas claras, Isabella puede ofrecer opciones breves en lugar de pedir una respuesta larga.',
  'deterministic_pattern','test74:communication:one',
  'La regla se apoya en evidencia explícita y un receipt conductual.',
  '{"support_count":2,"source_types":["manual","proposal_feedback"],"has_explicit_evidence":true,"transparent":true}'::jsonb,
  'proposed','{"requires_explicit_review":true}'::jsonb
);

insert into public.minds_operating_model_evidence(user_id,hypothesis_id,observation_id,stance)
values
('f7400000-0000-4000-8000-000000000074','f7400000-0000-4000-8000-000000000010','f7400000-0000-4000-8000-000000000001','supports'),
('f7400000-0000-4000-8000-000000000074','f7400000-0000-4000-8000-000000000010','f7400000-0000-4000-8000-000000000002','supports');

select set_config('request.jwt.claim.sub','f7400000-0000-4000-8000-000000000074',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare
  before_review jsonb;
  after_review jsonb;
  failed boolean:=false;
begin
  before_review:=public.minds_get_personal_operating_model();

  if jsonb_array_length(before_review->'accepted')<>0 then
    raise exception 'TEST74 unreviewed rule influenced accepted model';
  end if;
  if jsonb_array_length(before_review->'proposed')<>1 then
    raise exception 'TEST74 proposal not visible for review';
  end if;

  if has_table_privilege('authenticated','public.minds_operating_model_hypotheses','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_model_observations','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_model_reviews','INSERT') then
    raise exception 'TEST74 direct model writes exposed';
  end if;

  begin
    perform public.minds_review_operating_hypothesis(
      'f7400000-0000-4000-8000-000000000010'::uuid,
      'accept',null,
      'f7400000-0000-4000-8000-000000000020'::uuid,
      false
    );
  exception when others then
    failed:=true;
  end;
  if not failed then raise exception 'TEST74 confirmation not required'; end if;

  perform public.minds_review_operating_hypothesis(
    'f7400000-0000-4000-8000-000000000010'::uuid,
    'correct',
    'Si hay pocas alternativas claras, Isabella debe ofrecer opciones breves antes de pedir una respuesta larga.',
    'f7400000-0000-4000-8000-000000000021'::uuid,
    true
  );

  after_review:=public.minds_get_personal_operating_model();
  if jsonb_array_length(after_review->'accepted')<>1 then
    raise exception 'TEST74 corrected rule missing from accepted projection';
  end if;
  if jsonb_array_length(after_review->'proposed')<>0 then
    raise exception 'TEST74 corrected rule remained proposed';
  end if;
  if after_review->'accepted'->0->>'accepted_statement' <>
     'Si hay pocas alternativas claras, Isabella debe ofrecer opciones breves antes de pedir una respuesta larga.' then
    raise exception 'TEST74 corrected statement not preserved';
  end if;
end $$;

reset role;

do $$
declare failed boolean:=false;
begin
  begin
    insert into public.minds_operating_model_hypotheses(
      id,user_id,dimension,claim_type,statement,inference_kind,pattern_key,
      rationale,evidence_summary,status,metadata
    ) values (
      'f7400000-0000-4000-8000-000000000011',
      'f7400000-0000-4000-8000-000000000074',
      'communication','working_style','Segunda regla activa de comunicación.',
      'deterministic_pattern','test74:communication:two','Debe bloquearse mientras exista una regla corregida activa.',
      '{"support_count":1,"source_types":["manual"],"has_explicit_evidence":true,"transparent":true}'::jsonb,
      'proposed','{"requires_explicit_review":true}'::jsonb
    );
  exception when unique_violation then
    failed:=true;
  end;
  if not failed then raise exception 'TEST74 second active rule allowed in same dimension'; end if;
end $$;

select set_config('request.jwt.claim.sub','f7400000-0000-4000-8000-000000000074',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select public.minds_review_operating_hypothesis(
  'f7400000-0000-4000-8000-000000000010'::uuid,
  'retire',null,
  'f7400000-0000-4000-8000-000000000022'::uuid,
  true
);

reset role;

insert into public.minds_operating_model_hypotheses(
  id,user_id,dimension,claim_type,statement,inference_kind,pattern_key,
  rationale,evidence_summary,status,metadata
) values (
  'f7400000-0000-4000-8000-000000000011',
  'f7400000-0000-4000-8000-000000000074',
  'communication','working_style','Segunda regla de comunicación después de retirar la anterior.',
  'deterministic_pattern','test74:communication:two','La dimensión debe quedar libre tras retire.',
  '{"support_count":1,"source_types":["manual"],"has_explicit_evidence":true,"transparent":true}'::jsonb,
  'proposed','{"requires_explicit_review":true}'::jsonb
);

do $$
begin
  if (select count(*) from public.minds_operating_model_reviews
      where user_id='f7400000-0000-4000-8000-000000000074')<>2 then
    raise exception 'TEST74 review receipts missing';
  end if;
  if (select status from public.minds_operating_model_hypotheses
      where id='f7400000-0000-4000-8000-000000000010')<>'stale' then
    raise exception 'TEST74 retire failed';
  end if;
  if (select status from public.minds_operating_model_hypotheses
      where id='f7400000-0000-4000-8000-000000000011')<>'proposed' then
    raise exception 'TEST74 dimension not released after retire';
  end if;
  if to_regclass('public.minds_operating_observations') is not null
     or to_regclass('public.minds_operating_hypotheses') is not null
     or to_regclass('public.minds_operating_reviews') is not null then
    raise exception 'TEST74 legacy parallel ontology still exists';
  end if;
end $$;

select 'PASS: consolidated model, explicit review, corrected accepted-only projection, durable receipts, retire and one active rule per dimension' as result;
rollback;
