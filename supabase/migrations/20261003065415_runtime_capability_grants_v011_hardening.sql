create index minds_runtime_capability_grants_user_idx
  on public.minds_runtime_capability_grants(user_id);

create policy "runtime capability grants deny authenticated"
on public.minds_runtime_capability_grants
for all to authenticated
using (false)
with check (false);

create policy "runtime capability grants deny anon"
on public.minds_runtime_capability_grants
for all to anon
using (false)
with check (false);
