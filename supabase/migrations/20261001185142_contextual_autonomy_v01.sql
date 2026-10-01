-- Build 70: evidence is not authority. No existing permission is promoted here.
create schema if not exists minds_private;
revoke all on schema minds_private from public,anon,authenticated;

create table public.minds_contextual_permissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null, context_key text not null, scope_key text not null,
 scope_label text not null,
 mode text not null default 'confirm' check(mode in ('confirm','allow')),
 revision integer not null default 1,
 evidence jsonb not null default '{}',
 reviewed_at timestamptz not null default now(), expires_at timestamptz,
 unique(user_id,action,context_key,scope_key)
);
create table public.minds_permission_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 permission_id uuid not null references public.minds_contextual_permissions(id),
 request_id uuid not null, decision text not null check(decision in ('allow','confirm')),
 previous_mode text not null, revision integer not null,
 evidence jsonb not null, created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create index minds_permission_reviews_permission_idx on public.minds_permission_reviews(permission_id,created_at desc);
create table public.minds_autonomy_executions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, permission_id uuid not null references public.minds_contextual_permissions(id),
 permission_revision integer not null, task_id uuid not null, candidate jsonb not null,
 created_at timestamptz not null default now(), unique(user_id,request_id)
);
create index minds_autonomy_executions_permission_idx on public.minds_autonomy_executions(permission_id,created_at desc);
alter table public.minds_contextual_permissions enable row level security;
alter table public.minds_permission_reviews enable row level security;
alter table public.minds_autonomy_executions enable row level security;
create policy contextual_permissions_own on public.minds_contextual_permissions for select to authenticated using ((select auth.uid())=user_id);
create policy permission_reviews_own on public.minds_permission_reviews for select to authenticated using ((select auth.uid())=user_id);
create policy autonomy_executions_own on public.minds_autonomy_executions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.minds_contextual_permissions,public.minds_permission_reviews,public.minds_autonomy_executions from public,anon,authenticated,service_role;
grant select on public.minds_contextual_permissions,public.minds_permission_reviews,public.minds_autonomy_executions to authenticated,service_role;

-- Compare actual proposals, not just the browser's changed_fields annotation.
create function minds_private.shadow_changed_fields(a jsonb,b jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(k order by k),'[]') from (
  select k from (select jsonb_object_keys(coalesce(a,'{}')) k union select jsonb_object_keys(coalesce(b,'{}')) k) keys
  where k not in ('request_id','_review') and coalesce(a->k,'null'::jsonb) is distinct from coalesce(b->k,'null'::jsonb)
  union
  select jsonb_array_elements_text(case when jsonb_typeof(b->'_review'->'changed_fields')='array' then b->'_review'->'changed_fields' else '[]'::jsonb end)
 ) changes;
$$;

-- Authority class is stamped by the database at recording time, never by the model.
-- Historical observations without the v1 request attestation remain evidence only.
create function minds_private.shadow_class(u uuid,a text,p jsonb,c jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare cat uuid;proj uuid;cn text;pn text;ctx text;reason text;simple boolean;vdate date;
begin
 cn:=nullif(trim(p->>'category'),'');pn:=coalesce(nullif(trim(p->>'project'),''),nullif(trim(c->>'project'),''));
 select case when count(*)=1 then (array_agg(id))[1] end into cat from public.isabella_categories where user_id=u and lower(name)=lower(cn);
 select case when count(*)=1 then (array_agg(id))[1] end into proj from public.isabella_projects where user_id=u and lower(name)=lower(pn) and not archived;
 simple:=a='create_task' and p->>'kind'='task' and p->>'action'='create'
  and length(trim(coalesce(p->>'title',''))) between 1 and 500
  and coalesce(p->>'recurrence','')='' and coalesce(p->>'reminder_time','')=''
  and coalesce(p->>'target_id','')='' and coalesce(p->>'time','')='';
 if nullif(p->>'date','') is not null then
  begin vdate:=(p->>'date')::date;simple:=simple and to_char(vdate,'YYYY-MM-DD')=p->>'date';
  exception when others then simple:=false;end;
 end if;
 ctx:=case
  when c->>'source_tainted'='true' then 'source_derived'
  when c->>'background'='true' then 'background'
  when c->>'autonomy_contract'='fast_task_v1' and c->>'direct_request'='true'
   and c->>'fast_path'='true' and c->>'one_round'='true' and c->>'source_tainted'='false' and c->>'background'='false' and simple
   then case when vdate is null then 'fast_task_undated_v1' else 'fast_task_dated_v1' end
  when c->>'fast_path'='true' then 'fast_unverified'
  when c->>'background'='false' and c->>'source_tainted'='false' then 'interactive_review'
  else 'unknown_context' end;
 reason:=case when a<>'create_task' then 'excluded_action'
  when pn is not null then 'excluded_project_scope'
  when cat is null then 'unresolved_category'
  when ctx not in ('fast_task_undated_v1','fast_task_dated_v1') then 'unverified_or_complex_context'
  else null end;
 return jsonb_build_object('action',a,'context_key',ctx,
  'scope_key','category:'||coalesce(cat::text,'unknown:'||md5(coalesce(cn,'')))||':project:'||coalesce(proj::text,case when pn is null then 'none' else 'unknown:'||md5(pn) end),
  'scope_label',coalesce(cn,'Sin categoría')||' · '||coalesce(pn,'sin proyecto'),
  'category_id',cat,'project_id',proj,'eligible_class',reason is null,'exclusion_reason',reason);
end $$;
create function minds_private.stamp_shadow_class() returns trigger language plpgsql set search_path='' as $$
begin
 new.context:=coalesce(new.context,'{}')||jsonb_build_object('autonomy_class',minds_private.shadow_class(new.user_id,new.action,new.candidate,new.context));
 return new;
end $$;
create trigger minds_shadow_class_stamp before insert on public.minds_shadow_decisions for each row execute function minds_private.stamp_shadow_class();
alter table public.minds_shadow_decisions drop constraint minds_shadow_decisions_status_check;
alter table public.minds_shadow_decisions add constraint minds_shadow_decisions_status_check check(status in ('pending','accepted','edited','rejected','expired','executed'));

create or replace function public.minds_resolve_shadow_decision(p_request_id uuid,p_outcome text,p_reviewed jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();d public.minds_shadow_decisions;fields jsonb;next_status text;
begin
 if u is null or p_request_id is null or p_outcome is null or p_outcome not in ('accepted','rejected') then raise exception 'Invalid shadow outcome';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,70));
 select * into d from public.minds_shadow_decisions where user_id=u and request_id=p_request_id for update;
 if not found then return jsonb_build_object('status','missing');end if;
 if d.status<>'pending' then return to_jsonb(d);end if;
 if jsonb_typeof(p_reviewed) is distinct from 'object' then raise exception 'Invalid reviewed candidate';end if;
 fields:=minds_private.shadow_changed_fields(d.candidate,p_reviewed);
 next_status:=case when p_outcome='rejected' then 'rejected' when jsonb_array_length(fields)>0 then 'edited' else 'accepted' end;
 update public.minds_shadow_decisions set status=next_status,reviewed_candidate=p_reviewed,
  context=context||jsonb_build_object('verified_changed_fields',fields),resolved_at=now(),updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;

-- Thresholds are conservative product rules, not calibrated probabilities or a score.
create function minds_private.contextual_evidence(u uuid) returns setof jsonb language sql stable set search_path='' as $$
 with classified as (
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
 select cls||jsonb_build_object('accepted_unchanged',accepted,'edited',edited,'rejected',rejected,'pending',pending,'expired',expired,
  'executed',executions,'observations',accepted+edited+rejected,'review_days',days,'first_review_at',first_review,'last_review_at',last_review,
  'changed_fields',coalesce((select jsonb_object_agg(field,n) from (
    select f.field,count(*) n from jsonb_array_elements(evidence) item cross join lateral jsonb_array_elements_text(item->'changed_fields') f(field)
    where item->>'outcome'='edited' group by f.field) counts),'{}'),
  'evidence_version',md5(action||ctx||scope||evidence::text),
  'evidence_ids',(select coalesce(jsonb_agg(item->'id'),'[]') from jsonb_array_elements(evidence) item),
  'eligibility',case when cls->>'eligible_class'<>'true' then 'excluded'
   when edited+rejected>0 then 'needs_review'
   when accepted<12 or days<3 then 'insufficient_evidence'
   when last_review<now()-interval '7 days' then 'stale_evidence' else 'eligible' end,
  'suggestion',case when cls->>'eligible_class'='true' and accepted>=12 and days>=3 and edited+rejected=0 and last_review>=now()-interval '7 days'
   then 'Puedes autorizar esta clase concreta durante 30 días. Solo tu aprobación cambia el permiso.' else null end)
 from grouped order by action,ctx,scope;
$$;

create function public.minds_get_contextual_autonomy() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Authentication required';end if;
 return jsonb_build_object('units',(select coalesce(jsonb_agg(e),'[]') from minds_private.contextual_evidence(u) e),
  'permissions',(select coalesce(jsonb_agg(p order by p.reviewed_at desc),'[]') from public.minds_contextual_permissions p where p.user_id=u),
  'reviews',(select coalesce(jsonb_agg(r),'[]') from (select * from public.minds_permission_reviews where user_id=u order by created_at desc limit 20) r),
  'executions',(select coalesce(jsonb_agg(r),'[]') from (select * from public.minds_autonomy_executions where user_id=u order by created_at desc limit 20) r),
  'rules',jsonb_build_object('window_days',30,'min_unchanged',12,'min_review_days',3,'max_age_days',7,'max_edits',0,'max_rejections',0,'grant_days',30));
end $$;

create function public.minds_review_contextual_permission(p_action text,p_context_key text,p_scope_key text,
 p_mode text,p_evidence_version text,p_expected_revision integer,p_request_id uuid,p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();e jsonb;p public.minds_contextual_permissions;old_mode text;r public.minds_permission_reviews;
begin
 if u is null or p_confirmed is distinct from true or p_request_id is null or p_mode is null or p_mode not in ('allow','confirm') then raise exception 'Explicit user confirmation required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,70));
 select * into r from public.minds_permission_reviews where user_id=u and request_id=p_request_id;
 if found then
  select * into p from public.minds_contextual_permissions where id=r.permission_id and user_id=u;
  if r.decision<>p_mode or p.action<>p_action or p.context_key<>p_context_key or p.scope_key<>p_scope_key then raise exception 'Request id already used';end if;
  return jsonb_build_object('status','already_reviewed','permission',to_jsonb(p));
 end if;
 select * into p from public.minds_contextual_permissions where user_id=u and action=p_action and context_key=p_context_key and scope_key=p_scope_key for update;
 if coalesce(p.revision,0) is distinct from p_expected_revision then raise exception 'Permission changed; review again';end if;
 old_mode:=coalesce(p.mode,'confirm');
 if p_mode='allow' then
  select x into e from minds_private.contextual_evidence(u) x where x->>'action'=p_action and x->>'context_key'=p_context_key and x->>'scope_key'=p_scope_key;
  if e is null or e->>'eligibility'<>'eligible' or e->>'evidence_version' is distinct from p_evidence_version then raise exception 'Evidence is insufficient or changed; review again';end if;
  if exists(select 1 from public.minds_action_policies where app_scope='isabella' and action=p_action and enabled and mode='deny' and (user_id is null or user_id=u)) then raise exception 'Action denied by base policy';end if;
 else
  if p.id is null then raise exception 'Permission not found';end if;
  e:=p.evidence;
 end if;
 insert into public.minds_contextual_permissions(user_id,action,context_key,scope_key,scope_label,mode,evidence,expires_at)
 values(u,p_action,p_context_key,p_scope_key,coalesce(e->>'scope_label',p.scope_label),p_mode,e,case when p_mode='allow' then now()+interval '30 days' end)
 on conflict(user_id,action,context_key,scope_key) do update set mode=excluded.mode,evidence=excluded.evidence,
  scope_label=excluded.scope_label,revision=minds_contextual_permissions.revision+1,reviewed_at=now(),expires_at=excluded.expires_at returning * into p;
 insert into public.minds_permission_reviews(user_id,permission_id,request_id,decision,previous_mode,revision,evidence)
 values(u,p.id,p_request_id,p_mode,old_mode,p.revision,e);
 return jsonb_build_object('status','reviewed','permission',to_jsonb(p));
end $$;

-- No model-provided candidate is accepted here: only a service-recorded request,
-- an exact user-reviewed scope and a current server-side permission can execute.
create function public.minds_try_contextual_task(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();d public.minds_shadow_decisions;p public.minds_contextual_permissions;
 c jsonb;e jsonb;t public.isabella_tasks;r public.minds_autonomy_executions;
begin
 if u is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,70));
 select * into r from public.minds_autonomy_executions where user_id=u and request_id=p_request_id;
 if found then return jsonb_build_object('status','executed','receipt',to_jsonb(r));end if;
 select * into d from public.minds_shadow_decisions where user_id=u and request_id=p_request_id for update;
 if not found or d.status<>'pending' or d.created_at<now()-interval '10 minutes' then return jsonb_build_object('status','confirm','reason','no_current_pending_request');end if;
 c:=d.context->'autonomy_class';
 if c is null or c->>'eligible_class' is distinct from 'true' then return jsonb_build_object('status','confirm','reason','excluded_context');end if;
 select * into p from public.minds_contextual_permissions where user_id=u and action=d.action and context_key=c->>'context_key' and scope_key=c->>'scope_key' for update;
 if not found or p.mode<>'allow' or p.expires_at is null or p.expires_at<=now() or d.created_at<p.reviewed_at then return jsonb_build_object('status','confirm','reason','no_current_user_permission');end if;
 if exists(select 1 from public.minds_action_policies where app_scope='isabella' and action=d.action and enabled and mode='deny' and (user_id is null or user_id=u)) then return jsonb_build_object('status','confirm','reason','base_policy_denied');end if;
 select x into e from minds_private.contextual_evidence(u) x where x->>'action'=d.action and x->>'context_key'=c->>'context_key' and x->>'scope_key'=c->>'scope_key';
 if e is null or e->>'eligibility'<>'eligible' then return jsonb_build_object('status','confirm','reason','evidence_requires_review');end if;
 if not exists(select 1 from public.isabella_categories where user_id=u and id=(c->>'category_id')::uuid and lower(name)=lower(d.candidate->>'category')) then return jsonb_build_object('status','confirm','reason','category_changed');end if;
 insert into public.isabella_tasks(user_id,title,due_date,category_id,project_id,notes,client_key,sort_order,metadata)
 values(u,d.candidate->>'title',nullif(d.candidate->>'date','')::date,(c->>'category_id')::uuid,null,coalesce(d.candidate->>'notes',''),
  'autonomy:'||p_request_id::text,(select coalesce(max(sort_order),0)+10 from public.isabella_tasks where user_id=u and due_date is not distinct from nullif(d.candidate->>'date','')::date),
  jsonb_build_object('source','contextual_autonomy','permission_id',p.id,'permission_revision',p.revision,'request_id',p_request_id)) returning * into t;
 insert into public.minds_autonomy_executions(user_id,request_id,permission_id,permission_revision,task_id,candidate)
 values(u,p_request_id,p.id,p.revision,t.id,d.candidate) returning * into r;
 update public.minds_shadow_decisions set status='executed',resolved_at=now(),updated_at=now() where id=d.id;
 return jsonb_build_object('status','executed','receipt',to_jsonb(r));
end $$;

revoke all on function minds_private.shadow_changed_fields(jsonb,jsonb),minds_private.shadow_class(uuid,text,jsonb,jsonb),minds_private.stamp_shadow_class(),minds_private.contextual_evidence(uuid) from public,anon,authenticated,service_role;
-- The invoker-only recorder needs the class stamper but cannot change permissions.
grant usage on schema minds_private to service_role;
grant execute on function minds_private.shadow_class(uuid,text,jsonb,jsonb),minds_private.stamp_shadow_class() to service_role;
revoke all on function public.minds_get_contextual_autonomy(),public.minds_review_contextual_permission(text,text,text,text,text,integer,uuid,boolean),public.minds_try_contextual_task(uuid) from public,anon,authenticated,service_role;
grant execute on function public.minds_get_contextual_autonomy(),public.minds_review_contextual_permission(text,text,text,text,text,integer,uuid,boolean),public.minds_try_contextual_task(uuid) to authenticated;
comment on function public.minds_review_contextual_permission(text,text,text,text,text,integer,uuid,boolean) is 'Intentional authenticated per-user review API. No model tool exposes it. Explicit review, fresh evidence, optimistic revision and immutable audit receipt required.';
