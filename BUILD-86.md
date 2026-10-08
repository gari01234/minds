# Build 86 — Watch / Prospective Memory v0.2

## Objective

Make MINDS precise about the difference between remembering to surface something and actually observing the world for change.

A **Reminder** returns when a conversational or temporal situation reappears. It does not claim MINDS watched an external channel.

A **Watch** exists only when all four conditions are true:
1. the condition is explicit;
2. a channel can reveal the change without Gari supplying it manually;
3. the channel has known freshness and was actually checked;
4. a return rule says what MINDS should do when the condition fires.

If the second condition is false, MINDS must call the behavior a Reminder, not monitoring.

## Coverage vocabulary

- `autonomous` — MINDS can check the channel without Gari.
- `via_user` — the signal can only arrive because Gari supplies/opens/uploads it.
- `unobserved` — MINDS has no channel for it.

`via_user` and `unobserved` never justify saying “estoy vigilando esto”.

## Lifecycle

`pending → armed → fired → done / cancelled / expired`

A repeating Reminder may re-arm after a recorded firing until `max_triggers` is reached. A Watch may only become `armed` after its channel contract has been verified.

## Build 86 sequence

### 86.1 — Prospective Memory constitution + deterministic Reminder lifecycle **Implemented**
- Generalize the existing standing-intent store without creating a second reminder database.
- Existing conversational Standing Intents become `mode=reminder`, `observation_mode=via_user`, `channel_kind=conversation`.
- Creation/cancellation become explicit reviewed RPC operations; direct authenticated writes are removed.
- Lifecycle moves from active/completed to pending/armed/fired/done/cancelled/expired.
- Delivery acknowledgement remains idempotent and records the firing before re-arming or finishing.

### 86.2 — Watch channel contracts **Implemented**
- Add a registry of observation channels with provider, observation mode, freshness capability and enabled state.
- A true Watch cannot be armed unless the named channel is autonomous and its freshness contract is valid.
- Unsupported monitoring requests must fail closed into an explicit `watch_unavailable` result; Isabella may then offer a Reminder instead.

Implementation note: 86.2 deliberately registers **no fake provider**. The channel registry and arming contract exist, and Isabella can inspect them through `check_watch_capability`; until an actual autonomous source is connected and service-verified, true Watch creation fails closed instead of pretending that conversational recall is monitoring.

### 86.3 — Heartbeat observation + return routing **Implemented as governed runner; no autonomous adapter enabled yet**
- Heartbeat checks armed Watches only through their declared channel adapter.
- Each check records checked_at, freshness, result fingerprint and evidence/provenance.
- A condition firing publishes through Attention Economy; the watcher never decides interruption by itself.
- Silence is qualified by coverage and last successful check.

Implementation note: Heartbeat now has the complete receipt → condition → Attention Economy → lifecycle-finalization path. The runtime adapter registry is intentionally empty and Watch channels default to `runtime_supported=false`; therefore production cannot accidentally arm or execute a fake Watch. A future provider must ship both its adapter code and a service-verified channel contract before any Watch can run.

### 86.4 — Human Surface **Implemented**
- “Memoria futura” distinguishes Reminder from Watch.
- Each Watch says what it observes, when it was last checked, and whether coverage is autonomous / via Gari / unavailable.
- Cancellation is always explicit.

### 86.5 — Acceptance
- conversational Reminder fires deterministically, obeys cooldown/max count, and never claims monitoring;
- unsupported external Watch is rejected as monitoring and can only become a Reminder by explicit user review;
- an armed Watch cannot exist without a valid autonomous channel + freshness;
- Watch firing goes through Attention Economy;
- failed/stale channel check cannot produce calm-looking silence;
- cancellation and expiry are deterministic and auditable.

## Non-goals

No generic web monitoring loop in this build unless a bounded channel contract is explicitly implemented.
No inference-created Watches.
No silent conversion of Expectations into Watches.
No new authority from observing a condition.
No background model deciding that a Watch no longer matters.