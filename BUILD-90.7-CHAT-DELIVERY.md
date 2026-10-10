# Chat reliability — delivery recovery and response-budget correction

Live diagnosis (10 October 2026, Europe/Berlin):

At 17:34 the browser persisted an 870-character answer with `incomplete_reason=Load failed`, but its matching `isabella_chat` server run completed successfully (`direct_stream=true`). This is a lost SSE delivery; the model itself finished. A subsequent manual “Continuar respuesta” was routed to Work/Bernried while still classified as light, and OpenAI returned `incomplete_details.reason=max_output_tokens`. The server correctly preserved 1,274 characters as incomplete. The two failures are different. Do not conceal incomplete status.

## Browser delivery contract

Browser text-only streaming now sends a random UUID `client_message_id` and `surface=chat_browser`, without borrowing Presence decision bindings. After OpenAI reports a terminal completed/incomplete event, `isabella-chat` writes a short-lived delivery receipt using an authenticated JWT-derived user ID and the scoped server service role. The receipt is saved **before** the final SSE result is sent, so a browser losing its last SSE event can read that same completed text without a second model invocation. A private Supabase table serves SELECT only to the authenticated owner through RLS and expires receipts after 24h. Daily database cleanup removes expired records. The receipt is a transient delivery mechanism, not accepted knowledge, memory or an alternative conversation archive.

When SSE ends without `result` or an iOS `reader.read()` throws, the browser polls the existing receipt for up to ~9 seconds while retaining visible streamed text. If status is completed, it delivers the saved full text as complete. If the server marked the result incomplete, that flag is preserved. If there is no verified receipt, it retains the partial message and explicit continuation action. No automatic regeneration or implicit retry of operations occurs.

## Reasoning budget contract

The old light budget could be selected even after the router identified a Work follow-up. Continuations explicitly mentioning an interrupted previous answer now have a minimum output budget of 6,200 tokens. Routed Work follow-ups have a 4,400-token minimum, rather than the 1,800-token light budget, and their reasoning is not left at light purely by the textual classifier. Other requests, background work and all existing tool permissions remain unchanged. This is extra headroom, not a guarantee against every future output cap.

## Acceptance

Automated tests verify RLS and expiry, a browser recovery against a completed/incomplete receipt with no second model call, correct SSE completion signaling, non-promotion of partials, and targeted budget selection. Production acceptance requires deployment of the SQL migration before the chat function and PWA assets, a real authenticated Chat stream, proof of a completed delivery receipt, and at least one subsequent mobile Safari network interruption/return test. Do not claim the Wi-Fi/LTE switch is fixed merely because CI passed. Preserve previous Build 90.5 guarantees for weekly calendar assessments and source-first Work.
