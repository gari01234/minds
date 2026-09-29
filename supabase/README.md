# MINDS backend — Build 57

Production is project `lodexwyyynlarkqgkyhy`. The browser uses a publishable/anon key and the user's session. OpenAI and service-role credentials remain in Edge Function secrets; none belongs in this repository.

`functions/` now contains the source of all 11 production functions. The four updated functions are Isabella Chat, Sofía Chat, heartbeat and the routine runner. Their shared modules are in `functions/_shared/`; deploy these dependencies with each function. Chat and Sofía require JWT verification. The two scheduled workers retain their existing custom secret checks, with JWT verification disabled for pg_net requests.

`migrations/` contains the exported schema history and the two new applied migrations, with the real Supabase version timestamps. Personal seed/import/repair migrations have deliberately not been exported: a schema restore must not publish or recreate an individual's private data. The migrations create the same structural dependencies used by these functions. `schema.sql` is an obsolete v0.1 reference; do not apply it to production. `cognitive_architecture_v2.sql` is historical documentation, not the migration source.

For a fresh Supabase environment, apply the numbered migrations in order using the Supabase CLI, then configure secrets and Auth redirect URLs for that environment. The two historical cron migrations contain this production project's URL; change the destination before enabling cron in any other environment. Production has routine checks every minute and heartbeat checks every 15 minutes. Database tests below were run against production inside a rolled-back transaction; a clean-environment replay has not been claimed as tested.

## Deployment

Use `supabase functions deploy <name>` with `supabase/config.toml`. Deploy the SQL migrations before the corresponding function code. Coordinate changes to `claim_due_isabella_routines` with the runner by temporarily pausing its cron job; always restore the prior enabled state after deployment. Do not redeploy the seven unchanged functions merely because their source is now versioned.

The routines use `minds_routine_deliveries` as an outbox. Each scheduled occurrence has a stable identity. Generation is saved separately from delivery; message insertion, routine completion and delivered state commit together. Crashes leave a lease that can be reclaimed. Failures retry up to five times with backoff. Inspect `minds_agent_runs.metadata.phase` and the outbox for delivery diagnosis. “Delivered” means stored in the user's chat, not proof of a push notification or that the user read it.

Conversation leases prevent simultaneous appends and one-time context migration from racing. Heartbeat copies all old OpenAI conversation items while removing only MINDS-injected trailing JSON context blocks. It checks item count and the source tail before switching. The original OpenAI conversation remains in the archive metadata, and Supabase raw messages remain intact. Transient context thereafter lives in request instructions, not persistent user messages. No model, intelligence ceiling or compaction threshold was reduced.

## Verification

Run `node --test tests/*.test.mjs` with Node 24 and `node scripts/build.mjs`. Behavioral tests exercise actual proposal handlers and server functions with controlled dependencies. They cover cancellation, editing, duplicate clicks, errors, recall routing, lossless checkpoint batches, specialist tool continuation, context cleanup and truthful Doctor state.

Run `supabase/tests/cognitive_integrity.sql` after migrations in a transaction-capable SQL client. It creates two isolated auth fixtures and rolls everything back. It checks source ownership, failed evidence rollback, confirmation, claim and skill idempotency, skill versions, contiguous message cursors with tied timestamps, tenant isolation, function grants, leases, intent counts, heartbeat escalation/dismissal and routine delivery.

The SQL tests never send email, make model calls or leave example rows behind. A live authenticated chat and an actual future 07:45 delivery require separate observation; deployment success alone is not that evidence.
