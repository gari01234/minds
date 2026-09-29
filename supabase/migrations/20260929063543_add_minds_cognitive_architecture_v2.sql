
create table if not exists public.minds_standing_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  trigger_text text not null,
  reminder_text text not null,
  trigger_terms text[] not null default '{}',
  project_id uuid references public.isabella_projects(id) on delete set null,
  status text not null default 'active' check (status in ('active','snoozed','completed','expired')),
  cooldown_minutes integer not null default 1440 check (cooldown_minutes >= 0),
  max_triggers integer not null default 3 check (max_triggers >= 1),
  trigger_count integer not null default 0 check (trigger_count >= 0),
  last_trigger_at timestamptz,
  expires_at timestamptz default (now() + interval '90 days'),
  source_conversation_id uuid references public.conversations(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists minds_standing_intents_user_status_idx on public.minds_standing_intents(user_id,status);
create index if not exists minds_standing_intents_project_idx on public.minds_standing_intents(project_id) where project_id is not null;
alter table public.minds_standing_intents enable row level security;
drop policy if exists minds_standing_intents_own on public.minds_standing_intents;
create policy minds_standing_intents_own on public.minds_standing_intents for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_work_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  claim_type text not null default 'fact' check (claim_type in ('fact','decision','requirement','deadline','dependency','open_question','assumption','constraint','other')),
  statement text not null,
  subject text,
  topic text,
  discipline text,
  status text not null default 'proposed' check (status in ('proposed','confirmed','disputed','superseded','resolved','rejected')),
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  provenance_class text not null default 'inferred' check (provenance_class in ('user','project_source','external','inferred','system')),
  supersedes_id uuid references public.minds_work_claims(id) on delete set null,
  superseded_by uuid references public.minds_work_claims(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists minds_work_claims_project_idx on public.minds_work_claims(user_id,project_id,status);
create index if not exists minds_work_claims_topic_idx on public.minds_work_claims(project_id,topic);
alter table public.minds_work_claims enable row level security;
drop policy if exists minds_work_claims_own on public.minds_work_claims;
create policy minds_work_claims_own on public.minds_work_claims for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_work_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  claim_id uuid not null references public.minds_work_claims(id) on delete cascade,
  source_kind text not null default 'manual' check (source_kind in ('work_file','email','conversation','manual','external','protocol','plan','note','other')),
  source_file_id uuid references public.minds_work_files(id) on delete set null,
  source_message_id uuid references public.conversation_messages(id) on delete set null,
  locator jsonb not null default '{}',
  excerpt text,
  stance text not null default 'supports' check (stance in ('supports','contradicts','context')),
  trust_level text not null default 'reported' check (trust_level in ('confirmed','reported','untrusted','derived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists minds_work_evidence_claim_idx on public.minds_work_evidence(claim_id);
create index if not exists minds_work_evidence_project_idx on public.minds_work_evidence(user_id,project_id);
alter table public.minds_work_evidence enable row level security;
drop policy if exists minds_work_evidence_own on public.minds_work_evidence;
create policy minds_work_evidence_own on public.minds_work_evidence for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_skill_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  agent text not null default 'isabella' check (agent in ('isabella','sofia')),
  slug text not null,
  name text not null,
  description text not null default '',
  instructions text not null,
  preferred_tools text[] not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','applied')),
  evidence jsonb not null default '[]',
  source_conversation_id uuid references public.conversations(id) on delete set null,
  applied_skill_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists minds_skill_proposals_user_idx on public.minds_skill_proposals(user_id,status,agent);
alter table public.minds_skill_proposals enable row level security;
drop policy if exists minds_skill_proposals_own on public.minds_skill_proposals;
create policy minds_skill_proposals_own on public.minds_skill_proposals for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  agent text not null default 'isabella' check (agent in ('isabella','sofia')),
  slug text not null,
  name text not null,
  description text not null default '',
  instructions text not null,
  preferred_tools text[] not null default '{}',
  version integer not null default 1 check (version >= 1),
  enabled boolean not null default true,
  source_proposal_id uuid references public.minds_skill_proposals(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,agent,slug)
);
create index if not exists minds_user_skills_user_idx on public.minds_user_skills(user_id,agent,enabled);
alter table public.minds_user_skills enable row level security;
drop policy if exists minds_user_skills_own on public.minds_user_skills;
create policy minds_user_skills_own on public.minds_user_skills for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  feature text not null,
  run_key text,
  status text not null default 'running' check (status in ('running','success','error','skipped')),
  route jsonb not null default '{}',
  metadata jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  latency_ms integer
);
create index if not exists minds_agent_runs_user_feature_idx on public.minds_agent_runs(user_id,feature,started_at desc);
create index if not exists minds_agent_runs_status_idx on public.minds_agent_runs(status,started_at desc);
alter table public.minds_agent_runs enable row level security;
drop policy if exists minds_agent_runs_select_own on public.minds_agent_runs;
create policy minds_agent_runs_select_own on public.minds_agent_runs for select using (user_id=auth.uid());
drop policy if exists minds_agent_runs_insert_own on public.minds_agent_runs;
create policy minds_agent_runs_insert_own on public.minds_agent_runs for insert with check (user_id=auth.uid());

create table if not exists public.minds_heartbeat_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  fingerprint text not null,
  severity text not null default 'info' check (severity in ('info','attention','urgent')),
  title text not null,
  body text not null default '',
  status text not null default 'new' check (status in ('new','surfaced','dismissed','resolved')),
  project_id uuid references public.isabella_projects(id) on delete set null,
  source jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  surfaced_at timestamptz,
  metadata jsonb not null default '{}',
  unique(user_id,fingerprint)
);
create index if not exists minds_heartbeat_events_user_idx on public.minds_heartbeat_events(user_id,status,last_seen_at desc);
alter table public.minds_heartbeat_events enable row level security;
drop policy if exists minds_heartbeat_events_select_own on public.minds_heartbeat_events;
create policy minds_heartbeat_events_select_own on public.minds_heartbeat_events for select using (user_id=auth.uid());
drop policy if exists minds_heartbeat_events_update_own on public.minds_heartbeat_events;
create policy minds_heartbeat_events_update_own on public.minds_heartbeat_events for update using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.minds_memory_flushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent text not null default 'isabella' check (agent in ('isabella','sofia')),
  conversation_id uuid references public.conversations(id) on delete cascade,
  checkpoint_message_at timestamptz,
  summary text not null,
  open_loops jsonb not null default '[]',
  provenance jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','superseded','discarded')),
  created_at timestamptz not null default now()
);
create index if not exists minds_memory_flushes_conversation_idx on public.minds_memory_flushes(user_id,agent,conversation_id,created_at desc);
alter table public.minds_memory_flushes enable row level security;
drop policy if exists minds_memory_flushes_select_own on public.minds_memory_flushes;
create policy minds_memory_flushes_select_own on public.minds_memory_flushes for select using (user_id=auth.uid());

create table if not exists public.minds_action_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  app_scope text not null default 'isabella',
  action text not null,
  mode text not null check (mode in ('allow','confirm','deny')),
  reason text not null default '',
  priority integer not null default 100,
  enabled boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists minds_action_policies_system_unique on public.minds_action_policies(app_scope,action) where user_id is null;
create unique index if not exists minds_action_policies_user_unique on public.minds_action_policies(user_id,app_scope,action) where user_id is not null;
alter table public.minds_action_policies enable row level security;
drop policy if exists minds_action_policies_read on public.minds_action_policies;
create policy minds_action_policies_read on public.minds_action_policies for select using (user_id is null or user_id=auth.uid());
drop policy if exists minds_action_policies_user_write on public.minds_action_policies;
create policy minds_action_policies_user_write on public.minds_action_policies for all using (user_id=auth.uid()) with check (user_id=auth.uid());

insert into public.minds_action_policies(user_id,app_scope,action,mode,reason,priority)
values
(null,'isabella','search_memory','allow','Read-only autobiographical recall',10),
(null,'isabella','search_calendar','allow','Read-only agenda lookup',10),
(null,'isabella','search_work','allow','Read-only project lookup',10),
(null,'isabella','read_work_file','allow','Read-only project source inspection',10),
(null,'isabella','consult_sofia','allow','Internal specialist consultation',10),
(null,'isabella','load_skill','allow','Read-only skill loading',10),
(null,'isabella','create_event','confirm','Calendar mutation requires user confirmation',10),
(null,'isabella','update_event','confirm','Calendar mutation requires user confirmation',10),
(null,'isabella','delete_event','confirm','Destructive calendar mutation requires user confirmation',10),
(null,'isabella','create_task','confirm','Task mutation requires user confirmation',10),
(null,'isabella','update_task','confirm','Task mutation requires user confirmation',10),
(null,'isabella','complete_task','confirm','Task state change requires user confirmation',10),
(null,'isabella','archive_task','confirm','Task state change requires user confirmation',10),
(null,'isabella','delete_task','confirm','Destructive task mutation requires user confirmation',10),
(null,'isabella','create_routine','confirm','Recurring proactive behavior requires user confirmation',10),
(null,'isabella','create_chat_reminder','confirm','Future proactive message requires user confirmation',10),
(null,'isabella','create_standing_intent','confirm','Prospective memory requires user confirmation',10),
(null,'isabella','propose_project_claim','confirm','Project knowledge promotion requires user confirmation',10),
(null,'isabella','propose_skill','confirm','Learned workflow must be reviewed before activation',10),
(null,'isabella','update_feed_preferences','confirm','Persistent preference mutation requires user confirmation',10),
(null,'isabella','update_assistant_behavior','confirm','Persistent behavior mutation requires user confirmation',10)
on conflict do nothing;

insert into public.isabella_runtime_secrets(key,value)
values ('heartbeat_runner',gen_random_uuid()::text)
on conflict (key) do nothing;
