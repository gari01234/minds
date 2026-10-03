alter table public.minds_operating_model_reviews
  drop constraint if exists minds_operating_model_reviews_hypothesis_id_key;

create index if not exists minds_operating_model_reviews_hypothesis_idx
  on public.minds_operating_model_reviews(hypothesis_id,created_at desc);

create table public.minds_model_claim_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid not null references public.isabella_model_claims(id) on delete restrict,
  request_id uuid not null,
  decision text not null check (decision in ('confirmed','contradicted','stale')),
  replacement_claim_id uuid references public.isabella_model_claims(id) on delete set null,
  note text check (note is null or length(note)<=2000),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

create index minds_model_claim_reviews_claim_idx
  on public.minds_model_claim_reviews(claim_id,created_at desc);
create index minds_model_claim_reviews_replacement_idx
  on public.minds_model_claim_reviews(replacement_claim_id)
  where replacement_claim_id is not null;

alter table public.minds_model_claim_reviews enable row level security;
create policy minds_model_claim_reviews_own_select
  on public.minds_model_claim_reviews for select to authenticated
  using ((select auth.uid())=user_id);

revoke all on public.minds_model_claim_reviews from public,anon,authenticated,service_role;
grant select on public.minds_model_claim_reviews to authenticated,service_role;
grant all on public.minds_model_claim_reviews to service_role;

create or replace function minds_private.model_claim_review_integrity_guard()
returns trigger
language plpgsql
set search_path=''
as $$
declare cu uuid;ru uuid;
begin
  select user_id into cu from public.isabella_model_claims where id=new.claim_id;
  if cu is null or cu<>new.user_id then raise exception 'model_claim_review_user_mismatch';end if;
  if new.replacement_claim_id is not null then
    select user_id into ru from public.isabella_model_claims where id=new.replacement_claim_id;
    if ru is null or ru<>new.user_id then raise exception 'model_claim_review_replacement_user_mismatch';end if;
  end if;
  return new;
end $$;

create trigger minds_model_claim_review_integrity
before insert or update on public.minds_model_claim_reviews
for each row execute function minds_private.model_claim_review_integrity_guard();

revoke all on function minds_private.model_claim_review_integrity_guard()
from public,anon,authenticated,service_role;

create or replace function public.minds_review_model_claim(
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
  if length(coalesce(p_replacement,''))>2000 or length(coalesce(p_evidence,''))>2000 then
    raise exception 'Model claim review too long';
  end if;
  if p_status<>'contradicted' and nullif(trim(coalesce(p_replacement,'')),'') is not null then
    raise exception 'Replacement only allowed with contradicted status';
  end if;

  select * into r
  from public.minds_model_claim_reviews
  where user_id=u and request_id=p_request_id;
  if found then
    if r.claim_id<>p_claim_id or r.decision<>p_status then raise exception 'Model claim request id already used';end if;
    return jsonb_build_object(
      'status','already_reviewed','claim_id',r.claim_id,
      'replacement_claim_id',r.replacement_claim_id,'review_id',r.id
    );
  end if;

  select * into c
  from public.isabella_model_claims
  where id=p_claim_id and user_id=u
  for update;
  if not found then return jsonb_build_object('status','missing');end if;

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

  insert into public.minds_model_claim_reviews(
    user_id,claim_id,request_id,decision,replacement_claim_id,note
  ) values (
    u,c.id,p_request_id,p_status,replacement_id,nullif(trim(coalesce(p_evidence,'')),'')
  )
  returning * into r;

  return jsonb_build_object(
    'status','updated','claim_id',c.id,'replacement_claim_id',replacement_id,'review_id',r.id
  );
end $$;

revoke all on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean)
to authenticated;

comment on function public.minds_review_model_claim(uuid,text,text,text,text,uuid,boolean)
is 'Build 74 explicit, idempotent review of a confirmed personal-model claim. Direct table writes are revoked; auth.uid ownership, confirmation, request id and durable review receipt are enforced.';
