-- Retire the empty pre-74 draft ontology.
drop function if exists public.minds_publish_operating_hypothesis(uuid,uuid);
drop function if exists minds_private.review_operating_hypothesis(uuid,text,text,uuid,boolean);
drop function if exists public.minds_get_personal_operating_model();
drop trigger if exists minds_operating_hypothesis_guard_trg on public.minds_operating_hypotheses;
drop function if exists minds_private.operating_hypothesis_guard();
drop table if exists public.minds_operating_reviews;
drop table if exists public.minds_operating_hypotheses;
drop table if exists public.minds_operating_observations;

-- Cross-user integrity for the canonical Build 74 ontology.
create or replace function minds_private.operating_model_integrity_guard()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  hu uuid;
  ou uuid;
  cu uuid;
begin
  if tg_table_name='minds_operating_model_evidence' then
    select user_id into hu from public.minds_operating_model_hypotheses where id=new.hypothesis_id;
    select user_id into ou from public.minds_operating_model_observations where id=new.observation_id;
    if hu is null or ou is null or new.user_id<>hu or new.user_id<>ou then
      raise exception 'operating_model_evidence_user_mismatch';
    end if;
  elsif tg_table_name='minds_operating_model_reviews' then
    select user_id into hu from public.minds_operating_model_hypotheses where id=new.hypothesis_id;
    if hu is null or new.user_id<>hu then
      raise exception 'operating_model_review_user_mismatch';
    end if;
    if new.resulting_claim_id is not null then
      select user_id into cu from public.isabella_model_claims where id=new.resulting_claim_id;
      if cu is null or cu<>new.user_id then
        raise exception 'operating_model_review_claim_user_mismatch';
      end if;
    end if;
  elsif tg_table_name='minds_operating_model_hypotheses' then
    if new.accepted_claim_id is not null then
      select user_id into cu from public.isabella_model_claims where id=new.accepted_claim_id;
      if cu is null or cu<>new.user_id then
        raise exception 'operating_model_hypothesis_claim_user_mismatch';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger minds_operating_model_evidence_integrity
before insert or update on public.minds_operating_model_evidence
for each row execute function minds_private.operating_model_integrity_guard();

create trigger minds_operating_model_review_integrity
before insert or update on public.minds_operating_model_reviews
for each row execute function minds_private.operating_model_integrity_guard();

create trigger minds_operating_model_hypothesis_integrity
before insert or update of accepted_claim_id on public.minds_operating_model_hypotheses
for each row execute function minds_private.operating_model_integrity_guard();

revoke all on function minds_private.operating_model_integrity_guard()
from public,anon,authenticated,service_role;

create or replace function public.minds_get_personal_operating_model()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'confirmed_claims',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'claim_type',c.claim_type,
        'claim',c.claim,
        'source_type',c.source_type,
        'confirmed_at',c.confirmed_at,
        'last_seen_at',c.last_seen_at
      ) order by c.last_seen_at desc)
      from public.isabella_model_claims c
      where c.user_id=auth.uid() and c.status='confirmed'
    ),'[]'::jsonb),
    'proposed',coalesce((
      select jsonb_agg(
        to_jsonb(h)||jsonb_build_object(
          'evidence',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',o.id,
              'dimension',o.dimension,
              'signal_type',o.signal_type,
              'source_kind',o.source_kind,
              'signal',o.signal,
              'observed_at',o.observed_at,
              'stance',e.stance
            ) order by o.observed_at desc)
            from public.minds_operating_model_evidence e
            join public.minds_operating_model_observations o on o.id=e.observation_id
            where e.user_id=auth.uid()
              and e.hypothesis_id=h.id
          ),'[]'::jsonb)
        )
        order by h.proposed_at desc
      )
      from public.minds_operating_model_hypotheses h
      where h.user_id=auth.uid() and h.status='proposed'
    ),'[]'::jsonb),
    'accepted_hypotheses',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.accepted_at desc)
      from public.minds_operating_model_hypotheses h
      where h.user_id=auth.uid() and h.status='accepted'
    ),'[]'::jsonb),
    'recent_reviews',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select * from public.minds_operating_model_reviews
        where user_id=auth.uid()
        order by created_at desc limit 20
      ) r
    ),'[]'::jsonb),
    'observation_count',(
      select count(*) from public.minds_operating_model_observations
      where user_id=auth.uid()
    )
  );
$$;

revoke all on function public.minds_get_personal_operating_model()
from public,anon,authenticated,service_role;
grant execute on function public.minds_get_personal_operating_model()
to authenticated;

comment on function public.minds_get_personal_operating_model()
is 'Build 74 reviewable personal operating model. Proposed hypotheses are non-authoritative until explicit user review.';
