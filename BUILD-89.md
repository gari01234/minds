# Build 89 — Model Independence & Cold Reconstruction Acceptance

## Objective

Replace the architectural claim “Isabella is not a model” with measured evidence.

Build 89 does not ask which model is smarter. It asks which parts of Isabella remain stable when the replaceable reasoning model changes while MINDS state, governance, relationship contract and input evidence remain fixed.

## Experimental rules

1. The two models receive the same frozen input snapshot and the same Relationship Contract.
2. Neither model receives additional authority, memory or write tools during the experiment.
3. Invariant scoring is deterministic. A third model does not grade the models.
4. Free prose may differ without counting as identity drift. Governance decisions, epistemic status, scope discipline and temporal semantics must remain stable.
5. Experiment outputs are observations, never Personal Operating Rules, permissions or project truth.
6. The experiment ledger is append-only from the user surface; service-side runners may complete queued controlled experiments.
7. The current production model is not privileged in scoring.

## Build 89 sequence

### 89.1 — Frozen experiment ledger **Implemented**
- Store experiment kind, model pair, exact input snapshot, Relationship Contract version/hash and input hash.
- Preserve both outputs, deterministic metrics and failures.
- Runs are read-only to authenticated clients and writable only by the controlled runner.

### 89.2 — Model swap probe **Implemented; first production run completed and failed the hard acceptance threshold**
- Run the same constitutional/relational cases through GPT-5.6 Luna and GPT-6 Astra.
- Score exact structured decisions for authority, uncertainty, scope, temporal state and relationship boundaries.
- Record cross-model agreement separately from correctness against the fixed contract.
- Do not score stylistic wording as identity.

## Observed model-swap result

The first production model-swap run is preserved as evidence rather than tuned away.

Run `c819ad54-c18c-49b8-a834-f47bbfddf3f4` completed on 2026-10-09 with the frozen `model-swap-v0.1` fixture:
- GPT-5.6 Luna passed 6/11 exact contract cases.
- GPT-6 Astra passed 5/11 exact contract cases.
- Cross-model field agreement was 48/55 = 87.27%.
- `both_preserve_all_hard_invariants=false`.

This means the strong claim “all tested Isabella constitutional behavior already lives outside the replaceable model” is **not supported by this first probe**. The result is not repaired by changing expected answers after seeing outputs. Build 89.3 proceeds independently so the final report can separate model-dependent judgment, fixture ambiguity and structurally governed behavior.

### 89.3 — Cold reconstruction **Implemented; production run completed and exact structural gate failed**
- Give each model the same bounded Source fixture with the current Project Model hidden.
- Reconstruct Claims/relations/Movements into a Variant-shaped output.
- Compare each reconstruction to deterministic fixture expectations and to each other.
- This is a structural experiment, not the deferred real Bernried Work-source acceptance from Build 84.6.

### 89.4 — Independence report **Implemented — see BUILD-89-REPORT.md**
- Separate stable MINDS-governed behavior from model-dependent judgment/style.
- Identify any invariant that changes across models.
- Do not compensate for a failed invariant by tuning the evaluator after seeing the output.

### 89.5 — Acceptance **ACCEPTED after additive remediation — 2026-10-09**
Build 89 originally failed its frozen v0.1 probes. Those runs remain immutable evidence and are not reclassified as passes.

Acceptance is based on the strengthened architecture introduced after those failures:
- `model-swap-v0.2` moves already-structured constitutional state into the deterministic Constitutional State Adapter before either replaceable model runs;
- `cold-reconstruction-v0.3` evaluates hard provenance/authority/ownership/temporal boundaries after deterministic canonicalization of semantically symmetric `contradicts` relations;
- interpretive prose, optional evidence bundles and non-authoritative relation packaging remain allowed to differ between models.

Production acceptance evidence:
- model swap v0.2 — run `fca47745-05e2-42c9-a58d-3dc54c3ef088`: Luna 11/11, Astra 11/11, raw model agreement 100%, `both_system_preserve_all_hard_invariants=true`;
- cold reconstruction v0.2 — run `97ef9ba0-128d-4aac-8f64-569e08e72ca3`: Astra passed; Luna failed only the directional representation of the symmetric contradiction relation;
- cold reconstruction v0.3 — run `7479eb06-8249-4872-a1f2-4d12d6d29c1f`: both models passed all hard boundaries, `both_preserve_all_hard_boundaries=true`.

The accepted claim is deliberately narrower than “the models behave identically.” MINDS now demonstrates that durable constitutional state, authority boundaries, provenance requirements, ownership and temporal constraints can remain stable across the tested replaceable models. Open-ended judgment, evidence selection and explanatory style remain model-dependent.

### 89.R1 — Constitutional State Adapter **Implemented**
Move already-canonical MINDS state out of free prose classification and expose it as deterministic constitutional input to the replaceable model.

The adapter derives epistemic status, authority ceiling, scope action, relationship boundary and required uncertainty from structured MINDS state. A replaceable model may still suggest different labels or prose, but the constitutional fields can be overwritten deterministically and deviations remain observable. Detection of the structured input signal itself may still be model-dependent when no canonical state exists; this slice does not pretend otherwise.

### 89.R2 — Predeclared v0.2 rerun **Implemented; production model-swap v0.2 passed, cold v0.2 exposed one representation instability**

### 89.R3 — Symmetric relation canonicalization **Implemented; production cold v0.3 passed**
The v0.2 cold probe preserved all hard boundaries except Luna reversed the direction of the `contradicts` relation. Because contradiction is semantically symmetric, Build 89 does not treat model-chosen orientation as authority. A deterministic representation layer now canonicalizes only symmetric `contradicts` pairs to stable key order before hard-boundary evaluation. Directional relations such as `supports`, `supersedes`, `depends_on` and `qualifies` are not normalized.

The failed v0.2 run remains unchanged in the ledger. v0.3 is a new fixture version testing the new representation layer.

Production v0.3 acceptance run `7479eb06-8249-4872-a1f2-4d12d6d29c1f` passed all hard boundaries for both Luna and Astra. Exact interpretive agreement remained low (20%), which is retained as evidence that interpretation is still model-dependent even when constitutional behavior is stable.

Freeze hard-vs-interpretive dimensions before execution, rerun Luna/Astra against the strengthened architecture, preserve v0.1 unchanged, and only then reconsider 89.5.

The v0.2 model-swap fixture contains structured MINDS state rather than prose-only implied state. The Constitutional State Adapter derives the hard envelope before either model runs; raw model deviations remain measured, while final constitutional fields are server-enforced. The cold-reconstruction v0.2 probe separately gates provenance, uncertainty, ownership, anchors and authority while leaving optional evidence bundles and non-authoritative packaging as interpretive differences.

## Non-goals

No automatic model selection.
No ranking leaderboard.
No self-modifying prompt.
No new user-facing agent persona.
No promotion of experimental output into memory or Project Model.
No claim that a controlled fixture substitutes for the post-Build-90 Bernried source acceptance.