# MINDS Cognitive Architecture v2

This document records the persistent architecture introduced in Build 55–56.

## Layers

1. **User Model** — structured non-sensitive hypotheses and confirmed operating preferences in `isabella_model_claims`.
2. **Curated Memory** — durable explicit autobiographical memory in `isabella_memories`.
3. **Episodic Memory** — conversation history plus derived pre-compaction checkpoints in `minds_memory_flushes`.
4. **Project Knowledge** — Work project claims and evidence in `minds_work_claims` / `minds_work_evidence`, always preserving provenance and epistemic status.
5. **Prospective Memory** — exact-time `isabella_routines` plus contextual `minds_standing_intents`.

## Adaptive routing

Isabella uses deterministic cheap routing first and escalates only when the turn benefits from deeper memory, Work, Sofia, web, more reasoning or more rounds. Simple turns therefore remain cheap without imposing a lower intelligence ceiling on complex turns.

## Policy as code

Persistent/destructive actions are classified as allow / confirm / deny in server code. Calendar/task mutation, routines, standing intents, project-knowledge promotion and Skill creation require explicit user confirmation.

## Specialists

Isabella stays the visible owner of the answer. Sofia, Work, research and deep memory are selectively consulted under the hood.

## Heartbeat versus automations

Automations are exact scheduled jobs. Heartbeat is a deterministic periodic condition check (15 min) that surfaces only concrete state changes such as a nearby event or an overdue-task digest. It does not run a large language model by default.

## Skill Workshop

Base Skills remain system-managed. Personal Skills live in `minds_user_skills`, are versioned per user/agent and become active only after an explicit reviewed proposal.

## Observability

`minds_agent_runs` records execution state, route, latency and errors. The Isabella drawer exposes **Estado de MINDS** for practical health inspection.


## Build 57 — implementation and verification

The implementation is now versioned in `supabase/functions/` and `supabase/migrations/`. Applied migrations `20260929140920_complete_cognitive_integrity_v3` and `20260929141344_preserve_cognitive_review_receipts` provide atomic reviewed writes, durable checkpoint cursors, intent acknowledgements, skill version snapshots, heartbeat lifecycle publication and the routine outbox.

The Work **Conocimiento** tab exposes statements with their provenance, linked evidence, contradictions, validity and previous versions. Confirmed review does not upgrade external evidence to trusted fact. Substitutions preserve the earlier claim. Personal skills can be reviewed, edited, paused and restored as new versions. Repeated corrections to the same fields become explicit signals for a proposed workflow, never automatic activation.

Deep recall has a source-preserving escalation path: lexical, semantic and entity retrieval first, followed by up to two alternate queries only when direct evidence is insufficient. The router sees the actual user text and recent referential context. Models keep access to needed tools; route flags are retrieval/depth hints, not a ban on investigation. Background specialists retain the full current tool interaction across rounds.

Memory checkpoints process contiguous messages ordered by `(created_at,id)` without cutting off older rows or truncating individual messages. The checkpoint and episodic memory commit in one transaction. Sofía checkpoints stay in the intellectual namespace. Persistent conversation context no longer accumulates per-turn snapshots; one-time cleanup preserves all original items and archives the old conversation.

105 Node tests passed at release preparation, including 11 behavioral tests, and rolled-back SQL integration tests passed under authenticated and service roles. The live heartbeat completed the context migration and cron was restored. Automated deployment does not substitute for an authenticated browser conversation or observing tomorrow's scheduled delivery.


## Build 58 — Continuity Core v0.1

MINDS now distinguishes durable **Commitments** from tasks, routines and standing intents. A Commitment represents something the user explicitly reviewed and chose to keep alive across conversations; it does not execute actions by itself. The canonical state lives in `minds_commitments`, while `minds_commitment_events` preserves its causal history.

Creation is reviewed and idempotent through `minds_create_commitment`. Direct authenticated inserts are not exposed. Optional project links are validated against user ownership. If a Commitment is elevated from a checkpoint `open_loop`, the RPC validates that the exact string exists in the referenced user-owned checkpoint and records an `open_loop_linked` event. The open loop remains derived provenance; confirmation promotes the objective to a user-reviewed Commitment, not the checkpoint text to factual memory.

Isabella receives a small relevance-ranked set of active Commitments as transient context and can search them explicitly with `search_commitments`. She can propose a new Commitment with `propose_commitment`, but the proposal remains pending until the user reviews it in the existing confirmation UI. Checkpoint `open_loops` are never converted automatically.

This release intentionally does **not** add autonomous execution, a Missions dashboard, automatic historical migration, heartbeat-triggered Commitment transitions or Shadow Agency. Those remain later layers on top of this primitive.


## Build 59 — Continuity Engine v0.1

The Continuity Core now has a deterministic event layer. `minds_continuity_signals` records observable changes independently from Commitments, and `minds_commitment_signal_links` records why a particular signal was considered relevant. Matching is intentionally conservative: explicit links rank first, exact project identity is strong evidence, and otherwise at least two non-generic shared terms are required. A project-scoped Commitment is never matched to a signal from a different project.

Heartbeat publication now emits a continuity signal in the same transaction. Repeated heartbeat fingerprints update the existing signal and cannot duplicate a Commitment link or causal event. Active Commitments receive a `signal_linked` history event. A Commitment in `waiting` may return to `active` and receives a `reactivated` event. `paused`, `completed` and `cancelled` Commitments are not automatically reactivated. Reactivation changes continuity state but does not create a task, execute an action or surface a new interruption.

Each linked change is also summarized in the Commitment's `metadata.last_continuity`, so Isabella can explain why an open matter became current again without treating the signal as a new user instruction or as verified truth. MINDS remains the source of truth; the event is traceability, not authority.

Commitments are now inspectable from **••• → Continuidad**. This is a transparency surface, not a new primary navigation area. It shows the user-reviewed objective, status, project/scope, optional completion criterion and the latest relevant change. The mobile More drawer is independently scrollable, bounded to the visual viewport and keeps its close header sticky so long menus remain escapable on iOS.

This release still does **not** implement attention scoring, automatic notifications from continuity events, Shadow Agency, autonomous execution, Agents API sessions or invisible subagents. The next layer remains Shadow Agency, after the continuity signal model has been observed in real use.
