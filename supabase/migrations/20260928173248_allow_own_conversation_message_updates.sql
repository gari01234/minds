
    drop policy if exists conversation_messages_update_own on public.conversation_messages;
    create policy conversation_messages_update_own
    on public.conversation_messages
    for update
    using (((select auth.uid()) is not null) and ((select auth.uid()) = user_id))
    with check (((select auth.uid()) is not null) and ((select auth.uid()) = user_id));
  