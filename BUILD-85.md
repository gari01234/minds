# Build 85 — Exposure & Memory Provenance v0.1

## Objective

Make context exposure a governed subsystem instead of an accidental consequence of one long chat history.

Build 85 protects two boundaries:

1. **Scope boundary** — information can remain available in MINDS without automatically conditioning every later turn.
2. **Provenance boundary** — recalled or externally sourced information cannot silently re-enter autobiographical memory as if Gari had stated it again.

The product behavior should resemble human contextual memory: Isabella may know Bernried and Gari's personal life at the same time, while only the relevant context conditions the current reasoning unless Gari explicitly asks to cross those domains or an urgent governed anchor must surface.

## Constitutional rules

1. Availability ≠ admissibility.
2. Retrieval ≠ new memory.
3. Conversation continuity is scoped; one visible chat does not imply one undifferentiated model context.
4. Restricted scope is never opened merely because the model finds it relevant.
5. External/network content remains external through the current turn.
6. Background/cron/Mission-style sessions cannot manufacture autobiographical Claims about Gari.
7. Forgetting acts on lineage, not just on one rendered row.
8. Legacy pre-Build-85 conversation history is searchable but is not automatically injected into the new scoped working context.

## Build 85 sequence

### 85.1 — Scoped conversation exposure
- Every new conversation message receives an explicit exposure scope version, kind, key and structural provenance class.
- Main Isabella chat may move between `global` and `project:<uuid>` scopes while remaining one visible conversation.
- Work Threads keep their own exact `work_thread:<uuid>` scope.
- OpenAI persistent Conversations are keyed by exposure scope, so a Bernried turn cannot remain latent inside the model context of an unrelated personal turn.
- New scoped working context never falls back to old mixed local-history injection.

### 85.2 — Scoped lexical + semantic recall and exposure receipts
- Lexical and semantic recall admit current scope plus global durable memory.
- Cross-scope retrieval requires an explicit memory question or an explicit tool request whose server-side policy permits it.
- Every retrieved item carries source type, provenance class, scope and verification state.
- Every material retrieval can be reconstructed through an exposure receipt tied to the agent run.

### 85.3 — Recall-loop prevention + session gates
- `remember_information` can only create a durable candidate when it cites an exact excerpt from the **current user message**.
- Retrieved memory cannot be re-extracted merely because the model saw it again.
- Background sessions cannot create/update personal-model Claims, relations or autobiographical memory.
- External/network taint remains turn-local and blocks autobiographical promotion.

### 85.4 — Lineage-aware forgetting
- Memory lineage records which source produced which derived memory object.
- Forgotten sources/sessions are tombstoned.
- Derived memories and semantic caches from forgotten lineage become inadmissible without deleting historical audit records.
- A forgotten source cannot be silently re-ingested through recall.

### 85.5 — Acceptance
Acceptance includes:
- Bernried → personal-topic switch without Bernried bleed;
- return to Bernried with project continuity preserved;
- explicit “¿qué hablamos de Bernried?” can cross the scope boundary with provenance;
- a recalled autobiographical fact cannot generate a duplicate memory;
- a web-derived statement cannot become a personal fact;
- a background brief cannot create a Claim about Gari;
- forgetting a source removes its descendants from recall while keeping the audit trail.

## Non-goals

No automatic Project-Source promotion.
No new top-level UI.
No replacement of Project Model.
No opaque relevance score deciding restricted usage scope.
No automatic self-learning.
No frequency-of-recall promotion.