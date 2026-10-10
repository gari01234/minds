# Build 91 — Situational Review v0.1

## Why

An overdue reminder is not a review of whether a plan still makes sense. The authenticated 2026-10-10 example was a planned outdoor task with adverse local weather and diminishing daylight. The architectural requirement is general: reconsider the relationship between an open plan and new, grounded circumstances, without hardcoding activity-specific rules.

The initial investigation identified two gaps. First, `isabella-heartbeat` had been deployed with `verify_jwt=true`, but its scheduled request uses the custom `heartbeat_runner` secret and no Authorization header. HTTP 401 responses went unnoticed because pg_cron only recorded successful request submission. On 2026-10-10 the function was redeployed at v11 with `verify_jwt=false` (as already specified by `supabase/config.toml`), retaining its in-function secret check; a fresh successful run appeared in `minds_agent_runs`. Second, weather was separately generated for Situación and not part of Heartbeat's task review.

## New server operation

The existing 15-minute Heartbeat remains the sole temporal trigger. Every eligible invocation may call `runSituationalReview`. The bounded reviewer gathers open canonical tasks due within two days, upcoming calendar events, and weather only for a confirmed pre-existing weather locality. It runs during 08:00–20:59 local time and no more often than once per three hours, tracked as `minds_agent_runs.feature='situational_review'`. Empty task windows, repeated checks, unavailable contextual evidence or uncertain outcomes may produce **no message**.

A single bounded OpenAI evaluation may suggest at most one change in plan. It receives task, event, time and available weather context as evidence, not authority. A pure evidence gate checks the returned task ID, multiple actual evidence anchors, lengths, and contextual grounds for temporal urgency. The result is a suggestion, never an edited task, changed event, permission, memory claim or accepted rule. The returned text and evidence are tagged with `situational-review-v0.1` and canonical source IDs for provenance.

The existing `minds_publish_heartbeat` → `minds_publish_attention` → `minds_route_attention` chain owns publication, deduplication and delivery. A dedicated `situational_review` event type routes ordinary opportunities to ambient Situation and truly time-sensitive opportunities to Chat interrupt. Neither is a hard interruption: quiet hours and per-hour interruption budgets still apply. The same event fingerprint will not publish a duplicate message repeatedly. No new global autonomy score or custom notification router exists.

### Human Surface

A delivered review is a concise, conditional observation and a question about next steps. It cannot claim that a task was not done, that a weather observation applies away from the configured locality, or that a new date is definitely free. Approval or rejection of a proposed move must use the existing canonical task action and permission gates; proposal alone changes nothing.

### Empirical acceptance remaining

Unit and structural tests use synthetic fixtures to exercise non-effects and evidence gates. Those fixtures are not Bernried records. Production acceptance must check that Heartbeat runs after deployment, that a real task/weather overlap can produce a grounded proposal through Attention Economy, that no proposal is made when evidence is weak, that a real approval follows the existing canonical task-edit path, and that quiet hours, duplicate handling and device delivery behave as expected. Do not mark these scenario tests passed on the strength of CI alone.

## Deploy order

Merge the GitHub PR after Verify MINDS. Apply the Attention Economy SQL migration first, then deploy `isabella-heartbeat` from the merged source with `verify_jwt=false`, bundling the two new shared `.mjs` files and existing shared runtime dependencies. Verify runtime status/metadata and the next cron invocation; do not inject synthetic user tasks into production.

## 91.1 — evidence trace and false positive/negative baseline

The reviewer now classifies model abstention separately from rejected proposals and accepted evidence-bound suggestions. Each run records a minimal decision code, reviewed task reference, actual evidence anchors, number of candidate calendar dates and whether a checked alternative was selected. It does not store the model's private reasoning or full unrelated user inputs. The first acceptance suite covers stale/missing evidence, abstention and accepted material proposals. This is diagnostic transparency, not an external certification of model judgment.

## 91.2 — checked alternative dates

The model receives a bounded list of the next 14 dates with counts of **events starting** on each date in the currently recorded calendar. It may select a date, but the server checks membership and requires no recorded event starting that day before proposing it. The message explicitly states that this does **not** prove complete availability. There is no inferred duration, no timeslot reservation, no automatic event/task mutation and no cross-app calendar claims. Future acceptance should verify an actual approved task change via canonical edit tools.

## 91.3 — change-aware heartbeat evaluation

Keep the existing 15-minute Heartbeat as the only temporal detector, with no ungoverned background agent. Every eligible tick can compare canonical near-term task IDs, due dates, update revisions, forthcoming event IDs/times/revisions, local day-phase and weather transition (observed precipitation versus no observed precipitation). A stable source-state signature is compared with the last meaningful evaluation; the comparison does not infer a user's intent. Reviews remain on a three-hour periodic floor, but can run sooner when a source state actually changes, after a 30-minute debounce to limit inference cost. An unchanged state records a skipped evaluation and does not invoke the model. Weather is polled only after that debounce in the existing reviewed task window; the signature ignores mere observation timestamps. This is change-aware polling, not immediate push event handling, and exact weather transitions are not guaranteed to be caught within one tick.

No new notification channel, additional cron or autonomous approval path is introduced. Confirm responsiveness and provider freshness empirically after deploying.

## 91.4 — scoped Work relationships

The reviewer can now inspect a bounded set of open operational tasks in the same active project as reviewable task candidates. `work_scopes` includes only task IDs, title, due date, work status, priority and canonical project name; it does not ingest storage files or certify document-derived Project Model claims. If the model invokes `work` evidence, it must identify an actual second task ID from the **same project**, or the evidence gate rejects the proposal. Cross-project/task conflation and a made-up related ID are explicit negative acceptance fixtures. Inferred scheduling relations remain hypotheses for coordination, not documented dependencies. No write-through to Planner, Work or knowledge tables.
