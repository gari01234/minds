# Build 84 — Project Model & Evidence Constitution v0.1

## Objective

Give Isabella a persistent, inspectable way to understand a project without turning her interpretation into project truth.

This build does not replace Tasks, Expectations, Commitments or Missions. It adds a governed cognitive layer over the canonical project state.

## Constitutional model

### Source
A Source is something that entered MINDS independently of Isabella's interpretation: a Work file, Thread message or other explicit source record. Source is represented as a projection over canonical records, not by copying generated summaries into a second truth store.

### Referent
A Referent is the stable identity of what claims are about: a person, organization, building element, room, system, document, decision, meeting, phase or workstream. Referent identity may be inferred, so merge/alias provenance is preserved.

### Claim
Work Claims remain the proposition layer. Build 84 adds:
- `referent_id`
- `author_kind`
- `model_kind`
- `learned_at`

`valid_from/valid_to` describe when the proposition was valid in the project world; `learned_at` describes when MINDS learned it.

### Relation
Claims can explicitly support, contradict, supersede, depend on, qualify or identify the same subject as other Claims. Relation itself has status, confidence, author and provenance.

### Movement
Movement is a read-only envelope over existing state machines:
- Task → Gari
- Expectation → world
- Commitment → Isabella
- Mission → Isabella

The underlying entities keep their current lifecycle and authority rules.

### Perimeter
Perimeter records what source classes MINDS can observe for a project, whether they arrive autonomously or through Gari, whether they are readable, how complete they are, and how fresh that observation is.

### Project Model revision
A Project Model revision is a versioned interpretation. It changes only on an explicit trigger:
- new Source
- Gari correction
- time
- deliberate reread
- manual review

A current revision is unique per project. Model elements point to canonical objects by reference; the Model does not copy them into prose and call the copy truth.

## Safety

New Project Model tables are user-readable but not directly user/agent writable. Service-side processes may construct revisions later. User decisions continue to pass through existing reviewed paths.

Isabella-authored model elements remain interpretation unless separately promoted through the existing claim review regime.

## Runtime integration

`search_work` now also loads `minds_project_model_snapshot(project_id)`.

The snapshot returns:
- current revision
- Referents
- Claims
- claim relations
- Movements
- Perimeter

The tool contract explicitly tells Isabella that her own Model is interpretation, not canonical project truth.

### 84.3 comparison pass

Only after a Source has completed the blind 84.2 extraction may Isabella compare its sourced Claims with the current project Claim baseline.

The comparison pass:
- fingerprints the whole visible baseline so a changed baseline produces a new comparison receipt;
- selects a bounded comparison window, preferring shared Referents and relevant terms;
- records coverage and whether that window was truncated;
- classifies each sourced Claim as `aligned`, `contradicts`, `modifies`, `adds` or `unclear`;
- creates only `proposed` Claim relations for aligned / contradiction / modification;
- never changes Claim status, authority, supersession or the current Project Model revision;
- uses `aligned` rather than “confirmed” deliberately: evidential agreement is not human confirmation.

A repeated comparison against the same baseline fingerprint is idempotent. Re-comparison after the baseline changes creates a new receipt without rereading or rewriting the Source extraction.

### 84.4 triggered revisions

A completed Source comparison now becomes an explicit Project Model revision trigger. The writer:
- creates at most one revision per comparison receipt;
- snapshots current Perimeter coverage;
- projects current Referents, Claims, Claim relations and open Movements by reference rather than copying prose;
- maps Claim/Relation authority into model roles without changing the underlying authority;
- preserves open Movements across unrelated Source updates;
- records uncertain comparison findings and unobserved/illegible Perimeter as gaps;
- records contradictions and modifications as open Variants instead of deciding which Claim wins;
- supersedes only the prior Project Model revision, never a canonical Claim, Task, Expectation, Commitment or Mission;
- is idempotent under retries via a trigger key.

This slice implements the Source trigger. The schema already reserves the same revision machinery for user correction, time, deliberate reread and manual triggers; those writers should reuse this path rather than create another Project Model state machine.

## Build 84 sequence

84.1 — Evidence schema + read-only Project Model snapshot. **Implemented.**  
84.2 — Source-first document extraction and Referent resolution. **Implemented for Work files; creates only proposed sourced Claims and working Referents.**  
84.3 — Model comparison: aligned / contradicts / modifies / adds / unclear. **Implemented.**  
84.4 — Triggered revision writer + Variants. **Implemented for Source-comparison triggers.**  
84.5 — Work inspection surface: what Isabella thinks, why and coverage. **Implemented in Work / Conocimiento.**  
84.6 — Bernried acceptance against the real 20-case corpus.

## Acceptance rules

Build 84 is not accepted until Bernried demonstrates:

- old confirmed information cannot mask a later contradiction;
- a Source can remain authoritative without becoming a finished design decision;
- open Movements survive unrelated activity;
- Isabella can explain what she inferred versus what was accepted;
- Perimeter makes missing email / Fachplaner / document channels visible;
- a second visit with no new trigger does not silently reorganize the Project Model;
- at least one useful dependency, risk or next movement is derived that is not a trivial restatement of a stored row;
- maintaining the model does not create more manual classification work for Gari.

## Explicit non-goals

No automatic promotion of inferred Claims.
No schema merge of Task / Expectation / Commitment / Mission.
No new top-level navigation.
No auto-learning personal hypotheses.
No rewrite of Presence.
No AI-generated prose as project truth.
