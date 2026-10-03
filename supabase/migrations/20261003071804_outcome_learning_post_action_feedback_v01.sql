create table public.minds_post_action_feedback_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  autonomy_execution_id uuid not null unique references public.minds_autonomy_executions(id) on delete cascade,
  activity_id uuid null unique references public.isabella_activity_log(id) on delete set null,
  permission_id uuid not null references public.minds_contextual_permissions(id) on delete cascade,
  permission_revision integer not null,
  action text not null,
  context_key text not null,
  scope_key text not null,
  scope_label text not null,
  entity_type text not null check (entity_type='task'),
  entity_key text not null,
  mutation_action text not null check (mutation_action in ('update','delete')),
  changed_fields text[] not null check (cardinality(changed_fields)>0),
  before_state jsonb,
  after_state jsonb,
  detection_reason text not null default 'first_manual_mutation_after_autonomy_v1',
  status text not null default 'pending' check (status in ('pending','confirmed_correction','not_causal','expired')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index minds_post_action_feedback_user_idx
  on public.minds_post_action_feedback_candidates(user_id,status,created_at desc);

create table public.minds_outcome_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null unique references public.minds_post_action_feedback_candidates(id) on delete restrict,
  autonomy_execution_id uuid not null unique references public.minds_autonomy_executions(id) on delete restrict,
  permission_id uuid not null references public.minds_contextual_permissions(id) on delete restrict,
  permission_revision integer not null,
  action text not null,
  context_key text not null,
  scope_key text not null,
  scope_label text not null,
  feedback_type text not null check (feedback_type in ('corrected','reverted')),
  changed_fields text[] not null check (cardinality(changed_fields)>0),
  before_state jsonb,
  after_state jsonb,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now()
);

create index minds_outcome_feedback_scope_idx
  on public.minds_outcome_feedback(user_id,action,context_key,scope_key,created_at desc);

alter table public.minds_post_action_feedback_candidates enable row level security;
alter table public.minds_outcome_feedback enable row level security;

create policy minds_post_action_feedback_candidates_own
  on public.minds_post_action_feedback_candidates for select to authenticated
  using ((select auth.uid())=user_id);
create policy minds_outcome_feedback_own
  on public.minds_outcome_feedback for select to authenticated
  using ((select auth.uid())=user_id);

revoke all on public.minds_post_action_feedback_candidates,public.minds_outcome_feedback
  from public,anon,authenticated,service_role;
grant select on public.minds_post_action_feedback_candidates,public.minds_outcome_feedback
  to authenticated,service_role;

create or replace function minds_private.post_action_changed_fields(a jsonb,b jsonb,act text)
returns text[]
language plpgsql immutable
set search_path=''
as $$
declare k text;out text[]:='{}';
begin
  if act='delete' then return array['deleted']; end if;
  foreach k in array array['title','date','categoryId','notes'] loop
    if coalesce(a->k,'null'::jsonb) is distinct from coalesce(b->k,'null'::jsonb) then
      out:=array_append(out,k);
    end if;
  end loop;
  return out;
end $$;

create or replace function minds_private.capture_post_action_feedback_candidate()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare
  x public.minds_autonomy_executions;
  p public.minds_contextual_permissions;
  fields text[];
begin
  if new.source<>'manual' or new.entity_type<>'task' or new.action not in ('update','delete') then
    return new;
  end if;

  select * into x
  from public.minds_autonomy_executions
  where user_id=new.user_id
    and ('autonomy:'||request_id::text)=new.entity_key
    and created_at<=new.created_at
    and created_at>=new.created_at-interval '48 hours'
  order by created_at desc
  limit 1;

  if not found then return new; end if;

  if exists(
    select 1
    from public.isabella_activity_log a
    where a.user_id=new.user_id
      and a.entity_type='task'
      and a.entity_key=new.entity_key
      and a.source='manual'
      and a.id<>new.id
      and a.created_at>=x.created_at
      and a.created_at<=new.created_at
  ) then
    return new;
  end if;

  fields:=minds_private.post_action_changed_fields(new.before_state,new.after_state,new.action);
  if cardinality(fields)=0 then return new; end if;

  select * into p from public.minds_contextual_permissions
  where id=x.permission_id and user_id=new.user_id;
  if not found then return new; end if;

  insert into public.minds_post_action_feedback_candidates(
    user_id,autonomy_execution_id,activity_id,permission_id,permission_revision,
    action,context_key,scope_key,scope_label,entity_type,entity_key,mutation_action,
    changed_fields,before_state,after_state
  ) values (
    new.user_id,x.id,new.id,x.permission_id,x.permission_revision,
    p.action,p.context_key,p.scope_key,p.scope_label,'task',new.entity_key,new.action,
    fields,new.before_state,new.after_state
  )
  on conflict(autonomy_execution_id) do nothing;

  return new;
end $$;

drop trigger if exists minds_capture_post_action_feedback on public.isabella_activity_log;
create trigger minds_capture_post_action_feedback
after insert on public.isabella_activity_log
for each row execute function minds_private.capture_post_action_feedback_candidate();

create or replace function public.minds_review_post_action_feedback(
  p_candidate_id uuid,
  p_outcome text,
  p_note text default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  u uuid:=auth.uid();
  c public.minds_post_action_feedback_candidates;
  f public.minds_outcome_feedback;
  p public.minds_contextual_permissions;
  downgraded boolean:=false;
begin
  if u is null or p_confirmed is distinct from true or p_candidate_id is null
     or p_outcome not in ('correction','later_change') then
    raise exception 'Explicit feedback review required';
  end if;
  if length(coalesce(p_note,''))>2000 then raise exception 'Feedback note too long';end if;

  select * into c
  from public.minds_post_action_feedback_candidates
  where id=p_candidate_id and user_id=u
  for update;

  if not found then return jsonb_build_object('status','missing');end if;

  if c.status<>'pending' then
    select * into f from public.minds_outcome_feedback where candidate_id=c.id and user_id=u;
    return jsonb_build_object('status','already_reviewed','candidate',to_jsonb(c),'feedback',case when f.id is null then null else to_jsonb(f) end);
  end if;

  if c.created_at<now()-interval '14 days' then
    update public.minds_post_action_feedback_candidates
    set status='expired',reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'')
    where id=c.id returning * into c;
    return jsonb_build_object('status','expired','candidate',to_jsonb(c));
  end if;

  if p_outcome='later_change' then
    update public.minds_post_action_feedback_candidates
    set status='not_causal',reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'')
    where id=c.id returning * into c;
    return jsonb_build_object('status','reviewed','causal',false,'candidate',to_jsonb(c),'permission_downgraded',false);
  end if;

  update public.minds_post_action_feedback_candidates
  set status='confirmed_correction',reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'')
  where id=c.id returning * into c;

  insert into public.minds_outcome_feedback(
    user_id,candidate_id,autonomy_execution_id,permission_id,permission_revision,
    action,context_key,scope_key,scope_label,feedback_type,changed_fields,
    before_state,after_state,evidence
  ) values (
    u,c.id,c.autonomy_execution_id,c.permission_id,c.permission_revision,
    c.action,c.context_key,c.scope_key,c.scope_label,
    case when 'deleted'=any(c.changed_fields) then 'reverted' else 'corrected' end,
    c.changed_fields,c.before_state,c.after_state,
    jsonb_build_object(
      'source','explicit_post_action_review',
      'activity_id',c.activity_id,
      'detection_reason',c.detection_reason,
      'reviewed_at',now()
    )
  )
  returning * into f;

  select * into p
  from public.minds_contextual_permissions
  where id=c.permission_id and user_id=u
  for update;

  if found and p.mode='allow' then
    update public.minds_contextual_permissions
    set mode='confirm',
        revision=revision+1,
        reviewed_at=now(),
        expires_at=null,
        evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
          'last_post_action_correction',
          jsonb_build_object(
            'feedback_id',f.id,
            'candidate_id',c.id,
            'changed_fields',to_jsonb(c.changed_fields),
            'at',f.created_at
          )
        )
    where id=p.id
    returning * into p;
    downgraded:=true;
  end if;

  return jsonb_build_object(
    'status','reviewed',
    'causal',true,
    'candidate',to_jsonb(c),
    'feedback',to_jsonb(f),
    'permission_downgraded',downgraded,
    'permission',case when p.id is null then null else to_jsonb(p) end
  );
end $$;

create or replace function minds_private.contextual_evidence(u uuid)
returns setof jsonb
language sql stable
set search_path=''
as $$
 with corrections as (
  select action,context_key ctx,scope_key scope,
   count(*) corrections,
   max(created_at) last_correction,
   md5(string_agg(id::text,',' order by id)) correction_version
  from public.minds_outcome_feedback
  where user_id=u and created_at>=now()-interval '30 days'
  group by action,context_key,scope_key
 ), classified as (
  select d.*,coalesce(d.context->'autonomy_class',minds_private.shadow_class(u,d.action,d.candidate,d.context)) cls,
   minds_private.shadow_changed_fields(d.candidate,d.reviewed_candidate) fields
  from public.minds_shadow_decisions d where d.user_id=u and d.created_at>=now()-interval '30 days'
 ), observations as (
  select *,case when status='accepted' and jsonb_array_length(fields)>0 then 'edited' else status end outcome from classified
 ), grouped as (
  select action,cls->>'context_key' ctx,cls->>'scope_key' scope,
   (jsonb_agg(cls order by created_at desc)->0) cls,
   count(*) filter(where outcome='accepted') accepted,
   count(*) filter(where outcome='edited') edited,count(*) filter(where outcome='rejected') rejected,
   count(*) filter(where outcome='pending') pending,count(*) filter(where outcome='expired') expired,
   count(*) filter(where outcome='executed') executions,
   count(distinct (resolved_at at time zone 'UTC')::date) filter(where outcome in ('accepted','edited','rejected')) days,
   min(resolved_at) filter(where outcome in ('accepted','edited','rejected')) first_review,
   max(resolved_at) filter(where outcome in ('accepted','edited','rejected')) last_review,
   coalesce(jsonb_agg(jsonb_build_object('id',id,'outcome',outcome,'resolved_at',resolved_at,'changed_fields',fields) order by id) filter(where outcome in ('accepted','edited','rejected')),'[]') evidence
  from observations group by action,cls->>'context_key',cls->>'scope_key'
 )
 select g.cls||jsonb_build_object(
  'accepted_unchanged',g.accepted,'edited',g.edited,'rejected',g.rejected,'pending',g.pending,'expired',g.expired,
  'executed',g.executions,'observations',g.accepted+g.edited+g.rejected,'review_days',g.days,
  'first_review_at',g.first_review,'last_review_at',g.last_review,
  'outcome_corrections',coalesce(c.corrections,0),
  'last_outcome_correction_at',c.last_correction,
  'changed_fields',coalesce((select jsonb_object_agg(field,n) from (
    select f.field,count(*) n from jsonb_array_elements(g.evidence) item cross join lateral jsonb_array_elements_text(item->'changed_fields') f(field)
    where item->>'outcome'='edited' group by f.field) counts),'{}'),
  'evidence_version',md5(g.action||g.ctx||g.scope||g.evidence::text||coalesce(c.correction_version,'')),
  'evidence_ids',(select coalesce(jsonb_agg(item->'id'),'[]') from jsonb_array_elements(g.evidence) item),
  'eligibility',case when g.cls->>'eligible_class'<>'true' then 'excluded'
   when coalesce(c.corrections,0)>0 then 'needs_review'
   when g.edited+g.rejected>0 then 'needs_review'
   when g.accepted<12 or g.days<3 then 'insufficient_evidence'
   when g.last_review<now()-interval '7 days' then 'stale_evidence' else 'eligible' end,
  'suggestion',case when g.cls->>'eligible_class'='true'
    and coalesce(c.corrections,0)=0
    and g.accepted>=12 and g.days>=3 and g.edited+g.rejected=0 and g.last_review>=now()-interval '7 days'
   then 'Puedes autorizar esta clase concreta durante 30 días. Solo tu aprobación cambia el permiso.' else null end)
 from grouped g
 left join corrections c on c.action=g.action and c.ctx=g.ctx and c.scope=g.scope
 order by g.action,g.ctx,g.scope;
$$;

create or replace function public.minds_get_contextual_autonomy()
returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Authentication required';end if;
 return jsonb_build_object(
  'units',(select coalesce(jsonb_agg(e),'[]') from minds_private.contextual_evidence(u) e),
  'permissions',(select coalesce(jsonb_agg(p order by p.reviewed_at desc),'[]') from public.minds_contextual_permissions p where p.user_id=u),
  'reviews',(select coalesce(jsonb_agg(r),'[]') from (select * from public.minds_permission_reviews where user_id=u order by created_at desc limit 20) r),
  'executions',(select coalesce(jsonb_agg(r),'[]') from (select * from public.minds_autonomy_executions where user_id=u order by created_at desc limit 20) r),
  'post_action_candidates',(select coalesce(jsonb_agg(r),'[]') from (
    select * from public.minds_post_action_feedback_candidates
    where user_id=u and created_at>=now()-interval '30 days'
    order by created_at desc limit 30
  ) r),
  'outcome_feedback',(select coalesce(jsonb_agg(r),'[]') from (
    select * from public.minds_outcome_feedback
    where user_id=u and created_at>=now()-interval '30 days'
    order by created_at desc limit 30
  ) r),
  'rules',jsonb_build_object(
    'window_days',30,'min_unchanged',12,'min_review_days',3,'max_age_days',7,
    'max_edits',0,'max_rejections',0,'grant_days',30,
    'post_action_candidate_hours',48,'post_action_review_days',14,
    'post_action_correction_window_days',30
  )
 );
end $$;

revoke all on function minds_private.post_action_changed_fields(jsonb,jsonb,text),
 minds_private.capture_post_action_feedback_candidate()
 from public,anon,authenticated,service_role;
revoke all on function public.minds_review_post_action_feedback(uuid,text,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.minds_review_post_action_feedback(uuid,text,text,boolean)
 to authenticated;

comment on function public.minds_review_post_action_feedback(uuid,text,text,boolean)
is 'Build 73 explicit post-action causal review. Candidate detection is correlation only; only authenticated explicit correction review creates learning evidence and may reduce autonomy.';