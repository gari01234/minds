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
