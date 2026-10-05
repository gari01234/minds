# Build 81 — Skills & Capability Composition v0.1

Date: 5 October 2026.

## Objective

Formalize Skills as the procedural layer between Isabella's reasoning and MINDS tools without creating new authority, another agent runtime, or one-off feature handlers.

Architectural contract:

> Models reason. Tools act. Skills teach. Plugins extend. MINDS governs.

## Reconciliation

Build 81 does not introduce a second Skill system.

MINDS already had an early Skill implementation:

- system catalog in `isabella_skills`;
- repository `SKILL.md` mirrors;
- `load_skill` in `isabella-chat`;
- reviewed personal Skills in `minds_user_skills`;
- personal Skill proposals and version history;
- a Habilidades UI;
- historical system Skill usage.

Build 81 preserves that work and hardens the missing boundaries.

## Skill contract

A Skill is a versioned, inspectable procedure.

It is not:

- a capability;
- an agent;
- a permission;
- a runtime;
- a source of project truth.

`preferred_tools` is advisory metadata only. Every requested tool is resolved through the real runtime action policy as `allow`, `confirm` or `deny`.

The normalized Skill contract always exposes:

`authority = inherits_runtime_policy`

`grants = []`

Unknown or denied tool names are returned as unavailable. A Skill cannot turn `confirm` into `allow`, create contextual permission, bypass provenance, promote project truth or override the Relationship Contract.

## Composition

Isabella can load up to four materially complementary Skills in one turn.

Duplicate loads are deduplicated.

Composition remains procedural: the model receives multiple compatible procedures and then calls the same existing tools. No Skill executor, specialist swarm, second planner or agent graph is created.

## System and personal Skills

System Skills remain in `isabella_skills` and are mirrored in the repository.

Personal Skills remain human-reviewed, user-scoped and versioned through the existing proposal flow in `minds_user_skills` / `minds_user_skill_versions`.

A reviewed personal Skill can override a system Skill with the same slug for Gari, but it cannot change runtime authority.

Build 81 evolves the existing `isabella_skill_runs` ledger instead of creating a second run table. The old FK to `isabella_skills(slug)` is removed because an audit record must survive catalog changes and must also support personal Skills. Each load now records:

- slug;
- version;
- source: `system | personal`;
- Skill name snapshot;
- conversation;
- trigger message.

Existing historical rows are preserved and backfilled as system Skills.

## Capability composition

When a Skill-guided turn starts `general_execution`, only a sanitized Skill trace crosses into the Capability Plane:

- slug;
- name;
- version;
- source.

Instructions and preferred tool lists are deliberately excluded.

The Capability Runtime sanitizes the trace again at its API boundary and stores it in:

- `minds_capability_runs.metadata.skill_trace`;
- generated artifact metadata;
- completion message metadata;
- capability usage provenance.

Capability Runtime advances to `capability-runtime-v0.3.0` because the provenance contract changes. Execution authority does not.

Generated artifact ≠ project truth, regardless of which Skill guided the work.

## Acceptance Skill — preparar-reunion v2

`preparar-reunion` is upgraded to v2 as the first explicit Build 81 acceptance workflow.

It can combine, when materially necessary:

- canonical agenda;
- structured Work state;
- Work Threads;
- specific project files;
- commitments;
- general artifact execution;
- reviewed task proposals.

The Skill explicitly preserves Build 78 provenance rules: a Thread is conversation, not confirmed project knowledge; a generated artifact is a deliverable, not project truth.

If the goal requires an agenda, Teilnehmerliste, protocol, tracking table or similar usable object, the Skill points Isabella to the existing `execute_artifact_task` runtime rather than creating a format-specific capability.

During reconciliation Build 81 also fixes a pre-existing omission: `search_work_threads` already existed as a read-only tool and dispatch path but was missing from `ACTION_POLICY`. It is restored as `allow`, consistent with Build 78.

## Acceptance

Build 81 passes when:

1. a Skill with a confirm-only preferred tool still reports that tool as confirm;
2. a denied/unknown preferred tool is unavailable;
3. every normalized Skill has empty grants;
4. composition deduplicates and stops at four Skills;
5. system and personal Skill loads are written to one durable audit ledger;
6. deleting or replacing a Skill cannot cascade-delete its historical run evidence;
7. parent agent runs record sanitized Skill/version provenance;
8. general execution, artifacts, completion messages and usage provenance inherit only the sanitized trace;
9. `preparar-reunion` v2 can reference Work Threads and general execution without gaining authority;
10. Build 79's single general material runtime remains intact;
11. the existing Habilidades review/versioning UI remains intact;
12. Verify MINDS remains green.

## Deferred

Build 81 does not implement Persistent Work. A Skill can teach a multi-step procedure, but keeping an objective alive for hours or days belongs to Build 82.

Build 81 also does not add plugins, local-computer authority, provider write-through or autonomous Skill self-modification.
