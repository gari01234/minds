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

## Voice comparison (6 November 2026)

The Live acceptance page offers the 31 named GPT-Live built-in voices documented in OpenAI's current `/live/sessions` API reference. `marin` remains the default. The owner can select any voice **before** clicking Start; the selection is captured once and locked until the session finishes. Switching voices therefore requires starting a new (billable, 90-second maximum) session; changing a voice mid-stream is not supported by the API.

The browser sends only the selected voice name along with the SDP offer. The server rejects invalid, unknown and non-string names before invoking OpenAI. No voice choice is written into MINDS or browser storage; there are no new permissions. Compare vocal quality in the user's real languages (Spanish and German) rather than assuming regional labels imply performance in another language. OpenAI also offers prompt-created custom voices, but creating one is deliberately out of scope of this comparison.

## Original voice design v0.1 (6 November 2026)

A genuine GPT-Live custom voice can now be generated through OpenAI's `POST /v1/audio/voices` with `type:"prompt"`. The live pilot exposes **Isabella · Original I** as a separate, explicitly selected option, retaining all 31 built-in voices.

The brief consists entirely of general adult vocal attributes: moderate pitch, warmth, slight airy texture, lower-mid resonance, relaxed and varied conversational cadence, understated humor, and clear Spanish/German. It expressly forbids imitation of a specific person, actor, fictional character, synthetic voice or branded assistant. The source recording of a named performer is neither needed nor used. No reproduction of Sky or Scarlett Johansson is requested. Similarity to real voices is not guaranteed to be absent, nor is uniqueness guaranteed by the provider; assess the result by listening.

The first selected session calls `ensure_original_voice` on the same owner-authenticated Supabase function. Only the fixed server-side prompt can create a voice; no user-controlled synthesis prompt or audio uploads. A successful voice ID is saved as a separate `live_voice_isabella_original_v1` row in the existing `isabella_preferences` table with owner-scoped RLS and an explicit-confirmed source. Subsequent sessions reuse it. The app never exposes the OpenAI API key. The identifier is not a new memory, agent or authority; the original voice is still governed by the same `store:false` and no-tools voice trial.

A voice creation failure or unavailable `api.voices.write` permission is shown to the owner without affecting any built-in voice option. Creation itself produces no preview audio; a successful initial session is needed to judge the result. **Physical iPhone voice quality and bilingual accuracy remain unverified.** The original session still has the 90-second safety cap, and selection cannot change during playback.

## Original I provider HTTP 400 correction (6 November 2026)

The owner's iPhone reported creation failure at 21:07 CET. Edge Function logs confirm `isabella_original_voice_create_failed 400` at 20:07:27 UTC. The previous client phrasing ("OpenAI no ha permitido") was **not a supported diagnosis of a policy denial**: status 400 also covers malformed or invalid optional input fields.

OpenAI's official voice-create API documents `script_hint` as optional and notes that too-short scripts are rejected. The first implementation supplied a short bilingual hint; that is a **possible**, not verified, cause. The updated request omits this optional hint, allowing the provider to generate its own script while retaining the same original non-imitative voice design prompt. The server records only the status and safe error type/code/parameter tokens for future diagnosis. The browser distinguishes invalid request, permission denial and provider error; after failure it no longer falsely displays "waiting for remote audio".

The fix does **not** reconstruct discontinued ChatGPT Sky or the identifiable voice of any real voice performer. German personality rights can protect distinctive voice imitation, including AI-generated recreations, depending on purpose, context and recognizability (LG Berlin II, 20 August 2025, 2 O 202/24). There is no blanket conclusion that every private study is unlawful, or that recording availability confers permission to clone. Only non-identifying vocal qualities and speaking behavior are used in this trial.

The result of the corrected request is not yet known until an authenticated owner retries creation on an actual device. Never mark it as audible PASS based solely on CI.

## Original II / III · feedback-based voice refinement

Owner's authenticated physical iPhone acceptance of Original I: generated successfully but the perceived sound was too far from the desired friendly, spontaneous, American-influenced character, and the Spanish sounded too Peninsular. This is qualitative owner feedback, not a measured speaker-identity match. The earlier prompt didn't define a US-accent acoustic anchor, and its text was also reused as session-level speaking guidance.

Two **new, separate and audibly unverified** versions are now explicitly selectable:

- Original II: contemporary General American acoustic anchor, medium register, smooth and warm, restrained energy; neutral Latin American seseo when speaking Spanish rather than Spain's c/z distinction. 
- Original III: same American English and non-Peninsular Spanish targets, with a lighter/brighter voice, faster spontaneous variation, restrained dry wit.

This does not attempt to duplicate a specific voice performer. Both descriptions explicitly forbid imitation of real people, fictional characters, brand assistants, or existing synthetic voices. A General American/Latin American target is an accent/delivery category, not voice identity. Spanish/German bilingual stability is a hypothesis to test, not guaranteed.

Voice identity and delivery prompt are now separate for II and III: `/audio/voices` receives a fixed voice-design prompt on first explicit selection, while `/live/sessions` receives a shorter style instruction on the new sessions. Original I remains untouched, including its persisted voice identifier; all 31 existing voices and permission gates are unchanged. No new database schema: individual versioned `isabella_preferences` keys for each candidate, owner RLS and the same API key.

**Recommended acoustic acceptance:** In the same actual iPhone, test II and III with identical English and Spanish sentences and a short spontaneous joke or interruption. Evaluate US-vs-Peninsular Spanish vowels/consonants, naturalness, pacing and tonal warmth, not likeness to a specific actress. If neither improves the perceived experience, do not promote one as Isabella's production voice. The production default remains Marin until the owner approves a candidate.

## Independent release gates

CI must pass, including `node --test tests/isabella-gpt-live-pilot.test.mjs`, `node --check apps/isabella/live/live.js`, `deno check supabase/functions/isabella-live-session/index.ts`, and `node scripts/build.mjs`. The app's pre-existing browser and SQL tests must remain green.

Merge and publish static web assets only after CI PASS; use the existing **manual** Supabase function deployment workflow or the scoped Supabase connector for the new function. No changes to existing Edge Functions, database tables or RLS. Check the deployed function has JWT verification enabled. Confirm unauthenticated attempts fail and a server OpenAI failure is handled without credentials in the body.

On a physical iPhone, sign into the regular Isabella web/Window surface first. Open `https://gari01234.github.io/minds/isabella/live/`, tap Iniciar conversación, grant microphone permission, speak, and confirm **audible sound**. If the browser shows text but no sound, tap Activar altavoz, then inspect physical volume/silent settings; do not label the test PASS without hearing the voice. Verify interruptibility and ending the session. Record actual pass/fail (not inferred from a screenshot).

## Next delivery after audio acceptance

Follow the official **client delegation** contract. A `session.delegation.created` event contains an ID and an `offset_ms` but **not** the user's request text. `session.input_transcript.delta` fragments are not complete turns. Do not feed fragments directly into the canonical action runtime. Build a bounded turn-admission and idempotency mechanism, preserve source-first context and permission receipts, and return only verified/approved results using `session.commentary.append`. Connect both read and action flows via existing `isabella-chat` and single canonical conversation, never a second independent agent or authorization layer.

OpenAI official: https://developers.openai.com/api/docs/guides/voice-webrtc and https://developers.openai.com/api/docs/guides/live-delegation

Cost: `gpt-live-1` currently $0.05 per minute of active connection, billed by second; server backend usage would be billed separately once connected.
