alter table public.minds_operating_model_reviews
  drop constraint if exists minds_operating_model_reviews_hypothesis_id_key;
create index if not exists minds_operating_model_reviews_hypothesis_idx
  on public.minds_operating_model_reviews(hypothesis_id,created_at desc);

create unique index if not exists minds_operating_model_one_active_dimension_idx
on public.minds_operating_model_hypotheses(user_id,dimension)
where status in ('proposed','accepted','superseded');

create or replace function public.minds_review_operating_model_hypothesis(
  p_hypothesis_id uuid,
  p_decision text,
  p_replacement text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  h public.minds_operating_model_hypotheses;
  r public.minds_operating_model_reviews;
  cid uuid;
begin
  if u is null or p_hypothesis_id is null or p_confirmed is distinct from true or p_request_id is null then
    raise exception 'Explicit operating model review required';
  end if;
  if p_decision not in ('accept','reject','replace','retire') then raise exception 'Operating model review decision invalid';end if;
  if p_decision='replace' and (nullif(trim(coalesce(p_replacement,'')),'') is null or length(p_replacement)>2000) then
    raise exception 'Replacement statement required';
  end if;
  if p_decision<>'replace' and nullif(trim(coalesce(p_replacement,'')),'') is not null then
    raise exception 'Replacement only allowed with replace decision';
  end if;
  if p_decision='replace' and minds_private.operating_model_sensitive(p_replacement) then
    raise exception 'Sensitive operating model replacement not allowed';
  end if;

  select * into r
  from public.minds_operating_model_reviews
  where user_id=u and request_id=p_request_id;
  if found then
    if r.hypothesis_id<>p_hypothesis_id or r.decision<>p_decision then
      raise exception 'Operating model request id already used';
    end if;
    select * into h from public.minds_operating_model_hypotheses where id=r.hypothesis_id and user_id=u;
    return jsonb_build_object('status','already_reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r));
  end if;

  select * into h
  from public.minds_operating_model_hypotheses
  where id=p_hypothesis_id and user_id=u
  for update;
  if not found then return jsonb_build_object('status','missing');end if;

  if p_decision='retire' then
    if h.status not in ('accepted','superseded') or h.accepted_claim_id is null then
      raise exception 'Only active accepted operating rules can be retired';
    end if;
    update public.isabella_model_claims
    set status='stale',last_seen_at=now(),
        evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
          'source','operating_model_retire','hypothesis_id',h.id,'request_id',p_request_id,'at',now()
        ))
    where id=h.accepted_claim_id and user_id=u;
    update public.minds_operating_model_hypotheses
    set status='stale',reviewed_at=now(),updated_at=now()
    where id=h.id returning * into h;

    insert into public.minds_operating_model_reviews(
      user_id,hypothesis_id,decision,replacement_statement,resulting_claim_id,request_id
    ) values (u,h.id,'retire',null,h.accepted_claim_id,p_request_id)
    returning * into r;

    return jsonb_build_object('status','reviewed','decision','retire','hypothesis',to_jsonb(h),'review',to_jsonb(r));
  end if;

  if h.status<>'proposed' then
    select * into r from public.minds_operating_model_reviews where hypothesis_id=h.id order by created_at desc limit 1;
    return jsonb_build_object(
      'status','already_reviewed',
      'hypothesis_status',h.status,
      'review',case when r.id is null then null else to_jsonb(r) end
    );
  end if;

  if p_decision='accept' then
    cid:=minds_private.insert_confirmed_model_claim(
      u,h.claim_type,h.statement,'observed',
      jsonb_build_object(
        'source','operating_model_hypothesis','hypothesis_id',h.id,
        'accepted_by_user',true,'request_id',p_request_id,
        'evidence_summary',h.evidence_summary,'at',now()
      )
    );
    update public.minds_operating_model_hypotheses
    set status='accepted',accepted_claim_id=cid,reviewed_at=now(),accepted_at=now(),updated_at=now()
    where id=h.id returning * into h;
  elsif p_decision='reject' then
    update public.minds_operating_model_hypotheses
    set status='rejected',reviewed_at=now(),rejected_at=now(),updated_at=now()
    where id=h.id returning * into h;
  else
    cid:=minds_private.insert_confirmed_model_claim(
      u,h.claim_type,trim(p_replacement),'explicit',
      jsonb_build_object(
        'source','operating_model_replacement','hypothesis_id',h.id,
        'accepted_by_user',true,'request_id',p_request_id,'at',now()
      )
    );
    update public.minds_operating_model_hypotheses
    set status='superseded',accepted_claim_id=cid,reviewed_at=now(),updated_at=now()
    where id=h.id returning * into h;
  end if;

  insert into public.minds_operating_model_reviews(
    user_id,hypothesis_id,decision,replacement_statement,resulting_claim_id,request_id
  ) values (
    u,h.id,p_decision,case when p_decision='replace' then trim(p_replacement) else null end,cid,p_request_id
  )
  returning * into r;

  return jsonb_build_object(
    'status','reviewed','decision',p_decision,'hypothesis',to_jsonb(h),
    'review',to_jsonb(r),'resulting_claim_id',cid
  );
end $$;

create or replace function public.minds_review_operating_hypothesis(
  p_hypothesis_id uuid,
  p_decision text,
  p_final_statement text,
  p_request_id uuid,
  p_confirmed boolean default false
) returns jsonb
language sql security invoker
set search_path=''
as $$
  select public.minds_review_operating_model_hypothesis(
    p_hypothesis_id,
    case when p_decision='correct' then 'replace' else p_decision end,
    case when p_decision='correct' then p_final_statement else null end,
    p_request_id,
    p_confirmed
  );
$$;

create or replace function public.minds_get_personal_operating_model()
returns jsonb
language sql security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'confirmed_claims',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'claim_type',c.claim_type,'claim',c.claim,'source_type',c.source_type,
        'confirmed_at',c.confirmed_at,'last_seen_at',c.last_seen_at
      ) order by c.last_seen_at desc)
      from public.isabella_model_claims c
      where c.user_id=auth.uid() and c.status='confirmed'
    ),'[]'::jsonb),
    'accepted',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',h.id,'dimension',h.dimension,'claim_type',h.claim_type,
        'statement',c.claim,'accepted_statement',c.claim,
        'accepted_claim_id',c.id,'accepted_at',coalesce(h.accepted_at,c.confirmed_at),
        'hypothesis_status',h.status
      ) order by coalesce(h.accepted_at,c.confirmed_at) desc)
      from public.minds_operating_model_hypotheses h
      join public.isabella_model_claims c on c.id=h.accepted_claim_id
      where h.user_id=auth.uid()
        and h.status in ('accepted','superseded')
        and c.user_id=auth.uid()
        and c.status='confirmed'
    ),'[]'::jsonb),
    'accepted_hypotheses',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.accepted_at desc nulls last)
      from public.minds_operating_model_hypotheses h
      where h.user_id=auth.uid() and h.status in ('accepted','superseded')
    ),'[]'::jsonb),
    'proposed',coalesce((
      select jsonb_agg(
        to_jsonb(h)||jsonb_build_object(
          'evidence',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',o.id,'dimension',o.dimension,'signal_type',o.signal_type,
              'source_kind',o.source_kind,'signal',o.signal,'summary',o.signal,
              'provenance_class',case
                when o.signal_type in ('explicit_statement','manual_correction') or o.source_kind='manual' then 'explicit'
                when o.source_kind='outcome_feedback' then 'outcome'
                when o.source_kind='system' then 'system'
                else 'behavioral'
              end,
              'observed_at',o.observed_at,'stance',e.stance
            ) order by o.observed_at desc)
            from public.minds_operating_model_evidence e
            join public.minds_operating_model_observations o on o.id=e.observation_id
            where e.user_id=auth.uid() and e.hypothesis_id=h.id
          ),'[]'::jsonb)
        )
        order by h.proposed_at desc
      )
      from public.minds_operating_model_hypotheses h
      where h.user_id=auth.uid() and h.status='proposed'
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
      select count(*) from public.minds_operating_model_observations where user_id=auth.uid()
    )
  );
$$;

revoke all on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean)
to authenticated;

revoke all on function public.minds_get_personal_operating_model()
from public,anon,authenticated,service_role;
grant execute on function public.minds_get_personal_operating_model()
to authenticated;
