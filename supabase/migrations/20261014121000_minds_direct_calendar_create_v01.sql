-- MINDS #138: owner's reversible direct-create preference.
-- Explicit user instructions may commit calendar *creations* without redundant UI approval.
-- Other mutations remain reviewed. Every commit is authorized, idempotent and traceable.
CREATE TABLE public.minds_calendar_execution_preferences(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  create_mode text NOT NULL DEFAULT 'review'
    CHECK(create_mode IN ('review','direct')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.minds_calendar_execution_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minds_calendar_execution_preferences FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.minds_calendar_execution_preferences TO authenticated;
CREATE POLICY "calendar preference owner select"
  ON public.minds_calendar_execution_preferences FOR SELECT TO authenticated
  USING(user_id=auth.uid());
CREATE POLICY "calendar preference owner insert"
  ON public.minds_calendar_execution_preferences FOR INSERT TO authenticated
  WITH CHECK(user_id=auth.uid());
CREATE POLICY "calendar preference owner update"
  ON public.minds_calendar_execution_preferences FOR UPDATE TO authenticated
  USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT ALL ON public.minds_calendar_execution_preferences TO service_role;

ALTER TABLE public.minds_calendar_action_receipts
  DROP CONSTRAINT minds_calendar_action_receipts_action_check;
ALTER TABLE public.minds_calendar_action_receipts
  ADD CONSTRAINT minds_calendar_action_receipts_action_check
    CHECK (action IN ('update_task','create_task','create_event'));
ALTER TABLE public.minds_calendar_action_receipts
  DROP CONSTRAINT minds_calendar_action_receipts_entity_kind_check;
ALTER TABLE public.minds_calendar_action_receipts
  ADD CONSTRAINT minds_calendar_action_receipts_entity_kind_check
    CHECK (entity_kind IN ('task','event'));


-- Function is accessible only to the authenticated owner; server-issued context is
-- verified against an owner-authored scoped turn and an admitted shadow decision.
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
  IF v_event_time_quote IS NULL OR v_event_duration_quote IS NULL OR
     length(v_event_time_quote)<3 OR length(v_event_duration_quote)<3 OR
     length(v_event_time_quote)>160 OR length(v_event_duration_quote)>160 OR
     NOT EXISTS(
       SELECT 1 FROM public.conversation_messages m
       WHERE m.user_id=v_user AND m.client_key=v_owner_turn::text AND m.role='user'
         AND m.provenance_class='owner' AND m.exposure_scope_version=1
         AND position(lower(v_event_time_quote) in lower(m.content))>0
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
REVOKE ALL ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb)
  TO authenticated;
COMMENT ON FUNCTION public.minds_commit_direct_calendar_create_v01(uuid,jsonb) IS
  'Direct explicit user-authorized create task/event only; owner preference + canonical source quote + admitted decision + atomic receipt required.';
