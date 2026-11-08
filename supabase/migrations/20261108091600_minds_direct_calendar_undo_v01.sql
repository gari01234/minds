-- Isabella fase 2 / bloque 2: undo a *recent, exact* direct create.
-- Only the original owner, a direct-action receipt, no later owner turn,
-- <= 10 minutes, and an unchanged canonical target can be reversed.
-- No new tables and no bulk deletion. A single event DELETE is receipt/CAS scoped.
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
  v_owner_turn uuid;
  v_source_at timestamptz;
  v_changed integer:=0;
  v_undo_id uuid;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL OR p_receipt_id IS NULL
  THEN RAISE EXCEPTION 'undo_not_authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_request_id::text,42));
  SELECT * INTO v_receipt FROM public.minds_calendar_action_receipts
    WHERE user_id=v_user AND request_id=p_request_id AND id=p_receipt_id FOR UPDATE;
  IF NOT FOUND OR v_receipt.action NOT IN ('create_task','create_event')
    OR v_receipt.entity_kind NOT IN ('task','event')
  THEN RAISE EXCEPTION 'undo_create_receipt_missing'; END IF;

  SELECT * INTO v_decision FROM public.minds_shadow_decisions
    WHERE user_id=v_user AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_decision.action<>v_receipt.action OR
    v_decision.context->>'direct_calendar_authority'<>'explicit_owner_v1'
  THEN RAISE EXCEPTION 'undo_not_an_original_direct_create'; END IF;
  IF nullif(v_decision.context->>'undone_at','') IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_undone','request_id',p_request_id,
      'undo_receipt_id',v_decision.context->>'undo_receipt_id',
      'entity_kind',v_receipt.entity_kind);
  END IF;

  IF v_receipt.created_at < now()-interval '10 minutes'
  THEN RAISE EXCEPTION 'undo_window_expired'; END IF;
  BEGIN
    v_owner_turn:=(v_decision.context->>'direct_authorization_turn_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'undo_source_turn_invalid';
  END;
  SELECT m.created_at INTO v_source_at FROM public.conversation_messages m
    WHERE m.user_id=v_user AND m.client_key=v_owner_turn::text
      AND m.role='user' AND m.provenance_class='owner'
      AND m.exposure_scope_version=1 LIMIT 1;
  IF v_source_at IS NULL THEN RAISE EXCEPTION 'undo_owner_message_missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_messages m
      WHERE m.user_id=v_user AND m.role='user'
        AND m.provenance_class='owner' AND m.exposure_scope_version=1
        AND m.client_key<>v_owner_turn::text
        AND m.created_at>v_source_at
  ) THEN RAISE EXCEPTION 'undo_newer_owner_turn_exists'; END IF;

  IF v_receipt.entity_kind='task' THEN
    UPDATE public.isabella_tasks SET archived_at=now(),updated_at=now()
      WHERE user_id=v_user AND id=v_receipt.entity_id
        AND client_key=v_receipt.entity_client_key
        AND updated_at=(v_receipt.after_state->>'updated_at')::timestamptz
        AND archived_at IS NULL AND completed_at IS NULL;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
  ELSE
    DELETE FROM public.isabella_events
      WHERE user_id=v_user AND id=v_receipt.entity_id
        AND client_key=v_receipt.entity_client_key
        AND updated_at=(v_receipt.after_state->>'updated_at')::timestamptz;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
  END IF;
  IF v_changed<>1 THEN RAISE EXCEPTION 'undo_canonical_target_changed'; END IF;

  v_undo_id:=gen_random_uuid();
  UPDATE public.minds_shadow_decisions
    SET context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
      'undone_at',now(),'undo_receipt_id',v_undo_id),
      updated_at=now()
    WHERE id=v_decision.id AND user_id=v_user;
  INSERT INTO public.isabella_activity_log(user_id,entity_type,entity_key,action,source,before_state,after_state)
    VALUES(v_user,v_receipt.entity_kind,v_receipt.entity_client_key,
      CASE WHEN v_receipt.entity_kind='task' THEN 'archive' ELSE 'delete' END,
      'assistant',v_receipt.after_state,
      CASE WHEN v_receipt.entity_kind='task'
        THEN jsonb_build_object('archived_at',now())
        ELSE NULL END);
  RETURN jsonb_build_object('status','undone','request_id',p_request_id,
    'undo_receipt_id',v_undo_id,'entity_kind',v_receipt.entity_kind);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid)
  TO authenticated;
COMMENT ON FUNCTION public.minds_undo_direct_calendar_create_v01(uuid,uuid) IS
 'Undo one owner-verified recent direct create, with original receipt, CAS and no later owner turn.';
