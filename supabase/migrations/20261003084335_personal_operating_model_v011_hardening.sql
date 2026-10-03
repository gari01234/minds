create unique index if not exists minds_operating_one_active_dimension_idx
on public.minds_operating_hypotheses(user_id,dimension)
where status in ('proposed','accepted');

create or replace function minds_private.review_operating_hypothesis(
  p_hypothesis_id uuid,
  p_decision text,
  p_final_statement text,
  p_request_id uuid,
  p_confirmed boolean default false
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  h public.minds_operating_hypotheses;
  r public.minds_operating_reviews;
  final_text text;
begin
  if u is null or p_confirmed is distinct from true or p_hypothesis_id is null
     or p_request_id is null or p_decision not in ('accept','correct','reject','retire') then
    raise exception 'Explicit operating-model review required';
  end if;

  select * into r from public.minds_operating_reviews
  where user_id=u and request_id=p_request_id;
  if found then
    select * into h from public.minds_operating_hypotheses
    where id=r.hypothesis_id and user_id=u;
    if r.hypothesis_id<>p_hypothesis_id or r.decision<>p_decision then
      raise exception 'Operating-model request id already used';
    end if;
    return jsonb_build_object(
      'status','already_reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r)
    );
  end if;

  select * into h from public.minds_operating_hypotheses
  where id=p_hypothesis_id and user_id=u for update;
  if not found then return jsonb_build_object('status','missing');end if;

  if p_decision='retire' then
    if h.status<>'accepted' then raise exception 'Only accepted operating rules can be retired';end if;
    update public.minds_operating_hypotheses
    set status='retired',retired_at=now(),reviewed_at=now()
    where id=h.id returning * into h;
    insert into public.minds_operating_reviews(
      user_id,hypothesis_id,request_id,decision,status_before,status_after,
      original_statement,final_statement
    ) values (
      u,h.id,p_request_id,'retire','accepted','retired',h.statement,h.accepted_statement
    ) returning * into r;
    return jsonb_build_object('status','reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r));
  end if;

  if h.status<>'proposed' then raise exception 'Operating hypothesis is not awaiting review';end if;

  final_text:=case
    when p_decision='accept' then trim(h.statement)
    when p_decision='correct' then trim(coalesce(p_final_statement,''))
    else null
  end;

  if p_decision='correct' and length(final_text) not between 1 and 1000 then
    raise exception 'Corrected operating rule is invalid';
  end if;

  if p_decision in ('accept','correct') then
    update public.minds_operating_hypotheses
    set status='accepted',accepted_statement=final_text,reviewed_at=now(),accepted_at=now()
    where id=h.id returning * into h;
  else
    update public.minds_operating_hypotheses
    set status='rejected',reviewed_at=now()
    where id=h.id returning * into h;
  end if;

  insert into public.minds_operating_reviews(
    user_id,hypothesis_id,request_id,decision,status_before,status_after,
    original_statement,final_statement
  ) values (
    u,h.id,p_request_id,p_decision,'proposed',h.status,h.statement,h.accepted_statement
  ) returning * into r;

  return jsonb_build_object('status','reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r));
end $$;

revoke all on function minds_private.review_operating_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant usage on schema minds_private to authenticated;
grant execute on function minds_private.review_operating_hypothesis(uuid,text,text,uuid,boolean)
to authenticated;

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
  select minds_private.review_operating_hypothesis(
    p_hypothesis_id,p_decision,p_final_statement,p_request_id,p_confirmed
  );
$$;

revoke all on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean)
to authenticated;
