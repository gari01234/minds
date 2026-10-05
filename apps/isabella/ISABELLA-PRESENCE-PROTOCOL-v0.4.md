# Isabella Presence Protocol v0.4

Build 80.4 tightens three boundaries exposed by real desktop use: temporal truth, relationship fidelity and ambient interface density.

## Temporal truth

Calendar storage timestamps are not presentation data.

MINDS converts canonical event timestamps into the caller's IANA timezone before they enter the conversational context. Event context exposes:

- local_date;
- local_start_time;
- local_end_time;
- display_time;
- timezone.

When these fields exist, Isabella uses them directly. Raw starts_at / ends_at remain provenance/storage fields and must not be surfaced as local clock time.

This removes UTC/DST conversion from model reasoning.

## Relationship fidelity

Presence uses the same Relationship Contract as every Isabella conversation surface.

If Gari points out a contradiction in Isabella's immediately preceding answer and the evidence confirms the mistake, Isabella acknowledges that she gave the incorrect datum before stating the corrected one. The acknowledgement is brief and factual, not ceremonial.

The policy remains independent of Presence. Presence does not own personality.

## Ambient UI state model

Presence adopts a reduced desktop state model inspired by the interaction pattern studied in Coucou:

hidden → petit → home

- hidden: no visual occupation;
- petit: a small top-edge island with the focal state;
- home/status: one contextual state card;
- home/chat: short canonical conversation.

A normal work event reveals petit. A decision that requires Gari opens home/status and stays pinned until the user acts or explicitly hides it.

The expanded surface auto-collapses after inactivity only when it is not pinned by a decision and no text is being composed.

Escape collapses home to petit; from petit it hides the surface.

## Geometry

On desktop the island is centered on the top edge of the active monitor. The compact surface is 306×60 logical pixels.

Status and chat use separate dynamic heights rather than one permanent dashboard:

- status: 420×220;
- chat: 420×320.

## Content density

Status shows one focal event and a secondary count. It does not render every simultaneous signal as a vertical list.

Chat and status are separate views. Conversation is not permanently visible underneath operational state.

Assistant Markdown is rendered as safe local presentation — headings, emphasis, inline code and bullets — instead of exposing raw Markdown syntax.

## What is deliberately not copied from Coucou

Isabella does not reuse Coucou/Mochi character assets, iconography, sound design, colours or personality.

Build 80.4 also does not yet add Coucou's hover-to-wake top-edge input strip. That interaction requires a more specific native hit-region/window lifecycle and is not necessary to fix the current acceptance failures.

## Invariants

Presence remains a projection and conversation surface over the same MINDS.

No new agent runtime.
No new memory.
No new permissions.
No new Attention policy.
No local provider credentials.
No model-side timezone conversion when canonical local presentation exists.
