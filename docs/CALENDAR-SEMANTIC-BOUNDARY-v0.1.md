# Calendar Semantic Boundary · v0.1

## Decision

MINDS accepts natural language through Isabella's model-led semantic interpretation. Deterministic components do **not** reinterpret that language with dictionaries, regular expressions or synonym lists to decide what a calendar operation means. They verify factual consistency, owner provenance, permissions and persistence. The source of truth for tasks and events remains Supabase.

This separates three stages:

**Interpretation (model):** The model identifies the requested operation, target, dates, times, duration, project and any genuine uncertainty. It calls the same governed calendar tools with a typed `temporal_grounding` when a date is proposed. This may be a relative temporal meaning (`mode: relative`, integer `offset_days`) or absolute (`mode: absolute`). A literal `source_excerpt` must come from the current owner request or the server-verified original turn of a pending clarification; `weekday` is supplied only if the owner explicitly named a day of the week. The model must not invent missing data. The fast-lane lexical hint can affect latency only, not authorization or correctness. No additional mandatory model pass is introduced.

**Verification (deterministic):** The server checks the quoted span against the canonical owner turn, validates ISO calendar dates and clock/duration ranges, checks the weekday when supplied, derives relative date offsets from the server's local day rather than the model's guessed date, and rejects mutually inconsistent typed claims. No language regex is permitted at this stage. Unverifiable evidence produces `calendar_semantic_grounding_required` or `calendar_structural_validation_failed` for a tool retry or clarification, with **no** registered action. Validated semantic basis and source quote are attached to the shadow decision context.

**Authorization and execution (existing contracts):** The reviewed/direct distinction does not change. Direct creation still requires explicit owner authority, current opt-in, exact original quote evidence and an admitted shadow decision, and only creates tasks and eligible one-off events. Updates and deletions are reviewed. SQL transactions, RLS/owner checks, immutable idempotent receipts and canonical row read-back remain mandatory. Tool output or model prose is never evidence of a completed write.

## What changed

Removed the main runtime's `guardCalendarProposal()` lexical date override and the one-off `prepareContextualCalendarCorrection()` special path. Both could reinterpret correct model proposals from raw phrases or bypass the normal tool-capable contract. Kept `isSimpleAgendaMutation()` strictly as an optional latency hint. Migrated contextual corrections to the same scoped, tool-capable, review-first model interaction. Deleted unused lexical correction utility.

## What this **does not** prove

Literal source provenance proves that the model used owner text, **not** that its semantic interpretation is infallible. A model might still misunderstand a phrase while producing internally consistent structured data. The remaining protections are an explicit uncertainty/clarification path, typed temporal consistency, user review for high-impact actions, transactional receipts and the reversible direct-create setting. Do not claim that CI paraphrase tests demonstrate model accuracy; they exercise verification for supplied semantic interpretations. Real multi-phrase model evaluations and authenticated create/update/clarification acceptance are separate gates.

## Acceptance and telemetry

CI must pass Node, Deno type checking, Deno tests and published PWA checks. Representative semantic parity tests include paraphrases in Spanish, German and English, mixed-domain terminology, relative dates across DST/leap boundaries, unsupported evidence, contradictory weekday, missing dates, invalid time/duration, undated tasks and contextual corrections. Production canary must check original owner turn, proposal outcome, shadow-decision temporal basis, authorized action receipts and canonical row read-back, plus request latency and token counts. A correct synthetic test or published bundle alone is not an end-to-end acceptance.

Future capability areas should reuse this separation: semantic understanding is not a permission grant, source evidence is not a fact assertion, and a proposed tool call is not a completed write.
