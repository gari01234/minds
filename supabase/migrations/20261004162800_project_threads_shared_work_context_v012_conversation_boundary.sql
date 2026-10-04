drop policy if exists "work_threads_insert_own_project" on public.minds_work_threads;
create policy "work_threads_insert_own_project"
  on public.minds_work_threads for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.isabella_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.user_id = (select auth.uid())
          and c.app_scope = 'work_thread'
          and c.metadata->>'work_thread_id' = id::text
          and c.metadata->>'project_id' = project_id::text
      )
    )
  );

drop policy if exists "work_threads_update_own_project" on public.minds_work_threads;
create policy "work_threads_update_own_project"
  on public.minds_work_threads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.isabella_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and c.user_id = (select auth.uid())
          and c.app_scope = 'work_thread'
          and c.metadata->>'work_thread_id' = id::text
          and c.metadata->>'project_id' = project_id::text
      )
    )
  );
