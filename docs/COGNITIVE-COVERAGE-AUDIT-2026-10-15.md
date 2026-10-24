# MINDS — Cognitive Coverage Audit & Reusable Retrieval Patterns · 2026-10-15

Status: **READ-ONLY AUDIT / DESIGN EVIDENCE**, not a deployed feature, not an acceptance of Knowledge Coverage (#113) or conversational integrity (#138).
Base: `gari01234/minds` main `19042157db39b6b7e084faabe1312620304580f8`. Data snapshot: production Supabase `lodexwyyynlarkqgkyhy`; SQL and source inspections were SELECT/read-only. Do not publish raw private document contents, user memory or OAuth tokens in evaluation fixtures or telemetry.

## Architectural invariant agreed with the owner

**Context economy must never become knowledge economy.** It is legitimate to change how much context is placed *simultaneously* into a model request only if it remains possible, through permissioned and evidence-grounded recovery, to discover, expand, compare and cite the entire accessible knowledge corpus, including old or seemingly weakly relevant material and unexpected relations. Optimizing speed, tokens or engagement must not silently shrink that frontier.

A bigger prompt is **not** equivalent to broader epistemic coverage. Conversely, a selective prompt plus top-k retrieval is not equivalent to an open-ended evidence search. Both the discovery path and the full-source expansion path need to be tested independently. Preserve original text, source_version, page/row locators, authorship, status, owner/RLS isolation, timestamps and disagreements; do not turn provisional Claims or AI hypotheses into accepted facts.

The owner particularly values MINDS recognizing useful connections across Work, Lecturas, older conversation, annotations, and developing theory *without requiring the owner to name the relation in advance*. This is a goal and a future acceptance property, **not** a proven current capability.

## Actual production baseline (October 15, no writes)

Bernried has **28 Work originals**, **24 current-version text receipts**, **154 current-version source segments**, and **392,220 characters of extracted segment text**. Of those receipts, **21 report `partial_text`**, three `complete_text`. The 154 source segments comprise **101 `page_text` and 49 `unpaged_text`**; coverage labels do not certify understanding of figures, diagrams or image-only pages. Never substitute the indexed flag or a Claim count for complete source coverage.

There are **401 Work Claims**, **401 source-evidence records**, all **`proposed`**, none approved; **372 distinct normalized statements** by the audited simple whitespace/case normalization test. These are extracted proposals, not confirmed project truth. Their underlying documents remain independently authoritative as *documents*, not automatically as approved decisions. 181/401 Claims are older than the first 220 most recently updated, and 221/401 are older than the first 180 most recently updated. Overlap is expected because both slices use a newest-first baseline. Those older claims are persistent but **not guaranteed to appear in the initial prompt**, and no proven exhaustive fallback exists for all queries.

On the observed Bernried question about a technical rooftop surface, live source segments with verified locators reproduced the correct answer at two separate original pages. The real Isabella answer was factually correct, but the run recorded `work_consulted=true`, `metadata.tools=[]` and the persisted assistant message had `metadata.sources=[]` and `citations=[]`. Thus the answer's exact source admission path was **not machine-traceable** on that turn. This is not evidence for an explicit `search_work` call or reliable citation provenance.

Prompt-economy evidence (very small sample of successful authenticated turns with footprint telemetry, not p95): 2 Work/full turns averaged **347,095 serialized context characters** and **18,234 ms**; 2 non-Work/lean turns averaged **24,518 context characters** and **4,318 ms**; 1 calendar fast turn used **6,346 context characters**. A single correct Work turn had **141,756 provider input tokens (0 cached)**, **365,305 dynamic-context characters**, **47,167 instruction characters**, **36,018 tool-schema characters / 48 tools**, ~6,028 ms. These measurements establish size, **not which characters were dispensable** or that prompt size caused measured latency.

Current `isabella_embeddings` inventory: **59 records** (36 conversation, 23 memory; no Work source segment embedding there). `pgvector` and `pg_trgm` extensions already exist in Supabase; this is not evidence of an active indexed hybrid Work retrieval pipeline. Readings and theory live elsewhere in the same product; do not infer absence of intellectual source knowledge from the zero annotation rows on the current schema snapshot.

## Static code findings at the audited HEAD

`supabase/functions/isabella-chat/index.ts`:
- In the routed Work path, `searchWork` starts from at most the newest **180** project Claims before relevance filtering; it returns at most **30** matched. It separately queries a Project Model snapshot.
- `minds_project_model_snapshot` selects at most **220** newest Claims. Its selected 220-Claim serialization measured ~**140,700 characters** by itself. Claims may overlap with `searchWork` output. Do not assume all 401 are available to a given turn or count double representations as independent evidence.
- The automatically routed source-segment query asks `minds_search_work_source_segments` for **12** results; mapped source excerpts are truncated to **1,600 characters per segment**. The SQL function is restricted to current file `source_version` and authenticated owner, but ranking is principally literal word overlap / filename matching and the returned window is bounded.
- Work preload depends on routed project (`route.project`). Sofía/Readings preload depends separately on `route.sofia`. Initial semantic autobiographical recall is enabled on `route.deep_memory`. Therefore automatic **cross-domain associative retrieval is not established**, even though individual tools for Work, Readings and personal memory exist.
- `leanConversationEligible` explicitly excludes Work or Sofía from the lean tier and retains the governed full tool list. Do not turn this audit into a blind rule to trim Work context, suppress tools, or weaken privacy.
- `minds_exposure_receipts` records memory-recall admission, but the tested Work turn did not persist a corresponding fine-grained current-file/segment citation trace.

A read-only approximation of the source-term matching stage returned **8 candidates for a German literal label** but **0 for three natural Spanish/English paraphrases of the same technical referent**. This is a **diagnostic probe**, not an end-to-end retrieval quality score: filename-based matches and other Work sources may still recover the answer. It demonstrates a concrete cross-language risk that a successful exact-word test can hide.

### Readings/Sofía retrieval audit (same HEAD)

A separate static inspection of `supabase/functions/sofia-chat/index.ts` confirms that the intellectual lane has a real but **independently bounded and mostly lexical** `theorySearch` path. It initially fetches up to 80 Reading documents, 160 document annotations, 60 living theory threads, 120 thread versions and 120 mind annotations. Document relevance is computed from title/author/content tokens, with only **6** ranked documents sent onward as excerpts; only **7** ranked theory threads and **12** ranked document annotations make the candidate window. A snapshot of titles is sent before the search. An explicit `search_theory_memory` tool can be called later, but there is no proven automatic cross-lane associative walk from arbitrary Work Claims to Readings and back.

The production inventory currently includes **16 `documents` and 7 `mind_threads`**. Those totals are not completeness evidence for full Readings, not an independently tested answer outcome, and not a license to assume the user has no relevant notes. Sofía keeps an explicit exegesis firewall and a separate intellectual memory; retain those governance boundaries. Include this lexical limit and cross-lane recall in future owner-reviewed fixtures.

## External implementations and what to reuse (not vendor adoption)

**Anthropic — Contextual Retrieval (Sep 2024).** Contextualized chunks before indexing, hybrid contextual embeddings + contextual BM25, optional reranking. Anthropic reports on its own evaluation a **49%** relative reduction in failed top-20 retrievals for hybrid contextual retrieval, **67%** with reranking. These are published vendor experiment results, **not predicted MINDS gains**. Reusable idea: store a short document-specific contextual header for search without replacing the original, mix exact and semantic retrieval, and rerank *before* evidence injection. https://www.anthropic.com/engineering/contextual-retrieval

**pgvector and PostgreSQL.** Already installed `vector`/`pg_trgm` permit testing full-text/trigram + vector retrieval with reciprocal-rank fusion, under existing owner/RLS and source-version rules; no new database is required. It is an option to evaluate, not an approved schema migration or new embedding pipeline. https://github.com/pgvector/pgvector#hybrid-search

**Microsoft GraphRAG.** Separates *local* entity-neighbor search, *global* corpus-theme questions and DRIFT exploration, with links to original text units. This matches the requirement to discover a relationship the question did not explicitly name. Do not deploy full GraphRAG (community generation, separate indexing/storage, opaque AI-generated edges) before a simpler shadow test justifies it; candidate relations must remain attributed hypotheses. https://github.com/microsoft/graphrag and https://microsoft.github.io/graphrag/

**HippoRAG 2 (research code).** Adds associative/multi-hop retrieval and sense-making while explicitly evaluating preservation of simple factual recall. Authors report improved associative tasks on their benchmarks; results and costs must be independently reproduced on MINDS fixtures. Reusable idea: multi-hop candidate expansion from source-backed entities with old and weakly related sources still discoverable. https://github.com/OSU-NLP-Group/HippoRAG and https://arxiv.org/abs/2502.14802

**Zep/Graphiti (open-source reference).** Uses episode-to-fact provenance, bidirectional/bi-temporal validity and hybrid keyword/vector/graph traversal. Reusable concepts: keep event time distinct from learned time, retain superseded versions instead of deleting historical facts, and trace inferred relations to episodes. Do not replace MINDS' existing versioned Claims / human-review governance with autonomous graph acceptance. https://github.com/getzep/graphiti and https://arxiv.org/abs/2501.13956

**Letta / MemGPT.** Separates focused in-context memory from durable archival/recall memory, including search tools and an inspectable memory hierarchy. Useful as a contrast: MINDS' ability to retrieve and explain dormant knowledge is more important than aggressive core-memory compression. Do not adopt a second agent runtime or an automatic self-editing memory authority. https://docs.letta.com/ and https://www.letta.com/blog/introducing-the-agent-development-environment/

**Glean (product pattern).** Permission-mirrored connectors, retrieval across heterogeneous sources and source-backed answers. Reusable rule: source access controls and freshness must travel with search results, not be inferred from model language. Their product documentation is not an independent evaluation of coverage. https://docs.glean.com/connectors/about and https://docs.glean.com/user-guide/assistant/how-glean-accesses-info

**Ragas / independent evaluation.** Separate context recall, context precision, faithfulness, and factual correctness. Each answers a different question: whether relevant source evidence was retrieved, whether irrelevant material dominates, and whether conclusions are supported. These metrics require reliable reference answers/documents; model-judge scores alone cannot establish acceptance. https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/

**Liu et al., _Lost in the Middle_ (TACL 2024).** Peer-reviewed experiments show that even long-context models can use information less reliably when the critical evidence appears mid-context. Strong reason not to equate very large prompts with higher discovery, and to test evidence placement. https://aclanthology.org/2024.tacl-1.9/

## Baseline-first acceptance suite (design; not yet executed as an end-to-end suite)

Build **an owner-reviewed, ground-truth corpus of 28 cases**, with canonical expected `source_id`, `source_version`, page/row locator and the actual *supporting original excerpt* kept within authorized private storage, not committed to GitHub. Provisional mix: six exact factual cases, four cross-lingual/paraphrase cases, four multi-document synthesis cases, four version/temporal contradiction cases, three deliberately old/outside-recency Claims, three unreadable/unknown-source abstention cases, and four *unprompted, evidence-based cross-domain* (Work + Readings + conversation) associations. Evaluate one case only when necessary sources are actually present and independently verified. Do not invent an answer key to satisfy the test.

For each actual authenticated Isabella run distinguish:
1. **Admission/access**: Did permissions and scopes allow the relevant documents and memories? Was an older or other-domain source in the admissible search universe?
2. **Discovery/retrieval**: Which versioned `source_id` and `segment_no/locator` were retrieved or injected, at what stage? Did a paraphrase or second search expand the candidate set?
3. **Evidence/use**: Were all necessary original passages made available *and used accurately*, including contradictions, absent support, provenance and review statuses?
4. **Response**: Was the answer factually correct, source-cited and epistemically appropriate? Was the relation genuinely discovered, or named in the question/preloaded context?
5. **Cost**: latency, token input and cache, calls, and footprint by context component — **only after** the previous four.

No question is accepted solely because Isabella states a correct figure. A manually cited page without a source admission receipt is **answer correctness**, not independently demonstrated retrieval provenance. A genuine unknown relation cannot be benchmarked with a prompt that already tells the model the relation.

## Execution stages and gates

**Stage A — Baseline and trace only (next).** Do not change model context or production retrieval. Add privacy-preserving read-side measurement of the prompt context by top-level component (chars only), separately from provider tokens. Establish a source-admission trace that differentiates initial Work preload, explicit tool retrieval, Sofía consultation, memory recall and model/claim inference. Keep this metadata under owner-scoped Supabase; never log private passages in general logs. Create the private 28-case ground truth with independent owners/source review and run the current production baseline first. If practical, start with 8–10 verifiable cases and extend to the 28-case suite after confirming instrumentation.

**Stage B — Controlled shadow discovery.** Only after Stage A measurements, compare current lexical Work matching against a **permission- and version-filtered hybrid candidate pool** (full-text/trigram + semantic retrieval where secure embeddings are approved), with expansion across document titles, source-backed referents, old Claims and linked passages. Candidate graph/temporal traversal is a second experiment, not a new source of accepted project facts. Run new candidates in a **no-answer-effect shadow lane**; store only traceable source IDs and numeric scores under authorization.

**Stage C — Human acceptance.** Compare recall@K against the independently annotated gold set; specifically protect old-source, cross-language, cross-domain, multi-hop, contradiction and abstention strata. No evidence of permission bypass, no admitted stale original, no silent source loss. Define targets only *after* measuring baseline variance and annotator uncertainty. For meaningful exploratory turns, allow deliberate wider expansion; never hard-code a single top-k as a ceiling on potential knowledge discovery.

**Stage D — Prompt economy last.** Only when source-discovery and original-expansion are proven may we remove duplicated *representations*, not original knowledge. A/B compare the exact evidence identities made available and found, including evidence in the middle of prompts, and roll back on regression. Do not optimize solely for the two already answered Bernried questions.

## Explicit non-goals / safety boundaries

No production runtime change, PR merge, cron, new paid service, new third-party data export, or approval-state modification is authorized by this research artifact. No replacing the original PDF with a Claim, no automatic conversion from `proposed` to `confirmed`, no fabricated citations, no new agent brain, no broad cross-scope personal-data exposure without scoped authority, no regexes to special-case test phrasing, no exclusion of forgotten/old material on age alone.

Completion of this audit and of a documentation PR is **not** acceptance of #113 or #138. Keep both open until real authenticated tests pass and the owner reviews their evidence.