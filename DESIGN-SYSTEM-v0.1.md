# MINDS Design Language v0.1 — UX A.4

Status: proposed implementation, subject to CI and real-device acceptance. This is a visual system change, not a new MINDS capability or a change in permission, provenance, memory, task, project, reading or conversation contracts.

## Purpose and theoretical references

Design intention: lower the visual cost of using MINDS without reducing clarity or access to functions. Dieter Rams informs usefulness, comprehensibility, unobtrusiveness, honesty and precision of detail; Otl Aicher informs consistency of a visual grammar across different surfaces; Jasper Morrison and Naoto Fukasawa inform everyday legibility, familiarity and restraint. The numerical values below are our engineering and visual proposals, not measurements or prescriptions attributed to those designers.

MINDS must retain distinct modes of use: operational density in Calendar/Work/Now; reading density in Sofía and documents; the same interaction semantics underneath.

## Source of truth

`apps/shared/minds-design-tokens.css` defines light-mode semantic colors, spacing, typographic roles, radii, touch targets and motion durations. `apps/isabella/design-system.css` applies those roles after the legacy runtime stylesheet. `apps/theory/design-system.css` maps the same roles to embedded Readings while preserving serif text and existing annotation colors. Native Presence carries a self-contained mirror of the small shared token subset in `apps/isabella-presence/ui/presence.css`, with parity regression tests, because desktop packaging must not depend on a hosted stylesheet.

Semantics of design tokens: paper #fff, surface #f7f7f6, ink #171717, informative secondary text #60636a, line #e6e6e4, information #235c84, confirmed #287557, attention #92521d, error #b54736. These must not be arbitrarily re-used as category colors in the Calendar. Operational font uses the system sans-serif stack; document reading may use a serif. Body 16px/1.5, metadata 13px, sections 18px, compact controls at least 40–44px where feasible. Use a 4/8/12/16/24/32/48px rhythm; card radius 12px, panel radius 20px. Do not infer font-file licenses or bundle platform fonts.

## Components and hierarchy

The permanent upper MINDS wordmark is visually suppressed rather than repeated above every selected destination. Navigation remains unchanged across assistant, feed, ideas, calendar, readings and work. Now's accessible heading and Work Overview's accessible heading remain in the document but are visually hidden because navigation/project context already identifies the current section. The current project is communicated by its existing compact, explicit selector; the duplicated large heading is not the focal point. Work's five secondary tabs stay in a single horizontally scrollable row on a phone, without creating a new view model. Planner drag remains unchanged; the intrusive up/down arrows are not reintroduced.

Calendar's month stays visible as temporal context, but uses an operational rather than editorial title style. Work cards use consistent 12px borders/radii and no persistent shadows. Floating dialogs remain layered surfaces. Ideas and task lists retain explicit statuses and coverage, avoiding meaningless decoration. Sofía uses the same focus/feedback language but retains document reading typography; no changes to selection, annotations, draft persistence or scope.

## Motion and state

`chat-activity` is shared by Isabella and Work Threads; one low-key pulsating dot complements explicit textual status (not an additional large animated orb). Error state is static and legible. Motion durations are short and semantic; `prefers-reduced-motion` disables incidental motion. The existing Isabella ORB size, palette and animations have *not been changed* by this layer. Presence keeps its own existing ORB sizes and compact shell.

## Acceptance criteria

Automated: shared token loading, color contrast tests for informational text, no ORB resizing, PWA asset availability, route/drag invariants, native token parity, CSS block integrity, reduced-motion semantics and existing full Verify MINDS suite. The change requires authenticated visual checks in mobile Safari/PWA and desktop before final UX acceptance: top area distribution (including iOS safe area), absence of hidden/overlapping tabs, reading author/title legibility, dynamic type, on-screen keyboard/composer, sheet transitions, Calendar month/dots, Work project selection, native Presence card/layout and saved draft behavior.

These checks are distinct from pending Build 90.5/90.6 empirical validation of selection and annotation persistence, file transfer, reminders and native cross-surface task round trips. Do not claim those gates have passed because visual CI passed.

## Future work, not added to this PR

Extract existing declarations from the large historical CSS files into the new system incrementally after real-device signoff; remove superseded rules with regression evidence instead of a mass CSS replacement. Catalog interaction icons and introduce a unified icon set only with approval. Profile screen-reader ordering and alternate keyboard/touch reordering for Work without visible permanent arrow controls. Establish automated screenshot diffing when browser-test infrastructure and representative view fixtures are available.
