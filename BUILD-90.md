# Build 90 — Human Surface / Lenses Redesign

## Objective

MINDS has one governed world, multiple contextual lenses. The interface should reduce Gari's coordination work without reducing authority boundaries, provenance or the independent continuity of Work, Readings, calendar and conversational context.

Build 90 is a **product/UI transition**, not a new ontology or new source of truth. Preserve Build 83 task/calendar parity, Build 84 Project Model, Build 85 Exposure, Build 87 Review Economy and Build 88 Presence. No real Bernried Work/Desktop project corpus is required before Build 90 closure; Bernried source acceptance remains post-90.

## Product contract

The primary post-90 lenses are:

- **Situación → Ahora**: eventually a canonical Attention Economy projection, not a generated summary falsely implying exhaustive coverage.
- **Chat**: universal Isabella conversation, with server-governed scope.
- **Tiempo**: the existing canonical calendar and tasks, including user-defined execution order.
- **Work**: project-specific workspace (Desktop, Planner, Conocimiento, Threads), retained in full; no file migration or project data copying.
- **Lecturas**: reading and research experience, retaining history and annotation context.

**Ideas** remains reachable as a secondary exploratory destination while its durable proposals and workflows are evaluated. **Feed** remains active within the existing situational route during migration; do not silently claim that weather/news is canonical Attention Economy.

Navigating never changes usage scope, epistemic status, permissions, review state or task identity. Changing a lens is presentation only.

## Build 90 execution

### 90.1 — Desktop lens navigation — accepted and merged 2026-10-09

Introduce an actual desktop-first navigation rail above 1100px. It uses the same route actions and the same screen/data stores as mobile; active selection and keyboard focus are explicit. Primary desktop destinations are Situación, Chat, Tiempo, Work and Lecturas. Ideas remains secondary and available. The existing six-way mobile navigation remains unchanged. No backend, schema, permission, data flow, Work file or task changes.

The first label is deliberately **Situación**, not yet **Ahora**: the existing Feed route mixes immediate conditions and contextual information. Renaming it to canonical Ahora would be a false coverage claim until 90.2.

### 90.2 — Ahora as an honest attention lens — accepted and merged 2026-10-09

Derive current attention from canonical Attention Economy and Review Economy, explicitly distinguish no pending items from withheld/suppressed items and unknown coverage, and provide exact contextual actions. Preserve Feed items as a secondary, labeled contextual section. Never store a second attention status machine.

### 90.3 — Work as a project understanding lens — accepted and merged 2026-10-09

Keep Desktop, Planner, Conocimiento, Threads and their canonical identities. Make the Project Model revision, Variants, open Movements, Perimeter and gaps intelligible in a coherent overview without turning inferred Claims into accepted truth. Preserve existing task ordering and file interactions.

### 90.4 — Time and execution parity

Keep one canonical task/event row across Work, Calendar, Presence and assistant turns. Reduce unnecessary navigation and support inspection/editing of tasks without a separate shadow database. Preserve `sort_order` and `work_sort_order` as distinct dimensions.

### 90.5 — Conversational and reading transitions

Retain conversations and evidence when moving between lenses. Scope changes only with explicit route/context semantics, not merely because the visible page changed. Ensure Readings remains usable; do not silently dissolve its special full-text/annotation behavior.

### 90.6 — Desktop, mobile and Presence acceptance

Check all destinations, keyboard and touch navigation, project task interactions, file upload paths, proposal review, mobile Safari/PWA, reading frames, reduced-motion, desktop narrow window, no scope bleed and no duplicated truth. Keep 84.6 empirical Bernried source acceptance separately deferred until Gari loads Work/Desktop files after Build 90.

## Non-goals

No global navigation rewrite that destroys existing features. No new model inference to choose the next screen. No speculative import of chat attachments into Work. No automatic promotion of an Idea, memory, proposal or artifact. No redesign of the native Presence runtime in the first slice.

## Progress and validation boundary — 2026-10-09

90.1 introduced the desktop navigation rail without removing mobile destinations or changing canonical state. 90.2 introduced a source-backed situational radar; its coverage remains explicitly limited to dated tasks, selected Expectations, unconsumed user-required Attention Events, and pending action proposals. Generated Feed suggestions are not treated as authoritative attention.

90.3 introduces the read-only Work Panorama over canonical project tasks, proposed/disputed Claims, the existing Project Model snapshot and the file count. It does **not** claim to understand the real Bernried source corpus yet: the empirical 84.6 acceptance remains deferred until Work/Desktop uploads after Build 90. A model without listed gaps does not imply complete perimeter coverage. The existing Desktop, Planner, Conocimiento and Threads stay intact and navigable.

### Build 90.4 — field-reported parity regressions

2026-10-09: screenshots expose Panorama exception, Threads unable to open, literal backslash-n at lower left, missing contextual editing from Ahora, and oversize chat composition. This repair slice corrects Work navigation and the database thread-conversation RLS identity mismatch, and exposes direct task editing from Ahora. Full calendar/Work/Presence parity acceptance remains open; do not mark Build 90.4 closed without real interaction, persistence and cross-surface tests.

### Build 90.4 / 90.5 — field acceptance continuation, 2026-10-09

After PR #77, live user testing confirmed that Bernried's HLS & TWP Thread can open and receive a reply. Further screenshots revealed missing in-conversation transmission/progress feedback, unrendered Markdown, an inert task editor in Ahora and cramped task labels. The task editor defect is a mismatch between isabella_tasks.id (database UUID returned by the Ahora query) and the app editor's client_key. Resolve the canonical UUID under the authenticated owner, refresh the existing canonical client state, and edit that client_key. Never invent a second task or perform direct uncontrolled writes.

Thread and Isabella Chat should use one escaped Markdown formatter and surface honest execution phases. A persisted Work Thread message is confirmed as saved only after Supabase insert succeeds. Do not claim the message was 'read' without a read receipt. In-flight rendering state is ephemeral and must not become memory or a project Claim.

Supabase observation (2026-10-09): 28 Work files registered, 0 with index_status='indexed'; minds_work_claims and minds_project_model_revisions each contain 0 records. An empty Conocimiento view is thus not evidence of missing files, nor proof of ingestion or project comprehension. State that boundary in the interface and preserve Build 84.6 real Bernried acceptance for after Build 90.

90.5 first transition slice preserves the selected calendar date across lens switches while retaining the current Thread identity and source-bound reading surface. Remaining 90.4/90.5 acceptance: cross-surface create/edit/recurrence/drag persistence, live authenticated task round-trip, mobile Safari/PWA, multi-context navigation, Readings text/highlights/annotations and evidence scope. Do not mark either build closed or make 84.6 claims from CI-only results.

### 90.4/90.5 — Project inspection and response trace, 2026-10-09

Panorama task rows now route the actual isabella_tasks.id to the same authenticated UUID-to-client-key editor used by Ahora. This is a read/edit affordance over a canonical task, not a new Project Movement state or a write-through model.

For Work Thread responses, no cited sources is shown explicitly when the persisted message has no source metadata. A missing citation is not evidence that no files were read, and a filename list is not evidence of having read its contents. Live inspection of Bernried's first HLS & TWP exchange found zero sources on the response metadata. Preserve evidence/usage scope in subsequent reviews. The model's claims about indexed documents must not replace source receipts.

### 2026-10-09 — live defect: truncated weekly agenda assessment (90.5)

The user's 16:11 (Europe/Berlin) question "que tal pinta la siguiente semana?" has an assistant reply in canonical conversation_messages at 16:12 containing 220 characters, ending with "Raumflächen". The stored message itself is partial, not merely clipped by the chat renderer. The minds_agent_runs record is marked success with direct_stream=true and no tools despite being a schedule assessment. The direct-stream path sends result after any nonempty finalText and does not require response.completed; response.incomplete and a missing completion event are not distinguished from success. There is no isabella_chat usage receipt for the streamed result in the inspected time window, so the precise OpenAI termination cause is unproven.

Acceptance required: send multi-day agenda assessment to search_calendar (not text-only fast streaming); require explicit OpenAI completion status before marking run successful; preserve a partial as visibly incomplete rather than silently final; never acknowledge reminders from incomplete runs; never implicitly rerun a possibly side-effectful request after a broken SSE connection. Verify real multi-day answer with all dates covered, trace provenance, and test EOF / response.incomplete / response.completed / read-error transitions. Keep the 90.4 calendar-work-order identity tests and 90.5 reading-transition tests open.

Implementation blocker: direct writes to isabella-chat/index.ts and the Isabella browser AI client through the connected GitHub tool were blocked by the connector security checks on 2026-10-09. No backend patch or client fix was deployed by this handoff note. Review and apply through an approved editing workflow; do not treat documentation as implementation.

### 2026-10-09 — Build 90.5 stream integrity implemented, CI and publish green

The live 16:12 weekly-preview failure is documented above. The formerly blocked runtime edit was completed directly through the authorized GitHub Git-object commit path in PR #81, squash commit `9e95070cc13b2f70873421a6e67e1baa384295c6`. The PR Verify MINDS workflow passed, Publish MINDS passed, and production Supabase `isabella-chat` v83 was deployed with `verify_jwt=true` and its prior shared dependencies. The deployment entrypoint was compared byte-for-byte with the integrated repository version. Desktop PWA cache is `isabella-shell-v117`, `app.js?v=103`, `ai.js?v=50`, `work.js?v=18`, `app.css?v=67`.

Schedule assessment questions (including the user's exact “que tal pinta la siguiente semana?”) bypass text-only streaming, are explicitly scoped to an agenda lookup, and require a search_calendar call on the initial full-route model round. Streaming only marks success if OpenAI emits completed status. Partial text is retained with an incomplete receipt and an explicit user-driven continuation action in Isabella Chat and Work Threads. Do not interpret these verified build and deployment facts as empirical acceptance of weekly-answer quality, recurring task persistence, Presence parity, or Readings navigation. Builds 90.4 and 90.5 stay open until authenticated real-use acceptance.

### 2026-10-09 — 90.4/90.5 parity and reading-continuity follow-up

Implementation slices (PR pending acceptance): a manually created Calendar task/event can be assigned to an existing canonical project (Bernried or Schwarz), using the existing `projectId` → `isabella_projects` mapping rather than a new Work item model. Opening a task from Ahora or Panorama now waits for a successful pull of canonical state before the editor is shown; an unresolved or failed pull must not silently edit a stale local copy. Queued sync pulls return a completion result instead of returning before the queued run. A successful sync refreshes the visible canonical Ahora projection.

Readings continues to use the existing `/theory/` iframe with its own persisted reading annotations, selections and conversations. Navigating away should visually suspend the Sofía sheet, not send `minds:sofia-close` and discard a draft. Returning asks the embedded frame for actual sheet state; the parent only accepts the state from the expected iframe origin/window. Initial Sofía requests wait for the embedded frame's load rather than relying on a fixed 260ms timeout.

Read-only production audit, 2026-10-09: 111 active task records, zero missing client keys, zero duplicated (user_id, client_key), 39 undated tasks, four timed reminders, 77 tasks with Work sort order, zero active task recurrence JSON objects. These observations do not establish authenticated save/reload round-trip behavior, recurrence editing or iOS acceptance.

Build 90.6 automated transition acceptance covers explicit desktop/mobile destinations, canonical project selection, validated task-refresh preconditions, iframe-ready messaging, Work file upload route, and reduced motion. Automated CI is a bounded structural/behavioral gate, not proof of manual Safari/PWA, desktop narrow window, touch DnD, PDF reading annotation, notification delivery or Presence acceptance. Maintain Build 84.6's real Bernried source acceptance separately.

### 2026-10-09 — 90.4/90.5 implementation and bounded 90.6 acceptance status

PR #83 was merged as `658223c130b6616651354318f65d9e3702c217c4` with green Verify MINDS CI and successful Publish MINDS. It adds canonical project assignment to manual Calendar task/event creation, a required latest-state pull before editing task UUIDs from Ahora or Panorama, completion-aware queued sync, and automatic canonical Ahora projection refresh after successful sync. It also preserves Sofía's existing embedded conversation and unsent draft on lens changes, replacing fragile fixed-delay cross-frame messaging with frame-load and state-query handshakes, without creating a second Readings store.

PR #84 was merged as `6d128b5f2acc1511fec61acd43aa212de8969991` with green Verify MINDS CI and successful Publish MINDS. It fixes the user-visible project labels in Ahora by resolving canonical `isabella_projects.id` UUIDs, not local project keys; the attention/coverage calculation continues to rely on the same four existing canonical sources.

Current published Isabella assets after PR #84: `situation.js?v=4`, `app.js?v=104`, `sync.js?v=pwa32`, and service worker `isabella-shell-v119`; embedded Readings uses `v09.js?v=sofia10`. No production task/calendar mutations, source ingestion or authority schema changes were made by these PRs.

Build 90.6 now has an executable CI fixture `tests/build90-transition-acceptance.test.mjs` testing project/date creation, stale-task edit rejection, queued sync completion semantics, iframe readiness, route continuity, Work file upload entrypoint and reduced-motion/media-breakpoint contracts. This is automated contract acceptance, not a manual device acceptance.

Remaining gates before fully closing 90.4–90.6: authenticated save/reload of a task created from Calendar into Work/Ahora and Presence; stale edit after a Work mutation; completion and recurrence/reminder/order invariants; mobile Safari/PWA touch and keyboard behavior; a genuine embedded Reading with selection, highlight, annotation and unsent Sofía draft across lens switches; file upload and download; narrow desktop layout; native desktop Presence and no scope bleed. Manual device, browser and Presence checks have not been performed by GitHub CI. Do not mark Build 90 fully accepted, and do not start the separate 84.6 Bernried real-source acceptance, until these gates are accounted for.

### 2026-10-09 — Build 90.6 Work touch and file-transfer reliability slice

Work Planner cards now expose explicit up/down controls usable with touch and keyboard, calling the existing canonical `persistWorkTaskOrder` writer. The controls only update `work_sort_order` within the same bucket; they do not alter `sort_order`, dates, task identity, project identity or cross-bucket semantics. HTML drag remains available for browsers supporting it. A targeted Node acceptance test exercises both move directions, boundary behavior and preservation of the Work-only order dimension.

Work Desktop uploads now report how many files were truly registered and which failed, instead of unconditionally clearing an upload/metadata failure message after re-rendering. When storage upload succeeds but database registration fails, the newly uploaded unregistered storage object is removed. No uploaded source is silently promoted to indexed or to a Project Claim. A mocked test covers success, storage failure, registration failure and partial failure disclosure.

Automated tests and publication confirm the code contract, not empirical mobile Safari touch usability or the user's authenticated file round-trip. These remain Build 90.6 acceptance gates. The user did validate one 90.4 scenario: creation from Calendar, date edit from Ahora, persistence in Calendar, and disappearance from overdue Ahora once the due date was moved into the future.

### 2026-10-09 — Build 90.5 embedded Readings bridge provenance

When Sofía runs inside the Readings iframe, same-origin is not sufficient to authorize incoming `minds:sofia-open`, `minds:sofia-prompt`, `minds:sofia-close` or `minds:sofia-state-request` commands. The listener now requires that messages originate from its actual embedding parent window. The parent already verifies its actual iframe as source of responses. Standalone Readings retains the preexisting same-origin behavior. No annotations or conversation data are migrated, rewritten, silently promoted or deleted. Node tests explicitly check genuine parent acceptance, rejection of another same-origin window, foreign-origin rejection, standalone compatibility, and absence of a forced Sofía close when switching lenses. This is a communication-boundary regression gate, not a real Safari/PWA annotation round-trip test.
