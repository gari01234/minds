-- P0 #138.4: an accepted task-update proposal is not an applied task.
-- This RPC is the sole authoritative, idempotent write-through for reviewed
-- Isabella TASK UPDATE proposals. Other actions keep their existing flow
-- until corresponding canonical executors have been accepted.
CREATE TABLE public.minds_calendar_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('update_task')),
  entity_kind text NOT NULL CHECK(entity_kind IN ('task')),
  entity_id uuid NOT NULL,
  entity_client_key text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reviewed_candidate jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);
CREATE INDEX minds_calendar_action_receipts_owner
  ON public.minds_calendar_action_receipts(user_id,created_at DESC);
ALTER TABLE public.minds_calendar_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.minds_calendar_action_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.minds_calendar_action_receipts TO authenticated;
CREATE POLICY "owner can read receipts" ON public.minds_calendar_action_receipts
  FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT ALL ON public.minds_calendar_action_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.minds_commit_reviewed_task_update_v01(
  p_request_id uuid,p_reviewed jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_decision public.minds_shadow_decisions%ROWTYPE;
  v_existing public.minds_calendar_action_receipts%ROWTYPE;
  v_target public.isabella_tasks%ROWTYPE;
  v_original jsonb;
  v_target_ref text;
  v_match_count integer;
  v_due_date date;
  v_title text;
  v_before jsonb;
  v_after jsonb;
  v_receipt uuid;
  v_status text;
  v_edited boolean;
  v_project_id uuid;
  v_category_id uuid;
  v_project text;
  v_category text;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_reviewed) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'unauthorized_or_invalid_review';
  END IF;
  -- One user, one request. All reads/writes below take place atomically.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_request_id::text,42));
  SELECT * INTO v_existing FROM public.minds_calendar_action_receipts
    WHERE user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN
    IF (p_reviewed-'_review') IS DISTINCT FROM (v_existing.reviewed_candidate-'_review') THEN
      RAISE EXCEPTION 'receipt_replay_candidate_mismatch';
    END IF;
    RETURN jsonb_build_object('status','already_applied','receipt_id',v_existing.id,
      'request_id',p_request_id,'entity_id',v_existing.entity_id,
      'entity_client_key',v_existing.entity_client_key,'after',v_existing.after_state);
  END IF;
  SELECT * INTO v_decision FROM public.minds_shadow_decisions
    WHERE user_id=v_user AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_decision.action<>'update_task' OR
     v_decision.proposal_kind<>'task' OR v_decision.policy_mode<>'confirm'
     OR v_decision.status NOT IN ('pending','accepted','edited') THEN
    RAISE EXCEPTION 'missing_or_ineligible_review';
  END IF;
  v_original:=v_decision.candidate;
  IF coalesce(p_reviewed->>'kind','')<>'task'
     OR coalesce(p_reviewed->>'action','')<>'update'
     OR nullif(p_reviewed->>'request_id','') IS DISTINCT FROM p_request_id::text
     OR coalesce(p_reviewed->>'target_id','') IS DISTINCT FROM coalesce(v_original->>'target_id','')
     OR coalesce(p_reviewed->>'target_title','') IS DISTINCT FROM coalesce(v_original->>'target_title','')
     OR coalesce(p_reviewed->>'target_date','') IS DISTINCT FROM coalesce(v_original->>'target_date','')
  THEN RAISE EXCEPTION 'review_target_or_authority_changed';
  END IF;
  -- Reviews already marked accepted/edited by the former UI are immutable;
  -- retrying an earlier reviewed request cannot silently change its content.
  IF v_decision.status IN ('accepted','edited') AND
     (v_decision.reviewed_candidate IS NULL OR
      (p_reviewed - '_review') IS DISTINCT FROM
      (v_decision.reviewed_candidate - '_review')) THEN
    RAISE EXCEPTION 'reviewed_candidate_mismatch';
  END IF;
  v_target_ref:=nullif(v_original->>'target_id','');
  IF v_target_ref IS NOT NULL THEN
    SELECT * INTO v_target FROM public.isabella_tasks
      WHERE user_id=v_user AND (client_key=v_target_ref OR id::text=v_target_ref)
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found'; END IF;
  ELSE
    -- Never select a task solely by an ambiguous name.
    IF nullif(v_original->>'target_title','') IS NULL
       OR nullif(v_original->>'target_date','') IS NULL THEN
      RAISE EXCEPTION 'unbound_task_target';
    END IF;
    SELECT count(*) INTO v_match_count FROM public.isabella_tasks
      WHERE user_id=v_user
        AND lower(title)=lower(v_original->>'target_title')
        AND due_date=(v_original->>'target_date')::date;
    IF v_match_count<>1 THEN RAISE EXCEPTION 'ambiguous_or_missing_target'; END IF;
    SELECT * INTO v_target FROM public.isabella_tasks
      WHERE user_id=v_user
        AND lower(title)=lower(v_original->>'target_title')
        AND due_date=(v_original->>'target_date')::date FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_changed'; END IF;
  END IF;
  IF nullif(v_original->>'target_title','') IS NOT NULL
     AND lower(v_target.title)<>lower(v_original->>'target_title') THEN
     RAISE EXCEPTION 'stale_target_title';
  END IF;
  IF nullif(v_original->>'target_date','') IS NOT NULL
     AND v_target.due_date IS DISTINCT FROM (v_original->>'target_date')::date THEN
    RAISE EXCEPTION 'stale_target_date';
  END IF;
  IF v_target.completed_at IS NOT NULL OR v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'task_not_active';
  END IF;
  v_due_date:=v_target.due_date;
  IF coalesce((p_reviewed->>'clear_date')::boolean,false) THEN v_due_date:=NULL;
  ELSIF nullif(p_reviewed->>'date','') IS NOT NULL THEN
    IF (p_reviewed->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}
       THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
    v_due_date:=(p_reviewed->>'date')::date;
    IF to_char(v_due_date,'YYYY-MM-DD')<>p_reviewed->>'date'
       THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
  END IF;
  v_title:=coalesce(nullif(btrim(p_reviewed->>'title'),''),v_target.title);
  IF length(v_title)>500 THEN RAISE EXCEPTION 'invalid_reviewed_title'; END IF;
  -- Project and category must match an owned canonical object if specified.
  v_project_id:=v_target.project_id;
  v_project:=nullif(btrim(p_reviewed->>'project'),'');
  IF v_project IS NOT NULL THEN
    SELECT id INTO v_project_id FROM public.isabella_projects
     WHERE user_id=v_user AND lower(name)=lower(v_project) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
  END IF;
  v_category_id:=v_target.category_id;
  v_category:=nullif(btrim(p_reviewed->>'category'),'');
  IF v_category IS NOT NULL THEN
    SELECT id INTO v_category_id FROM public.isabella_categories
     WHERE user_id=v_user AND lower(name)=lower(v_category) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
  END IF;
  -- No implicit recurrence rewrite in v0.1; nonempty changes fail closed.
  IF p_reviewed->'recurrence' IS NOT NULL AND
     p_reviewed->'recurrence'<>'null'::jsonb AND
     p_reviewed->'recurrence' NOT IN (v_original->'recurrence','{}'::jsonb) THEN
    RAISE EXCEPTION 'recurrence_requires_separate_executor';
  END IF;
  v_before:=jsonb_build_object('id',v_target.id,'client_key',v_target.client_key,
    'title',v_target.title,'date',v_target.due_date,'updated_at',v_target.updated_at);
  UPDATE public.isabella_tasks
    SET title=v_title,due_date=v_due_date,project_id=v_project_id,category_id=v_category_id,
      notes=CASE WHEN p_reviewed->>'notes' IS NULL THEN v_target.notes
                 ELSE left(p_reviewed->>'notes',12000) END,
      reminder_time=CASE WHEN v_due_date IS NULL THEN NULL
                         WHEN p_reviewed->>'reminder_time' IS NULL THEN v_target.reminder_time
                         WHEN p_reviewed->>'reminder_time'='' THEN NULL
                         ELSE (p_reviewed->>'reminder_time')::time END,
      updated_at=now()
    WHERE id=v_target.id AND user_id=v_user
    RETURNING * INTO v_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'canonical_write_failed'; END IF;
  v_after:=jsonb_build_object('id',v_target.id,'client_key',v_target.client_key,
    'title',v_target.title,'date',v_target.due_date,
    'project_id',v_target.project_id,'category_id',v_target.category_id,
    'notes',v_target.notes,'reminder_time',v_target.reminder_time,
    'updated_at',v_target.updated_at);
  INSERT INTO public.minds_calendar_action_receipts(
    user_id,request_id,action,entity_kind,entity_id,entity_client_key,before_state,after_state,reviewed_candidate
  ) VALUES (v_user,p_request_id,'update_task','task',v_target.id,v_target.client_key,
            v_before,v_after,p_reviewed) RETURNING id INTO v_receipt;
  v_edited:=p_reviewed-'_review' IS DISTINCT FROM v_original-'_review';
  v_status:=CASE WHEN v_edited THEN 'edited' ELSE 'accepted' END;
  UPDATE public.minds_shadow_decisions
    SET status=v_status,reviewed_candidate=p_reviewed,
        resolved_at=coalesce(resolved_at,now()),updated_at=now()
    WHERE id=v_decision.id;
  INSERT INTO public.isabella_activity_log
    (user_id,entity_type,entity_key,action,source,before_state,after_state)
    VALUES (v_user,'task',v_target.client_key,'update','assistant',
            v_before,v_after);
  RETURN jsonb_build_object('status','applied','receipt_id',v_receipt,
    'request_id',p_request_id,'entity_id',v_target.id,
    'entity_client_key',v_target.client_key,'after',v_after);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) IS
 'Owner-authenticated atomic reviewed update_task commit, with immutable idempotent receipt and canonical read-back. No model prose can serve as execution evidence.';

       THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
    v_due_date:=(p_reviewed->>'date')::date;
    IF to_char(v_due_date,'YYYY-MM-DD')<>p_reviewed->>'date'
       THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
  END IF;
  v_title:=coalesce(nullif(btrim(p_reviewed->>'title'),''),v_target.title);
  IF length(v_title)>500 THEN RAISE EXCEPTION 'invalid_reviewed_title'; END IF;
  -- Project and category must match an owned canonical object if specified.
  v_project_id:=v_target.project_id;
  v_project:=nullif(btrim(p_reviewed->>'project'),'');
  IF v_project IS NOT NULL THEN
    SELECT id INTO v_project_id FROM public.isabella_projects
     WHERE user_id=v_user AND lower(name)=lower(v_project) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
  END IF;
  v_category_id:=v_target.category_id;
  v_category:=nullif(btrim(p_reviewed->>'category'),'');
  IF v_category IS NOT NULL THEN
    SELECT id INTO v_category_id FROM public.isabella_categories
     WHERE user_id=v_user AND lower(name)=lower(v_category) LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
  END IF;
  -- No implicit recurrence rewrite in v0.1; nonempty changes fail closed.
  IF p_reviewed->'recurrence' IS NOT NULL AND
     p_reviewed->'recurrence'<>'null'::jsonb AND
     p_reviewed->'recurrence' NOT IN (v_original->'recurrence','{}'::jsonb) THEN
    RAISE EXCEPTION 'recurrence_requires_separate_executor';
  END IF;
  v_before:=jsonb_build_object('id',v_target.id,'client_key',v_target.client_key,
    'title',v_target.title,'date',v_target.due_date,'updated_at',v_target.updated_at);
  UPDATE public.isabella_tasks
    SET title=v_title,due_date=v_due_date,project_id=v_project_id,category_id=v_category_id,
      notes=CASE WHEN p_reviewed->>'notes' IS NULL THEN v_target.notes
                 ELSE left(p_reviewed->>'notes',12000) END,
      reminder_time=CASE WHEN v_due_date IS NULL THEN NULL
                         WHEN p_reviewed->>'reminder_time' IS NULL THEN v_target.reminder_time
                         WHEN p_reviewed->>'reminder_time'='' THEN NULL
                         ELSE (p_reviewed->>'reminder_time')::time END,
      updated_at=now()
    WHERE id=v_target.id AND user_id=v_user
    RETURNING * INTO v_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'canonical_write_failed'; END IF;
  v_after:=jsonb_build_object('id',v_target.id,'client_key',v_target.client_key,
    'title',v_target.title,'date',v_target.due_date,
    'project_id',v_target.project_id,'category_id',v_target.category_id,
    'notes',v_target.notes,'reminder_time',v_target.reminder_time,
    'updated_at',v_target.updated_at);
  INSERT INTO public.minds_calendar_action_receipts(
    user_id,request_id,action,entity_kind,entity_id,entity_client_key,before_state,after_state
  ) VALUES (v_user,p_request_id,'update_task','task',v_target.id,v_target.client_key,
            v_before,v_after) RETURNING id INTO v_receipt;
  v_edited:=p_reviewed-'_review' IS DISTINCT FROM v_original-'_review';
  v_status:=CASE WHEN v_edited THEN 'edited' ELSE 'accepted' END;
  UPDATE public.minds_shadow_decisions
    SET status=v_status,reviewed_candidate=p_reviewed,
        resolved_at=coalesce(resolved_at,now()),updated_at=now()
    WHERE id=v_decision.id;
  INSERT INTO public.isabella_activity_log
    (user_id,entity_type,entity_key,action,source,before_state,after_state)
    VALUES (v_user,'task',v_target.client_key,'update','assistant',
            v_before,v_after);
  RETURN jsonb_build_object('status','applied','receipt_id',v_receipt,
    'request_id',p_request_id,'entity_id',v_target.id,
    'entity_client_key',v_target.client_key,'after',v_after);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.minds_commit_reviewed_task_update_v01(uuid,jsonb) IS
 'Owner-authenticated atomic reviewed update_task commit, with immutable idempotent receipt and canonical read-back. No model prose can serve as execution evidence.';
