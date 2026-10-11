# MINDS — Knowledge Coverage Acceptance

**North Star:** [Issue #113](https://github.com/gari01234/minds/issues/113). It remains open until real-world acceptance, not merely implementation. The objective is to reuse proven open-source technologies and the existing MINDS source-first architecture so Isabella can reliably know and connect information from every supported MINDS surface, without asking for it again.

## Starting evidence (11 October 2026)

Work/Desktop contains 28 registered original files (23 PDFs, 3 PNG, 2 XLSX), all `index_status=stored`, and no `minds_project_source_ingestions`. Upload stores objects and rows, but does **not** call `analyzeProjectSource`. Claims and Project Model already exist; do not create a second truth store. Some PDFs exceed the existing 20 MiB extractor cap, and architectural drawings need format-specific coverage.

## Phase gates

**A: Intake reliability.** Every *new* Desktop upload creates a durable queue receipt under RLS. Original bytes and metadata remain canonical. `queued` is not `indexed`. Worker may only mark `indexed` after successful source-first commit; expose errors faithfully. Existing files require a controlled, reversible backfill after worker acceptance.

**B: Extraction.** Prefer open-source Docling Serve for page/table/structure conversion where a secured reachable instance is configured; do not transmit private plans to an unverified third-party endpoint. Use bounded existing provider document extraction only where needed. Preserve source SHA-256, source version, excerpts and locators, and only `proposed` claims until human review. Never invent claims from unreadable drawings.

**C: Retrieval.** Chat search across Work/Readings/Time/Situación and conversations must produce exact-source answers without the user having to name a section. Prove coverage, correct abstention and content references with real documents, not a synthetic fixture alone.

**D: Evolution.** Reprocess changed sources without duplicate canon; compare claims, track contradictions and updates. Consider CocoIndex only after measuring incremental need beyond the existing queue. Consider graph engines only if current relation model demonstrably fails.

**E: Initiative.** Server-side changes trigger bounded, evidence-backed reviews and attention-governed useful proposals. No synthetic engagement or permission escalation.

## Exit criteria

Use real Bernried documents and Readings/annotations, verify factual multi-document questions, conflicting versions, cross-surface retrieval, actual iPhone background behavior and notifications, and no silent hallucinated project truth. Record what failed, what shipped, what was verified, and remaining limitations for each stage. The ambition persists until empirically met or explicitly reconsidered by the user.
