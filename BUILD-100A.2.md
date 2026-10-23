# Build 100A.2 — Verified review acknowledgement and recovery

Confirmed real-iPhone acceptance on 23 Oct 2026: user clicked Confirmar; Supabase has exactly one task dated 2026-10-27, an immutable update_task receipt (before.date=2026-10-25, after.date=2026-10-27), and shadow_decisions.status=accepted. Screenshot still shows model's earlier “Aún falta tu confirmación” and review button. **DB PASS; UI acknowledgement FAIL.** The screenshot does not prove whether the client round-trip had finished.

Resolved review bubbles now render a deterministic, verified/cancelled outcome instead of old pending prose. If the browser loses an acknowledgement, a read-only check at startup, reentering Chat or resuming visibility verifies owner-scoped receipt AND accepted decision AND current canonical title/date/updated_at, then resolves the review locally without rerunning the write RPC. Invalid/missing/stale evidence fails closed. RLS and existing privileges apply. No Supabase changes. Physical iPhone re-test after PWA refresh required before closing P0 #138.

Manual task creation double button remains a separate outstanding Build 100 UX gate.
