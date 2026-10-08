-- Build 87.2 — compatible review batching + deterministic expiry.
-- Review Economy reduces review work through compatibility, reversibility and staleness.
-- It does not accept proposals automatically and does not expire authority-boundary reviews.

create or replace view public.minds_review_queue_v2
with (security_invoker=true)
as
select
  d.*,
  case
    when d.item_kind='shadow_decision'
      and d.consequence='low'
      and d.reversibility='high'
      and d.metadata->>'proposal_kind' in ('task','event')
      and d.metadata->>'action' in ('create_task','create_event')
      and coalesce((d.metadata->'context'->>'source_tainted')::boolean,false)=false
      and nullif(trim(coalesce(d.metadata->'candidate'->>'recurrence','')),'') is null
      and coalesce(d.metadata->'candidate'->>'action','create')='create'
    then true
    else false
  end as batchable,
  case
    when d.item_kind='shadow_decision'
      and d.consequence='low'
      and d.reversibility='high'
      and d.metadata->>'proposal_kind' in ('task','event')
      and d.metadata->>'action' in ('create_task','create_event')
      and coalesce((d.metadata->'context'->>'source_tainted')::boolean,false)=false
      and nullif(trim(coalesce(d.metadata->'candidate'->>'recurrence','')),'') is null
      and coalesce(d.metadata->'candidate'->>'action','create')='create'
    then left(concat_ws(
      '|',
      'batch_v1',
      d.metadata->>'proposal_kind',
      d.metadata->>'action',
      coalesce(
        nullif(d.metadata->'context'->'autonomy_class'->>'scope_key',''),
        nullif(d.metadata->'candidate'->>'project',''),
        nullif(d.metadata->'candidate'->>'category',''),
        'unscoped'
      ),
      coalesce(nullif(d.metadata->'candidate'->>'date',''),'undated'),
      case when coalesce((d.metadata->'context'->>'direct_request')::boolean,false) then 'direct' else 'inferred' end
    ),500)
    else null::text
  end as batch_key,
  case
    when d.item_kind='shadow_decision'
      and d.consequence='low'
      and d.reversibility='high'
      and d.metadata->>'proposal_kind' in ('task','event')
      and d.metadata->>'action' in ('create_task','create_event')
      and nullif(trim(coalesce(d.metadata->'candidate'->>'recurrence','')),'') is null
    then 'stale_reversible_shadow_v1'
    else 'protected'
  end as expiry_policy,
  case
    when d.item_kind='shadow_decision'
      and d.consequence='low'
      and d.reversibility='high'
      and d.metadata->>'proposal_kind' in ('task','event')
      and d.metadata->>'action' in ('create_task','create_event')
      and nullif(trim(coalesce(d.metadata->'candidate'->>'recurrence','')),'') is null
    then case
      when coalesce(d.metadata->'candidate'->>'date','') ~ '^\d{4}-\d{2}-\d{2}$'
      then greatest(
        d.created_at + interval '24 hours',
        least(
          d.created_at + interval '7 days',
          ((d.metadata->'candidate'->>'date')::date + interval '1 day')::timestamptz
        )
      )
      else d.created_at + interval '7 days'
    end
    else null::timestamptz
  end as review_expires_at,
  case
    when d.item_kind in ('operating_hypothesis','project_claim','project_variant') then true
    when d.item_kind='shadow_decision'
      and d.metadata->>'proposal_kind' in ('permission','permission_change','commitment','work_claim','claim')
      then true
    else false
  end as protected_from_expiry
from public.minds_review_debt_v1 d;

grant select on public.minds_review_queue_v2 to authenticated;


create or replace view public.minds_review_batches_v1
with (security_invoker=true)
as
select
  q.user_id,
  q.batch_key,
  q.review_class,
  q.metadata->>'proposal_kind' as proposal_kind,
  count(*)::integer as item_count,
  min(q.created_at) as oldest_created_at,
  min(q.review_expires_at) as next_expiry_at,
  jsonb_agg(
    jsonb_build_object(
      'item_kind',q.item_kind,
      'item_id',q.item_id,
      'title',q.title,
      'created_at',q.created_at,
      'review_expires_at',q.review_expires_at,
      'consequence',q.consequence,
      'reversibility',q.reversibility,
      'metadata',q.metadata
    )
    order by q.created_at,q.item_id
  ) as items
from public.minds_review_queue_v2 q
where q.batchable
group by q.user_id,q.batch_key,q.review_class,q.metadata->>'proposal_kind'
having count(*)>=2;

grant select on public.minds_review_batches_v1 to authenticated;


create or replace function public.minds_expire_review_items(
  p_user uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ids uuid[]:='{}'::uuid[];
  v_count integer:=0;
begin
  if p_user is null then raise exception 'user_required'; end if;

  with eligible as (
    select q.item_id,q.review_expires_at
    from public.minds_review_queue_v2 q
    where q.user_id=p_user
      and q.item_kind='shadow_decision'
      and q.expiry_policy='stale_reversible_shadow_v1'
      and q.protected_from_expiry=false
      and q.review_expires_at is not null
      and q.review_expires_at<=p_now
  ), expired as (
    update public.minds_shadow_decisions s
    set
      status='expired',
      resolved_at=coalesce(s.resolved_at,p_now),
      updated_at=p_now,
      context=s.context||jsonb_build_object(
        'review_economy',
        coalesce(s.context->'review_economy','{}'::jsonb)||jsonb_build_object(
          'expired_at',p_now,
          'policy','stale_reversible_shadow_v1',
          'policy_version','review_economy_v01',
          'authority_changed',false
        )
      )
    from eligible e
    where s.id=e.item_id and s.user_id=p_user and s.status='pending'
    returning s.id
  )
  select coalesce(array_agg(id),'{}'::uuid[]),count(*) into v_ids,v_count from expired;

  return jsonb_build_object(
    'status','ok',
    'expired_count',v_count,
    'expired_ids',to_jsonb(v_ids),
    'policy','stale_reversible_shadow_v1',
    'authority_changed',false
  );
end $$;

revoke all on function public.minds_expire_review_items(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.minds_expire_review_items(uuid,timestamptz)
  to service_role;


create or replace function public.minds_review_debt_summary()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with q as (
  select * from public.minds_review_queue_v2 where user_id=auth.uid()
), by_consequence as (
  select consequence,count(*) n from q group by consequence
), by_class as (
  select review_class,count(*) n from q group by review_class
), batches as (
  select * from public.minds_review_batches_v1 where user_id=auth.uid()
)
select jsonb_build_object(
  'total',(select count(*) from q),
  'high',(select count(*) from q where consequence='high'),
  'medium',(select count(*) from q where consequence='medium'),
  'low',(select count(*) from q where consequence='low'),
  'older_than_24h',(select count(*) from q where age_hours>=24),
  'older_than_7d',(select count(*) from q where age_hours>=168),
  'oldest_created_at',(select min(created_at) from q),
  'batchable_items',(select count(*) from q where batchable),
  'compatible_batches',(select count(*) from batches),
  'expirable_items',(select count(*) from q where expiry_policy='stale_reversible_shadow_v1'),
  'next_expiry_at',(select min(review_expires_at) from q where review_expires_at is not null),
  'protected_items',(select count(*) from q where protected_from_expiry),
  'by_consequence',coalesce((select jsonb_object_agg(consequence,n) from by_consequence),'{}'::jsonb),
  'by_class',coalesce((select jsonb_object_agg(review_class,n) from by_class),'{}'::jsonb),
  'scoring','none',
  'authority_changed',false
);
$$;

grant execute on function public.minds_review_debt_summary() to authenticated;


create or replace function public.minds_heartbeat_users()
returns table(user_id uuid, timezone text)
language sql
set search_path=public,pg_temp
as $$
  with ids as (
    select user_id from public.isabella_routines where enabled
    union select user_id from public.isabella_tasks where archived_at is null
    union select user_id from public.isabella_events where starts_at>=now()-interval '1 hour'
    union select user_id from public.isabella_projects where not archived
    union select user_id from public.minds_expectations where status in ('active','due_unconfirmed')
    union select user_id from public.minds_standing_intents where status in ('pending','armed','fired')
    union select user_id from public.minds_shadow_decisions where status='pending'
  )
  select i.user_id,
         coalesce(
           (select r.timezone from public.isabella_routines r where r.user_id=i.user_id and r.enabled order by r.created_at limit 1),
           (select e.timezone from public.minds_expectations e where e.user_id=i.user_id and e.status in ('active','due_unconfirmed') order by e.created_at limit 1),
           'Europe/Berlin'
         )
  from ids i;
$$;
