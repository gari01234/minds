# Build 100A.5 — Turn-level performance attribution

Date: 24 Oct 2026. Scope: the outstanding performance/context acceptance of P0 #138, after real physical approval, cancel, one-save and review-sync tests passed.

## Read-only baseline (last 14 days, as of 24 Oct)

Supabase `minds_agent_runs`, successful `isabella_chat`: n=69 p50 7.192s, p90 31.200s, max 115.380s (mixed historical routes; not a controlled comparison).
For explicitly classified, successful turns: lean n=19 p50 4.116s / p90 9.741s; full n=12 p50 14.542s / p90 77.813s; calendar_fast n=4 p50 5.582s / p90 6.796s. Caveat: different tasks, varying complexity, small samples.
`minds_ai_usage` last 14 days by **provider call**: `calendar_fast` n=8 p50 5,144 input tokens; `lean` n=23 p50 22,950; `full` n=44 p50 164,712 and p90 269,074. These are per provider invocation, not total cost per owner turn: earlier usage records lack an agent_run_id. Multi-round calls inflate per-turn cost.
Measured `prompt_components` full-tier median `context_chars` approximately 353,333, tools ~37,615 and instructions ~47,821. In recent full first-round calls `routed_work_context` averaged 178,518 chars and peaked at 263,888 chars. Full project context is a major contributor, but is also legitimate evidence for some Work tasks. **Do not blindly truncate** or imply that the 14-day input-token median reflects the current calendar path.

## Implementation (read-only telemetry)

1. Attach canonical `agent_run_id` to each `isabella_chat` and `isabella_background` provider usage record (and the direct stream completion usage), enabling exact future `minds_ai_usage` → `minds_agent_runs` joins by owner/turn, with multi-round totals.
2. Add numeric-only `context_signal` under existing prompt_components, with a **non-enforcing** provisional footprint envelope for calendar_fast and lean and a Work prefetch outlier flag. Record dominant section **name and character count only**; no excerpts, prompt text, file content or new user profile attributes.
3. Protect typed route, authorized tools, work evidence, RLS, budgets, prompts and direct stream behavior. No schema migration, new RPC or extra permissions.
4. Regression tests confirm envelope classification, lack of content, absence of a new execution gate, and correct presence of trace IDs.

## Remaining exit criterion

A single real successful update and cancellation establish **action integrity**, not a p90 latency SLO. We cannot prove production cost/latency improvement without new matched post-deploy owner-turn data, and no unapproved SLO should be invented. After deployment collect enough comparable `calendar_fast` and `lean` turns, use agent_run_id for total turn tokens, compare latency and choose a human-reviewed acceptance threshold. Until then P0 #138 stays open for budget/performance acceptance; source-first Work expansion is a separate, source-preserving candidate, not silently authorized here.

Independent Railway/Docling credential rotation is not part of this performance change.
