# MINDS Runtime Delegation — Phase 3: restart across processes

**Date:** 2026-10-18. **Base:** `eaaf8ee370ceb1bff6bd2f0d5eb202d548042ab7`. **Tracking:** [#166](https://github.com/gari01234/minds/issues/166).

## What this experiment actually tests

The real pinned `@openai/agents@0.20.0` Runner pauses on an approval-gated **synthetic read-only** function. A first independent Node process serializes its `RunState` and exits. A subsequent **different Node process** rehydrates `RunState` with newly instantiated agent/model/tool objects and resumes a fictional evidence read, only when a separately stored fictional review matches exactly the owner, scope, run, operation and current lease. A server-owned exclusive marker suppresses replay. Expiration and corruption are tested.

The test store is an isolated temporary filesystem directory owned by GitHub Actions and deleted after the test. It is not a Supabase table, a mission workspace, a provider session, a new production backend, or an authentication system.

**Outcomes that can be established by CI:** cross-process serialization and restoration of SDK state; no tool call before reviewed reactivation; fail-closed mismatch for owner/scope/operation/lease; expiry, missing approval and corrupted checkpoint rejection; sequential duplicate resume suppression without a second fictional read.

**Not established:** durable PostgreSQL persistence, RLS, a genuinely killed worker after an external side-effect, lease recycling/expiry takeover, concurrent distributed workers, exactly-once execution, approval in Isabella's UI, browser delivery, net reduction in owned orchestration code, or actual Work/Bernried provenance. The SHA-256 of serialized state is **only a corruption checksum**, not an authentication signature; safe use requires trusted server storage and a separate authenticated, approved MINDS receipt.

## Integration feasibility: SQL contract inspected in production (read-only)

Current `minds_mission_runs` already has `metadata jsonb`, `user_id`, `lease_token`, `lease_until`, `iteration`, and `status`. `minds_claim_mission_runs` assigns a four-minute lease under `FOR UPDATE SKIP LOCKED`. `minds_apply_mission_step_v2` requires `status='running'`, the exact token and a live lease, and updates the existing run and event log transactionally. `minds_resume_mission_run` requires `auth.uid()` and owner matching, while only accepting waiting/paused/failed states. Existing `minds_mission_runs` RLS is read-only for authenticated owners; worker writes happen through privileged RPC.

**Critical integration gap:** `minds_apply_mission_step_v2` currently does not accept a serialized Agents SDK checkpoint and cannot atomically bind one to a waiting state. A separate unconstrained `metadata` write would undermine the lease contract. Before a real pilot, implement a **minimal lease-fenced transactional checkpoint** on the existing mission row, with owner+scope+version+tool-policy bindings and a bounded server-only state payload, then validate its transaction path (stale token, changed ownership, replay, lease takeover) in an isolated SQL fixture. Do not create an independent sessions database. Do not put user-approved writes in this first SDK lane: use only owner-scoped read-only tools and preserve MINDS as sole mutation executor.

The existing managed Agents API adapter from Build 72.5 is not the self-hosted SDK. The production chat remains native Responses and unmodified.

## Measurable promotion gates

Before integrating the SDK, check that verified mission checkpoint persistence/restart works with authentic owner/lease/RLS; that source-lookup receipts retain their exact version and cover the requested source scope; that the result reaches Isabella after lost HTTP delivery; and that implementation replaces *more* maintained code and failure paths than it introduces. If the SDK adds another runtime without reducing net complexity, stop and keep Responses.

**No user corpus or paid model calls were used in this experiment.**
