-- Build 91.5: explicitly rated situational proposals enter the POM as observations,
-- not accepted rules, causal learning, permissions or behavior changes.
create or replace function public.minds_capture_situational_review_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.minds_surface_items%rowtype;
begin
  if new.action not in ('liked','not_relevant') or new.item_id is null then return new; end if;
  select * into v_item from public.minds_surface_items
    where id=new.item_id and user_id=new.user_id
      and metadata->>'reason_code'='contextual_reassessment';
  if not found then return new; end if;

  insert into public.minds_operating_model_observations(
    user_id,dimension,signal_type,source_kind,source_ref,signal,payload,fingerprint,observed_at
  ) values(
    new.user_id,'planning','proposal_outcome','proposal_feedback',new.id::text,
    case new.action
      when 'liked' then 'El usuario indicó explícitamente que una sugerencia contextual le ayudó.'
      else 'El usuario indicó explícitamente que una sugerencia contextual no encajaba.'
    end,
    jsonb_build_object(
      'kind','situational_review_explicit_feedback',
      'attention_event_id',v_item.metadata->>'attention_event_id',
      'surface_item_id',v_item.id,
      'feedback_id',new.id,
      'feedback_action',new.action,
      'evidence_kind','explicit_user_selection',
      'causal_status','unconfirmed',
      'accepted_rule',false
    ),
    md5('situational_review_feedback:'||new.id::text),new.created_at
  )
  on conflict (user_id,fingerprint) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_capture_situational_review_feedback on public.minds_surface_feedback;
create trigger trg_capture_situational_review_feedback
after insert on public.minds_surface_feedback
for each row execute function public.minds_capture_situational_review_feedback();
