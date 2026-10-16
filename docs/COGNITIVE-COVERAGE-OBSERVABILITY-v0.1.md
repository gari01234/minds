# MINDS cognitive coverage observability v0.1 — code-only PR

Relates to #113 (Knowledge Coverage) and #138 (conversational latency). Base: main `19042157db39b6b7e084faabe1312620304580f8`. This change is **instrumentation only**: it does not change retrieval limits, routing, evidence contents, model instructions, model tools, prompts, actions, permissions, document index or the Supabase schema.

## What is measured

The existing `prompt_components` (numeric instruction/context/input/tool chars) gains `context_sections`: per top-level field of the **already-resolved** context object, only `chars` and, for arrays, `items`. This measures serialized component size; it does not assert relevance, duplication, or independent meaning, and the total token count from the provider remains authoritative.

On normal Isabella function-tool turns the owner-scoped `minds_agent_runs.metadata.source_admission` gets a bounded list of **admissions**, distinct from answer citations:

- `routed_work`: versioned document segments that the automatic Work route actually loaded. The admission callback sees source rows before excerpt projection, so it can record the stable `file_id`, `source_version`, `segment_no`, numeric `page`, and `page_verified` without adding new text to Isabella's context.
- `tool_search_work`: the same source identity for explicit `search_work` calls.
- `read_work_file`: explicit raw-original consultation outcome and file ID. Source version is intentionally `null` because the current file-reading tool does not return a separately authenticated source-version receipt.
- `consult_sofia`: route/tool consultation outcome, **not** a claim that any specific Reading passage was recovered.
- `search_memory`: counts of scope-governed lexical, semantic and entity candidates; full autobiographical provenance remains with the existing `minds_exposure_receipts`.

Nothing in the admission trace proves that the model read, attended to, reasoned about, or cited a passage; separate authoritative evidence-use/citation receipts remain needed. Explicitly differentiate `loaded`, `consulted`, `used` and `verified` when reviewing QA. No source names, raw passages, user questions, memory contents, tool outputs, arguments, embeddings or original prompt text are logged by this addition.

## Safety conditions

Supabase `minds_agent_runs` and `minds_ai_usage` already have `user_id` and RLS enabled (production read-only verification, 2026-10-16). This instrumentation uses their existing user-authenticated insert/update paths. No service-role access or cross-owner lookup added. Observe access-policy parity after deployment; RLS enabled does not itself constitute a complete security audit.

Helpers have deterministic Node tests under `tests/*.test.mjs`, automatically discovered by the existing `Verify MINDS` workflow. Deno checks `isabella-chat/index.ts` as before. The telemetry callback is optional and catch-isolated so observability failure cannot change project search results.

## Non-covered paths / gaps

The present version instruments the normal non-streaming function-tool response path. Provider direct-stream and durable background delivery have separate code paths and do not yet record this full source admission trace. Failures occurring before normal completion may not persist admissions. This is a **partial trace**, not universal knowledge observability. Do not interpret `sources=[]` or missing rows as evidence no knowledge exists. The required future experiment is an authenticated E2E Work turn proving that a specific current source version and segment are present in `source_admission` and that the answer's claimed citation is validated against the original.

## Post-merge acceptance gate (not performed by CI)

First perform CI and code review (no production changes yet). Then deploy `isabella-chat` to the existing Supabase project using the current safe JWT/runtime deployment procedure, without touching Railway/Docling or indexing. Run one natural authenticated question about the already known Bernried Kick-off document and a second about an old/outside-recent Claim; compare `minds_agent_runs.metadata.source_admission` against the SQL current-version source segments and model usage, and verify unchanged answer semantics. Continue Work/Readings cross-lane tests and documented access boundaries. Preserve #113 and #138 as **OPEN** until broader authenticated acceptance.

This PR is **implemented on a branch**, and can only be called **fusionado**, **desplegado**, **probado en producción** or **aceptado** after the corresponding steps actually occur.
