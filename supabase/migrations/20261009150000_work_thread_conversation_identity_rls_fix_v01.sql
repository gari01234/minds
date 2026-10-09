-- Build 90.4: Work Thread conversation binding must compare the metadata
-- work_thread_id to the thread row, not to the conversation id.
-- Applied to production Supabase as work_thread_conversation_identity_rls_fix_v01.
drop policy if exists work_threads_update_own_project on public.minds_work_threads;
create policy work_threads_update_own_project on public.minds_work_threads
for update to authenticated
using (user_id = (select auth.uid()))
with check (
 user_id = (select auth.uid())
 and exists (
   select 1 from public.isabella_projects p
   where p.id = project_id and p.user_id = (select auth.uid())
 )
 and (conversation_id is null or exists (
   select 1 from public.conversations c
   where c.id = conversation_id
     and c.user_id = (select auth.uid())
     and c.app_scope = 'work_thread'
     and c.metadata->>'work_thread_id' = minds_work_threads.id::text
     and c.metadata->>'project_id' = minds_work_threads.project_id::text
 ))
);
