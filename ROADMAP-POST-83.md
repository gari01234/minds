# MINDS roadmap after Build 83

This roadmap converts the October 2026 product/architecture brainstorming into implementation order. It is deliberately conservative about new primitives: ideas are promoted into production only when they solve a demonstrated problem without weakening provenance, authority or continuity.

## Build 83 — Operational Reliability & Proactive Coordination

Status: active acceptance/follow-up.

Purpose: make ordinary coordination trustworthy before adding new cognitive machinery.

Remaining acceptance includes:
- document attachments that actually upload and reach Isabella;
- task creation that survives transient transport failures;
- Work bucket visibility and Planner-style task ordering;
- Calendar task ordering for the user’s intended execution sequence;
- proactive conversion of clear day narratives into reviewable task/event proposals;
- cross-surface parity from one canonical task row.

Ordering semantics are explicitly split:
- `sort_order` = Calendar/list execution order;
- `work_sort_order` = Work bucket order.

They must not overwrite each other.

---

## Build 84 — Project Model & Evidence Constitution v0.1

Status: implementation closed through 84.5; real Bernried source acceptance deferred until after Build 90 by explicit sequencing decision.

Project regains centrality as the main cognitive object for work. It is not a constitutional primitive and does not replace MINDS-wide entities, but it becomes the scope in which project understanding is maintained.

Introduce a governed Project Model composed from structured elements rather than an opaque prose summary:

- **Source** — what entered the system: document, email, message, meeting record, plan, explicit user act.
- **Claim** — a proposition with author/type, evidence, confidence/review state and validity interval.
- **Referent** — stable identity for what claims are about: actor, building element, document, decision, room, system, etc. Referent identity merges are themselves inferred and provenance-bearing.
- **Movement** — an obligation/next movement involving Gari, Isabella or an external counterpart; may be inferred, but inference never silently becomes canonical.
- **Perimeter** — expected source classes and observed coverage for the project.
- **Revision** — a triggered, inspectable Model diff with reason.

Core rules:
1. Every evidential chain terminates in an external Source or explicit act by Gari, never in another Isabella statement.
2. Isabella-authored text can prove that Isabella said something, not that the proposition is true.
3. New Sources are first extracted “blind” with the current Project Model excluded except for the minimum Referent resolution needed to identify subject.
4. Only after blind extraction is the Source compared with the current Model: confirms, contradicts, modifies or leaves intact.
5. Claims support bitemporal information: when something was valid and when MINDS learned it.
6. The Project Model changes only on an explicit trigger: new Source, Gari correction, time trigger, or deliberate re-read.
7. Human-authored/canonical project truth is never regenerated away.
8. Derived prose is a view over structured elements, not another source of truth.
9. Variants use the same element vocabulary and are compared as diffs; rejected variants remain historical evidence of a rejected path, not admissible current project context.

Acceptance must use Bernried material and real project contradictions, not synthetic MINDS-on-MINDS examples.

The acceptance is intentionally **not** run before Build 90. Gari will start loading the real Bernried corpus into Work / Desktop only after the Human Surface / Lenses redesign is complete. Builds 85–90 may proceed without treating this deferral as a Build 84 failure.

Do not add a temporary Chat-attachment → Work-Source bridge merely to force early acceptance. Conversation attachments and Work Sources remain distinct until a later governed promotion path is deliberately designed.

### Deliberately not accepted yet

“Living Matter / Asunto Vivo” remains a research hypothesis, not a production schema. Task, Expectation, Commitment and Mission may share a higher abstraction, but only after falsification shows that their distinct invariants are preserved.

---

## Build 85 — Exposure & Memory Provenance v0.1

Status: closed through Build 85.5.

Solve context contamination structurally rather than with prompt wording.

1. Conversation history becomes scope-aware by segment; one global chat channel must not make previous Bernried turns automatically condition unrelated personal reasoning.
2. Context assembly defaults to the active usable scope plus the global relationship/time layer.
3. Cross-scope context is admitted only for:
   - an explicit question requiring it;
   - a shared Referent allowed by usage scope;
   - an urgent anchor surfaced separately through Attention Economy.
4. Restricted usage scope is never opened by inferred relevance.
5. Retrieved memory is structurally marked and cannot be re-extracted as a new memory merely because it was recalled.
6. External/network tool output taints the relevant turn as external until a clean user boundary; it cannot silently become autobiographical memory.
7. Background/cron/Mission sessions cannot manufacture Claims about Gari.
8. Add lineage-aware forgetting so deleting/forgetting a source or session also invalidates its derived memory lineage without allowing re-ingestion loops.

This is where the useful OpenClaw patterns belong: provenance classes, recall-loop prevention, session gating and outside-memory-frontier mechanics. We do **not** adopt frequency-of-recall promotion or automatic self-learning.

---

## Build 86 — Watch / Prospective Memory v0.2

Status: closed and accepted on the no-provider production baseline. Any future autonomous provider requires provider-specific acceptance before runtime enablement.

Unify Standing Intents and real monitoring semantics without pretending that a reminder is observation.

A Watch exists only when:
1. its condition is defined;
2. a channel can reveal the change without Gari supplying it manually;
3. channel freshness is known and was actually checked;
4. a return rule is defined.

Coverage states:
- observed autonomously;
- observed through Gari;
- not observed.

If condition 2 fails, the system calls it a reminder, not monitoring.

Adopt a deterministic lifecycle inspired by the useful OpenClaw standing-intent mechanics:
`pending → armed → fired → done/cancelled/expired`,
with conservative cooldown, trigger and expiry bounds. Creation and cancellation remain explicit owner acts. Inferred future obligations may be proposed as Movements/Expectations but never silently promoted into a Watch.

---

## Build 87 — Review Economy v0.1

Status: active. 87.1 Review Debt Ledger, 87.2 compatible batching + deterministic proposal expiry, and 87.3 consequence/reversibility routing implemented; suppression/Human Surface remain.

Treat human judgment as a scarce resource.

The problem is not only interruption. As MINDS creates more hypotheses, claims, permissions, variants and memory proposals, explicit review can itself become coordination debt.

Goals:
- measure pending review debt;
- group compatible reviews;
- suppress low-value proposals before they reach Gari;
- allow proposals to expire instead of accumulating forever;
- distinguish irreversible/high-authority review from cheap reversible confirmation;
- route review through Attention Economy according to urgency and consequence;
- avoid “ceremonial approval” caused by too many prompts.

No automatic elevation of authority is allowed. Reducing review load must come from better proposal selection, reversibility and batching—not silent acceptance.

Self-Evaluation / Evolution remains behind this build because otherwise it would generate another review stream before review scalability is solved.

---

## Build 88 — Presence Reliability & Exact Decision Binding v0.2

Keep Presence as a thin projection of canonical MINDS, not another agent.

Adopt the useful Coucou patterns:
- Presence never sits on the critical execution path; if closed/crashed, MINDS work continues.
- Every reply/decision is bound to the exact request id **and revision** being answered; stale answers are rejected.
- Alerts queue and are shown one decision at a time.
- Pollers pause when no live state requires observation.
- Transport exposes the minimum state required for Presence.
- Attention Economy remains the only authority for whether/when ambient state becomes an interruption.

Do not copy Coucou’s character/assets or make Presence its own runtime.

---

## Build 89 — Model Independence & Cold Reconstruction Acceptance

Test, rather than merely assert, that Isabella is more than the currently selected model.

Two controlled experiments:
1. **Model swap:** hold canonical MINDS state, Relationship Contract, Project Model and conversation scope constant; run equivalent tasks through two model families and measure what behavior/understanding remains stable.
2. **Cold reconstruction:** rebuild a project Model from Sources with the current Model hidden, then compare the reconstructed Variant with the canonical one. Unexplained differences quantify accumulated model drift.

The goal is not to find the “best” model. It is to locate which parts of Isabella truly live in MINDS and which remain model-dependent.

---

## Build 90 — Human Surface / Lenses redesign

Only after the Project Model and Exposure rules are stable should the main desktop information architecture be redesigned.

The working hypothesis is not “one true surface”, but multiple lenses over one canonical world:
- **Ahora** = attention lens;
- **Calendar** = temporal lens;
- **Work** = project lens;
- **Readings** = research/reading lens;
- **Chat** = conversational lens.

Feed/Ideas should survive only if they have a distinct job after this reframing. Navigation is not allowed to freeze an immature ontology.

---

## External references: what is adopted and what is not

**OpenClaw:** adopt structural provenance, recall-loop prevention, session gates, deterministic standing intents and lineage-aware deletion patterns where they fit. Do not adopt automatic self-learning, memory promotion by repeated recall, or its architecture wholesale.

**Dots:** use its delegation/briefing pattern as evidence that a good handoff states what must remain true, what sources may be read, what deserves attention and what must not be done yet. Do not depend on Dots as a component.

**Coucou:** reuse fail-open Presence, exact decision binding, alert queues and idle polling principles. Do not copy product identity or create another Isabella.

**Graphiti/Hindsight/Beads/ambient-agent literature:** use bitemporal validity, evidence typing, explicit dependencies and intervention modes as design references only. They do not become new runtimes or autonomous truth sources.

## Constitutional constraints across all builds

Capability ≠ authority.
Skill ≠ permission.
Prediction ≠ permission.
Inference ≠ canonical fact.
Conversation ≠ confirmed project knowledge.
Artifact ≠ project truth.
External output ≠ autobiographical memory.
Absence of confirmation ≠ confirmation of absence.
No silent write-through.
No autonomous authority escalation.
No second Isabella.
No self-modification without explicit human review.

The product-level objective remains: **Gari can let go of something without losing it.**
