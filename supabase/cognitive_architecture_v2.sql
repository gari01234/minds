-- MINDS Cognitive Architecture v2
-- Canonical table summary. Production migration: add_minds_cognitive_architecture_v2.
-- This file is intentionally declarative documentation; apply through reviewed Supabase migrations.

-- Prospective memory: public.minds_standing_intents
-- Project knowledge: public.minds_work_claims + public.minds_work_evidence
-- Skill Workshop: public.minds_skill_proposals + public.minds_user_skills
-- Observability: public.minds_agent_runs + public.minds_heartbeat_events
-- Episodic checkpoints: public.minds_memory_flushes
-- Policy registry: public.minds_action_policies

-- Invariants:
-- 1. Every personal row is scoped by user_id and RLS.
-- 2. Project-source/inferred claims are never silently promoted to confirmed.
-- 3. Personal Skills require explicit confirmation before activation.
-- 4. Standing intents have cooldown, maximum trigger count and expiry.
-- 5. Heartbeat is deterministic/cheap by default and distinct from exact-time routines.
-- 6. Critical mutation policy is enforced in server code, not solely by prompting.
