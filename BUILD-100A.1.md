# Build 100A.1 — No phantom proposal after rejected action tools

**Date:** 2026-10-23. Base: `5952ca38e0771677856b55af78a52b68626439a3`. Related: [P0 #138](https://github.com/gari01234/minds/issues/138).

The server may invoke a confirmation-required tool and receive a failure to register a proposal (temporal evidence, review registration, policy, deduplication). The model's eventual text is not proof of a registered proposal. If *any* `policyMode(name)==="confirm"` tool was attempted and the final result contains **zero** canonical proposals, the response text is replaced by a deterministic non-success status. Only the tool call trace + canonical proposal array decide this. No Spanish/English/German lexical exceptions or inferred referents.

A separate bounded Node test drives the actual `applyVerifiedTaskUpdate` browser function against an in-memory Supabase interface, checking authenticated reviewed RPC → receipt → canonical owner read-back → UI update, and failure-closed cases (missing receipt, rejected transaction, stale/inconsistent read-back). **Synthetic harness only**, not authenticated browser E2E and not a production write.

**Observed baseline, seven days, read-only aggregate:** 28 `isabella_chat` runs; 26 completed, 3 generated proposals, informative answers median 5.035 s, p90 72.9556 s across 23 completed informational runs. Small sample; not a causal diagnosis. No message bodies inspected.

## Release gate

Full Node CI, Deno check, SQL fixture must pass; then deploy `isabella-chat` from the exact reviewed GitHub snapshot, preserving all 22 files and JWT settings. Verify Edge version and source equality. Not sufficient to close #138: real authenticated mobile/desktop multi-turn, visible review card and actual approved task update remain pending, along with a latency/context budget experiment. No fictional tasks may be written to canonical production.

The separate Railway/Docling credential rotation remains a security obligation.
