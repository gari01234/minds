# Cognitive Integrity Protocol v0.1

Status: working contract for the next MINDS architecture phase. This document does not rename existing product surfaces or migrate production data.

## Why this exists

The Bernried corpus exposed a class of failures that authority gates alone do not catch: MINDS can be calm, internally consistent and still wrong because the wrong source was retrieved, a contradiction was omitted, an inferred personal hypothesis conditioned Isabella, or a future dependency silently disappeared.

The product goal is stronger than memory. Gari must be able to stop actively holding a matter without losing it. That requires not only durable state but trustworthy exposure: what Isabella sees, what Gari sees, what remains hidden, and what MINDS can actually observe.

## Four invariants

1. **Authority does not travel.** Status, authority or acceptance never transfers automatically across versions, layers, successor objects, generated summaries or repeated exposure.
2. **Influence leaves a trace.** Outputs should be reconstructable to the sources, accepted rules, project scope, procedures and relevant model inputs that conditioned them.
3. **No output exceeds its basis.** A claim, deliverable or silence must not look more complete or certain than its evidentiary and observational coverage.
4. **Anchors return in time.** A deadline, counterparty dependency or explicitly accepted watch cannot disappear through inactivity, grouping, ranking or unrelated project activity.

## Immediate hardening in this PR

Unreviewed rows in `isabella_model_claims` are no longer injected into Isabella's conversational context. Hypotheses may still exist as inspectable stored objects, but only `confirmed` claims can condition normal conversation. This closes the self-confirming loop where an inferred hypothesis could change Isabella's behavior and then generate evidence compatible with itself.

This is intentionally narrower than the future Project Model refactor. It removes a known unsafe exposure channel without migrating the current memory ontology.

## Bernried as acceptance corpus

`tests/fixtures/bernried-cognitive-integrity-v01.json` contains 20 real cases derived from the same material Gari uses to run the project: Völker's Umsetzungskonzeption, the TBA Fragenkatalog, the July/September/October presentations, the Fachplaner kick-off, the contract addendum and the LPH3 Terminplan.

The corpus is not project truth stored inside MINDS. It is an acceptance fixture. A future architecture passes only if it can represent the cases without flattening source authority, losing open dependencies, inventing certainty or requiring Gari to manually reconstruct the project state.

## Structural direction under test

The current working hypothesis remains a bounded structural refactor rather than a clean slate:

- Project stays central as the place where sources, claims, concerns, rules and project understanding compose.
- A governed Project Model may persist organizing inferences, but it cannot create facts by summarizing them.
- Retrieval should begin from project structure and explicit relationships before similarity adds optional context.
- Exposure must distinguish epistemic status, admissibility, salience and coverage.
- Perimeter/coverage must say what MINDS can observe, how fresh it is, and whether the source arrives automatically or only through Gari.
- Concerns/movements remain candidates for unifying task, expectation and persistent-work semantics, but no schema merge happens until the Bernried corpus demonstrates no semantic loss.

## External references

Patterns from OpenClaw, Dots, Coucou, Graphiti, Hindsight, Beads and ambient-agent systems are treated as design evidence, not as authority. Candidates worth testing include source-class provenance, explicit standing-intent lifecycles, bitemporal validity, lineage-aware forgetting, exact request/version binding in Presence, and read-only proactive research. None should be imported if MINDS already has a stricter invariant or if the pattern increases hidden authority.

## Entry condition for the structural refactor

Do not begin a Claim/Concern/Exposure/Perimeter data migration until the acceptance corpus can be mapped on paper and in tests without losing the current distinctions that already work: `due_unconfirmed`, `waiting` vs `waiting_for_user`, contextual permission validation, artifact intake provenance, canonical state with multiple projections, and bounded Capability Runtime.
