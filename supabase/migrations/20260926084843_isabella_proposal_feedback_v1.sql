create table if not exists public.isabella_proposal_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid(),
    outcome text not null check (outcome in ('accepted','rejected')),
    proposal jsonb not null,
    created_at timestamptz not null default now()
  );
  create index if not exists isabella_proposal_feedback_user_created_idx
    on public.isabella_proposal_feedback(user_id,created_at desc);
  alter table public.isabella_proposal_feedback enable row level security;
  create policy "isabella_feedback_select_own_v1"
    on public.isabella_proposal_feedback for select
    using (auth.uid()=user_id);
  create policy "isabella_feedback_insert_own_v1"
    on public.isabella_proposal_feedback for insert
    with check (auth.uid()=user_id);
  grant select,insert on public.isabella_proposal_feedback to authenticated;