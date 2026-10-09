# Build 88 — Presence Reliability & Exact Decision Binding v0.2

## Objective

Keep Presence thin, fail-open and subordinate to canonical MINDS while making every decision response target an exact still-live request.

Presence is a projection, not another runtime. Closing or crashing it must never stop Missions, Capability Runs, Attention Economy or canonical state transitions.

## Constitutional rules

1. A Presence answer to a decision is valid only for the exact Attention request revision the user saw.
2. Stale answers fail closed before model reasoning or Mission resume.
3. Presence never owns authority, memory, personality, permissions or Attention policy.
4. Multiple pending alerts are queued and surfaced one at a time; queue order never changes authority.
5. Polling is demand-driven: no live observed state means no busy loop.
6. Presence transport exposes only the minimum canonical fields required to render or answer the current state.
7. Presence failure is fail-open for MINDS execution and fail-closed for stale human decisions.

## Build 88 sequence

### 88.1 — Exact decision binding **Implemented**
- Add a monotonic revision to decision-bearing Attention events.
- Presence carries attention_id + request_revision in reply_context.
- isabella-chat validates the binding server-side before model reasoning.
- A stale/missing/resolved request returns a structured stale-decision response; it cannot resume a Mission or apply another decision.

### 88.2 — Alert queue **Implemented**
- Canonical pending interrupt events are ordered deterministically.
- Presence displays one decision card at a time and keeps the rest as a count/queue.
- Resolving or invalidating the head advances to the next live request.

### 88.3 — Fail-open lifecycle + idle polling **Implemented**
- Presence process/window is never on the critical execution path.
- The 15-second active poll loop stops when there is no live run, pending attention, open chat panel or active task surface. Because desktop Presence has no Realtime/push wake channel yet, an idle 120-second discovery probe remains so new server state is not missed.
- Reopening Presence resynchronizes from canonical state rather than trusting local cache.

### 88.4 — Minimum-exposure transport **Implemented**
- Reduce Presence queries and reply payloads to the canonical fields required by the active view.
- Do not ship hidden project/memory context to Presence merely because MINDS knows it.
- Keep canonical conversation and agenda shared with web MINDS.

### 88.5 — Acceptance
- stale decision answer rejected before reasoning;
- exact revision accepted;
- two alerts queue and advance one-by-one;
- closing Presence does not stop background work;
- idle Presence stops unnecessary polling and resumes cleanly;
- no independent Presence authority/runtime/memory appears.