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

## Build 84 sequence

84.1 — Evidence schema + read-only Project Model snapshot.  
84.2 — Source-first document extraction and Referent resolution.  
84.3 — Model comparison: confirm / contradict / modify / unchanged.  
84.4 — Triggered revision writer + Variants.  
84.5 — Work inspection surface: what Isabella thinks, why, coverage, change since last revision.  
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
