
drop policy if exists minds_memory_flushes_insert_own on public.minds_memory_flushes;
create policy minds_memory_flushes_insert_own
on public.minds_memory_flushes
for insert
with check (user_id=auth.uid());
