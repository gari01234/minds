# Build 100A — Verified action receipts at the browser boundary

**Date:** 2026-10-23. **Base:** `23b85cc6465af33103bef847ba087ca2ffb18885` (Build 99C). **Tracking:** [P0 #138](https://github.com/gari01234/minds/issues/138).

## Scope and diagnosis

The conversational turn result has a typed `outcome` but the UI previously allowed `action_applied` with a bare `autonomy_execution.id` or with just one action receipt even when `applied_count` was greater. That is weaker than a one-to-one receipt contract. This change validates a list of server-origin receipt IDs and their request IDs against the reported execution count. No model-generated prose, runtime ID alone, count alone, duplicate receipt or malformed receipt satisfies the boundary. When a valid `action_applied` is displayed, its text is deterministically derived from the receipt count, never model prose.

The server already restricts text-only browser recovery to informational results: `recoverableInformationalTurn` requires no proposals, capability runs or artifacts and permits only listed read tools. Do not claim that old transport recovery fabricates action receipts. This build does not attempt to reconstruct an action proposal from a text-only recovery record.

## Boundary

This is **a browser presentation gate**, not cryptographic validation of a DB receipt. Server verification and canonical read-back remain authoritative. Legacy untyped proposals are still review-only, never executed by this gate. Current `isabella-chat` returns an `answered` or `proposal_created` outcome (it does not issue an `action_applied` from `turnOutcomeReceipt` today), so the effect is strengthening a future action-result contract, without changing Supabase data, tools, permissions, context routing or delivery.

## Acceptance

Node UI regression suite must cover valid single/multiple receipts, count mismatch, malformed and duplicate IDs, `autonomy_execution.id` only, `answered` with hidden execution claims, and fail-closed presentation; full Verify and coherent PWA cache pins must pass. Physical browser E2E for the P0 #138 contextual correction, approval card, actual mutation, reload recovery, latency and token budgets remains **open**. Do not close #138 on CI alone.

No new service, migration, deployment permission or runtime lane is introduced.
