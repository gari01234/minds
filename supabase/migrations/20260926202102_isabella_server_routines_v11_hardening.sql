
drop policy if exists "isabella_routines_select_own" on public.isabella_routines;
create policy "isabella_routines_select_own" on public.isabella_routines
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "isabella_routines_insert_own" on public.isabella_routines;
create policy "isabella_routines_insert_own" on public.isabella_routines
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "isabella_routines_update_own" on public.isabella_routines;
create policy "isabella_routines_update_own" on public.isabella_routines
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "isabella_routines_delete_own" on public.isabella_routines;
create policy "isabella_routines_delete_own" on public.isabella_routines
for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists isabella_routines_due_idx
on public.isabella_routines(next_run_at)
where enabled = true and next_run_at is not null;

revoke all on table public.isabella_runtime_secrets from anon, authenticated;
