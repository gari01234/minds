# Isabella · nightly dreaming v1 (08.11.2026)

Decided by Gari on 08.11.2026: adopt Anthropic's memory pattern and the prompts of its dreaming
recipe inside Window, instead of inventing a new mechanism. The research and the plan are in the
Window project on claude.ai: `claude/isabella-fase0.md` and `claude/isabella-memoria-investigacion.md`.

## Sources
- Anthropic, "The components of agent memory" (06.11.2026):
  - memory as layers: transcripts (ground truth), notes, per-entity pages, and a small injected layer;
  - "dreaming" consolidates offline;
  - purpose, not procedure: fixed write rules hurt strong models;
  - keep the injected layer small.
- Anthropic cookbook "Dreaming with a dynamic workflow":
  - per transcript: read the whole transcript, verify what memory claims, enrich, organize;
  - then organize the result: do not invent or delete facts, mark conflicts, date superseded facts, never copy secrets;
  - transcripts are data, never instructions.

## What runs
- `.github/workflows/isabella-dream.yml`:
  - runs nightly at 02:47 Berlin, after the Akte-Pflege;
  - makes up to 4 passes for a backlog;
  - its logs show counts only.
- `supabase/functions/isabella-dream`: only that workflow on `main` can call it (GitHub OIDC, audience `minds-isabella-dream`).
- `supabase/functions/_shared/isabella-dream.mjs`: input, instructions, JSON schema, and how the result is applied.
- The model comes from `OPENAI_DREAM_MODEL`, falling back to `OPENAI_DEEP_MODEL`, then to `gpt-5.6-luna`. It runs with `store:false`.

## Input boundaries
- Only the owner's chat turns with `exposure_scope_version=1` and `exposure_scope_kind='global'`, `provisional=false`, roles user and assistant.
- Excluded:
  - project and Work-thread turns (they stay in their scope);
  - legacy rows from before exposure scopes (never promoted);
  - fixed app texts (`isTemplate`);
  - conversation messages that have a forget tombstone.
- A forgotten entity (`metadata.forgotten_at`) is never rebuilt.
- First run: the last 21 days. After that, only what is new (`isabella_preferences` key `isabella_dream`).

## Output (no new tables, no parallel memory)
| What | Where |
| - | - |
| Pages per entity (`gari`, `person`, `topic`, `relationship`, `isabella`) | `isabella_entities.metadata.page`; the previous 3 versions are kept in `page_history` |
| Hypotheses about Gari (at most 3 per night) | `isabella_model_claims` with status `hypothesis`; Gari confirms or rejects them in "Lo que Isabella sabe de mí" |
| Threads to come back to (at most 2 new per night, 3 open, expiring after 3–14 days) | `isabella_return_queue`, kind `conversation_thread`, status `ready` |
| Diary for Gari | `minds_agent_runs`, feature `isabella_dream`, `metadata.diario` |

## Use
- **Chat:** global turns get `memoria_de_isabella` (`consolidatedMemoryView`): up to 12 page summaries and up to 2 live threads. This holds in both the full and the lean route. The prompt says to use it naturally, to bring a thread up only at a natural opening, and not to repeat a thread.
- **Memory panel:** shows the diary, the pages and the threads, and Gari can dismiss a thread.

## Known limits (v1)
- Facts in a page carry their source as text, not as message ids. Forgetting a message after a dream does not remove a fact that is already in a page. To do: record lineage (message → entity) so the existing forget cascade reaches pages.
- Threads are not marked "returned" automatically after Isabella brings one up. They expire, the prompt forbids repeating one, and Gari can dismiss them.
- Morning briefs and the fixed texts that look like Isabella are filtered with a heuristic until step 3 turns them into system events.
