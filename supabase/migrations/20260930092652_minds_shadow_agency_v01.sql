create table public.minds_shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null default 'isabella' check (agent in ('isabella','sofia','minds')),
  request_id uuid not null,
  action text not null check (length(trim(action)) between 1 and 120),
  proposal_kind text not null check (length(trim(proposal_kind)) between 1 and 120),
  policy_mode text not null default 'confirm' check (policy_mode='confirm'),
  candidate jsonb not null check (jsonb_typeof(candidate)='object'),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context)='object'),
  status text not null default 'pending' check (status in ('pending','accepted','edited','rejected','expired')),
  reviewed_candidate jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index minds_shadow_decisions_user_time_idx on public.minds_shadow_decisions(user_id,created_at desc);
create index minds_shadow_decisions_user_action_idx on public.minds_shadow_decisions(user_id,action,status,created_at desc);
alter table public.minds_shadow_decisions enable row level security;
create policy minds_shadow_decisions_select_own on public.minds_shadow_decisions
for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.minds_shadow_decisions from anon,authenticated;
grant select on public.minds_shadow_decisions to authenticated;
grant all on public.minds_shadow_decisions to service_role;

create or replace function public.minds_record_shadow_decision(
  p_user uuid,p_request_id uuid,p_action text,p_candidate jsonb,p_context jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.minds_shadow_decisions;
begin
  if p_user is null or p_request_id is null or length(trim(coalesce(p_action,'')))=0 then raise exception 'Invalid shadow decision';end if;
  if jsonb_typeof(coalesce(p_candidate,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_context,'{}'::jsonb))<>'object' then raise exception 'Invalid shadow payload';end if;
  insert into public.minds_shadow_decisions(user_id,agent,request_id,action,proposal_kind,policy_mode,candidate,context)
  values(p_user,case when coalesce(p_candidate->>'agent','isabella') in('isabella','sofia','minds') then coalesce(p_candidate->>'agent','isabella') else 'isabella' end,p_request_id,trim(p_action),coalesce(nullif(trim(p_candidate->>'kind'),''),'action'),'confirm',p_candidate,coalesce(p_context,'{}'::jsonb))
  on conflict(user_id,request_id) do nothing returning * into d;
  if not found then select * into d from public.minds_shadow_decisions where user_id=p_user and request_id=p_request_id;end if;
  return to_jsonb(d);
end $$;
revoke all on function public.minds_record_shadow_decision(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.minds_record_shadow_decision(uuid,uuid,text,jsonb,jsonb) to service_role;

create or replace function public.minds_resolve_shadow_decision(
  p_request_id uuid,p_outcome text,p_reviewed jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();d public.minds_shadow_decisions;next_status text;changed boolean:=false;
begin
  if u is null or p_request_id is null or p_outcome not in ('accepted','rejected') then raise exception 'Invalid shadow outcome';end if;
  select * into d from public.minds_shadow_decisions where user_id=u and request_id=p_request_id for update;
  if not found then return jsonb_build_object('status','missing');end if;
  if d.status<>'pending' then return to_jsonb(d);end if;
  if p_outcome='accepted' then
    changed:=jsonb_typeof(coalesce(p_reviewed->'_review'->'changed_fields','[]'::jsonb))='array' and jsonb_array_length(coalesce(p_reviewed->'_review'->'changed_fields','[]'::jsonb))>0;
    next_status:=case when changed then 'edited' else 'accepted' end;
  else next_status:='rejected';end if;
  update public.minds_shadow_decisions set status=next_status,reviewed_candidate=case when jsonb_typeof(coalesce(p_reviewed,'{}'::jsonb))='object' then p_reviewed else '{}'::jsonb end,resolved_at=now(),updated_at=now() where id=d.id returning * into d;
  return to_jsonb(d);
end $$;
revoke all on function public.minds_resolve_shadow_decision(uuid,text,jsonb) from public,anon;
grant execute on function public.minds_resolve_shadow_decision(uuid,text,jsonb) to authenticated,service_role;