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

`preferred_tools` is interpreted only as a hint. Each requested tool is classified through the existing runtime policy as allow / confirm / deny.

The normalized Skill contract always exposes:

`authority = inherits_runtime_policy`

`grants = []`

Unknown or denied tool names are returned as unavailable rather than becoming implicit capabilities.

## Composition

Isabella can load up to four complementary Skills in one turn.

Duplicate Skills do not consume additional composition slots.

Composition is procedural: the model receives multiple instructions and decides how to use existing tools. No specialist swarm or second planning runtime is created.

## Personal Skills

Personal Skills remain human-reviewed and versioned.

The legacy `isabella_skill_runs` table references system Skill slugs only. Build 81 therefore keeps that ledger for system Skills and records every system/personal Skill used in the parent `minds_agent_runs.metadata.skills` trace.

This fixes personal Skill loading without a schema migration and preserves historical system run data.

## Capability composition

When a Skill-guided turn starts `general_execution`, only a sanitized Skill trace crosses into the Capability Plane:

- slug;
- name;
- version;
- source.

The Capability Runtime sanitizes this trace again at its API boundary.

The trace is stored in the capability run, generated artifact metadata and completion message. Skill instructions are never written into those metadata fields.

Capability Runtime moves to `capability-runtime-v0.3.0` because the provenance contract changes; execution authority does not.

## Acceptance

Build 81 passes when:

1. a Skill with a confirm-only preferred tool still reports that tool as confirm;
2. a denied/unknown preferred tool is unavailable;
3. every normalized Skill has empty grants;
4. composition deduplicates and stops at four Skills;
5. personal Skills can load without writing to the system-only legacy Skill ledger;
6. system Skill usage remains backward-compatible with the legacy ledger;
7. parent agent runs record sanitized Skill/version provenance;
8. general execution, artifacts and completion messages inherit only the sanitized trace;
9. Build 79's single general runtime remains intact;
10. the existing Habilidades review/versioning UI remains intact.

## Deferred

Build 81 does not implement Persistent Work. A Skill can teach a multi-step procedure, but keeping an objective alive for hours or days belongs to Build 82.

Build 81 also does not add new plugins or local-computer authority.
