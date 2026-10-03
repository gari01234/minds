create table public.minds_operating_model_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension text not null check (dimension in (
    'scheduling','task_management','work_rhythm','interruptions',
    'planning','decision_style','communication','tooling','review'
  )),
  signal_type text not null check (signal_type in (
    'explicit_statement','conversation_inference','proposal_outcome',
    'confirmed_correction','manual_correction','pattern_summary'
  )),
  source_kind text not null check (source_kind in (
    'conversation','shadow_decision','proposal_feedback',
    'outcome_feedback','manual','system'
  )),
  source_ref text,
  signal text not null check (length(trim(signal)) between 1 and 2000),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,fingerprint)
);

create index minds_operating_model_observations_user_idx
  on public.minds_operating_model_observations(user_id,dimension,observed_at desc);

create table public.minds_operating_model_hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension text not null check (dimension in (
    'scheduling','task_management','work_rhythm','interruptions',
    'planning','decision_style','communication','tooling','review'
  )),
  claim_type text not null check (claim_type in (
    'preference','habit','pattern','goal','priority','value',
    'working_style','interaction','constraint','other'
  )),
  statement text not null check (length(trim(statement)) between 1 and 2000),
  inference_kind text not null check (inference_kind in ('conversation_inference','deterministic_pattern')),
  pattern_key text not null check (length(pattern_key) between 1 and 240),
  rationale text not null default '' check (length(rationale)<=4000),
  evidence_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_summary)='object'),
  status text not null default 'proposed'
    check (status in ('proposed','accepted','rejected','superseded','stale')),
  accepted_claim_id uuid references public.isabella_model_claims(id) on delete set null,
  proposed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  superseded_by uuid references public.minds_operating_model_hypotheses(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index minds_operating_model_hypotheses_user_idx
  on public.minds_operating_model_hypotheses(user_id,status,proposed_at desc);
create unique index minds_operating_model_hypotheses_active_pattern_idx
  on public.minds_operating_model_hypotheses(user_id,pattern_key)
  where status in ('proposed','accepted');

create table public.minds_operating_model_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hypothesis_id uuid not null references public.minds_operating_model_hypotheses(id) on delete cascade,
  observation_id uuid not null references public.minds_operating_model_observations(id) on delete cascade,
  stance text not null default 'supports' check (stance in ('supports','contradicts','context')),
  created_at timestamptz not null default now(),
  unique(hypothesis_id,observation_id)
);

create index minds_operating_model_evidence_hypothesis_idx
  on public.minds_operating_model_evidence(hypothesis_id,stance);
create index minds_operating_model_evidence_observation_idx
  on public.minds_operating_model_evidence(observation_id);

create table public.minds_operating_model_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hypothesis_id uuid not null unique references public.minds_operating_model_hypotheses(id) on delete restrict,
  decision text not null check (decision in ('accept','reject','replace')),
  replacement_statement text,
  resulting_claim_id uuid references public.isabella_model_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (decision='replace' and replacement_statement is not null and length(trim(replacement_statement))>0)
    or (decision<>'replace' and replacement_statement is null)
  )
);

create index minds_operating_model_reviews_user_idx
  on public.minds_operating_model_reviews(user_id,created_at desc);

alter table public.minds_operating_model_observations enable row level security;
alter table public.minds_operating_model_hypotheses enable row level security;
alter table public.minds_operating_model_evidence enable row level security;
alter table public.minds_operating_model_reviews enable row level security;

create policy minds_operating_model_observations_own_select
  on public.minds_operating_model_observations for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_operating_model_hypotheses_own_select
  on public.minds_operating_model_hypotheses for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_operating_model_evidence_own_select
  on public.minds_operating_model_evidence for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_operating_model_reviews_own_select
  on public.minds_operating_model_reviews for select to authenticated
  using ((select auth.uid())=user_id);

revoke all on public.minds_operating_model_observations,
  public.minds_operating_model_hypotheses,
  public.minds_operating_model_evidence,
  public.minds_operating_model_reviews
  from public,anon,authenticated,service_role;
grant select on public.minds_operating_model_observations,
  public.minds_operating_model_hypotheses,
  public.minds_operating_model_evidence,
  public.minds_operating_model_reviews
  to authenticated,service_role;
grant all on public.minds_operating_model_observations,
  public.minds_operating_model_hypotheses,
  public.minds_operating_model_evidence,
  public.minds_operating_model_reviews
  to service_role;

create or replace function minds_private.operating_model_sensitive(t text)
returns boolean
language sql immutable
set search_path=''
as $$
  select coalesce(t,'') ~* '(health|medical|diagnos|religio|politic|sexual|financ|password|contrase|bank|banco|criminal|race|ethnic|salud|m[eé]dic|religi[oó]n|pol[ií]tic|sexualidad|raza|etnia)';
$$;

create or replace function minds_private.insert_confirmed_model_claim(
  u uuid,
  p_claim_type text,
  p_claim text,
  p_source_type text,
  p_evidence jsonb
) returns uuid
language plpgsql security definer
set search_path=''
as $$
declare
  x public.isabella_model_claims;
begin
  if u is null or p_claim is null or length(trim(p_claim))=0 then
    raise exception 'model_claim_invalid';
  end if;
  if p_claim_type not in ('preference','habit','pattern','goal','priority','value','working_style','interaction','constraint','other') then
    raise exception 'model_claim_type_invalid';
  end if;
  if p_source_type not in ('explicit','observed') then
    raise exception 'model_claim_source_invalid';
  end if;
  if minds_private.operating_model_sensitive(p_claim) then
    raise exception 'sensitive_model_claim_not_allowed';
  end if;

  select * into x
  from public.isabella_model_claims
  where user_id=u and claim=trim(p_claim) and status='confirmed'
  order by confirmed_at desc nulls last
  limit 1
  for update;

  if found then
    update public.isabella_model_claims
    set claim_type=p_claim_type,
        source_type=case when source_type='explicit' then 'explicit' else p_source_type end,
        evidence=(coalesce(evidence,'[]'::jsonb) || jsonb_build_array(p_evidence)),
        last_seen_at=now(),
        confirmed_at=coalesce(confirmed_at,now()),
        confidence=1
    where id=x.id
    returning * into x;
    return x.id;
  end if;

  insert into public.isabella_model_claims(
    user_id,claim_type,claim,status,confidence,source_type,evidence,
    first_seen_at,last_seen_at,confirmed_at,metadata
  ) values (
    u,p_claim_type,trim(p_claim),'confirmed',1,p_source_type,
    jsonb_build_array(p_evidence),now(),now(),now(),
    jsonb_build_object('operating_model_v','74')
  )
  returning * into x;
  return x.id;
end $$;

create or replace function public.minds_record_explicit_model_claim(
  p_claim_type text,
  p_claim text,
  p_evidence text default null,
  p_source text default 'conversation'
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  cid uuid;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_evidence,''))>2000 or length(coalesce(p_source,''))>200 then
    raise exception 'Explicit model claim evidence too long';
  end if;
  cid:=minds_private.insert_confirmed_model_claim(
    u,p_claim_type,p_claim,'explicit',
    jsonb_build_object(
      'source','explicit_user_statement',
      'channel',coalesce(nullif(trim(p_source),''),'conversation'),
      'note',nullif(trim(coalesce(p_evidence,'')),''),
      'at',now()
    )
  );
  return jsonb_build_object('status','confirmed','claim_id',cid);
end $$;

create or replace function public.minds_propose_operating_model_hypothesis(
  p_dimension text,
  p_claim_type text,
  p_statement text,
  p_rationale text default '',
  p_source_kind text default 'conversation',
  p_source_ref text default null,
  p_evidence_note text default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  o public.minds_operating_model_observations;
  h public.minds_operating_model_hypotheses;
  obs_fp text;
  pkey text;
begin
  if u is null then raise exception 'Authentication required';end if;
  if p_dimension not in ('scheduling','task_management','work_rhythm','interruptions','planning','decision_style','communication','tooling','review') then
    raise exception 'Operating model dimension invalid';
  end if;
  if p_claim_type not in ('preference','habit','pattern','goal','priority','value','working_style','interaction','constraint','other') then
    raise exception 'Operating model claim type invalid';
  end if;
  if p_source_kind not in ('conversation','manual') then
    raise exception 'Operating model source invalid';
  end if;
  if length(trim(coalesce(p_statement,'')))=0 or length(p_statement)>2000
     or length(coalesce(p_rationale,''))>4000
     or length(coalesce(p_source_ref,''))>500
     or length(coalesce(p_evidence_note,''))>2000 then
    raise exception 'Operating model proposal invalid';
  end if;
  if minds_private.operating_model_sensitive(p_statement||' '||coalesce(p_rationale,'')||' '||coalesce(p_evidence_note,'')) then
    raise exception 'Sensitive operating model inference not allowed';
  end if;

  obs_fp:=md5(u::text||'|'||p_source_kind||'|'||coalesce(p_source_ref,'')||'|'||lower(trim(p_statement))||'|'||coalesce(p_evidence_note,''));
  insert into public.minds_operating_model_observations(
    user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
  ) values (
    u,p_dimension,'conversation_inference',p_source_kind,nullif(trim(coalesce(p_source_ref,'')),''),
    trim(p_statement),
    jsonb_build_object('evidence_note',nullif(trim(coalesce(p_evidence_note,'')),'')),
    obs_fp,now()
  )
  on conflict(user_id,fingerprint) do update
    set observed_at=excluded.observed_at
  returning * into o;

  pkey:='conversation:'||md5(p_dimension||'|'||p_claim_type||'|'||lower(trim(p_statement)));

  select * into h
  from public.minds_operating_model_hypotheses
  where user_id=u and pattern_key=pkey and status<>'stale'
  order by proposed_at desc
  limit 1;

  if not found then
    insert into public.minds_operating_model_hypotheses(
      user_id,dimension,claim_type,statement,inference_kind,pattern_key,
      rationale,evidence_summary,status,metadata
    ) values (
      u,p_dimension,p_claim_type,trim(p_statement),'conversation_inference',pkey,
      trim(coalesce(p_rationale,'')),
      jsonb_build_object(
        'support_count',1,
        'contradict_count',0,
        'source_types',jsonb_build_array(p_source_kind),
        'transparent',true
      ),
      'proposed',
      jsonb_build_object('requires_explicit_review',true)
    )
    returning * into h;
  end if;

  if h.status='proposed' then
    insert into public.minds_operating_model_evidence(user_id,hypothesis_id,observation_id,stance)
    values(u,h.id,o.id,'supports')
    on conflict(hypothesis_id,observation_id) do nothing;
  end if;

  return jsonb_build_object(
    'status',h.status,
    'hypothesis_id',h.id,
    'statement',h.statement,
    'requires_review',h.status='proposed'
  );
end $$;

create or replace function public.minds_review_model_claim(
  p_claim_id uuid,
  p_status text,
  p_replacement text default null,
  p_claim_type text default 'other',
  p_evidence text default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  c public.isabella_model_claims;
  replacement_id uuid;
begin
  if u is null or p_claim_id is null then raise exception 'Authentication required';end if;
  if p_status not in ('confirmed','contradicted','stale') then raise exception 'Model claim status invalid';end if;
  if length(coalesce(p_replacement,''))>2000 or length(coalesce(p_evidence,''))>2000 then
    raise exception 'Model claim review too long';
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
        'source','explicit_user_review','outcome',p_status,'note',nullif(trim(coalesce(p_evidence,'')),''),'at',now()
      ))
  where id=c.id;

  if p_status='contradicted' and nullif(trim(coalesce(p_replacement,'')),'') is not null then
    replacement_id:=minds_private.insert_confirmed_model_claim(
      u,p_claim_type,trim(p_replacement),'explicit',
      jsonb_build_object('source','user_correction','replaces_claim_id',c.id,'note',nullif(trim(coalesce(p_evidence,'')),''),'at',now())
    );
  end if;

  return jsonb_build_object('status','updated','claim_id',c.id,'replacement_claim_id',replacement_id);
end $$;

create or replace function public.minds_review_operating_model_hypothesis(
  p_hypothesis_id uuid,
  p_decision text,
  p_replacement text default null
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
  if u is null or p_hypothesis_id is null then raise exception 'Authentication required';end if;
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
        'source','operating_model_hypothesis',
        'hypothesis_id',h.id,
        'accepted_by_user',true,
        'evidence_summary',h.evidence_summary,
        'at',now()
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
        'source','operating_model_replacement',
        'hypothesis_id',h.id,
        'accepted_by_user',true,
        'at',now()
      )
    );
    update public.minds_operating_model_hypotheses
    set status='superseded',accepted_claim_id=cid,reviewed_at=now(),updated_at=now()
    where id=h.id returning * into h;
  end if;

  insert into public.minds_operating_model_reviews(
    user_id,hypothesis_id,decision,replacement_statement,resulting_claim_id
  ) values (
    u,h.id,p_decision,case when p_decision='replace' then trim(p_replacement) else null end,cid
  )
  returning * into r;

  return jsonb_build_object(
    'status','reviewed',
    'decision',p_decision,
    'hypothesis',to_jsonb(h),
    'review',to_jsonb(r),
    'resulting_claim_id',cid
  );
end $$;

create or replace function minds_private.refresh_task_timing_hypothesis(u uuid)
returns void
language plpgsql security definer
set search_path=''
as $$
declare
  total_n integer;
  all_day_n integer;
  timed_n integer;
  days_n integer;
  dominant text;
  ratio numeric;
  h public.minds_operating_model_hypotheses;
  obs_ids uuid[];
  stmt text;
  rationale_text text;
begin
  if u is null then return;end if;

  select count(*),
         count(*) filter(where payload->>'timing_mode'='all_day'),
         count(*) filter(where payload->>'timing_mode'='timed'),
         count(distinct (observed_at at time zone 'UTC')::date),
         array_agg(id order by observed_at)
  into total_n,all_day_n,timed_n,days_n,obs_ids
  from public.minds_operating_model_observations
  where user_id=u
    and dimension='task_management'
    and signal_type='proposal_outcome'
    and source_kind='shadow_decision'
    and payload->>'outcome' in ('accepted','edited')
    and payload->>'timing_mode' in ('all_day','timed')
    and observed_at>=now()-interval '60 days';

  if coalesce(total_n,0)<8 or coalesce(days_n,0)<3 then return;end if;
  if all_day_n>=timed_n then dominant:='all_day'; ratio:=all_day_n::numeric/total_n;
  else dominant:='timed'; ratio:=timed_n::numeric/total_n;end if;
  if ratio<0.80 then return;end if;

  if exists(
    select 1 from public.minds_operating_model_hypotheses
    where user_id=u and pattern_key='task_timing_mode'
      and status in ('proposed','accepted','rejected')
  ) then return;end if;

  if dominant='all_day' then
    stmt:='Para tareas con fecha, suelo preferir que Isabella las trate como tareas de día completo salvo que yo indique una hora.';
  else
    stmt:='Para tareas con fecha, suelo preferir que Isabella proponga una hora concreta cuando la información disponible lo permite.';
  end if;

  rationale_text:=format(
    '%s de %s decisiones de tarea con forma temporal explícita siguieron el patrón %s, observadas en %s días durante los últimos 60 días.',
    case when dominant='all_day' then all_day_n else timed_n end,total_n,dominant,days_n
  );

  insert into public.minds_operating_model_hypotheses(
    user_id,dimension,claim_type,statement,inference_kind,pattern_key,
    rationale,evidence_summary,status,metadata
  ) values (
    u,'task_management','working_style',stmt,'deterministic_pattern','task_timing_mode',
    rationale_text,
    jsonb_build_object(
      'support_count',case when dominant='all_day' then all_day_n else timed_n end,
      'total_clear_observations',total_n,
      'observation_days',days_n,
      'dominant_pattern',dominant,
      'ratio',ratio,
      'window_days',60,
      'transparent',true
    ),
    'proposed',
    jsonb_build_object('requires_explicit_review',true,'rule_version','74.0')
  )
  returning * into h;

  insert into public.minds_operating_model_evidence(user_id,hypothesis_id,observation_id,stance)
  select u,h.id,x,'supports'
  from unnest(obs_ids) x
  on conflict(hypothesis_id,observation_id) do nothing;
end $$;

create or replace function minds_private.capture_operating_model_shadow_decision()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare
  final jsonb;
  mode text:='unspecified';
  fp text;
begin
  if new.status is not distinct from old.status then return new;end if;
  if new.action not in ('create_task','update_task') or new.status not in ('accepted','edited','rejected') then return new;end if;

  final:=coalesce(new.reviewed_candidate,new.candidate,'{}'::jsonb);
  if coalesce((final->>'all_day')::boolean,false) then mode:='all_day';
  elsif nullif(trim(final->>'time'),'') is not null then mode:='timed';
  end if;

  fp:=md5('shadow_decision|'||new.id::text||'|'||new.status);
  insert into public.minds_operating_model_observations(
    user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
  ) values (
    new.user_id,'task_management','proposal_outcome','shadow_decision',new.id::text,
    'task proposal '||new.status,
    jsonb_build_object(
      'action',new.action,
      'outcome',new.status,
      'timing_mode',mode,
      'duration_present',(final ? 'duration_minutes' and final->'duration_minutes' is not null),
      'recurrence_present',(final ? 'recurrence' and final->'recurrence' is not null)
    ),
    fp,coalesce(new.resolved_at,now())
  )
  on conflict(user_id,fingerprint) do nothing;

  perform minds_private.refresh_task_timing_hypothesis(new.user_id);
  return new;
end $$;

create or replace function minds_private.capture_operating_model_proposal_feedback()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare
  kind text;
  fp text;
begin
  kind:=coalesce(new.proposal->>'kind',new.proposal->>'type',new.proposal->>'action','unknown');
  fp:=md5('proposal_feedback|'||new.id::text);
  insert into public.minds_operating_model_observations(
    user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
  ) values (
    new.user_id,
    case when kind in ('task','event','routine') then 'planning' else 'review' end,
    'proposal_outcome','proposal_feedback',new.id::text,
    'proposal '||new.outcome,
    jsonb_build_object('proposal_kind',kind,'outcome',new.outcome),
    fp,new.created_at
  )
  on conflict(user_id,fingerprint) do nothing;
  return new;
end $$;

create or replace function minds_private.capture_operating_model_outcome_feedback()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare fp text;
begin
  fp:=md5('outcome_feedback|'||new.id::text);
  insert into public.minds_operating_model_observations(
    user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
  ) values (
    new.user_id,'task_management','confirmed_correction','outcome_feedback',new.id::text,
    'confirmed post-action correction',
    jsonb_build_object(
      'action',new.action,
      'context_key',new.context_key,
      'scope_key',new.scope_key,
      'changed_fields',to_jsonb(new.changed_fields)
    ),
    fp,new.created_at
  )
  on conflict(user_id,fingerprint) do nothing;
  return new;
end $$;

create trigger minds_operating_model_shadow_observe
after update of status on public.minds_shadow_decisions
for each row execute function minds_private.capture_operating_model_shadow_decision();

create trigger minds_operating_model_proposal_feedback_observe
after insert on public.isabella_proposal_feedback
for each row execute function minds_private.capture_operating_model_proposal_feedback();

create trigger minds_operating_model_outcome_feedback_observe
after insert on public.minds_outcome_feedback
for each row execute function minds_private.capture_operating_model_outcome_feedback();

drop policy if exists isabella_model_claims_own on public.isabella_model_claims;
revoke all on public.isabella_model_claims from public,anon,authenticated,service_role;
grant select on public.isabella_model_claims to authenticated,service_role;
grant all on public.isabella_model_claims to service_role;
create policy isabella_model_claims_own_select
  on public.isabella_model_claims for select to authenticated
  using ((select auth.uid())=user_id);

revoke all on function minds_private.operating_model_sensitive(text),
  minds_private.insert_confirmed_model_claim(uuid,text,text,text,jsonb),
  minds_private.refresh_task_timing_hypothesis(uuid),
  minds_private.capture_operating_model_shadow_decision(),
  minds_private.capture_operating_model_proposal_feedback(),
  minds_private.capture_operating_model_outcome_feedback()
  from public,anon,authenticated,service_role;

revoke all on function public.minds_record_explicit_model_claim(text,text,text,text),
  public.minds_propose_operating_model_hypothesis(text,text,text,text,text,text,text),
  public.minds_review_model_claim(uuid,text,text,text,text),
  public.minds_review_operating_model_hypothesis(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.minds_record_explicit_model_claim(text,text,text,text),
  public.minds_propose_operating_model_hypothesis(text,text,text,text,text,text,text),
  public.minds_review_model_claim(uuid,text,text,text,text),
  public.minds_review_operating_model_hypothesis(uuid,text,text)
  to authenticated;
