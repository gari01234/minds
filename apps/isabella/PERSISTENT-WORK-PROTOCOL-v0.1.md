# Persistent Work Protocol v0.1

Build 82 turns the existing Commitment + Mission spine into a durable continuation layer.

## Contract

Persistent Work is not a second agent and not a new job system.

A user-reviewed Commitment is the durable objective.
Its Commitment Workspace is operational working memory.
A Mission Run is the process that advances that objective.
Skills teach procedures.
Capability Runtime produces bounded material outputs.
Expectations represent user-reviewed future facts of the world.
Attention Economy decides when the result deserves Gari's attention.

## Human trigger

A phrase such as “encárgate de preparar Bernried para la reunión del jueves” is treated differently from “recuerda esto”.

When Gari explicitly delegates ongoing work beyond the current turn, Isabella proposes one Commitment with persistent_work=true.

One human confirmation may create:

Commitment → Workspace → Persistent Work.

No second confirmation is required merely to start internal work.

External or consequential actions still use their normal approval policies.

## Durable waits

A Mission Run may enter status waiting without asking Gari to act.

Supported waits:

- time: an exact bounded future moment;
- capability: one subordinate general_execution run;
- expectation: one existing, user-reviewed Expectation.

waiting is not waiting_for_user.

waiting means the next useful step depends on something else and Gari does not need to do anything now.

waiting_for_user means a decision, private input or approval is genuinely required.

## Expectations

Persistent Work can wait on an existing active/due_unconfirmed Expectation.

It never creates an Expectation silently.

An Expectation becoming due_unconfirmed does not wake the mission and does not prove non-occurrence.

The mission wakes only after a reviewed terminal state:

- fulfilled;
- not_occurred;
- cancelled.

## Material delegation

A Mission may request one bounded material deliverable from general_execution.

The resulting Capability Run uses:

origin_kind = mission
delivery = mission_parent
surface_hidden = true

It inherits only sanitized Skill provenance and the Persistent Work identity trace.

It gains no new authority.

Capability Runner stores its artifacts but does not deliver a separate chat message or Presence card. The parent Mission wakes, inspects the result and decides the next checkpoint.

Generated artifact ≠ project truth.

## Limits

Persistent Work remains bounded.

Each run has a maximum of 32 checkpoints.
Time waits must be more than 15 seconds in the future and no more than 90 days away.
Existing retry limits remain bounded.
Invalid dependencies fail closed into waiting_for_user rather than silently guessing.

## Attention

Waiting remains silent.

Only terminal or user-blocking mission states are candidates for proactive Attention:

- completed;
- waiting_for_user;
- failed.

Attention Economy remains authoritative for interrupt / briefing / ambient / silent.

## Presence

Presence projects the parent objective, not its machinery.

queued/running may reveal the compact island.
waiting is visible when Isabella is opened manually but does not keep the island awake.
Subordinate capability runs marked surface_hidden never become separate Presence cards.

## Invariants

Persistent Work cannot:
- create external side effects by itself;
- promote generated artifacts to project truth;
- create Expectations silently;
- bypass Skills/tool permissions;
- auto-modify Isabella;
- create a second personality or runtime authority layer.
