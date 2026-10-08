-- Build 83.2 operational regression hotfix.
-- Calendar drag can change both order and date; activity-log vocabulary must admit that action.

alter table public.isabella_activity_log
  drop constraint if exists isabella_activity_log_action_check;

alter table public.isabella_activity_log
  add constraint isabella_activity_log_action_check
  check (action in ('create','update','delete','complete','uncomplete','archive','restore','reorder','move_date'));
