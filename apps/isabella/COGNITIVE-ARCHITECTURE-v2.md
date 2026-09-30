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


## Build 60 — Shadow Agency v0.1

Shadow Agency adds an observational layer beneath Isabella's existing confirmation policy. When Isabella proposes an action whose policy is still `confirm`, the server records the candidate she would have taken before the user sees the review UI. The record is keyed by a stable server-generated `request_id` and preserves the action, proposal payload and bounded execution context. Recording a shadow decision never executes the action and never modifies `minds_action_policies`.

The user's actual review resolves the observation. Confirming the proposal unchanged records `accepted`; confirming after editing records `edited` together with the reviewed proposal and its changed fields; rejecting records `rejected`. The canonical observations live in `minds_shadow_decisions`. The browser can read its own observations but cannot insert or update them directly. Server-side recording is service-only, while resolution is exposed through a narrowly scoped RPC that derives `auth.uid()` and can mutate only that user's pending observation.

Build 60 intentionally does not derive an autonomy score or automatically promote permissions from these outcomes. Agreement rates can be inspected as evidence, but they are not authority. `••• → Estado de MINDS` shows recent aggregate counts for Shadow Agency so the mechanism remains observable without becoming a primary interface surface.

The same release hardens calendar persistence. Manual or assistant-reviewed Task/Event edits are now persisted as atomic entity mutations immediately when they occur. Full-state synchronization may insert missing entities but cannot overwrite an existing Task/Event row with a stale client snapshot. While an atomic mutation is in flight, pull reconciliation preserves that local entity, and server `updated_at` is retained when hydrating the client. The full-state path therefore becomes a convergence mechanism instead of an implicit last-writer-wins authority.

This release still does not add invisible specialist agents, automatic autonomy promotion or autonomous execution. The next planned layer is **Build 61 — Invisible Specialist Runtime v0.1**: Isabella remains the single visible interlocutor while bounded internal specialists can handle research, Work/project retrieval, planning, document review and memory operations underneath her orchestration. Sofía remains the deliberate visible exception because her intellectual role is itself part of the MINDS interface.


## Build 61 — Invisible Specialist Runtime v0.1

Build 61 introduces a bounded internal delegation runtime beneath Isabella without adding new visible agents or navigation. Isabella remains the sole conversational interface and the sole component allowed to turn analysis into user-facing proposals. The runtime exposes five read-only specialist roles: `research`, `work`, `planning`, `memory` and `document`.

Delegation is selective rather than automatic fan-out. The existing typed router derives `specialist_candidates` from the actual turn and passes them as advisory context; Isabella may call `delegate_specialist` only when an additional specialized pass materially improves a complex answer. Simple turns stay single-agent. The runtime enforces a maximum of three delegations per turn and deduplicates identical requests to prevent tool loops.

Each delegation runs as an isolated OpenAI response outside Isabella's persistent conversation object. It receives a narrow objective plus only the evidence required by its role. Research can use web search; Work receives project retrieval; planning receives calendar/tasks and relevant Commitments; memory receives Active Memory retrieval and Commitments; document review receives selected Work files or, when no file id has yet been chosen, a bounded file index. Specialist calls have no mutation tools. They cannot create or modify Tasks, Events, Routines, Standing Intents, Commitments, Work claims, personal memory, preferences or Skills.

Specialist output returns to Isabella as a transient memo. The memo itself is not stored as memory or project truth. Execution metadata is recorded through `minds_agent_runs` under features such as `specialist_work` or `specialist_planning`, linked to the parent Isabella run in route/metadata. Usage is recorded separately by specialist role. `Estado de MINDS` shows only aggregate recent specialist activity and errors, not the hidden memos.

Source discipline is preserved. Research, Work and document delegations taint the resulting context as source-derived so they cannot be silently promoted to autobiographical facts. Work/document specialists must preserve claim status and provenance and must not treat a source assertion as a confirmed project fact merely because it was retrieved or reviewed. Planning and memory specialists remain read-only and advisory.

Sofía is explicitly outside this runtime. She remains the visible intellectual identity attached to Readings/Theory and is consulted through the existing `consult_sofia` bridge. Build 61 therefore implements invisible specialization without turning MINDS into a collection of interchangeable personas.

Build 61 does not yet implement specialist-to-specialist communication, persistent specialist memory, autonomous permission promotion, background multi-agent swarms or automatic execution of specialist recommendations. Those remain later layers and must preserve Isabella as the orchestration boundary.


## Build 62 — Specialist Orchestration / Evidence Routing v0.1

Build 62 upgrades the invisible specialist runtime from independent delegation to bounded orchestration. Isabella can now call `orchestrate_specialists` with an ordered plan of up to three specialist steps. Each step has its own objective and may depend only on earlier steps, creating a small directed acyclic execution plan instead of an unconstrained agent swarm. The typed router also exposes a `specialist_plan_hint` derived from the current request; it is advisory and Isabella remains responsible for deciding whether orchestration is warranted.

Evidence is routed according to specialist role. Research receives no private upstream memos and cannot depend on Work, Memory, Planning or Document outputs. Work retrieves project-scoped evidence while preserving claim status and provenance. Memory uses Active Memory and Commitments. Planning receives agenda/tasks and Commitments and may consume explicitly tagged upstream specialist memos as evidence. Document review uses Work provenance and, when no file ids are supplied, can identify the most relevant Work files and read at most two automatically. Upstream memos are clipped, labelled with their evidence class and never treated as instructions.

The orchestration runtime preserves the global Build 61 ceiling of three new specialist executions per user turn, even when direct delegation and orchestration are mixed. Identical specialist requests are cached within the turn to avoid repeated model work. Every child run records its parent and optional orchestration id, and the parent Isabella run records a compact orchestration summary. Specialist memos remain transient and are not written into autobiographical memory, Work claims or Commitments.

Source taint propagates through dependency chains: if a downstream Planning or Memory memo depends on source-derived Work, Document or Research evidence, Isabella receives that provenance state and the existing protection against silently promoting sourced material into personal fact remains active. Disagreement between specialists is preserved for Isabella's final synthesis rather than collapsed into artificial consensus.

This release also closes a calendar synchronization race discovered after Build 60. Explicit Task/Event mutations already persisted atomically, but a pull started before the mutation could finish later with an older server snapshot and temporarily replace the newer local entity until refresh. Reconciliation now compares per-entity `updatedAt` revisions as well as the in-flight mutation guard. A remote snapshot can replace local state only when it is at least as recent; an older remote row can no longer visually undo a newer local date change. Moving a task by editing its date also receives a fresh sort order in the destination day.

Build 62 still does not allow specialist mutation, persistent specialist memory, automatic permission promotion, background swarms or hidden specialist-to-specialist conversations outside the explicit dependency graph. Isabella remains the orchestration and permission boundary.


## Build 63 — Coherence & Sync Integrity

Build 63 is a corrective release focused on consistency before further agentic expansion. It resolves four regressions observed in authenticated production use: stale calendar repaint after a successful task move, temporal greetings inherited from historical context, repeated curiosity questions about already resolved preferences, and legacy interest-feed state surviving after the Feed product model had changed.

Task/Event persistence remains atomic as introduced in Build 60, but synchronization no longer treats a snapshot captured at the beginning of a network cycle as authoritative UI state. A pull now reconciles its remote rows against `app.getState()` at completion time. Per-entity `updatedAt` ordering and the in-flight mutation guard still apply, so an old pull cannot visually undo a newer local edit even when that edit occurred after the sync request began. The pre-pull unconditional `replaceState(capturedSnapshot)` path has been removed.

Feed preferences now have one canonical shape: `mode=situational_personal`, optional weather locality, and explicit situational instructions. Legacy `topics`, `customTopics`, `following` and `followGraph` are normalized to empty arrays on load, hydration and persistence. This prevents old browser state from resurrecting the retired architecture/art/news discovery model. The situational Feed remains allowed to consult external information only when it materially affects an active personal, operational or project dependency.

Proactivity is serialized. Only one post-sync proactive cycle may run at a time, curiosity has its own in-flight lock, and its cadence timestamp is reserved before the network call rather than after it. Candidate curiosity questions are also checked against prior assistant questions. The curiosity prompt explicitly excludes Feed content categories and requires checking recent context and long-term memory before asking a preference question that may already be resolved.

Temporal context is now explicit end-to-end. The browser sends current local time and daypart, while `isabella-chat` independently computes server-side local date/time for the supplied IANA timezone and exposes that server result as authoritative context. Historical greetings are explicitly non-authoritative; Isabella must not infer the present daypart from an earlier “buenas noches” or similar conversational residue.

Build 63 intentionally adds no new autonomous or multi-agent capability. Its purpose is to restore coherent behavior before continuing the agent roadmap.


## Build 64 — Fast Path v0.1

Build 64 introduces a bounded low-latency path for ordinary Isabella interactions while preserving the full cognitive architecture for complex work. Production observation before this build showed successful Isabella chat runs at roughly 13.5 seconds median latency, with straightforward task creation commonly requiring three model rounds. The active OpenAI Conversation had also grown to more than one hundred thousand input tokens per model call even for light requests.

The OpenAI Conversation is now explicitly a working window rather than the archive of record. Full conversational history remains in Supabase. When 48 additional persisted messages have accumulated since the current working conversation was created, MINDS creates a fresh OpenAI Conversation, seeds it with the 24 most recent user/assistant messages, archives the previous OpenAI conversation reference in metadata and continues without deleting historical messages. This keeps local conversational continuity while long-range recall continues to come from Active Memory, checkpoints, entities, Commitments and explicit retrieval.

Light turns now use low reasoning effort and a lower compaction threshold; standard and deep requests retain medium/high reasoning and their broader retrieval budgets. A dedicated fast-agenda path recognizes short, explicit task/event mutations. On that path, MINDS skips unrelated long-term recall, model claims, Skills, Commitments, Work prefetch, Sofía and checkpoint generation, while retaining recent conversation, temporal context, taxonomy, standing intents and the narrow set of agenda tools required to understand and prepare the requested mutation.

Skills remain available for non-trivial workflows, but complete one-shot calendar/task operations no longer load the `capturar-compromiso` procedure merely to restate a tool schema already present in the runtime. This removes an unnecessary model round without changing the confirmation policy: persistent mutations still require explicit user review.

Agent-run and AI-usage metadata now records whether a turn used the fast path and whether the OpenAI working conversation rotated, so latency changes can be measured against real production use rather than inferred from architecture alone. Build 64 does not alter the deep Work, research, Readings/Sofía or specialist orchestration paths.
