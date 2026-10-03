create index if not exists minds_operating_model_evidence_user_idx
  on public.minds_operating_model_evidence(user_id);
create index if not exists minds_operating_model_hypotheses_accepted_claim_idx
  on public.minds_operating_model_hypotheses(accepted_claim_id)
  where accepted_claim_id is not null;
create index if not exists minds_operating_model_hypotheses_superseded_idx
  on public.minds_operating_model_hypotheses(superseded_by)
  where superseded_by is not null;
create index if not exists minds_operating_model_reviews_resulting_claim_idx
  on public.minds_operating_model_reviews(resulting_claim_id)
  where resulting_claim_id is not null;

alter table public.minds_operating_model_reviews
  add column if not exists request_id uuid;

create unique index if not exists minds_operating_model_reviews_user_request_idx
  on public.minds_operating_model_reviews(user_id,request_id)
  where request_id is not null;

drop function if exists public.minds_review_model_claim(uuid,text,text,text,text);
create function public.minds_review_model_claim(
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
  replacement_id uuid;
begin
  if u is null or p_claim_id is null or p_confirmed is distinct from true or p_request_id is null then
    raise exception 'Explicit model claim review required';
  end if;
  if p_status not in ('confirmed','contradicted','stale') then raise exception 'Model claim status invalid';end if;
  if length(coalesce(p_replacement,''))>2000 or length(coalesce(p_evidence,''))>2000 then
    raise exception 'Model claim review too long';
  end if;

  select * into c
  from public.isabella_model_claims
  where id=p_claim_id and user_id=u
  for update;
  if not found then return jsonb_build_object('status','missing');end if;

  if exists(
    select 1 from public.minds_operating_model_reviews
    where user_id=u and request_id=p_request_id
  ) then
    return jsonb_build_object('status','already_reviewed','claim_id',c.id);
  end if;

  update public.isabella_model_claims
  set status=p_status,
      last_seen_at=now(),
      confidence=case when p_status='confirmed' then 1 else confidence end,
      source_type=case when p_status='confirmed' then 'explicit' else source_type end,
      confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
      evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'source','explicit_user_review','outcome',p_status,
        'note',nullif(trim(coalesce(p_evidence,'')),''),
        'request_id',p_request_id,'at',now()
      ))
  where id=c.id;

  if p_status='contradicted' and nullif(trim(coalesce(p_replacement,'')),'') is not null then
    replacement_id:=minds_private.insert_confirmed_model_claim(
      u,p_claim_type,trim(p_replacement),'explicit',
      jsonb_build_object(
        'source','user_correction','replaces_claim_id',c.id,
        'note',nullif(trim(coalesce(p_evidence,'')),''),
        'request_id',p_request_id,'at',now()
      )
    );
  end if;

  return jsonb_build_object('status','updated','claim_id',c.id,'replacement_claim_id',replacement_id);
end $$;

drop function if exists public.minds_review_operating_model_hypothesis(uuid,text,text);
create function public.minds_review_operating_model_hypothesis(
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
  if p_decision not in ('accept','reject','replace') then raise exception 'Operating model review decision invalid';end if;
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

  if h.status<>'proposed' then
    select * into r from public.minds_operating_model_reviews where hypothesis_id=h.id;
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

revoke all on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean),
  public.minds_review_operating_model_hypothesis(uuid,text,text,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean),
  public.minds_review_operating_model_hypothesis(uuid,text,text,uuid,boolean)
  to authenticated;

comment on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean)
is 'Build 74 explicit review of an existing personal-model claim. SECURITY DEFINER is intentional: direct table writes are revoked; auth.uid ownership, explicit confirmation and request id are enforced.';
comment on function public.minds_review_operating_model_hypothesis(uuid,text,text,uuid,boolean)
is 'Build 74 explicit review of a non-authoritative operating-model hypothesis. SECURITY DEFINER is intentional: direct table writes are revoked; auth.uid ownership, explicit confirmation and idempotent request id are enforced.';
