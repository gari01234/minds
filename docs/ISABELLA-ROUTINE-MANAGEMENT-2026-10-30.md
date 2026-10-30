# Isabella routine management — 30 October 2026

The reported failure was a missing operation, not a missing ownership grant. Chat exposed create_routine but had no canonical routine lookup or update/pause/resume/delete tools. Production inspection found two active briefs (07:45 and 08:00), contrary to the conversation's assertion that only one existed. This change does not consolidate or reschedule either existing brief.

Chat now reads saved routines, including disabled ones, with pagination, and prepares changes bound to canonical owner-scoped IDs. Partial edits preserve omitted fields. Existing-target proposals carry a server-read configuration snapshot; stale configuration edits fail, while runner timestamp updates do not invalidate review.

The browser commits routine lifecycle actions through minds_commit_reviewed_routine_v1. Mutation, immutable receipt and review resolution are atomic. Same-request replay returns its receipt, changed replay fails, and creation rejects equivalent existing routines. The server validates schedule, future execution, timezone and content. Receipts retain pre-delete configuration; there is no general undo UI yet.

New mutation tools require the loaded browser executor's routine_review_version, preventing old clients from routing updates through their legacy insertion handler. The existing explicit-review model and owner isolation remain intact.

## Capability scope

| Area | Available capability | Boundary |
|---|---|---|
| Routines | Canonical read; create, edit, pause, reactivate, delete with receipts | No automatic brief consolidation or general undo command |
| Calendar/tasks | Existing create/update/delete, complete/archive tools retained | Verified task create/update; other mutations retain their existing paths |
| Feed/behavior | Existing weather locality, attention rules, behavior tools | Specific preferences, not arbitrary page/code editing |
| Commitments | Existing proposals, expectations, workspaces and mission controls | External delivery/monitoring requires supported capabilities |
| Documents/projects | Existing artifact generation, execution, search and source reading | No new arbitrary overwrite of every document or project field |
| Page implementation | Repository/deployment workflow | No deployment credentials granted to chat |

## Verification and rollout

Node tests cover partial binding, missing targets, RPC failures, verified acknowledgements and client compatibility. SQL tests use synthetic owners and the exact migration for lifecycle, replay, duplicate prevention, isolation, stale reviews, validation and receipt access. CI runs them against PostgreSQL 17; local execution uses PGlite because native PostgreSQL installation is unavailable.

Apply the additive migration before isabella-chat deployment, then publish browser assets. Deployed chat was compared with main and matched except for a final newline. Existing routine configuration remains unchanged. Reloading the page advertises the new executor capability.
