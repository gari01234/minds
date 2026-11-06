# Isabella GPT-Live 1 · audio acceptance v0.1

Date: 6 November 2026. Base: `main f4b4d2b37a0bdcb74702bfaa9d7fd205341ce56a`.

## Why this pilot is isolated

The first browser SpeechSynthesis attempt rendered text but did not produce audible speech on the owner's iPhone. It was not a full-duplex conversation. Do not claim it passed.

OpenAI's GPT-Live uses WebRTC with real bidirectional audio and a separate event data channel. The OpenAI platform requires session creation with a server-held API key and an SDP offer. This pilot uses that official flow with `gpt-live-1`.

The owner explicitly selected a safe sequencing: verify genuine audible audio on a physical iPhone **before** connecting the model to canonical MINDS capabilities. Do not silently build a second memory or agent.

## Components

`apps/isabella/live/` is a standalone, authenticated page at `/minds/isabella/live/`. It is copied to the published site by the existing build script. It loads the same `shared/supabase-client.js` used by Isabella / Window; no new login, browser storage, microphone button or Supabase application.

`supabase/functions/isabella-live-session` is a new function using `verify_jwt=true`, explicit owner JWT validation, strict origin, bounded SDP, and server-owned `OPENAI_API_KEY`. A successfully authenticated request to `POST /v1/live/sessions` creates a `gpt-live-1` WebRTC session with `delegation:{type:"client"}`, fixed voice `marin`, and `store:false`.

The page requests microphone access only after the owner clicks Iniciar conversación. It negotiates WebRTC, receives a remote audio track, attempts actual `audio.play()`, exposes visible native audio controls, and offers manual playback activation when Safari blocks autoplay. It reports the playback `playing` event separately from the text transcript; a transcript is **not** proof of audible audio.

A 90-second timeout, Finish button, pagehide, and background visibility termination close the peer, audio tracks and data channel. No implicit retries or additional billed sessions. During this pilot the provider may converse casually, but **all client-delegated work receives a restricted no-tools reply**; nothing may read or write MINDS tasks, project records or memory.

The user's voice is transmitted to OpenAI to process the active session. This pilot sends no work documents or personal context to GPT-Live. No application audio recording or transcript is written to Supabase or local storage. OpenAI may process transmitted audio subject to its API data handling; `store:false` disables API session storage.

## Independent release gates

CI must pass, including `node --test tests/isabella-gpt-live-pilot.test.mjs`, `node --check apps/isabella/live/live.js`, `deno check supabase/functions/isabella-live-session/index.ts`, and `node scripts/build.mjs`. The app's pre-existing browser and SQL tests must remain green.

Merge and publish static web assets only after CI PASS; use the existing **manual** Supabase function deployment workflow or the scoped Supabase connector for the new function. No changes to existing Edge Functions, database tables or RLS. Check the deployed function has JWT verification enabled. Confirm unauthenticated attempts fail and a server OpenAI failure is handled without credentials in the body.

On a physical iPhone, sign into the regular Isabella web/Window surface first. Open `https://gari01234.github.io/minds/isabella/live/`, tap Iniciar conversación, grant microphone permission, speak, and confirm **audible sound**. If the browser shows text but no sound, tap Activar altavoz, then inspect physical volume/silent settings; do not label the test PASS without hearing the voice. Verify interruptibility and ending the session. Record actual pass/fail (not inferred from a screenshot).

## Next delivery after audio acceptance

Follow the official **client delegation** contract. A `session.delegation.created` event contains an ID and an `offset_ms` but **not** the user's request text. `session.input_transcript.delta` fragments are not complete turns. Do not feed fragments directly into the canonical action runtime. Build a bounded turn-admission and idempotency mechanism, preserve source-first context and permission receipts, and return only verified/approved results using `session.commentary.append`. Connect both read and action flows via existing `isabella-chat` and single canonical conversation, never a second independent agent or authorization layer.

OpenAI official: https://developers.openai.com/api/docs/guides/voice-webrtc and https://developers.openai.com/api/docs/guides/live-delegation

Cost: `gpt-live-1` currently $0.05 per minute of active connection, billed by second; server backend usage would be billed separately once connected.
