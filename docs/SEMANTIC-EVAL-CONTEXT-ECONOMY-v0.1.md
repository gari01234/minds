# MINDS #138 — Semantic Evaluation & Context Economy v0.1

## Problem measured in production

The 14 October 2026 authenticated natural Schwarz calendar create has an accepted owner-reviewed shadow decision, direct-create receipt and matching canonical event: this is actual action integrity evidence. The first turn nevertheless asked for clarification about a date, hour and duration already present. After that event, three light conversational responses took 6.1s, 4.4s and 3.9s while spending 46,736, 46,166 and 44,200 **uncached** input tokens, respectively. Those responses used zero tools and `bounded_scoped` history. A small conversation window alone is insufficient to bound the other prompt components.

## Changes

A **typed lean context tier** activates only when the existing route says light, general, non-work, non-Sofía, with no attachment, no weather/schedule assessment, no background, no thread, and no fast calendar mutation. It does not recognize intents via language keywords. The tier uses a concise general conversation instruction set, while preserving full already-bounded canonical today/tomorrow/overdue/upcoming agenda snapshots, current owner exposure scope, relevant memory, reply context, durable preferences and the current relationship policy. It does not force heavy Work/specialist/workspace/epistemic material into every short general turn. The existing **full governed tool list** and `ACTION_POLICY` remain unchanged: a lightweight context must not weaken action safety or suppress legitimate tools. Explicit Work and non-light turns stay on the existing full context.

Per-run and per-model-call telemetry records `context_tier` and **numeric-only** `prompt_components` (instruction chars, context chars, input chars, tool schema chars, tool count). It does not copy private texts into the telemetry. These fields are a measurement instrument, not a token estimator substitute; usage numbers from the provider remain definitive.

The clarification tool and fast calendar instructions explicitly distinguish missing attributes/real contradictions from an unnecessary reconfirmation of complete date/time/duration/title. Permission and shadow decision paths are unchanged. Whether the model actually follows the rule requires real model evaluation.

## Real-model semantic evaluation

`scripts/eval-calendar-semantics.mjs` is a **read-only** Node runner against the OpenAI Responses API. It extracts the production `fastCalendarInstructions` and calendar tool schemas from the checked-out server source so the benchmark does not silently test an unrelated invented API. It contains synthetic Spanish/German/English paraphrases, a relative morning date, a task create, incomplete references and an inconsistent weekday. Each case expects either a grounded structured tool call or an explicit clarification. Results include only case ID, pass/failure reason, observed tool name, latency, input/output tokens. It uses the same `verifyCalendarSemanticProposal` and `validatedCalendarClock` as the server. The runner never imports a Supabase client or creates any user object.

Run schema-only validation with `node scripts/eval-calendar-semantics.mjs --dry-run`. To execute the actual model evaluation, use an explicitly configured `OPENAI_API_KEY` in an approved environment and `node scripts/eval-calendar-semantics.mjs --output semantic-eval-results.json`. **Do not claim real-model evaluation occurred if only dry-run/CI ran.** No runtime secret is queried or printed. Gate model results on complete-request action correctness and no redundant clarification, ambiguous/inconsistent request abstention, grounded date/time and reported token/time costs. Do not publish raw owner conversation excerpts; fixtures are synthetic.

## Acceptance

Node and Deno CI, deploy function v105 with JWT preserved, observe a few real general-chat traces for instruction/context/tool footprint and provider input tokens. Confirm no relevant agenda/memory access regression, source honesty and no accidental autonomous action. Compare measured token usage to 44–47k historical uncached baseline; if tool schema dominates, design a capability-expansion lane **after** real evidence rather than masking permissions or breaking fallback. A one-off success does not establish p95; continue monitoring.

The calendar action #138 remains open for real-model interpretive accuracy and parity of other action types. #113/Docling stays next after core reliability acceptance.
