# Isabella Skills

Reusable, versioned procedures for Isabella.

## Contract

MINDS uses the following separation:

- **Tool** — something Isabella can do.
- **Skill** — instructions for how to approach a reusable procedure.
- **Plugin** — a connected runtime or external integration that extends what tools can exist.

A Skill is not an agent, model, permission, capability grant or authority boundary.

The invariant is:

> Skills teach. Tools act. MINDS governs.

## Runtime

Isabella discovers the enabled Skill catalog from Supabase and loads full instructions on demand through `load_skill`.

Every loaded Skill is normalized through `_shared/skill-registry.ts`.

`preferred_tools` is advisory metadata only. At load time every preferred tool is resolved against the real runtime action policy:

- `allow` — the tool may be called under its existing runtime rules;
- `confirm` — the tool still requires the existing user-confirmation path;
- `deny` — the tool is reported as unavailable to the Skill.

A Skill can never transform `confirm` into `allow`, create a permission, bypass provenance, promote project truth, or override the Relationship Contract.

The normalized contract therefore always has:

`authority = inherits_runtime_policy`

and:

`grants = []`

## Composition

A turn may load up to four materially complementary Skills. Duplicate loads are deduplicated.

Composition means the model receives multiple compatible procedures; it does not create a new agent graph or multi-agent runtime.

## Provenance

A loaded Skill produces a sanitized trace containing only:

- slug;
- name;
- version;
- source (`system` or `personal`).

Instructions and preferred tool lists are deliberately excluded from execution provenance.

The parent `minds_agent_run` records the Skill trace. If the turn creates a material deliverable, `general_execution`, the resulting `minds_capability_run`, generated artifacts and completion message inherit that trace.

Generated artifact ≠ project truth, regardless of which Skill guided it.

## Sources of truth

System Skills live in `isabella_skills` and are mirrored in this directory as `SKILL.md` files so procedures stay inspectable and portable.

Personal Skills live in `minds_user_skills`. They are created or revised only through the existing human-review proposal flow and keep version history in `minds_user_skill_versions`.

A personal Skill may override a system Skill with the same slug for Gari, but it does not change runtime authority.

## Repository mirror

Each system Skill has its own directory and `SKILL.md` manifest following the Agent Skills convention.

These files are documentation/version-control mirrors of the runtime catalog. The conceptual format can be adapted to other agent runtimes without changing the MINDS authority model.
