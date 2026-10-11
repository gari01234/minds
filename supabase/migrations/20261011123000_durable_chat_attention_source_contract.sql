-- Build 90.8.5.1: Chat completion Attention events use source_type='chat'.
-- The initial completion trigger (90.8.5) is server-owned and uses this
-- provenance class, which was absent from the original Attention CHECK.
-- Until aligned, a completed job's status update rolls back and the user
-- cannot recover the provider's successful response.
--
-- Retain every existing source class; do not modify the trigger, push routing,
-- Quiet Hours, subscription permissions, or canonical Chat messages.
alter table public.minds_attention_events
  drop constraint minds_attention_events_source_type_check;
alter table public.minds_attention_events
  add constraint minds_attention_events_source_type_check
  check (source_type in ('mission','heartbeat','routine','system','expectation','chat'));
