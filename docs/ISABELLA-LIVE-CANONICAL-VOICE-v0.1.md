# Isabella Live — Canonical Voice Foundation v0.1

**Status:** isolated incremental implementation; not full-duplex Live, not a second agent.  
**Base:** `main` `0881b0f364fb7a7b94ebaf97f76bf03da85e5d35` (6 November 2026).

## Objective

Introduce optional spoken replies while retaining the existing, proven route:

microphone → `isabella-transcribe` (or browser fallback) → transcription review → `handle` → **canonical `isabella-chat`** → typed receipt and persisted message → optional local speech synthesis.

The same MINDS source of truth, conversational memory, tools, authorization policy, review UI, workspaces, and receipt verifier remain intact. No new LLM instance, agent, database tables, secrets, service-role permission, Supabase deployment or background microphone access.

## Safeguards

Speech is disabled by default. Gari chooses **Escuchar la respuesta** in the existing Focus dialog before sending a spoken turn. The choice is session-local and has no remote write. If speech synthesis is not supported, the control is disabled and text chat still works.

Only that opted-in voice turn can speak, and only after a **completed, typed `answered` outcome** from the existing `MINDS_TURN_INTEGRITY` verification. No speech from untyped/ambiguous outcomes, proposals, unconfirmed actions, clarification, incomplete results, background delivery, readback, cache reconciliation or old messages. The speech renderer has no networking, model invocation, memory or write privileges.

A new user turn cancels audio from the old one. So do Stop, navigation away, pagehide and document becoming hidden. Stale asynchronous completions cannot speak after a newer chat turn. The renderer caps spoken text to 720 characters, omits fenced/inline code and raw URLs, and leaves the full canonical message on screen.

Web Speech synthesis voice and availability depend on the installed browser/OS voices; audible speech after a network round trip is not guaranteed on every iPhone/WKWebView. No claims of realtime turn taking or end-to-end physical acceptance are made here.

## Non-regression / rollback

The previous microphone/transcription/edit/send workflow remains the default. Typed keyboard messages are unchanged. Existing memory, proposal, calendar, source-first Work and delivery paths are unchanged. No database migration or Edge Function deployment.

Reverting the feature consists of restoring the previous `shell.js`, `app.js`, `index.html` and `sw.js` versions and removing the standalone voice renderer/styles/tests. No data conversion or rollback is required.

## Gates before merging/publishing

Run `node --test tests/isabella-canonical-voice-replies.test.mjs`, then the full Node test suite and existing browser harnesses. Check syntax and confirm the PWA service-worker cache lists every new asset with bumped versions. The check must verify that old transcription still works, typed messages never start audio, a proposal still requires confirmation, the Stop button cancels playback, returning to another tab cancels audio, and failure leaves the original typed response intact.

Perform a real authenticated phone or desktop check after publishing, separately from CI. A TestFlight simulator/pass does not substitute for native audible playback on physical iPhone. Do not claim this gate passed from a static test.

## Subsequent Live phase (not authorized implicitly by this patch)

Full-duplex GPT-Live/WebRTC would require an authenticated server-minted short-lived session, real server-side context under owner RLS, transcript admission to **the same** canonical conversation, a secure server sideband to governed MINDS capabilities, interruption and idempotency receipts, provider usage/cost limits, explicit microphone and storage controls, and tests for false claims, privacy boundaries and missing evidence. It may be added as an opt-in capability, but must **not** create an independent assistant memory or action authority.

Issues [#138](https://github.com/gari01234/minds/issues/138) and [#113](https://github.com/gari01234/minds/issues/113) remain independently open until their authenticated acceptance gates pass.
