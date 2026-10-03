create or replace function minds_private.review_operating_model_hypothesis(
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

  select * into r from public.minds_operating_model_reviews
  where user_id=u and request_id=p_request_id;
  if found then
    if r.hypothesis_id<>p_hypothesis_id or r.decision<>p_decision then raise exception 'Operating model request id already used';end if;
    select * into h from public.minds_operating_model_hypotheses where id=r.hypothesis_id and user_id=u;
    return jsonb_build_object('status','already_reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r));
  end if;

  select * into h from public.minds_operating_model_hypotheses
  where id=p_hypothesis_id and user_id=u for update;
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
    return jsonb_build_object('status','already_reviewed','hypothesis_status',h.status,'review',case when r.id is null then null else to_jsonb(r) end);
  end if;

  if p_decision='accept' then
    cid:=minds_private.insert_confirmed_model_claim(
      u,h.claim_type,h.statement,'observed',
      jsonb_build_object('source','operating_model_hypothesis','hypothesis_id',h.id,'accepted_by_user',true,'request_id',p_request_id,'evidence_summary',h.evidence_summary,'at',now())
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
      jsonb_build_object('source','operating_model_replacement','hypothesis_id',h.id,'accepted_by_user',true,'request_id',p_request_id,'at',now())
    );
    update public.minds_operating_model_hypotheses
    set status='superseded',accepted_claim_id=cid,reviewed_at=now(),updated_at=now()
    where id=h.id returning * into h;
  end if;

  insert into public.minds_operating_model_reviews(
    user_id,hypothesis_id,decision,replacement_statement,resulting_claim_id,request_id
  ) values (u,h.id,p_decision,case when p_decision='replace' then trim(p_replacement) else null end,cid,p_request_id)
  returning * into r;

  return jsonb_build_object('status','reviewed','decision',p_decision,'hypothesis',to_jsonb(h),'review',to_jsonb(r),'resulting_claim_id',cid);
end $$;

revoke all on function minds_private.review_operating_model_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant usage on schema minds_private to authenticated;
grant execute on function minds_private.review_operating_model_hypothesis(uuid,text,text,uuid,boolean) to authenticated;

create or replace function public.minds_review_operating_model_hypothesis(
  p_hypothesis_id uuid,
  p_decision text,
  p_replacement text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
) returns jsonb
language sql security invoker
set search_path=''
as $$
  select minds_private.review_operating_model_hypothesis(
    p_hypothesis_id,p_decision,p_replacement,p_request_id,p_confirmed
  );
$$;

revoke all on function public.minds_review_operating_model_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_operating_model_hypothesis(uuid,text,text,uuid,boolean) to authenticated;

create or replace function minds_private.review_model_claim(
  p_claim_id uuid,
  p_status text,
  p_replacement text default null,
  p_claim_type text default 'other',
  p_evidence text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  c public.isabella_model_claims;
  r public.minds_model_claim_reviews;
  replacement_id uuid;
begin
  if u is null or p_claim_id is null or p_confirmed is distinct from true or p_request_id is null then
    raise exception 'Explicit model claim review required';
  end if;
  if p_status not in ('confirmed','contradicted','stale') then raise exception 'Model claim status invalid';end if;
  if length(coalesce(p_replacement,''))>2000 or length(coalesce(p_evidence,''))>2000 then raise exception 'Model claim review too long';end if;
  if p_status<>'contradicted' and nullif(trim(coalesce(p_replacement,'')),'') is not null then raise exception 'Replacement only allowed with contradicted status';end if;

  select * into r from public.minds_model_claim_reviews
  where user_id=u and request_id=p_request_id;
  if found then
    if r.claim_id<>p_claim_id or r.decision<>p_status then raise exception 'Model claim request id already used';end if;
    return jsonb_build_object('status','already_reviewed','claim_id',r.claim_id,'replacement_claim_id',r.replacement_claim_id,'review_id',r.id);
  end if;

  select * into c from public.isabella_model_claims
  where id=p_claim_id and user_id=u for update;
  if not found then return jsonb_build_object('status','missing');end if;

  update public.isabella_model_claims
  set status=p_status,last_seen_at=now(),
      confidence=case when p_status='confirmed' then 1 else confidence end,
      source_type=case when p_status='confirmed' then 'explicit' else source_type end,
      confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
      evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'source','explicit_user_review','outcome',p_status,'note',nullif(trim(coalesce(p_evidence,'')),''),
        'request_id',p_request_id,'at',now()
      ))
  where id=c.id;

  if p_status='contradicted' and nullif(trim(coalesce(p_replacement,'')),'') is not null then
    replacement_id:=minds_private.insert_confirmed_model_claim(
      u,p_claim_type,trim(p_replacement),'explicit',
      jsonb_build_object('source','user_correction','replaces_claim_id',c.id,'note',nullif(trim(coalesce(p_evidence,'')),''),
        'request_id',p_request_id,'at',now())
    );
  end if;

  insert into public.minds_model_claim_reviews(
    user_id,claim_id,request_id,decision,replacement_claim_id,note
  ) values (u,c.id,p_request_id,p_status,replacement_id,nullif(trim(coalesce(p_evidence,'')),''))
  returning * into r;

  return jsonb_build_object('status','updated','claim_id',c.id,'replacement_claim_id',replacement_id,'review_id',r.id);
end $$;

revoke all on function minds_private.review_model_claim(uuid,text,text,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function minds_private.review_model_claim(uuid,text,text,text,text,uuid,boolean) to authenticated;

create or replace function public.minds_review_model_claim(
  p_claim_id uuid,
  p_status text,
  p_replacement text default null,
  p_claim_type text default 'other',
  p_evidence text default null,
  p_request_id uuid default null,
  p_confirmed boolean default false
) returns jsonb
language sql security invoker
set search_path=''
as $$
  select minds_private.review_model_claim(
    p_claim_id,p_status,p_replacement,p_claim_type,p_evidence,p_request_id,p_confirmed
  );
$$;

revoke all on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean) to authenticated;
