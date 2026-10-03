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


## Build 65 — One-Round Fast Action + Streaming v0.1

Build 65 adds a deliberately narrow one-round execution path for fully specified create actions. The path is not a lower-quality replacement for Isabella. It is a separate authenticated Edge Function, `isabella-fast-stream`, entered only for short explicit create instructions that contain no question, unresolved reference, conditional clause, multi-action conjunction, attachment or reply-to dependency. Updates, deletes, completions, references such as “lo de Wagner”, conditional instructions and anything that may require Work, memory or planning remain on the full Isabella path.

The Fast Action function exposes only `create_task`, `create_event` and `escalate_to_full_isabella`. It uses one low-reasoning Responses API call with required, non-parallel function selection. The endpoint never writes Task/Event state. A successful model call becomes the same reviewed proposal shape used by Isabella, receives a stable request id, is recorded in Shadow Agency, and still requires the existing user confirmation UI before any persistent mutation can occur. If the narrow model is uncertain, it explicitly escalates and the browser transparently retries the full Isabella path.

Transport is server-sent events. The browser receives progressive status events while the model is resolving the action and a transient assistant acknowledgement as soon as a task/event function call begins. Function arguments themselves are never exposed in the UI. Once the complete function-call item is available, the server builds the proposal deterministically and streams the final acknowledgement plus proposal. Partial streamed text is rendered only in an ephemeral DOM bubble; only the completed final message is written into Isabella's normal local/synced conversation state.

This is intentionally not yet universal token streaming for deep conversational answers. Build 65 streams the fast action lifecycle where early progress is safe and useful, while complex answers continue through the existing buffered path. OpenAI Responses streaming semantics are used directly rather than simulated client-side delays. Agent-run and usage logging use the separate `isabella_fast_action` feature so production latency and Shadow acceptance can be compared against Build 64's two-round path.

The architectural invariant remains: speed may remove redundant rounds only when semantic uncertainty is already low. Any unresolved context automatically promotes the turn back to full Isabella.


## Build 66 — Full Response Streaming v0.1

Build 66 extends real streaming from the one-round Fast Action path to ordinary Isabella conversation while preserving the existing tool and reasoning architecture. The server accepts an explicit streaming request only when the typed router classifies the turn as light and no attachment, agenda mutation, web lookup, Work context, Sofía context, project context or deep-memory retrieval is required. Eligible turns use the normal Isabella system prompt, temporal context, retrieved lightweight memory, persistent OpenAI Conversation and cognitive budget; only the transport changes.

Eligible responses call the OpenAI Responses API with `stream=true` and forward semantic `response.output_text.delta` events through authenticated server-sent events. The browser renders those deltas into the same ephemeral streaming bubble introduced in Build 65. Partial text is never written to the synchronized conversation state. When the upstream response completes, MINDS emits one canonical result containing the complete reply; only that completed reply is persisted by the normal UI path.

Tool-bearing and context-heavy turns deliberately refuse direct text streaming with an HTTP 409 fallback signal. The browser then invokes the existing buffered Isabella runtime unchanged. This protects multi-round Work, research, document, memory, mutation and specialist flows from being weakened merely to expose earlier text. In other words, Build 66 streams when the answer is already safe to expose incrementally and keeps full orchestration whenever future tool evidence may still change the answer.

Standing Intents retain their delivery semantics in the streaming path. If the model fails to integrate an activated reminder, the server appends and streams the reminder before emitting the final canonical result. OpenAI Conversation leases are held for the duration of the stream and released only after completion or failure, preventing concurrent-turn corruption.

Usage and agent-run metadata now distinguish `direct_stream=true` and `ttft_streamed=true`, allowing MINDS to compare perceived latency against the buffered path in production. Build 66 does not yet stream intermediate claims from evidence-dependent research; those turns expose progress through Isabella's working state but remain buffered until their evidentiary pipeline is complete.


## Build 67 — Mission / Commitment Workspaces v0.1

Build 67 turns a user-approved Commitment into an optional operational container when it begins to require real multi-turn work. A Commitment still represents the objective that MINDS has been asked to keep alive; a Mission Workspace is the temporary working state used to advance that objective. The two are deliberately separate so intermediate agent reasoning does not become autobiographical memory or accepted project truth.

Each Commitment can have at most one workspace. Opening it snapshots the Commitment title, objective, completion criterion and project association while preserving the Commitment itself as the source of authority. The workspace stores a short operational summary plus append-only working items of type `plan`, `finding`, `source`, `question`, `decision` or `note`. Items carry provenance class and source kind. Work/document evidence is forced to `project_source`; web evidence is forced to `external`. A workspace decision is always persisted as `proposed`, never silently confirmed.

Authenticated clients can read their own workspace state but cannot directly insert, update or delete workspace rows. Mutations go through narrowly scoped RPCs that derive `auth.uid()`, verify ownership and enforce the epistemic rules above. Cross-user access is covered by the rolled-back SQL integrity suite. Opening and writing workspace state are internal Isabella policies with `allow` mode because they do not perform external actions or alter the user's accepted memory; they only maintain the scratchpad of an already approved Commitment.

Isabella receives relevant existing workspaces alongside `active_commitments`. She may open one only when the user is actually advancing a user-approved Commitment and the work has enough scope to benefit from continuity across turns. Mentioning a Commitment, asking its status or handling a trivial one-shot task is not sufficient. Once work is underway, Isabella can read the scratchpad, append only durable intermediate results and refresh a concise operational summary. Raw chat transcripts and entire specialist memos should not be copied into the workspace.

Mission Workspaces integrate with specialist orchestration without giving specialists mutation authority. Isabella remains the orchestration boundary: specialist results can be distilled into workspace findings with explicit provenance, while external actions, Tasks/Events, personal memory and confirmed Work claims still use their existing confirmation/review paths. The workspace therefore survives conversational turns but does not independently execute anything.

Continuidad now shows when a Commitment has an active Mission Workspace and exposes its current operational summary and item history. `••• → Estado de MINDS` also reports active/paused Mission Workspaces and item counts. No new top-level navigation or agent identity is introduced.

Build 67 is intentionally synchronous. It gives future durable agents somewhere explicit to keep progress, dependencies and working evidence, but it does not yet continue work after the originating request has ended. That transition belongs to Build 68 — Durable Agent Runtime.


## Build 68 — Durable Agent Runtime v0.1

Build 68 introduces durable Mission Runs: bounded server-side executions attached to a Mission Workspace that survive the originating chat request. The runtime is intentionally narrower than general autonomous agency. It can continue internal research, project-context reading, planning and synthesis, and it can append provenance-aware operational state to the workspace. It cannot create or modify Tasks, Events, Routines, accepted personal memory, confirmed Work claims, files or external systems.

A Mission Run is persisted in `minds_mission_runs` with an immutable user/workspace association, request id, instruction, status, phase, checkpoint iteration, bounded maximum iterations, retry count, next-attempt time and a recoverable lease. At most one live run may exist per workspace. `minds_mission_run_events` provides an append-only execution history. Authenticated users may read their own runs and control them through scoped RPCs, but cannot directly insert or update runtime rows. Claiming, checkpoint application, retry scheduling and delivery marking are restricted to the service role.

Execution is queue-based rather than request-bound. A pg_cron job invokes `isabella-mission-runner` every minute. The worker atomically claims due runs with `FOR UPDATE SKIP LOCKED`, assigns a four-minute lease and performs one bounded reasoning checkpoint. If the work can continue, the checkpoint is persisted and the run returns to the queue. If user input is genuinely required it moves to `waiting_for_user`; if the objective is satisfied it becomes `completed`. Expired leases are reclaimable, while model/runtime failures use bounded exponential retry waits and become `failed` after four failed attempts.

Each model checkpoint receives the Commitment objective, completion criterion, current workspace summary, recent scratchpad items and bounded Work context when the workspace belongs to a project. The only OpenAI tool exposed to the worker in v0.1 is web search. The worker returns structured operational items; the database re-enforces provenance and forces every `decision` item to remain `proposed`. Web evidence is stored as external provenance and Work/document evidence as project-source provenance. The durable runtime therefore accumulates work without silently turning its own intermediate reasoning into accepted truth.

Durable user control is explicit. Isabella can start a Mission Run only when the user is actually asking an already approved Commitment to continue beyond the current request, work in the background or return later. She can inspect progress, pause, resume with new user input or cancel the run. A pause requested while a checkpoint is already executing is honored at the next atomic checkpoint boundary; cancellation wins over a stale worker because checkpoint writes require the still-valid run lease.

When a run reaches `completed`, `waiting_for_user` or terminal `failed`, the worker writes one idempotent Isabella message into the user's conversation using a stable `mission:<run>:<event>` client key. The message carries Mission metadata and is not a new memory record. `conversation_messages` is now in the Supabase Realtime publication, and Isabella's sync layer listens only for server Mission messages and pulls them into the visible conversation while the app is open. If the app is closed, the message remains in the conversation and appears on the next sync.

Mission Workspace now exposes the current durable-run state, checkpoint count, summary/blocker and pause/resume/cancel controls. `••• → Estado de MINDS` separately reports Durable Missions in queue/running, waiting for the user and failed states. This keeps agent infrastructure beneath Isabella rather than introducing another visible agent.

Build 68 deliberately stops before autonomous external action or unbounded background loops. The next architectural problem is Attention Economy: once durable work can finish without the user watching, MINDS must decide which results deserve an interruption, which belong in a briefing and which should remain silent until requested.


## Build 69 — Attention Economy v0.1

Build 69 inserts an explicit attention-routing layer between proactive system events and the user-facing surfaces of MINDS. A completed agent run, heartbeat signal or operational failure no longer implies that Isabella should immediately write into the chat. Each candidate first becomes an auditable `minds_attention_events` record and is routed to exactly one of four channels: `interrupt`, `briefing`, `ambient` or `silent`.

The four routes have different meanings. `interrupt` creates one idempotent Isabella chat message and is reserved by default for work that is blocked on a user decision or genuinely time-sensitive events. `briefing` persists the signal until the next compatible daily briefing consumes it. `ambient` places a personal/productive signal in Feed without creating a chat interruption. `silent` records the decision but surfaces nothing automatically. Every attention event stores the chosen route, a human-readable reason, a reason code, source, source event and the factors used by the policy. Build 69 deliberately uses no opaque importance score.

User intent outranks the general policy. Durable Missions default to letting the policy decide what happens when they finish, which currently routes ordinary completion to the next briefing. If the user explicitly asks “avísame cuando termines”, Isabella starts the Mission with `notify_mode=interrupt_on_complete`, which becomes a hard interruption that bypasses quiet hours and the non-blocking interruption budget. An explicit request not to be notified uses `silent_on_complete`. A Mission in `waiting_for_user` is always a hard interruption because autonomous work cannot progress without a decision.

Non-blocking interruptions are bounded. The default policy permits at most three during the previous hour; additional candidates are deferred to the briefing. Optional quiet hours can similarly downgrade non-blocking interruptions to the briefing. Both controls are configurable in the existing `Proactividad de Isabella` panel. The same panel exposes per-event routing for completed Missions, failed Missions, imminent events, overdue tasks and routine failures, plus an auditable “decisiones recientes” view explaining why each event interrupted, waited, appeared in Feed or stayed silent.

Heartbeat now delegates surfacing to Attention Economy while continuing to publish the same Continuity signals as before. This distinction is important: whether a project change should reactivate a waiting Commitment and whether that change deserves the user's attention are separate decisions. A regression test caught an initial implementation that had preserved attention routing but accidentally removed the Continuity publication; the heartbeat publisher was corrected and the full integrity suite again verifies automatic Commitment reactivation.

The existing 07:45 daily summary is the first briefing consumer. When it runs, the routine runner loads pending `briefing` attention events, integrates the relevant ones into the already personal/productive summary and stores the exact event ids alongside the durable routine output. Only after the routine message is successfully delivered are those events atomically marked consumed. If routine delivery is retried, the generated output retains the same attention-event set instead of consuming newer signals by accident.

Feed remains the ambient surface, but attention-owned cards are now protected from the situational Feed generator's cleanup cycle. Generated cards are explicitly marked `source=situational_feed`; refresh/expiry cleanup only dismisses that source. Attention cards use `source=attention_runtime`, so a Feed regeneration cannot erase a signal that the attention policy intentionally placed there.

Realtime chat delivery remains available for `interrupt` events through the existing `conversation_messages` subscription. If Isabella is open, an interrupt can appear without manual refresh; if the app is closed, it is persisted and appears on the next sync. Build 69 does not yet claim operating-system push notifications while the phone is locked. That requires a separate notification transport and should remain distinct from the cognitive decision of whether an event deserves interruption.

`••• → Estado de MINDS` now reports Attention Economy separately from Durable Missions and Mission Workspaces. The next architectural step is contextual autonomy informed by Shadow Agency: using accumulated accepted, edited and rejected proposals to determine which classes of action can safely require less confirmation, without collapsing permission boundaries into a global autonomy level.

## Build 70 — Contextual Autonomy / Evidence-Based Permissions v0.1

Shadow Agency now reports evidence by action, request context and exact category/project scope. Actual candidate differences determine edited outcomes. Sparse, stale, corrected and excluded classes remain explicit states; no global autonomy score exists. Reading evidence cannot write permissions, and executed actions never become approval observations.

`Más → Permisos de Isabella` presents evidence and supports deliberate, version-checked approval and revocation. The first supported grant covers only a simple task in one category, with no project, recurrence or reminder, through an attested one-round request. Both category and task text must appear in the user's input. Dated and undated tasks have separate contexts. At least 12 unchanged reviews on 3 distinct UTC dates within 30 days, no edits/rejections, and a review within 7 days are required to suggest a grant. These are review conditions, not a confidence percentage. Grants expire after 30 days and can be revoked at any time.

The database stamps request scope and enforces fresh evidence, current permission, exact scope, expiry, base denials, transaction locking and idempotent execution receipts. The model can read `read_contextual_autonomy` but cannot grant permission. Historical unverified contexts do not retroactively authorize the new execution class. Network uncertainty cannot silently retry a possibly committed task through the full runtime. Existing clients remain proposal-only through explicit protocol negotiation.

Migration `20261001185142_contextual_autonomy_v01` and the behavioral SQL suite implement these boundaries. `BUILD-70.md` documents infrastructure, validation, limits and real evidence at deployment. No contextual permissions were granted as part of this build.


## Build 71 — Native Presence & Delivery Layer v0.1

Build 71 closes the transport gap identified in Build 69 without changing the attention policy. An `interrupt` may now be projected into a durable `minds_delivery_intents` record when the user has an active Web Push subscription. `briefing`, `ambient` and `silent` never become device push merely because transport exists.

Device subscriptions, transport intents and delivery attempts are independent persisted objects. The delivery worker claims intents with bounded leases, sends Web Push using a stable VAPID identity, deactivates stale 404/410 endpoints and records what the push service actually accepted. A push-service acceptance is not treated as proof that the user saw or opened the notification.

The browser receives only the VAPID public key. Subscription registration/removal is authenticated; direct table writes remain unavailable to authenticated clients; claim/finish and VAPID persistence are service-only. The Service Worker always produces a visible notification for a received push and opens the associated Isabella deep link when tapped.

The human surface is deliberately smaller than the internal ontology: the user sees `Avisos de Isabella`, not delivery intents or push receipts. This is the first narrow application of the next design direction: internal complexity should reduce rather than increase external complexity.

The repository implementation is documented in `BUILD-71.md`. The delivery schema and both Edge Functions are deployed and verified against the exact MINDS Supabase project; the user-facing publication is complete only once PR #1 is merged and the official Pages gate succeeds.


## Build 72 — Human Surface / Conversational Abstraction v0.1

Build 72 adds an explicit abstraction boundary between MINDS' technical ontology and Isabella's everyday surface. The internal system may continue to reason in terms of Commitments, Mission Workspaces, Mission Runs, attention routes, contextual permissions, Shadow Agency, Continuity signals, checkpoints and receipts. The user-facing default instead answers four questions: what is happening, who must act, what is known versus uncertain, and whether the user needs to do anything.

The browser contract in `shared/human-surface.js` is deliberately pure and non-authoritative. It maps existing states to human descriptions but persists nothing and changes no policy. Supabase remains the source of truth. A human phrase that conflicts with technical state is a projection bug, never grounds for overriding backend state.

Continuity, durable work, permissions, notification settings and system health adopt progressive disclosure: human state first, technical state on demand. Mission Workspace becomes “Trabajo de Isabella” at the default surface; checkpoints and provenance remain available beneath technical detail. Contextual Autonomy keeps its evidence thresholds and explicit user authority while explaining eligibility as “I am still learning / I will keep asking / I can propose that you let me stop asking in this exact case.” Attention routes keep exactly the same semantics while their controls are expressed as when Isabella should notify, defer, surface quietly or remain silent.

The conversational runtime receives the same boundary. Isabella may use technical ontology privately, but should not expose it spontaneously. She must distinguish completed work from work being checked and from uncertain inference, and she must make the current locus of responsibility legible. Humanization explicitly excludes simulated emotions, consciousness or human needs.

Build 72 introduces no database migration, new navigation surface, permission class, autonomy threshold or attention rule. It changes representation while preserving authority and provenance.


## Build 72.5A — Mission Runtime Adapter contract

MINDS now distinguishes the authoritative Mission Run from the runtime execution used to advance it. `minds_mission_runs` remains the control-plane object. Runtime-provider identity lives separately in `minds_mission_runtime_executions`, allowing a future primary and shadow execution to be compared without changing the Mission's objective, authority or workspace state.

The provider-neutral contract exposes `start / inspect / steer / pause_or_stop / collect` and explicit capability flags. `native_minds` remains mandatory as fallback; `openai_agents` is only a recognized provider name in 72.5A and is not selected by production.

Runtime snapshots are bounded, strip no truth silently, contain no user identity, and reject credential-shaped object keys before they cross the execution boundary. Runtime results are normalized back into the existing Mission Workspace vocabulary; provenance remains subject to the database enforcement already present in `minds_apply_mission_step`.

The runtime ledger is service-write/authenticated-read-only with RLS. Ownership is derived in the database from the Mission Run rather than trusted from a worker payload. Provider/mode/run identity is immutable. No new autonomy or action authority is introduced.

This creates the control-plane/execution-plane seam required for 72.5B shadow execution while leaving the existing native Mission worker unchanged.


## Runtime selection after 72.5B-EVAL

The runtime abstraction now has an evidence-based routing rule. `native_minds` remains the production default; `openai_agents` remains shadow-only.

Five synthetic evaluations showed equivalent substantive resolution across conflict handling, user-decision gating, provenance discipline and two multi-episode continuity tasks. Provider-managed session durability did not outperform reconstruction from Mission Workspace under the tested no-tool environment, while observed token volume and latency were materially higher.

Therefore runtime selection must not be based on generic task difficulty, number of documents or multi-turn duration alone. A future Agents route requires a **capability differential** that native MINDS has not demonstrated efficiently: persistent execution environment/artifacts, durable tool/MCP work, justified multi-agent delegation, or sufficiently large/long state that reconstruction becomes materially inferior.

The full evidence and policy live in `RUNTIME-SELECTION-v0.1.md`. No opaque global runtime score is permitted.


## Capability Integration after Build 72.7

External execution can now produce material work without becoming authoritative state.

The stable boundary is:

```
Mission Runtime
  → external material execution
  → verified provider artifact
  → Artifact Intake / pending
  → human review
  → optional MINDS artifact
```

Provider filesystem state and provider artifacts are execution state, not autobiographical memory or project truth. Mission Workspace remains unchanged until a later, separately authorized architecture explicitly permits proposals to cross that boundary.

Persistent Environment is therefore a capability-level route for material-state work, not a second default runtime.


## Execution-scoped context after Build 72.8

External runtimes no longer need broad context injection as their only way to understand a Mission.

MINDS may grant narrowly scoped, temporary read capabilities:

```
MissionRuntimeExecution
      ↓
Capability Grant
  execution-bound
  expiring
  revocable
  hashed credential
      ↓
Read-only MINDS MCP
      ↓
source-of-truth context
```

The provider cannot select arbitrary users, workspaces or projects; those scopes are derived from the execution chain inside MINDS. Each read emits an audit event without duplicating the retrieved content.

This is a data-minimization boundary, not a new authority channel. Write capabilities remain absent.
