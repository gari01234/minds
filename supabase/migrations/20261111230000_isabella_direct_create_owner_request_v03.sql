-- Isabella · 11.11.2026 · «Deshacer en lugar de confirmar» (Gari, paso 4).
-- Creating an own task or a timed event is reversible and low-risk: when the owner asks for it in a
-- turn, it is created at once and can be undone for 10 minutes. Until now this only happened when
-- the title, the day and the hour were written literally in the owner's message (v02), so «agrega
-- este Termin» with a screenshot, or «sí, apúntalo» after her own suggestion, still needed a card.
--
-- What changes (v03, same function names and signatures, nothing dropped, no data touched):
--  * the owner's request must be in the owner's turn (any wording, compared without case or
--    punctuation); the title, day and hour are no longer required to be literal quotes;
--  * an overlap with another event no longer blocks: she is told and says so, the owner can undo;
--  * creating with Undo is the default; an explicit choice of «review» in the preferences still
--    turns it off for that person;
--  * a read-only helper tells the engine which events a new one would overlap.
-- What stays: only create_task/create_event for the owner's own calendar, never a change or a
-- deletion; no recurring or all-day events; not in background turns; not when text from the web,
-- Sofía or a specialist entered the turn; one admitted decision, one atomic receipt; Undo only
-- within 10 minutes, only while no newer owner message exists, only if the item is unchanged.
-- Requires 20261108101000_isabella_direct_calendar_safe_undo_v02.sql.

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
  v_owner_turn uuid;
  v_source_turn uuid;
  v_turns text[];
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
  -- 11.11.2026: creating with Undo is the default; only an explicit «confirmar antes de crear» turns it off.
  IF v_pref IS NOT DISTINCT FROM 'review' THEN RAISE EXCEPTION 'direct_creation_not_enabled'; END IF;

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
     OR coalesce(v_decision.context->>'direct_calendar_authority','') NOT IN ('explicit_owner_v1','owner_request_v2')
     OR coalesce((v_decision.context->>'direct_owner_source_tainted')::boolean,true)
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
  -- The owner's own words asking for it (any wording, any length: «sí», «apúntalo»). Compared without
  -- case or punctuation, like the server does (direct-calendar-contract.mjs, ownerAsked).
  v_evidence:=btrim(regexp_replace(regexp_replace(
    lower(coalesce(v_decision.context->>'direct_authorization_excerpt','')),'[^[:alnum:] ]+',' ','g'),'[[:space:]]+',' ','g'));
  IF length(v_evidence)<2 OR length(v_evidence)>900
  THEN RAISE EXCEPTION 'direct_authorization_excerpt_missing'; END IF;
  BEGIN
    v_owner_turn:=(v_decision.context->>'direct_authorization_turn_id')::uuid;
    -- After a server-verified clarification («¿a qué hora?» → «a las 10») the clarified owner
    -- turn may hold the title or a quote; the answering turn stays the authorizing one.
    v_source_turn:=nullif(v_decision.context->>'direct_source_turn_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'direct_authorization_source_invalid';
  END;
  v_turns:=array_remove(ARRAY[v_owner_turn::text,v_source_turn::text],NULL);
  SELECT EXISTS(
    SELECT 1 FROM public.conversation_messages m
    WHERE m.user_id=v_user AND m.client_key=ANY(v_turns) AND m.role='user'
      AND m.provenance_class='owner' AND m.exposure_scope_version=1
      AND position(v_evidence in btrim(regexp_replace(regexp_replace(
        lower(m.content),'[^[:alnum:] ]+',' ','g'),'[[:space:]]+',' ','g')))>0
  ) INTO v_authorization_exists;
  IF NOT v_authorization_exists THEN RAISE EXCEPTION 'direct_authorization_source_missing'; END IF;
  IF p_candidate->'recurrence' IS NOT NULL AND
     p_candidate->'recurrence' NOT IN ('null'::jsonb,'{}'::jsonb,'""'::jsonb)
  THEN RAISE EXCEPTION 'recurrence_requires_review'; END IF;

  -- v03: the title, the day and the hour may come from an attachment, an earlier message or her own
  -- reading of the request; what must be the owner's is the request itself (checked above).
  IF length(btrim(coalesce(p_candidate->>'title','')))<1 THEN RAISE EXCEPTION 'direct_title_missing'; END IF;

  IF v_action='create_task' THEN
    -- Reuse the already accepted transactional executor: task + receipt +
    -- decision + activity, all in this same transaction.
    RETURN public.minds_commit_reviewed_task_create_v01(p_request_id,p_candidate);
  END IF;

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
  -- v03: an overlap no longer stops the creation. She is told about it before she answers
  -- (minds_direct_event_overlap_v01) and says so; the owner can undo.

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
REVOKE ALL ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb)
  TO authenticated;
COMMENT ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb) IS
  'Direct create of an own task or timed event when the owner asked for it in this turn (v03): the request is the owner''s, details may be interpreted; admitted decision + atomic receipt; undo for 10 minutes. Off only when the owner chose review.';



CREATE OR REPLACE FUNCTION public.minds_undo_direct_calendar_create_v01(
  p_request_id uuid,p_receipt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_receipt public.minds_calendar_action_receipts%ROWTYPE;
  v_decision public.minds_shadow_decisions%ROWTYPE;
  v_task public.isabella_tasks%ROWTYPE;
  v_after_task public.isabella_tasks%ROWTYPE;
  v_event public.isabella_events%ROWTYPE;
  v_undo_receipt uuid;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL OR p_receipt_id IS NULL
  THEN RAISE EXCEPTION 'unauthorized_or_invalid_undo'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_request_id::text,42));
  SELECT * INTO v_receipt FROM public.minds_calendar_action_receipts
    WHERE user_id=v_user AND id=p_receipt_id AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_receipt.action NOT IN ('create_task','create_event')
    OR v_receipt.entity_kind NOT IN ('task','event')
    OR v_receipt.after_state IS NULL
  THEN RAISE EXCEPTION 'direct_create_receipt_not_found'; END IF;
  -- The receipt must be fresh; this guard is not a generic archive/delete permission.
  IF now()>v_receipt.created_at+interval '10 minutes'
  THEN RAISE EXCEPTION 'direct_undo_window_expired'; END IF;
  SELECT * INTO v_decision FROM public.minds_shadow_decisions
    WHERE user_id=v_user AND request_id=p_request_id;
  IF NOT FOUND OR v_decision.action IS DISTINCT FROM v_receipt.action
     OR coalesce(v_decision.context->>'direct_calendar_authority','') NOT IN ('explicit_owner_v1','owner_request_v2')
     OR v_decision.context->>'direct_authorization_turn_id' IS NULL
  THEN RAISE EXCEPTION 'not_a_direct_owner_create'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.conversation_messages m
      WHERE m.user_id=v_user AND m.role='user' AND m.provenance_class='owner' AND m.exposure_scope_version=1
        AND m.client_key=v_decision.context->>'direct_authorization_turn_id'
        AND NOT EXISTS (SELECT 1 FROM public.conversation_messages newer
          WHERE newer.user_id=v_user AND newer.role='user' AND newer.provenance_class='owner'
            AND newer.conversation_id=m.conversation_id AND newer.created_at>m.created_at))
  THEN RAISE EXCEPTION 'direct_undo_superseded'; END IF;

  IF v_receipt.entity_kind='task' THEN
    SELECT * INTO v_task FROM public.isabella_tasks
      WHERE user_id=v_user AND id=v_receipt.entity_id
        AND client_key=v_receipt.entity_client_key FOR UPDATE;
    IF NOT FOUND OR v_task.archived_at IS NOT NULL OR v_task.completed_at IS NOT NULL OR
       v_task.updated_at IS DISTINCT FROM (v_receipt.after_state->>'updated_at')::timestamptz OR
       v_task.title IS DISTINCT FROM v_receipt.after_state->>'title' OR
       v_task.due_date IS DISTINCT FROM (v_receipt.after_state->>'date')::date
    THEN RAISE EXCEPTION 'original_task_changed_undo_requires_review'; END IF;
    UPDATE public.isabella_tasks SET archived_at=now(),updated_at=now()
      WHERE id=v_task.id AND user_id=v_user AND archived_at IS NULL
      RETURNING * INTO v_after_task;
    IF NOT FOUND THEN RAISE EXCEPTION 'task_undo_conflict'; END IF;
    INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
      VALUES(v_user,'task',v_task.client_key,'archive','assistant',to_jsonb(v_task),to_jsonb(v_after_task))
      RETURNING id INTO v_undo_receipt;
  ELSE
    SELECT * INTO v_event FROM public.isabella_events
      WHERE user_id=v_user AND id=v_receipt.entity_id
        AND client_key=v_receipt.entity_client_key FOR UPDATE;
    IF NOT FOUND OR
       v_event.updated_at IS DISTINCT FROM (v_receipt.after_state->>'updated_at')::timestamptz OR
       v_event.title IS DISTINCT FROM v_receipt.after_state->>'title' OR
       v_event.starts_at IS DISTINCT FROM (v_receipt.after_state->>'starts_at')::timestamptz OR
       v_event.ends_at IS DISTINCT FROM (v_receipt.after_state->>'ends_at')::timestamptz
    THEN RAISE EXCEPTION 'original_event_changed_undo_requires_review'; END IF;
    DELETE FROM public.isabella_events WHERE id=v_event.id AND user_id=v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_undo_conflict'; END IF;
    -- Sync tombstone belongs in the same transaction as the deletion.
    INSERT INTO public.isabella_deleted_items(user_id,entity_type,client_key,deleted_at)
      VALUES(v_user,'event',v_event.client_key,now())
      ON CONFLICT (user_id,entity_type,client_key) DO UPDATE
      SET deleted_at=EXCLUDED.deleted_at;
    INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
      VALUES(v_user,'event',v_event.client_key,'delete','assistant',to_jsonb(v_event),NULL)
      RETURNING id INTO v_undo_receipt;
  END IF;
  RETURN jsonb_build_object('status','undone','request_id',p_request_id,
    'original_receipt_id',p_receipt_id,'undo_receipt_id',v_undo_receipt,
    'entity_kind',v_receipt.entity_kind,'entity_client_key',v_receipt.entity_client_key);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid) IS
  'Owner-only, one direct creation receipt, 10 minutes, unchanged row, transactional reversal and activity receipt; never general delete authority.';



-- Read-only: which of the owner's events would a new timed event overlap? Used by the engine to
-- tell her before she answers. Security invoker: the existing row-level rules decide what is seen.
CREATE OR REPLACE FUNCTION public.minds_direct_event_overlap_v01(
  p_date date,p_time time,p_duration_minutes integer,p_timezone text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_zone text:=nullif(btrim(coalesce(p_timezone,'')),'');
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_user IS NULL OR p_date IS NULL OR p_time IS NULL OR v_zone IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_zone)
     OR coalesce(p_duration_minutes,0)<1 OR p_duration_minutes>720
  THEN RETURN '[]'::jsonb; END IF;
  v_start:=(p_date::timestamp+p_time) AT TIME ZONE v_zone;
  v_end:=v_start+make_interval(mins=>p_duration_minutes);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'title',x.title,
      'local_start',to_char(x.starts_at AT TIME ZONE v_zone,'HH24:MI'),
      'local_end',to_char(x.ends_at AT TIME ZONE v_zone,'HH24:MI')) ORDER BY x.starts_at)
    FROM (
      SELECT e.title,e.starts_at,e.ends_at FROM public.isabella_events e
      WHERE e.user_id=v_user AND NOT coalesce(e.all_day,false)
        AND e.starts_at<v_end AND e.ends_at>v_start
      ORDER BY e.starts_at LIMIT 5
    ) x),'[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_direct_event_overlap_v01(date,time,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_direct_event_overlap_v01(date,time,integer,text) TO authenticated;
COMMENT ON FUNCTION public.minds_direct_event_overlap_v01(date,time,integer,text) IS
  'Read-only: the owner''s timed events a new event would overlap (at most 5), for the engine to mention before answering.';
