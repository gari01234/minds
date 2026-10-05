# Build 82 — Persistent Work / Dot-like Continuations v0.1

Date: 5 October 2026.

## Objective

Let Gari delegate an objective once and let Isabella keep advancing it for hours or days without requiring an open chat session.

Example:

“Encárgate de preparar Bernried para la reunión del jueves.”

The intended human surface is not a technical Mission graph. It is:

“Estoy preparando Bernried para el jueves.”
“Estoy esperando una respuesta; no necesitas hacer nada ahora.”
“Necesito que decidas una cosa antes de poder seguir.”
“He terminado.”

## Reconciliation

Build 82 does not create a new persistent-work table or agent.

The existing architecture already contained the right spine:

- minds_commitments;
- minds_commitment_workspaces;
- minds_mission_runs;
- Mission Runner;
- Capability Runtime;
- Expectations;
- Attention Economy;
- Presence.

Before Build 82 Mission Runs were durable but short-lived: they could only continue immediately, wait for Gari, finish or fail.

Build 82 adds recoverable temporal/dependency waiting and material delegation to that existing spine.

## State machine

Mission Run adds:

status = waiting

with:

wait_kind = time | capability | expectation
wait_ref
wake_at

waiting is an internal dependency state and does not require user action.

The old paused state remains user-controlled and the two historical paused production runs are not reactivated by this build.

## Reactivation

minds_reactivate_mission_waits runs before each Mission Runner claim.

Time wakes when wake_at is reached.

Capability wakes when the subordinate run becomes completed, failed or cancelled.

Expectation wakes only after reviewed terminal truth: fulfilled, not_occurred or cancelled.

due_unconfirmed is deliberately non-terminal.

## One-confirmation delegation

propose_commitment gains persistent_work fields.

When Gari explicitly delegates ongoing work, the same reviewed proposal creates the Commitment and then starts its Workspace + Mission.

No second “start Mission” approval is required for internal work.

The proposal carries a stable mission_request_id for idempotency.

## Skills

If the conversational turn loaded Skills before proposing Persistent Work, only the sanitized Build 81 trace is persisted:

slug, name, version, source.

The Mission and any subordinate Capability Run inherit that trace.

Skill instructions never become permissions.

## Material work

Mission Runner may request one material_request per checkpoint.

The host creates the existing general_execution Capability Run with origin_kind=mission.

The subordinate run is surface_hidden and delivery=mission_parent.

Capability Runner completes it without posting its own final message.

The Mission later wakes and receives capability status, summary and generated artifact metadata as dependency context.

## Human Surface

Human Surface adds a waiting state.

Expectation:
“Estoy esperando que ocurra algo antes de seguir. No necesitas hacer nada ahora.”

Material capability:
“Estoy preparando una parte de este trabajo. No necesitas hacer nada ahora.”

Time:
“Esto sigue en marcha. Lo retomaré en el momento previsto.”

## Presence 0.1.5

Presence queries active Mission Runs in addition to Attention and visible Capability Runs.

Subordinate surface_hidden capabilities are filtered.

queued/running can surface the compact island.
waiting remains available on manual open without creating a persistent interruption.

## PWA

Because Build 82 changes Commitment confirmation and Continuity, the PWA advances to Build 2026.10.05.82.

app.js -> v87
shell.js -> v83
Human Surface -> v2
Service Worker -> isabella-shell-v93

## Acceptance

Build 82 passes when:

1. “encárgate de…” produces one reviewable persistent-work Commitment proposal;
2. one confirmation creates Commitment + Workspace + Mission;
3. waiting has no user action requirement;
4. due_unconfirmed never wakes a mission;
5. an existing resolved Expectation can wake it;
6. a Mission can create one bounded general_execution run and wait for it;
7. the subordinate capability does not produce a separate chat delivery or Presence card;
8. failed/cancelled subordinate material wakes the Mission so it can recover or ask Gari;
9. generated artifacts remain non-authoritative;
10. Persistent Work never gains external side-effect authority;
11. Presence projects the parent objective;
12. all historical paused runs remain paused;
13. Verify MINDS, native Presence builds and Windows NSIS packaging remain green.
