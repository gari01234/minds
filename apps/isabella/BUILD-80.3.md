# Build 80.3 — Canonical Surface

Date: 5 October 2026.

## Trigger

Real-world acceptance testing of Presence 0.1.2 exposed two contradictions:

1. Attention Economy correctly showed overdue work while the inline conversation could claim there were no tasks for the day.
2. Presence used the canonical Isabella runtime, but its visible turns were not guaranteed to appear in the durable web conversation.

Both failures had the same architectural cause: too much continuity still depended on the client surface.

## Decision

Move the missing continuity boundary to MINDS.

`isabella-chat` now loads agenda context server-side from canonical Supabase state for every conversational surface.

Presence identifies its requests explicitly and the backend persists those turns into the same durable `app_scope = isabella` conversation used by the PWA.

The PWA's Realtime listener now reacts to Presence-originated conversation messages and pulls them into the visible history.

Presence also reloads recent canonical conversation history when opened and during active polling.

## Version

Isabella Presence 0.1.3.

## No new backend

Build 80.3 does not introduce a Presence-specific chat endpoint, memory store or agenda cache.

It reuses:

- `isabella-chat`;
- `conversations`;
- `conversation_messages`;
- `isabella_tasks`;
- `isabella_events`;
- existing RLS;
- existing Attention Economy;
- existing Capability Runtime.

## Acceptance

Build 80.3 is accepted when:

- asking Presence for today's pending work reflects canonical Supabase tasks/events;
- Presence and web show the same durable conversation;
- closing/reopening Presence does not erase its previous canonical turns;
- the PWA receives Presence turns without manual re-entry;
- the existing MINDS verification suite remains green;
- Presence compiles on macOS, Linux and Windows;
- Windows installer 0.1.3 is produced successfully.
