# Isabella Presence Protocol v0.3

Build 80.3 closes the remaining continuity gap between the desktop Presence and the canonical Isabella surface.

## Canonical operational context

Agenda and task context must not depend on which client surface Gari is using.

For every Isabella chat turn, `isabella-chat` loads the current operational agenda directly from the canonical Supabase tables under the caller's authenticated RLS context:

- `isabella_tasks`;
- `isabella_events`.

The server derives:

- `today_tasks`;
- `overdue_tasks`;
- `undated_tasks`;
- `today_events`;
- `upcoming`.

Client-provided agenda context remains a fallback only if the canonical read is unavailable.

This makes Web, Presence and future surfaces converge on the same operational truth.

## Canonical conversation

Presence is another surface of the same `app_scope = isabella` conversation.

Presence does not maintain a durable private transcript. Each Presence turn is persisted server-side into `conversation_messages` with deterministic client keys and metadata:

- `source = presence`;
- `surface = presence`;
- a request id shared by the user and assistant turn.

The web client observes these inserts and pulls them into the same visible Isabella conversation. Presence reads the latest canonical conversation when it opens and while its panel is active.

## Authority and security

No service-role key is added to Presence.

All agenda reads and conversation writes happen with the authenticated user's Supabase context and existing RLS.

Presence still does not gain new authority. Proposals that require confirmation remain subject to the same MINDS permission and review model.

## Invariant

One Isabella, one operational context, one conversation history, multiple surfaces.


## Tareas as a projection, not a second planner

The Tareas surface reads and mutates the same canonical `isabella_tasks` rows used by MINDS.

A selected calendar day means exactly that date. Presence must not silently inject overdue tasks into Today. Overdue is a separate semantic view if introduced later.

Manual task gestures in Presence — create, complete, edit, delete, mark important and reorder — are explicit user actions under authenticated RLS. They do not grant Isabella additional autonomous authority.

Task order is persisted in `sort_order`; importance is persisted in `priority`; date remains `due_date`. MINDS must pull canonical task state when its calendar is opened so edits made in Presence appear on the full surface.

## Ahora

Ahora is an attention surface, not a task inbox and not a history feed.

It may show:
- a current decision that genuinely blocks progress;
- active work whose state is meaningful now;
- a recent completion or failure that merits surfacing.

A delivered decision whose underlying Mission is no longer `waiting_for_user` is obsolete and must not remain actionable. Resuming a Mission resolves its prior waiting-for-user Attention event at the ledger level.
