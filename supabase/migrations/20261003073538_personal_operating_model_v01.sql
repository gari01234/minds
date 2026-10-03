create table public.minds_operating_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  observation_key text not null,
  dimension text not null check (dimension in (
    'time_planning','task_management','focus','interruption',
    'decision_making','autonomy','interaction'
  )),
  provenance_class text not null check (provenance_class in ('explicit','behavioral','outcome','system')),
  source_type text not null check (source_type in (
    'activity_aggregate','task_snapshot','calendar_snapshot','assistant_preference',
    'permission_review','outcome_feedback','proposal_feedback'
  )),
  source_ref text not null,
  summary text not null check (length(trim(summary)) between 1 and 2000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data)='object'),
  window_start timestamptz,
  window_end timestamptz,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,observation_key)
);

create index minds_operating_observations_user_idx
  on public.minds_operating_observations(user_id,dimension,observed_at desc);

create table public.minds_operating_hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension text not null check (dimension in (
    'time_planning','task_management','focus','interruption',
    'decision_making','autonomy','interaction'
  )),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  statement text not null check (length(trim(statement)) between 1 and 1000),
  rationale text not null check (length(trim(rationale)) between 1 and 3000),
  evidence_ids uuid[] not null check (cardinality(evidence_ids) between 1 and 12),
  status text not null default 'hypothesis' check (status in ('hypothesis','proposed','accepted','rejected','retired')),
  accepted_statement text check (accepted_statement is null or length(trim(accepted_statement)) between 1 and 1000),
  generated_at timestamptz not null default now(),
  proposed_at timestamptz,
  reviewed_at timestamptz,
  accepted_at timestamptz,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,fingerprint)
);

create index minds_operating_hypotheses_user_idx
  on public.minds_operating_hypotheses(user_id,status,updated_at desc);

create table public.minds_operating_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hypothesis_id uuid not null references public.minds_operating_hypotheses(id) on delete restrict,
  request_id uuid not null,
  decision text not null check (decision in ('accept','correct','reject','retire')),
  status_before text not null,
  status_after text not null,
  original_statement text not null,
  final_statement text,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

create index minds_operating_reviews_hypothesis_idx
  on public.minds_operating_reviews(hypothesis_id,created_at desc);

alter table public.minds_operating_observations enable row level security;
alter table public.minds_operating_hypotheses enable row level security;
alter table public.minds_operating_reviews enable row level security;

create policy minds_operating_observations_own
  on public.minds_operating_observations for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_operating_hypotheses_own
  on public.minds_operating_hypotheses for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_operating_reviews_own
  on public.minds_operating_reviews for select to authenticated
  using ((select auth.uid())=user_id);

revoke all on public.minds_operating_observations,public.minds_operating_hypotheses,public.minds_operating_reviews
from public,anon,authenticated,service_role;
grant select on public.minds_operating_observations,public.minds_operating_hypotheses,public.minds_operating_reviews
to authenticated,service_role;
grant insert on public.minds_operating_observations,public.minds_operating_hypotheses
to service_role;

create or replace function minds_private.operating_hypothesis_guard()
returns trigger
language plpgsql
set search_path=''
as $$
declare n integer;
begin
  if tg_op='INSERT' then
    if new.status<>'hypothesis' or new.accepted_statement is not null
       or new.proposed_at is not null or new.reviewed_at is not null
       or new.accepted_at is not null or new.retired_at is not null then
      raise exception 'operating_hypothesis_must_start_unreviewed';
    end if;
    select count(*) into n
    from public.minds_operating_observations o
    where o.user_id=new.user_id and o.id=any(new.evidence_ids);
    if n<>cardinality(new.evidence_ids) then
      raise exception 'operating_hypothesis_evidence_mismatch';
    end if;
  else
    if new.user_id<>old.user_id or new.dimension<>old.dimension
       or new.fingerprint<>old.fingerprint or new.statement<>old.statement
       or new.rationale<>old.rationale or new.evidence_ids<>old.evidence_ids
       or new.generated_at<>old.generated_at then
      raise exception 'operating_hypothesis_identity_immutable';
    end if;

    if new.status<>old.status then
      if old.status='hypothesis' and new.status='proposed' then
        if new.proposed_at is null then raise exception 'proposal_timestamp_required';end if;
      elsif old.status='proposed' and new.status in ('accepted','rejected') then
        if new.reviewed_at is null then raise exception 'review_timestamp_required';end if;
        if new.status='accepted' and (new.accepted_statement is null or new.accepted_at is null) then
          raise exception 'accepted_statement_required';
        end if;
        if new.status='rejected' and new.accepted_statement is not null then
          raise exception 'rejected_cannot_have_accepted_statement';
        end if;
      elsif old.status='accepted' and new.status='retired' then
        if new.retired_at is null or new.reviewed_at is null then raise exception 'retire_timestamp_required';end if;
      else
        raise exception 'operating_hypothesis_invalid_transition:%->%',old.status,new.status;
      end if;
    end if;
  end if;

  new.updated_at:=now();
  return new;
end $$;

create trigger minds_operating_hypothesis_guard_trg
before insert or update on public.minds_operating_hypotheses
for each row execute function minds_private.operating_hypothesis_guard();

create or replace function public.minds_publish_operating_hypothesis(
  p_user uuid,p_hypothesis_id uuid
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare h public.minds_operating_hypotheses;
begin
  if p_user is null or p_hypothesis_id is null then raise exception 'Invalid operating hypothesis';end if;
  select * into h from public.minds_operating_hypotheses
  where id=p_hypothesis_id and user_id=p_user for update;
  if not found then return jsonb_build_object('status','missing');end if;
  if h.status='proposed' then return jsonb_build_object('status','already_proposed','hypothesis',to_jsonb(h));end if;
  if h.status<>'hypothesis' then return jsonb_build_object('status','not_publishable','hypothesis',to_jsonb(h));end if;
  update public.minds_operating_hypotheses
  set status='proposed',proposed_at=now()
  where id=h.id
  returning * into h;
  return jsonb_build_object('status','proposed','hypothesis',to_jsonb(h));
end $$;

create or replace function public.minds_review_operating_hypothesis(
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
    select * into h from public.minds_operating_hypotheses where id=r.hypothesis_id and user_id=u;
    if r.hypothesis_id<>p_hypothesis_id or r.decision<>p_decision then
      raise exception 'Operating-model request id already used';
    end if;
    return jsonb_build_object('status','already_reviewed','hypothesis',to_jsonb(h),'review',to_jsonb(r));
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

create or replace function public.minds_get_personal_operating_model()
returns jsonb
language sql security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'accepted',coalesce((
      select jsonb_agg(h order by h.accepted_at desc)
      from public.minds_operating_hypotheses h
      where h.user_id=auth.uid() and h.status='accepted'
    ),'[]'::jsonb),
    'proposed',coalesce((
      select jsonb_agg(
        to_jsonb(h)||jsonb_build_object(
          'evidence',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',o.id,'dimension',o.dimension,'provenance_class',o.provenance_class,
              'source_type',o.source_type,'summary',o.summary,'observed_at',o.observed_at
            ) order by o.observed_at desc)
            from public.minds_operating_observations o
            where o.user_id=auth.uid() and o.id=any(h.evidence_ids)
          ),'[]'::jsonb)
        )
        order by h.proposed_at desc
      )
      from public.minds_operating_hypotheses h
      where h.user_id=auth.uid() and h.status='proposed'
    ),'[]'::jsonb),
    'recent_reviews',coalesce((
      select jsonb_agg(r order by r.created_at desc)
      from (
        select * from public.minds_operating_reviews
        where user_id=auth.uid()
        order by created_at desc limit 20
      ) r
    ),'[]'::jsonb),
    'observation_count',(
      select count(*) from public.minds_operating_observations where user_id=auth.uid()
    )
  );
$$;

revoke all on function minds_private.operating_hypothesis_guard()
from public,anon,authenticated,service_role;
revoke all on function public.minds_publish_operating_hypothesis(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.minds_publish_operating_hypothesis(uuid,uuid) to service_role;
revoke all on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_operating_hypothesis(uuid,text,text,uuid,boolean) to authenticated;
revoke all on function public.minds_get_personal_operating_model()
from public,anon,authenticated,service_role;
grant execute on function public.minds_get_personal_operating_model() to authenticated;
