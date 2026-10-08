# Build 87 — Review Economy v0.1

## Objective

Treat Gari's review attention as a scarce resource without converting fewer prompts into silent authority.

Review Economy exists because a more capable Isabella can otherwise create a new class of coordination work: proposals, hypotheses, permissions, variants and confirmations that are individually reasonable but collectively expensive to review.

The goal is not to reduce review by accepting more things automatically. The goal is to reduce review through better selection, batching, reversibility and expiration.

## Constitutional rules

1. Review debt is measured in transparent pending items and age, not a global opaque score.
2. Lower review load must not increase Isabella's authority.
3. High-consequence or low-reversibility changes stay individually reviewable.
4. Cheap reversible proposals may be batched, delayed or allowed to expire when safe.
5. Open contradictions and authority-boundary decisions do not silently expire.
6. Attention Economy decides when a review deserves interruption; Review Economy decides what actually deserves review.
7. Review metadata is a projection over canonical proposal/review stores, not a second proposal database.

## Build 87 sequence

### 87.1 — Review Debt Ledger **Implemented**
- Add one read-only projection over pending reviewable state already present in MINDS.
- Classify each item by review class, consequence and reversibility with explicit deterministic rules.
- Summarize debt with counts and age bands; no opaque score.
- Do not move, accept, reject or expire anything in this slice.

### 87.2 — Compatible batching + proposal expiry **Implemented**
- Only low-consequence, highly reversible create-task/create-event shadow decisions are batch-compatible in v0.1.
- Compatibility requires the same proposal kind, action, scope, target date and origin class (direct vs inferred); source-tainted or recurring proposals never batch.
- Batch compatibility is a read-only projection. One batch never grants authority and cannot be bulk-applied before the Human Surface explicitly reviews it.
- Stale task/event shadow proposals expire deterministically: at least 24 h after creation, no later than 7 days, and no later than one day after their target date when dated.
- Expiry is executed by the deterministic Heartbeat and leaves an audit receipt in the original shadow decision context.
- Operating-rule hypotheses, Project Claims, Project Model Variants, permissions, permission changes, commitments and claim-authority proposals are protected from age-based expiry.

### 87.3 — Consequence / reversibility review routing **Implemented**
- Review items are split deterministically into `authority_boundary`, `bounded_change` and `cheap_reversible` lanes.
- Dependency-blocking review is the only review condition that becomes a hard interruption by itself.
- Authority-boundary review routes to briefing by default; time-window-closing review routes ambient; cheap reversible review stays silent until a review surface is opened.
- Review Economy supplies consequence/reversibility/window/dependency facts; the existing Attention Economy still decides the final route.
- Routing is read-only and cannot accept, reject, edit or expire a review item.

### 87.4 — Proposal admission / low-value suppression **Implemented**
- Shadow-decision proposals now pass an auditable admission gate before entering review debt.
- Same-run semantic duplicates reuse the existing pending review instead of creating another review item; later turns remain new user acts and are never silently swallowed.
- Safe no-op actions — currently completing an already completed task or archiving an already archived task — are suppressed before review because no state change remains to authorize.
- Every admitted, duplicate or suppressed attempt leaves a Review Admission receipt with reason, fingerprint and minimal context.
- Suppression never applies to permission, Project Claim, Project Variant, operating-rule or other authority-boundary evidence merely because it looks weak.
- Reissuing a request after the underlying state changes is allowed; suppression is not a permanent rejection.

### 87.5 — Human Surface + acceptance **Implemented; acceptance validation in progress**
- “Revisiones” lives under Isabella → Más, not as another top-level product surface.
- The surface shows actionable individual review, server-declared compatible batches, cheap reversible items that can wait, expiry context and transparent debt counts.
- A compatible batch reuses the existing `confirmProposals` flow so one explicit human confirmation can apply several already-compatible reversible proposals; each canonical proposal still resolves through its existing reviewed mutation path.
- Authority-boundary and behavior-rule reviews remain individual.
- Loading the surface is read-only: it cannot accept, reject, expire or modify any review item.
- Acceptance requires CI plus a production-baseline check that stale reversible debt can disappear while protected authority/behavior review remains pending.

## Non-goals

No automatic approval.
No global review score.
No authority escalation.
No engagement optimization.
No second proposal store.
No requirement that every inference become a review item.