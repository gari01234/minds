# Build 80.4 — Relationship Fidelity & Temporal Presentation

Date: 5 October 2026.

## Trigger

Real Windows acceptance testing exposed three remaining problems in Presence:

1. A Bernried event stored correctly as 13:00 UTC / 15:00 Europe/Berlin was presented as 13:00 local time.
2. When Gari corrected the time, Isabella gave the corrected answer without acknowledging that her previous answer had been wrong, despite the Build 77 Relationship Contract.
3. Presence still read visually like a small vertical application and exposed model Markdown syntax.

## Temporal correction

Build 80.4 adds a pure shared temporal presentation helper.

The helper converts ISO timestamps to the requested IANA timezone before model inference and is covered by DST tests. The Bernried acceptance fixture:

2026-10-05T13:00:00Z → Europe/Berlin → 15:00
2026-10-05T15:30:00Z → Europe/Berlin → 17:30

The event reaches Isabella with display_time = 15:00–17:30.

## Relationship correction

Relationship Contract advances to gari-isabella-v0.2.

The existing requirement to acknowledge errors is made operationally explicit: when Gari identifies a contradiction in Isabella's own prior statement and the evidence confirms it, she briefly names the wrong datum and then gives the correction.

The intended form is natural, for example:

“Sí, tienes razón. Antes te dije 13:00 y eso fue un error mío: estaba leyendo la hora UTC. La reunión es a las 15:00, hasta las 17:30.”

This is not a scripted sentence and not a required apology formula.

## Coucou UI reconciliation

A new review of the current Coucou Windows implementation focused on UI rather than runtime. The useful patterns are:

- top-edge presence instead of a floating mini-app;
- explicit hidden / compact / expanded state machine;
- normal activity reveals compact state;
- questions/approvals open the expanded state and pin it;
- Escape collapses;
- expanded views are contextual and shallow;
- secondary functionality stays out of the primary surface.

Build 80.4 integrates those principles without copying Mochi, its visual identity, sounds or protected assets.

## Presence 0.1.4

The Windows app becomes 0.1.4.

The island moves to the top centre of the active monitor.

Compact geometry: 306×60.
Status geometry: 420×220.
Chat geometry: 420×320.

The expanded surface has two explicit views: Ahora and Chat. Only one focal status card is shown. Assistant Markdown is rendered locally instead of displayed as raw syntax.

Questions requiring user input open the status view automatically and disable inactivity auto-collapse. Ordinary work remains compact.

## Acceptance

Build 80.4 passes when:

- the Bernried event is presented as 15:00–17:30 in Europe/Berlin;
- winter timezone conversion also passes;
- Relationship Contract v0.2 explicitly preserves self-correction continuity;
- Presence renders Markdown without visible ** / ### syntax;
- Presence anchors top-centre and uses petit/status/chat geometry;
- requires_user opens the contextual status surface;
- Escape collapses the island;
- Verify MINDS remains green;
- native builds pass macOS, Linux and Windows;
- Windows NSIS installer 0.1.4 is generated.
