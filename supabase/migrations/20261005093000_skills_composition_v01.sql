-- Build 81 · Skills & Capability Composition v0.1
-- Preserve Skill execution history across system/personal Skills without granting authority.

alter table public.isabella_skill_runs
  add column if not exists skill_source text not null default 'system',
  add column if not exists skill_name text;

update public.isabella_skill_runs r
set skill_name = s.name
from public.isabella_skills s
where r.skill_name is null
  and r.skill_slug = s.slug;

alter table public.isabella_skill_runs
  drop constraint if exists isabella_skill_runs_skill_slug_fkey;

alter table public.isabella_skill_runs
  drop constraint if exists isabella_skill_runs_skill_source_check;

alter table public.isabella_skill_runs
  add constraint isabella_skill_runs_skill_source_check
  check (skill_source in ('system','personal'));

create index if not exists isabella_skill_runs_user_source_slug_created_idx
  on public.isabella_skill_runs(user_id,skill_source,skill_slug,created_at desc);

drop policy if exists "isabella_skill_runs_own" on public.isabella_skill_runs;
create policy "isabella_skill_runs_own" on public.isabella_skill_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
