# Build 90.8 — Durable Chat Continuity v0.1 / Push Diagnostics

## Scope

Text-only informational Chat turns, admitted by the existing direct-text eligibility gate, now run through OpenAI Responses background mode. The authenticated server records a durable, owner-readable job row with one unique request ID before starting the provider response. A separately authenticated cron worker polls the OpenAI response ID every minute and writes its terminal answer to the same job. The browser reconciles jobs at startup and whenever it becomes visible, without invoking the model a second time. A single active job per user prevents overlapping conversation writes.

Jobs can be recovered after a browser tab is closed **once the provider has accepted the job**. An ambiguous provider start is never retried automatically. This is not the earlier 90.7 streaming receipt: it is independent provider-side generation. The new ledger uses Supabase RLS SELECT for its owner; writes require service authorization. Jobs include an explicit 90-day terminal retention rule.

**Limitation:** Action/tool-requiring Chat, Work file processing, attachments, complex routing, web searches and mutations still use existing modes. The durable lane has no tools and cannot bypass permission or execute changes. This v0.1 therefore does not make every imaginable Isabella turn persistent. Continue server-side tool orchestration and approval-bound checkpoints before claiming universal background Chat support.

## Push state and diagnostic

Production examination identified one active iPhone standalone PWA Push subscription, last registered October 2. Six attempts were accepted by the Push service with HTTP 201 between October 2 and October 8. HTTP acceptance is not proof of display on iPhone. A deliberately requested test, limited to once per 90 seconds, can now send a single Push to the latest active subscription; the panel displays acceptance versus failure and provides an explicit re-registration option. It neither modifies Attention Economy nor silently enables unsolicited notifications.

Open installed MINDS via the Home Screen icon. Navigate to the menu (...) and Avisos de Isabella. Confirm permission, renew the subscription if necessary, and tap Enviar aviso de prueba. If the server accepted the request but the phone is silent, check iOS Settings > Notifications > Isabella and Focus/Scheduled Summary.

## Validation and caveats

CI covers authenticated ledger, distinct provider execution/reconciliation, anti-duplicate constraints, client recovery, safe fallback to tool-enabled Chat, on-demand Push tests and PWA revision pins. Acceptance must still be performed on real Safari/iPhone: immediately switch tabs after sending, lock device, fully close the PWA, then reopen and confirm one user turn and one matching answer in the same conversation. Check a complex Work request deliberately falls back instead of claiming durability. A separate later iteration can add governed optional completion notifications rather than notifying indiscriminately on every chat response.
