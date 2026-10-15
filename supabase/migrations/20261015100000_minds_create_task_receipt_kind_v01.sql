-- #138 P0: compatible authoritative action receipt on first task create AND replay.
-- Direct create delegates to reviewed create; before this migration the task
-- existed but UI rejected the response because entity_kind was absent.
-- No schema changes or existing record mutations; preserve owner checks/RLS.
CREATE OR REPLACE FUNCTION public.minds_commit_reviewed_task_create_v01(
 p_request_id uuid,p_reviewed jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_decision public.minds_shadow_decisions%ROWTYPE;
 v_existing public.minds_calendar_action_receipts%ROWTYPE;
 v_target public.isabella_tasks%ROWTYPE;
 v_original jsonb;
 v_title text;
 v_date date;
 v_project text;
 v_category text;
 v_project_id uuid;
 v_category_id uuid;
 v_note text;
 v_reminder time;
 v_after jsonb;
 v_receipt uuid;
 v_status text;
BEGIN
 IF v_user IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_reviewed) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'unauthorized_or_invalid_review';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||p_request_id::text,42));
 SELECT * INTO v_existing FROM public.minds_calendar_action_receipts
  WHERE user_id=v_user AND request_id=p_request_id;
 IF FOUND THEN
   IF v_existing.action<>'create_task' OR
      (p_reviewed-'_review') IS DISTINCT FROM (v_existing.reviewed_candidate-'_review')
   THEN RAISE EXCEPTION 'receipt_replay_candidate_mismatch'; END IF;
   RETURN jsonb_build_object('status','already_applied','receipt_id',v_existing.id,
     'request_id',p_request_id,'entity_kind','task','entity_id',v_existing.entity_id,
     'entity_client_key',v_existing.entity_client_key,'after',v_existing.after_state);
 END IF;
 SELECT * INTO v_decision FROM public.minds_shadow_decisions
  WHERE user_id=v_user AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_decision.action<>'create_task' OR
    v_decision.proposal_kind<>'task' OR v_decision.policy_mode<>'confirm'
    OR v_decision.status NOT IN ('pending','accepted','edited')
 THEN RAISE EXCEPTION 'missing_or_ineligible_review'; END IF;
 v_original:=v_decision.candidate;
 IF coalesce(p_reviewed->>'kind','')<>'task'
    OR coalesce(p_reviewed->>'action','')<>'create'
    OR nullif(p_reviewed->>'request_id','') IS DISTINCT FROM p_request_id::text
    OR coalesce(p_reviewed->>'target_id','')<>''
    OR coalesce(p_reviewed->>'target_title','')<>''
    OR coalesce(p_reviewed->>'target_date','')<>''
 THEN RAISE EXCEPTION 'review_target_or_authority_changed'; END IF;
 IF v_decision.status IN ('accepted','edited') AND
   (v_decision.reviewed_candidate IS NULL OR
    (p_reviewed-'_review') IS DISTINCT FROM (v_decision.reviewed_candidate-'_review'))
 THEN RAISE EXCEPTION 'reviewed_candidate_mismatch'; END IF;
 v_title:=nullif(btrim(p_reviewed->>'title'),'');
 IF v_title IS NULL OR length(v_title)>500 THEN RAISE EXCEPTION 'invalid_reviewed_title'; END IF;
 IF nullif(p_reviewed->>'date','') IS NOT NULL THEN
   IF (p_reviewed->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
   v_date:=(p_reviewed->>'date')::date;
   IF to_char(v_date,'YYYY-MM-DD')<>(p_reviewed->>'date')
   THEN RAISE EXCEPTION 'invalid_reviewed_date'; END IF;
 END IF;
 v_project:=nullif(btrim(p_reviewed->>'project'),'');
 IF v_project IS NOT NULL THEN
   SELECT id INTO v_project_id FROM public.isabella_projects
    WHERE user_id=v_user AND archived=false AND lower(name)=lower(v_project);
   IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found'; END IF;
 END IF;
 v_category:=nullif(btrim(p_reviewed->>'category'),'');
 IF v_category IS NOT NULL THEN
   SELECT id INTO v_category_id FROM public.isabella_categories
    WHERE user_id=v_user AND lower(name)=lower(v_category);
   IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
 END IF;
 IF p_reviewed->'recurrence' IS NOT NULL AND
    p_reviewed->'recurrence' NOT IN ('null'::jsonb,'{}'::jsonb,'""'::jsonb)
 THEN RAISE EXCEPTION 'recurrence_requires_separate_executor'; END IF;
 v_note:=left(coalesce(p_reviewed->>'notes',''),12000);
 IF nullif(p_reviewed->>'reminder_time','') IS NOT NULL THEN
   IF v_date IS NULL OR (p_reviewed->>'reminder_time') !~ '^[0-9]{2}:[0-9]{2}$'
   THEN RAISE EXCEPTION 'invalid_reviewed_reminder'; END IF;
   v_reminder:=(p_reviewed->>'reminder_time')::time;
 END IF;
 INSERT INTO public.isabella_tasks(user_id,client_key,title,due_date,project_id,category_id,notes,reminder_time,metadata)
 VALUES(v_user,'review:'||p_request_id::text,v_title,v_date,v_project_id,v_category_id,
        v_note,v_reminder,jsonb_build_object('source','isabella','review_request_id',p_request_id))
 RETURNING * INTO v_target;
 v_after:=jsonb_build_object('id',v_target.id,'client_key',v_target.client_key,
   'title',v_target.title,'date',v_target.due_date,
   'project_id',v_target.project_id,'category_id',v_target.category_id,
   'notes',v_target.notes,'reminder_time',v_target.reminder_time,
   'updated_at',v_target.updated_at);
 INSERT INTO public.minds_calendar_action_receipts(
   user_id,request_id,action,entity_kind,entity_id,entity_client_key,
   before_state,after_state,reviewed_candidate
 ) VALUES(v_user,p_request_id,'create_task','task',v_target.id,v_target.client_key,
          'null'::jsonb,v_after,p_reviewed) RETURNING id INTO v_receipt;
 v_status:=CASE WHEN p_reviewed-'_review' IS DISTINCT FROM v_original-'_review'
   THEN 'edited' ELSE 'accepted' END;
 UPDATE public.minds_shadow_decisions
   SET status=v_status,reviewed_candidate=p_reviewed,
       resolved_at=coalesce(resolved_at,now()),updated_at=now()
 WHERE id=v_decision.id;
 INSERT INTO public.isabella_activity_log(
   user_id,entity_type,entity_key,action,source,before_state,after_state
 ) VALUES(v_user,'task',v_target.client_key,'create','assistant',NULL,v_after);
 RETURN jsonb_build_object('status','applied','receipt_id',v_receipt,
   'request_id',p_request_id,'entity_kind','task','entity_id',v_target.id,
   'entity_client_key',v_target.client_key,'after',v_after);
END;
$function$;
REVOKE ALL ON FUNCTION public.minds_commit_reviewed_task_create_v01(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_commit_reviewed_task_create_v01(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.minds_commit_reviewed_task_create_v01(uuid,jsonb) IS
 'Owner-authenticated atomic reviewed create_task, idempotent receipt plus canonical read-back.';

