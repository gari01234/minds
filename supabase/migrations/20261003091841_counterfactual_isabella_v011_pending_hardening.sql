create or replace function public.minds_preview_contextual_counterfactual(
  p_action text,
  p_context_key text,
  p_scope_key text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  u uuid:=(select auth.uid());
  result jsonb;
begin
  if u is null then raise exception 'counterfactual_auth_required'; end if;
  if p_action is null or p_context_key is null or p_scope_key is null then
    raise exception 'counterfactual_exact_scope_required';
  end if;
  if p_action<>'create_task'
     or p_context_key not in ('fast_task_undated_v1','fast_task_dated_v1') then
    raise exception 'counterfactual_class_not_supported';
  end if;

  with matched as (
    select
      d.id,d.request_id,d.created_at,d.resolved_at,d.status,
      d.candidate,d.reviewed_candidate,
      d.context->'autonomy_class' cls,
      case when d.reviewed_candidate is null then '[]'::jsonb else coalesce((
        select jsonb_agg(k order by k)
        from (
          select k
          from (
            select jsonb_object_keys(coalesce(d.candidate,'{}'::jsonb)) k
            union
            select jsonb_object_keys(coalesce(d.reviewed_candidate,'{}'::jsonb)) k
          ) keys
          where k not in ('request_id','_review')
            and coalesce(d.candidate->k,'null'::jsonb)
                is distinct from coalesce(d.reviewed_candidate->k,'null'::jsonb)
          union
          select jsonb_array_elements_text(
            case when jsonb_typeof(d.reviewed_candidate->'_review'->'changed_fields')='array'
              then d.reviewed_candidate->'_review'->'changed_fields'
              else '[]'::jsonb end
          )
        ) changes
      ),'[]'::jsonb) end changed_fields
    from public.minds_shadow_decisions d
    where d.user_id=u
      and d.action=p_action
      and d.created_at>=now()-interval '30 days'
      and d.context->'autonomy_class'->>'context_key'=p_context_key
      and d.context->'autonomy_class'->>'scope_key'=p_scope_key
      and d.context->'autonomy_class'->>'eligible_class'='true'
  ),
  normalized as (
    select *,
      case
        when status='accepted' and jsonb_array_length(changed_fields)>0 then 'edited'
        else status
      end actual_outcome,
      case
        when status='accepted' and jsonb_array_length(changed_fields)=0 then 'same_result_without_confirmation'
        when status='accepted' and jsonb_array_length(changed_fields)>0 then 'would_act_before_correction'
        when status='edited' then 'would_act_before_correction'
        when status='rejected' then 'would_act_despite_rejection'
        when status='executed' then 'already_autonomous'
        else 'unknown'
      end counterfactual_effect
    from matched
  ),
  summary as (
    select
      count(*) as observed_cases,
      count(*) filter(where actual_outcome in ('accepted','edited','rejected')) as historical_reviews,
      count(*) filter(where actual_outcome in ('accepted','edited','rejected')) as would_have_auto_executed,
      count(*) filter(where actual_outcome='accepted') as would_have_matched_final,
      count(*) filter(where actual_outcome='edited') as would_have_preceded_correction,
      count(*) filter(where actual_outcome='rejected') as would_have_preceded_rejection,
      count(*) filter(where actual_outcome='executed') as already_autonomous,
      count(*) filter(where actual_outcome in ('pending','expired')) as unknown_outcome
    from normalized
  ),
  cases as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'decision_id',id,
        'created_at',created_at,
        'resolved_at',resolved_at,
        'actual_outcome',actual_outcome,
        'counterfactual_effect',counterfactual_effect,
        'changed_fields',changed_fields,
        'candidate',jsonb_strip_nulls(jsonb_build_object(
          'title',candidate->>'title',
          'date',candidate->>'date',
          'category',candidate->>'category'
        )),
        'reviewed',case when reviewed_candidate is null then null else
          jsonb_strip_nulls(jsonb_build_object(
            'title',reviewed_candidate->>'title',
            'date',reviewed_candidate->>'date',
            'category',reviewed_candidate->>'category'
          )) end
      )
      order by created_at desc
    ),'[]'::jsonb) value
    from normalized
  )
  select jsonb_build_object(
    'status',case when s.observed_cases=0 then 'no_history' else 'ok' end,
    'action',p_action,
    'context_key',p_context_key,
    'scope_key',p_scope_key,
    'scope_label',(select cls->>'scope_label' from normalized order by created_at desc limit 1),
    'window_days',30,
    'assumption','This preview changes only the user-confirmation layer: it assumes the exact allow permission had been active for each matching historical request while the stamped request class remained the same.',
    'limitations',jsonb_build_array(
      'It does not reconstruct historical revisions of global base policies.',
      'Pending or expired requests have unknown human outcomes and are never guessed.',
      'The preview does not execute tasks, change permissions, or create evidence.'
    ),
    'summary',to_jsonb(s),
    'cases',c.value,
    'current_permission',(
      select jsonb_build_object(
        'mode',p.mode,'revision',p.revision,'reviewed_at',p.reviewed_at,'expires_at',p.expires_at
      )
      from public.minds_contextual_permissions p
      where p.user_id=u and p.action=p_action and p.context_key=p_context_key and p.scope_key=p_scope_key
      limit 1
    )
  )
  into result
  from summary s cross join cases c;

  return result;
end $$;

revoke all on function public.minds_preview_contextual_counterfactual(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.minds_preview_contextual_counterfactual(text,text,text)
  to authenticated;
