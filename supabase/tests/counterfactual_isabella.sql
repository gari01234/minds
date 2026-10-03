begin;

insert into auth.users(id,aud,role,email)
values ('f7520000-0000-4000-8000-000000000001','authenticated','authenticated','counterfactual-sql-test@example.invalid');

insert into public.isabella_categories(id,user_id,name,sort_order,client_key)
values (
  'f7520000-0000-4000-8000-000000000002',
  'f7520000-0000-4000-8000-000000000001',
  'Casa',10,'counterfactual-sql-test-house'
);

insert into public.minds_shadow_decisions(
  user_id,request_id,action,proposal_kind,policy_mode,candidate,context,status,reviewed_candidate,resolved_at,created_at,updated_at
) values
(
  'f7520000-0000-4000-8000-000000000001',
  'f7520000-0000-4000-8000-000000000011',
  'create_task','task','confirm',
  '{"kind":"task","action":"create","title":"A","category":"Casa","date":"2026-10-04"}'::jsonb,
  '{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}'::jsonb,
  'accepted',
  '{"kind":"task","action":"create","title":"A","category":"Casa","date":"2026-10-04"}'::jsonb,
  now()-interval '3 days',now()-interval '3 days',now()-interval '3 days'
),
(
  'f7520000-0000-4000-8000-000000000001',
  'f7520000-0000-4000-8000-000000000012',
  'create_task','task','confirm',
  '{"kind":"task","action":"create","title":"B","category":"Casa","date":"2026-10-05"}'::jsonb,
  '{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}'::jsonb,
  'edited',
  '{"kind":"task","action":"create","title":"B","category":"Casa","date":"2026-10-06","_review":{"changed_fields":["date"]}}'::jsonb,
  now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'
),
(
  'f7520000-0000-4000-8000-000000000001',
  'f7520000-0000-4000-8000-000000000013',
  'create_task','task','confirm',
  '{"kind":"task","action":"create","title":"C","category":"Casa","date":"2026-10-07"}'::jsonb,
  '{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}'::jsonb,
  'rejected',
  '{"kind":"task","action":"create","title":"C","category":"Casa","date":"2026-10-07"}'::jsonb,
  now()-interval '1 day',now()-interval '1 day',now()-interval '1 day'
),
(
  'f7520000-0000-4000-8000-000000000001',
  'f7520000-0000-4000-8000-000000000014',
  'create_task','task','confirm',
  '{"kind":"task","action":"create","title":"D","category":"Casa","date":"2026-10-08"}'::jsonb,
  '{"autonomy_contract":"fast_task_v1","direct_request":true,"fast_path":true,"one_round":true,"source_tainted":false,"background":false}'::jsonb,
  'pending',null,null,now(),now()
);

select set_config('request.jwt.claim.sub','f7520000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $test$
declare
  r jsonb;
  before_shadow bigint;
  before_tasks bigint;
  before_permissions bigint;
  before_reviews bigint;
  before_exec bigint;
  pending_case jsonb;
begin
  select count(*) into before_shadow from public.minds_shadow_decisions;
  select count(*) into before_tasks from public.isabella_tasks;
  select count(*) into before_permissions from public.minds_contextual_permissions;
  select count(*) into before_reviews from public.minds_permission_reviews;
  select count(*) into before_exec from public.minds_autonomy_executions;

  r:=public.minds_preview_contextual_counterfactual(
    'create_task',
    'fast_task_dated_v1',
    'category:f7520000-0000-4000-8000-000000000002:project:none'
  );

  if r->>'status'<>'ok' then raise exception 'counterfactual_status_failed:%',r; end if;
  if (r->'summary'->>'historical_reviews')::int<>3 then raise exception 'counterfactual_review_count_failed:%',r; end if;
  if (r->'summary'->>'would_have_matched_final')::int<>1 then raise exception 'counterfactual_match_count_failed:%',r; end if;
  if (r->'summary'->>'would_have_preceded_correction')::int<>1 then raise exception 'counterfactual_edit_count_failed:%',r; end if;
  if (r->'summary'->>'would_have_preceded_rejection')::int<>1 then raise exception 'counterfactual_reject_count_failed:%',r; end if;
  if (r->'summary'->>'unknown_outcome')::int<>1 then raise exception 'counterfactual_unknown_count_failed:%',r; end if;

  select x into pending_case
  from jsonb_array_elements(r->'cases') x
  where x->>'actual_outcome'='pending'
  limit 1;
  if pending_case is null
     or jsonb_array_length(pending_case->'changed_fields')<>0
     or pending_case->>'counterfactual_effect'<>'unknown'
  then raise exception 'counterfactual_pending_semantics_failed:%',pending_case; end if;

  if (select count(*) from public.minds_shadow_decisions)<>before_shadow
     or (select count(*) from public.isabella_tasks)<>before_tasks
     or (select count(*) from public.minds_contextual_permissions)<>before_permissions
     or (select count(*) from public.minds_permission_reviews)<>before_reviews
     or (select count(*) from public.minds_autonomy_executions)<>before_exec
  then raise exception 'counterfactual_side_effect_detected'; end if;
end $test$;

reset role;
rollback;
