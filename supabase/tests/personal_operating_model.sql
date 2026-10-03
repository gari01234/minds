-- Build 74 behavioral contract. All fixtures roll back.
begin;

insert into auth.users(id,aud,role,email)
values ('f7400000-0000-4000-8000-000000000074','authenticated','authenticated','pom74-test@example.invalid');

insert into public.minds_operating_observations(
  id,user_id,observation_key,dimension,provenance_class,source_type,source_ref,summary,data,observed_at
) values
(
  'f7400000-0000-4000-8000-000000000001',
  'f7400000-0000-4000-8000-000000000074',
  'test:explicit:interaction',
  'interaction','explicit','assistant_preference','test:explicit',
  'El usuario confirmó una regla explícita de interacción.',
  '{"test":true}'::jsonb,now()
),
(
  'f7400000-0000-4000-8000-000000000002',
  'f7400000-0000-4000-8000-000000000074',
  'test:behavioral:interaction',
  'interaction','behavioral','proposal_feedback','test:behavioral',
  'Existe un agregado factual de feedback, sin inferir causa.',
  '{"test":true}'::jsonb,now()
);

insert into public.minds_operating_hypotheses(
  id,user_id,dimension,fingerprint,statement,rationale,evidence_ids,metadata
) values
(
  'f7400000-0000-4000-8000-000000000010',
  'f7400000-0000-4000-8000-000000000074',
  'interaction',repeat('a',64),
  'Cuando haya pocas alternativas claras, Isabella puede ofrecer opciones breves en lugar de pedir una respuesta larga.',
  'La regla se apoya en evidencia explícita y un receipt conductual.',
  array[
    'f7400000-0000-4000-8000-000000000001'::uuid,
    'f7400000-0000-4000-8000-000000000002'::uuid
  ],
  '{"test":true}'::jsonb
),
(
  'f7400000-0000-4000-8000-000000000011',
  'f7400000-0000-4000-8000-000000000074',
  'interaction',repeat('b',64),
  'Segunda hipótesis de interacción.',
  'Debe permanecer inactiva mientras exista una regla aceptada de la misma dimensión.',
  array['f7400000-0000-4000-8000-000000000001'::uuid],
  '{"test":true}'::jsonb
);

select public.minds_publish_operating_hypothesis(
  'f7400000-0000-4000-8000-000000000074'::uuid,
  'f7400000-0000-4000-8000-000000000010'::uuid
);

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

  if has_table_privilege('authenticated','public.minds_operating_hypotheses','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_observations','INSERT')
     or has_table_privilege('authenticated','public.minds_operating_reviews','INSERT') then
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
    raise exception 'TEST74 accepted rule missing';
  end if;
  if jsonb_array_length(after_review->'proposed')<>0 then
    raise exception 'TEST74 accepted rule remained proposed';
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
    perform public.minds_publish_operating_hypothesis(
      'f7400000-0000-4000-8000-000000000074'::uuid,
      'f7400000-0000-4000-8000-000000000011'::uuid
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

select public.minds_publish_operating_hypothesis(
  'f7400000-0000-4000-8000-000000000074'::uuid,
  'f7400000-0000-4000-8000-000000000011'::uuid
);

do $$
begin
  if (select count(*) from public.minds_operating_reviews
      where user_id='f7400000-0000-4000-8000-000000000074')<>2 then
    raise exception 'TEST74 review receipts missing';
  end if;
  if (select status from public.minds_operating_hypotheses
      where id='f7400000-0000-4000-8000-000000000010')<>'retired' then
    raise exception 'TEST74 retire failed';
  end if;
  if (select status from public.minds_operating_hypotheses
      where id='f7400000-0000-4000-8000-000000000011')<>'proposed' then
    raise exception 'TEST74 dimension not released after retire';
  end if;
end $$;

select 'PASS: explicit review, accepted-only model, correction receipts, one active rule per dimension and no direct client writes' as result;
rollback;
