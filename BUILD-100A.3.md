# Build 100A.3 — Convergence after conversation sync

**24 Oct 2026**, scoped follow-up for issue #138. The canonical update from the iPhone acceptance was committed once with an immutable action receipt and review status `accepted`. But the user's screenshot after reopening the PWA still displayed the stale pending review next to the morning message.

## Verified source of the inconsistency

- Supabase query: **one** `conversation_messages` record for the matching request ID retains `review_proposals` but has no `review_state`, despite the canonical decision being accepted and the task due date now being 2026-10-27.
- `sync.js mergeConversationMessages` uses remote-first messages, discarding the local `applied_verified` status and `review_receipt_id` because it preserved only `durable_request_id` specially.
- `app.js` startup/visibility/chat entry invokes `recoverReviewedTaskReceipts`, but **the successful `isabella:synced` event did not**. Its `app.replaceState` could therefore reintroduce a remote pending review even if local receipt recovery had succeeded.
- Arrival of the morning message is not evidence that it caused the bug; syncing remote conversation records is the verified vulnerable path.

## Patch

1. After every `isabella:synced`, execute read-only owner-RLS receipt/accepted-decision/canonical-task recovery. No re-execution, no additional task mutations.
2. Preserve a locally verified review over a remote pending echo **only when** local status is `applied_verified`, a UUID-shaped `review_receipt_id` exists and both copies reference the exact same single proposal `request_id`. Never infer an execution from prose.
3. Tests for all match/mismatch/malformed cases and PWA cache pins `v164`, `app.js?v=128`, `sync.js?v=pwa39`.

## Acceptance boundary

Automated tests and GitHub Publish are necessary but not sufficient. Ask user to hard-reopen the iPhone PWA after deployment: the old proposal should no longer say approval is pending or offer the review button, and the task must still show 2026-10-27. A separate Build 100 issue remains: task creation should be one Guardar, not a two-step Guardar/Crear tarea.

No migration, permission change or new runtime, and no user test task mutated by this commit.
