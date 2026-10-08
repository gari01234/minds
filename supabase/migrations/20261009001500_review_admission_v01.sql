-- Build 87.4 — proposal admission and low-value suppression.
-- Suppression is deterministic, auditable and narrow. It never rejects authority/project-truth review.
-- This is an admission receipt layer, not a second proposal store.

alter table public.minds_shadow_decisions
  add column if not exists admission_fingerprint text null;

create index if not exists minds_shadow_decisions_admission_idx
  on public.minds_shadow_decisions(user_id,admission_fingerprint,status,created_at desc)
  where admission_fingerprint is not null;


create table if not exists public.minds_review_admission_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (length(trim(action)) between 1 and 120),
  proposal_kind text not null check (length(trim(proposal_kind)) between 1 and 120),
  outcome text not null check (outcome in ('admitted','duplicate','suppressed')),
  reason_code text not null check (length(trim(reason_code)) between 1 and 120),
  semantic_fingerprint text not null check (semantic_fingerprint ~ '^[0-9a-f]{32}$'),
  existing_decision_id uuid null references public.minds_shadow_decisions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create index if not exists minds_review_admission_events_user_idx
  on public.minds_review_admission_events(user_id,created_at desc);

alter table public.minds_review_admission_events enable row level security;

drop policy if exists "review_admission_events_select_own" on public.minds_review_admission_events;
create policy "review_admission_events_select_own"
on public.minds_review_admission_events for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_review_admission_events from anon,authenticated;
grant select on public.minds_review_admission_events to authenticated;
grant select,insert,update,delete on public.minds_review_admission_events to service_role;


create or replace function public.minds_admit_shadow_decision(
  p_user uuid,
  p_request_id uuid,
  p_action text,
  p_candidate jsonb,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  d public.minds_shadow_decisions;
  existing public.minds_shadow_decisions;
  v_kind text:=coalesce(nullif(trim(p_candidate->>'kind'),''),'action');
  v_action text:=trim(coalesce(p_action,''));
  v_run_id text:=nullif(trim(coalesce(p_context->>'run_id','')),'');
  v_scope text:=coalesce(
    nullif(p_context->'autonomy_class'->>'scope_key',''),
    nullif(p_context->>'project',''),
    'unscoped'
  );
  v_direct text:=case when coalesce((p_context->>'direct_request')::boolean,false) then 'direct' else 'inferred' end;
  v_tainted text:=case when coalesce((p_context->>'source_tainted')::boolean,false) then 'tainted' else 'clean' end;
  v_fingerprint text;
  v_target uuid;
  v_noop boolean:=false;
  v_reason text:=null;
begin
  if p_user is null or p_request_id is null or v_action='' then
    raise exception 'Invalid shadow decision';
  end if;
  if jsonb_typeof(coalesce(p_candidate,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_context,'{}'::jsonb))<>'object' then
    raise exception 'Invalid shadow payload';
  end if;

  v_fingerprint:=md5(
    v_action||'|'||v_kind||'|'||
    ((p_candidate-'request_id'-'mission_request_id')::text)||'|'||
    v_scope||'|'||v_direct||'|'||v_tainted
  );

  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||coalesce(v_run_id,'none')||':'||v_fingerprint,0));

  select * into d
  from public.minds_shadow_decisions
  where user_id=p_user and request_id=p_request_id
  limit 1;
  if found then
    return jsonb_build_object('status','already_recorded','decision',to_jsonb(d),'reason','same_request_id');
  end if;

  -- Safe low-value suppression: do not ask Gari to confirm a state that already exists.
  if v_action in ('complete_task','archive_task') and coalesce(p_candidate->>'target_id','') ~* '^[0-9a-f-]{36}$' then
    v_target:=(p_candidate->>'target_id')::uuid;
    if v_action='complete_task' then
      select (completed_at is not null) into v_noop
      from public.isabella_tasks
      where id=v_target and user_id=p_user;
      if coalesce(v_noop,false) then v_reason:='task_already_completed'; end if;
    elsif v_action='archive_task' then
      select (archived_at is not null) into v_noop
      from public.isabella_tasks
      where id=v_target and user_id=p_user;
      if coalesce(v_noop,false) then v_reason:='task_already_archived'; end if;
    end if;
  end if;

  if v_reason is not null then
    insert into public.minds_review_admission_events(
      user_id,request_id,action,proposal_kind,outcome,reason_code,semantic_fingerprint,metadata
    ) values (
      p_user,p_request_id,v_action,v_kind,'suppressed',v_reason,v_fingerprint,
      jsonb_build_object(
        'target_id',p_candidate->>'target_id',
        'title',left(coalesce(p_candidate->>'title',''),500),
        'run_id',v_run_id,
        'scope',v_scope,
        'directness',v_direct,
        'reversible',true,
        'reissue_if_state_changes',true,
        'authority_changed',false
      )
    );
    return jsonb_build_object(
      'status','suppressed',
      'reason',v_reason,
      'semantic_fingerprint',v_fingerprint,
      'authority_changed',false
    );
  end if;

  -- Semantic dedupe is deliberately limited to one agent run.
  -- Repeating the same request in a later turn remains a new user act and is not silently swallowed.
  if v_run_id is not null then
    select * into existing
    from public.minds_shadow_decisions s
    where s.user_id=p_user
      and s.status='pending'
      and s.admission_fingerprint=v_fingerprint
      and s.context->>'run_id'=v_run_id
    order by s.created_at asc
    limit 1;

    if found then
      insert into public.minds_review_admission_events(
        user_id,request_id,action,proposal_kind,outcome,reason_code,semantic_fingerprint,
        existing_decision_id,metadata
      ) values (
        p_user,p_request_id,v_action,v_kind,'duplicate','same_run_semantic_duplicate',v_fingerprint,
        existing.id,
        jsonb_build_object(
          'run_id',v_run_id,
          'scope',v_scope,
          'directness',v_direct,
          'authority_changed',false
        )
      );
      return jsonb_build_object(
        'status','duplicate',
        'reason','same_run_semantic_duplicate',
        'decision',to_jsonb(existing),
        'authority_changed',false
      );
    end if;
  end if;

  insert into public.minds_shadow_decisions(
    user_id,agent,request_id,action,proposal_kind,policy_mode,candidate,context,admission_fingerprint
  ) values (
    p_user,
    case when coalesce(p_candidate->>'agent','isabella') in ('isabella','sofia','minds')
      then coalesce(p_candidate->>'agent','isabella') else 'isabella' end,
    p_request_id,v_action,v_kind,'confirm',p_candidate,coalesce(p_context,'{}'::jsonb),v_fingerprint
  )
  returning * into d;

  insert into public.minds_review_admission_events(
    user_id,request_id,action,proposal_kind,outcome,reason_code,semantic_fingerprint,
    existing_decision_id,metadata
  ) values (
    p_user,p_request_id,v_action,v_kind,'admitted','review_required',v_fingerprint,d.id,
    jsonb_build_object(
      'run_id',v_run_id,
      'scope',v_scope,
      'directness',v_direct,
      'source_tainted',coalesce((p_context->>'source_tainted')::boolean,false),
      'authority_changed',false
    )
  );

  return jsonb_build_object(
    'status','admitted',
    'decision',to_jsonb(d),
    'semantic_fingerprint',v_fingerprint,
    'authority_changed',false
  );
exception
  when unique_violation then
    select * into d from public.minds_shadow_decisions
    where user_id=p_user and request_id=p_request_id limit 1;
    if found then
      return jsonb_build_object('status','already_recorded','decision',to_jsonb(d),'reason','same_request_id');
    end if;
    raise;
end $$;

revoke all on function public.minds_admit_shadow_decision(uuid,uuid,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.minds_admit_shadow_decision(uuid,uuid,text,jsonb,jsonb)
  to service_role;
