-- Isabella fase 2, bloque 2. Deliberately not deployed by this PR.
-- Reissue the existing validated direct-create function with one conditional duration rule.
-- All owner/receipt/overlap and timezone guards stay in force.
CREATE OR REPLACE FUNCTION public.minds_commit_direct_calendar_create_v01(
  p_request_id uuid,p_candidate jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_pref text;
  v_decision public.minds_shadow_decisions%ROWTYPE;
  v_existing public.minds_calendar_action_receipts%ROWTYPE;
  v_evidence text;
  v_event_time_quote text;
  v_event_duration_quote text;
  v_event_duration_defaulted boolean;
  v_owner_turn uuid;
  v_authorization_exists boolean;
  v_action text;
  v_title text;
  v_date date;
  v_time time;
  v_duration integer;
  v_zone text;
  v_start timestamp;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_project text;
  v_category text;
  v_project_id uuid;
  v_category_id uuid;
  v_event public.isabella_events%ROWTYPE;
  v_after jsonb;
  v_receipt uuid;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL OR
     jsonb_typeof(p_candidate) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'unauthorized_or_invalid_direct_create'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_request_id::text,42));
  SELECT create_mode INTO v_pref FROM public.minds_calendar_execution_preferences
    WHERE user_id=v_user;
  IF v_pref IS DISTINCT FROM 'direct' THEN RAISE EXCEPTION 'direct_creation_not_enabled'; END IF;

  SELECT * INTO v_existing FROM public.minds_calendar_action_receipts
    WHERE user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.action NOT IN ('create_task','create_event') OR
       (p_candidate-'_review') IS DISTINCT FROM (v_existing.reviewed_candidate-'_review')
    THEN RAISE EXCEPTION 'receipt_replay_candidate_mismatch'; END IF;
    RETURN jsonb_build_object('status','already_applied','receipt_id',v_existing.id,
      'request_id',p_request_id,'entity_kind',v_existing.entity_kind,
      'entity_id',v_existing.entity_id,'entity_client_key',v_existing.entity_client_key,
      'after',v_existing.after_state);
  END IF;

  SELECT * INTO v_decision FROM public.minds_shadow_decisions
    WHERE user_id=v_user AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_decision.status<>'pending' OR v_decision.policy_mode<>'confirm'
     OR v_decision.action NOT IN ('create_task','create_event')
     OR v_decision.proposal_kind NOT IN ('task','event')
     OR coalesce(v_decision.context->>'direct_calendar_authority','')<>'explicit_owner_v1'
     OR coalesce((v_decision.context->>'source_tainted')::boolean,true)
     OR coalesce((v_decision.context->>'background')::boolean,true)
     OR (v_decision.candidate-'_review') IS DISTINCT FROM (p_candidate-'_review')
     OR v_decision.candidate->>'request_id' IS DISTINCT FROM p_request_id::text
  THEN RAISE EXCEPTION 'direct_creation_not_authorized'; END IF;
  v_action:=v_decision.action;
  IF (v_action='create_task' AND (p_candidate->>'kind'<>'task' OR p_candidate->>'action'<>'create'))
     OR (v_action='create_event' AND (p_candidate->>'kind'<>'event' OR p_candidate->>'action'<>'create'))
  THEN RAISE EXCEPTION 'direct_creation_kind_mismatch'; END IF;
  IF nullif(p_candidate->>'target_id','') IS NOT NULL OR
     nullif(p_candidate->>'target_title','') IS NOT NULL
  THEN RAISE EXCEPTION 'direct_creation_cannot_mutate'; END IF;
  v_evidence:=nullif(btrim(v_decision.context->>'direct_authorization_excerpt'),'');
  IF v_evidence IS NULL OR length(v_evidence)<8 OR length(v_evidence)>900
  THEN RAISE EXCEPTION 'direct_authorization_excerpt_missing'; END IF;
  BEGIN
    v_owner_turn:=(v_decision.context->>'direct_authorization_turn_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'direct_authorization_source_invalid';
  END;
  SELECT EXISTS(
    SELECT 1 FROM public.conversation_messages m
    WHERE m.user_id=v_user AND m.client_key=v_owner_turn::text AND m.role='user'
      AND m.provenance_class='owner' AND m.exposure_scope_version=1
      AND position(lower(v_evidence) in lower(m.content))>0
  ) INTO v_authorization_exists;
  IF NOT v_authorization_exists THEN RAISE EXCEPTION 'direct_authorization_source_missing'; END IF;
  IF p_candidate->'recurrence' IS NOT NULL AND
     p_candidate->'recurrence' NOT IN ('null'::jsonb,'{}'::jsonb,'""'::jsonb)
  THEN RAISE EXCEPTION 'recurrence_requires_review'; END IF;

  IF v_action='create_task' THEN
    -- Reuse the already accepted transactional executor: task + receipt +
    -- decision + activity, all in this same transaction.
    RETURN public.minds_commit_reviewed_task_create_v01(p_request_id,p_candidate);
  END IF;

  v_event_time_quote:=nullif(btrim(v_decision.context->>'direct_event_time_excerpt'),'');
  v_event_duration_quote:=nullif(btrim(v_decision.context->>'direct_event_duration_excerpt'),'');
  v_event_duration_defaulted:=coalesce((v_decision.context->>'direct_event_duration_defaulted')::boolean,false);
  IF v_event_time_quote IS NULL OR length(v_event_time_quote)<3 OR
     length(v_event_time_quote)>160 OR NOT EXISTS(
       SELECT 1 FROM public.conversation_messages m
       WHERE m.user_id=v_user AND m.client_key=v_owner_turn::text AND m.role='user'
         AND m.provenance_class='owner' AND m.exposure_scope_version=1
         AND position(lower(v_event_time_quote) in lower(m.content))>0
     )
  THEN RAISE EXCEPTION 'event_time_not_explicit'; END IF;
  IF v_event_duration_defaulted THEN
    -- The explicit owner quote contains the clock time, not a duration.
    -- Exactly 60 min is the only permitted inferred duration; the owner can
    -- change it later through the normal confirmed edit flow.
    IF (p_candidate->>'duration_defaulted') IS DISTINCT FROM 'true'
       OR (p_candidate->>'duration_minutes') IS DISTINCT FROM '60'
       OR v_event_duration_quote IS NOT NULL
    THEN RAISE EXCEPTION 'event_default_duration_mismatch'; END IF;
  ELSIF v_event_duration_quote IS NULL OR
     length(v_event_duration_quote)<3 OR length(v_event_duration_quote)>160 OR
     NOT EXISTS(
       SELECT 1 FROM public.conversation_messages m
       WHERE m.user_id=v_user AND m.client_key=v_owner_turn::text AND m.role='user'
         AND m.provenance_class='owner' AND m.exposure_scope_version=1
         AND position(lower(v_event_duration_quote) in lower(m.content))>0
     )
  THEN RAISE EXCEPTION 'event_time_or_duration_not_explicit'; END IF;
  v_title:=nullif(btrim(p_candidate->>'title'),'');
  IF v_title IS NULL OR length(v_title)>500 THEN RAISE EXCEPTION 'invalid_event_title'; END IF;
  IF coalesce(p_candidate->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR coalesce(p_candidate->>'time','') !~ '^[0-9]{2}:[0-9]{2}$'
  THEN RAISE EXCEPTION 'event_time_requires_review'; END IF;
  v_date:=(p_candidate->>'date')::date;
  IF to_char(v_date,'YYYY-MM-DD')<>p_candidate->>'date' THEN RAISE EXCEPTION 'invalid_event_date'; END IF;
  v_time:=(p_candidate->>'time')::time;
  IF to_char(v_time,'HH24:MI')<>p_candidate->>'time' THEN RAISE EXCEPTION 'invalid_event_time'; END IF;
  v_duration:=(p_candidate->>'duration_minutes')::integer;
  IF v_duration IS NULL OR v_duration<1 OR v_duration>720 OR
     coalesce((p_candidate->>'all_day')::boolean,false)
  THEN RAISE EXCEPTION 'event_duration_or_all_day_requires_review'; END IF;
  v_zone:=nullif(btrim(v_decision.context->>'direct_timezone'),'');
  IF v_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_zone)
  THEN RAISE EXCEPTION 'event_timezone_requires_review'; END IF;
  v_start:=v_date::timestamp+v_time;
  v_start_at:=v_start AT TIME ZONE v_zone;
  IF (v_start_at AT TIME ZONE v_zone)<>v_start
  THEN RAISE EXCEPTION 'event_invalid_local_time'; END IF;
  v_end_at:=v_start_at+make_interval(mins=>v_duration);
  v_project:=nullif(btrim(p_candidate->>'project'),'');
  IF v_project IS NOT NULL THEN
    SELECT id INTO v_project_id FROM public.isabella_projects
    WHERE user_id=v_user AND lower(name)=lower(v_project) AND NOT archived LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
  END IF;
  v_category:=nullif(btrim(p_candidate->>'category'),'');
  IF v_category IS NOT NULL THEN
    SELECT id INTO v_category_id FROM public.isabella_categories
    WHERE user_id=v_user AND lower(name)=lower(v_category) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.isabella_events e
    WHERE e.user_id=v_user AND e.starts_at<v_end_at AND e.ends_at>v_start_at
  ) THEN RAISE EXCEPTION 'event_overlap_requires_review'; END IF;

  INSERT INTO public.isabella_events(user_id,client_key,title,starts_at,ends_at,all_day,
    project_id,category_id,notes,metadata)
  VALUES(v_user,'direct:'||p_request_id::text,v_title,v_start_at,v_end_at,false,
    v_project_id,v_category_id,left(coalesce(p_candidate->>'notes',''),12000),
    jsonb_build_object('source','isabella','direct_request_id',p_request_id))
  RETURNING * INTO v_event;
  v_after:=jsonb_build_object('id',v_event.id,'client_key',v_event.client_key,
    'title',v_event.title,'starts_at',v_event.starts_at,'ends_at',v_event.ends_at,
    'project_id',v_event.project_id,'category_id',v_event.category_id,
    'all_day',v_event.all_day,'updated_at',v_event.updated_at);
  INSERT INTO public.minds_calendar_action_receipts(
    user_id,request_id,action,entity_kind,entity_id,entity_client_key,
    before_state,after_state,reviewed_candidate)
  VALUES(v_user,p_request_id,'create_event','event',v_event.id,v_event.client_key,
    'null'::jsonb,v_after,p_candidate) RETURNING id INTO v_receipt;
  UPDATE public.minds_shadow_decisions SET status='accepted',reviewed_candidate=p_candidate,
    resolved_at=now(),updated_at=now() WHERE id=v_decision.id;
  INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
  VALUES(v_user,'event',v_event.client_key,'create','assistant',NULL,v_after);
  RETURN jsonb_build_object('status','applied','receipt_id',v_receipt,
    'request_id',p_request_id,'entity_kind','event','entity_id',v_event.id,
    'entity_client_key',v_event.client_key,'after',v_after);
END;
$function$;

ALTER TABLE public.minds_calendar_action_receipts
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undo_receipt_id uuid;

CREATE OR REPLACE FUNCTION public.minds_undo_direct_calendar_create_v01(p_receipt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $undo$
DECLARE
  v_user uuid:=auth.uid();
  v_original public.minds_calendar_action_receipts%ROWTYPE;
  v_decision public.minds_shadow_decisions%ROWTYPE;
  v_task public.isabella_tasks%ROWTYPE;
  v_event public.isabella_events%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_user IS NULL OR p_receipt_id IS NULL
  THEN RAISE EXCEPTION 'undo_auth_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_receipt_id::text,42));
  SELECT * INTO v_original FROM public.minds_calendar_action_receipts
    WHERE id=p_receipt_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND OR v_original.action NOT IN ('create_task','create_event')
  THEN RAISE EXCEPTION 'undo_receipt_not_eligible'; END IF;
  IF v_original.undone_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_undone','receipt_id',v_original.undo_receipt_id,
      'original_receipt_id',v_original.id,'entity_kind',v_original.entity_kind);
  END IF;
  IF now()<v_original.created_at OR now()>=v_original.created_at+interval '10 minutes'
  THEN RAISE EXCEPTION 'undo_window_expired'; END IF;
  SELECT * INTO v_decision FROM public.minds_shadow_decisions
    WHERE user_id=v_user AND request_id=v_original.request_id AND
      context->>'direct_calendar_authority'='explicit_owner_v1';
  IF NOT FOUND OR v_decision.status<>'accepted'
  THEN RAISE EXCEPTION 'undo_requires_direct_creation'; END IF;
  -- The window also closes when Gari sends any later owner-authored message.
  IF EXISTS(SELECT 1 FROM public.conversation_messages m
    WHERE m.user_id=v_user AND m.role='user' AND m.provenance_class='owner'
      AND m.exposure_scope_version=1 AND m.created_at>v_original.created_at)
  THEN RAISE EXCEPTION 'undo_new_owner_message'; END IF;
  v_id:=gen_random_uuid();
  IF v_original.entity_kind='task' THEN
    SELECT * INTO v_task FROM public.isabella_tasks
      WHERE id=v_original.entity_id AND user_id=v_user
        AND client_key=v_original.entity_client_key FOR UPDATE;
    IF NOT FOUND OR v_task.archived_at IS NOT NULL OR v_task.completed_at IS NOT NULL
       OR v_task.title IS DISTINCT FROM v_original.after_state->>'title'
       OR v_task.due_date IS DISTINCT FROM nullif(v_original.after_state->>'date','')::date
       OR v_task.updated_at IS DISTINCT FROM (v_original.after_state->>'updated_at')::timestamptz
    THEN RAISE EXCEPTION 'undo_task_changed_since_creation'; END IF;
    UPDATE public.isabella_tasks SET archived_at=now(),updated_at=now()
      WHERE id=v_task.id AND user_id=v_user;
    INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
      VALUES(v_user,'task',v_task.client_key,'archive','assistant',
        v_original.after_state,jsonb_build_object('id',v_task.id,'archived_at',now(),'undo_receipt_id',v_id));
  ELSIF v_original.entity_kind='event' THEN
    SELECT * INTO v_event FROM public.isabella_events
      WHERE id=v_original.entity_id AND user_id=v_user
        AND client_key=v_original.entity_client_key FOR UPDATE;
    IF NOT FOUND
       OR v_event.starts_at IS DISTINCT FROM (v_original.after_state->>'starts_at')::timestamptz
       OR v_event.ends_at IS DISTINCT FROM (v_original.after_state->>'ends_at')::timestamptz
       OR v_event.updated_at IS DISTINCT FROM (v_original.after_state->>'updated_at')::timestamptz
    THEN RAISE EXCEPTION 'undo_event_changed_since_creation'; END IF;
    -- One exact newly created event, never a broad delete or an existing event.
    DELETE FROM public.isabella_events
      WHERE id=v_event.id AND user_id=v_user AND client_key=v_original.entity_client_key;
    INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
      VALUES(v_user,'event',v_event.client_key,'delete','assistant',
        v_original.after_state,jsonb_build_object('id',v_event.id,'undone',true,'undo_receipt_id',v_id));
  ELSE RAISE EXCEPTION 'undo_entity_kind_not_eligible'; END IF;
  UPDATE public.minds_calendar_action_receipts
    SET undone_at=now(),undo_receipt_id=v_id
    WHERE id=v_original.id AND user_id=v_user;
  RETURN jsonb_build_object('status','undone','receipt_id',v_id,
    'original_receipt_id',v_original.id,'entity_kind',v_original.entity_kind);
END;
$undo$;
REVOKE ALL ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid) TO authenticated;
COMMENT ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid) IS
  'Owner-only ten-minute idempotent undo of receipt-backed direct creations, expired on later owner turn; not a general deletion capability.';
