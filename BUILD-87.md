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

### 87.2 — Compatible batching + proposal expiry
- Define which reversible review items can share one human review.
- Add explicit expiry only to proposal classes where staleness is safer than accumulation.
- Never expire unresolved contradictions, permission changes or accepted-rule proposals merely because they are old.

### 87.3 — Consequence / reversibility review routing
- Separate cheap correction from authority-boundary review.
- Route review through Attention Economy based on consequence, window and dependency.
- Interruption remains exceptional.

### 87.4 — Proposal admission / low-value suppression
- Prevent weak or duplicative proposals from entering review debt in the first place.
- Suppression must be inspectable and reversible; it cannot become silent rejection of important evidence.

### 87.5 — Human Surface + acceptance
- Surface grouped review only when Gari can actually act on it.
- Acceptance measures reduced manual review burden without increased silent authority.

## Non-goals

No automatic approval.
No global review score.
No authority escalation.
No engagement optimization.
No second proposal store.
No requirement that every inference become a review item.