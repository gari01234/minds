# Build 90 — Human Surface / Lenses v0.1

## Objective

Make MINDS easier to inhabit by exposing a small set of human lenses over one canonical world instead of making the user navigate implementation domains.

The redesign does not create new truth stores. Chat, Ahora, Calendar, Work and Readings are projections over existing canonical state. More internal complexity must produce less external complexity.

## Primary lenses

- **Chat** — conversational presence and universal entry point to Isabella.
- **Ahora** — only what materially deserves attention now: blocking decisions, active background work, recent consequential completion/failure and explicit Attention Economy returns.
- **Calendar** — temporal organization of Tasks and Events.
- **Work** — project understanding and coordination.
- **Readings** — active reading/research memory.

Feed and Ideas no longer justify permanent primary-navigation slots. Their existing capabilities remain available from Más while Build 90 measures whether they retain a distinct job.

## Invariants

1. A lens is a projection, not a new canonical object.
2. Ahora is not a task inbox, notification archive or calendar duplicate.
3. Chat remains the main conversational surface and mobile swipe to Calendar remains intact.
4. Work remains a first-class primary lens.
5. Removing Feed/Ideas from primary navigation does not delete their state or functionality.
6. Attention Economy remains the authority for communicative interruption; Ahora may display already-governed state but does not create urgency.
7. Technical ontology stays behind human copy unless inspection is explicitly requested.

## Sequence

### 90.1 — Lens shell + Ahora **Implementation target**
- Reduce primary navigation to Chat / Ahora / Calendar / Work / Readings.
- Move Feed and Ideas to Más without deleting them.
- Add a read-only Ahora lens built from Attention Economy and Persistent Work.
- Show only unresolved user-needed attention, active work and recent consequential outcomes.

### 90.2 — Chat as universal control surface
- Keep today's compact temporal context without turning Chat into a dashboard.
- Let contextual returns from Ahora/Work/Calendar land back in the same conversation.
- Remove duplicate navigation language and technical labels.

### 90.3 — Calendar lens polish
- Preserve direct manipulation of task order.
- Make day/week/month hierarchy and task/event distinction visually clearer.
- Keep scheduling semantics canonical and independent from Work bucket order.

### 90.4 — Work project lens
- Lead with current project state, changed/open/blocked/who moves/coverage before inventories.
- Keep Desktop, Planner, Conocimiento and Threads as deeper project tools rather than four equal mental models.
- Do not load the real Bernried document corpus until this surface is accepted, per Gari's sequencing decision.

### 90.5 — Readings lens + legacy surface decision
- Preserve clean active reading, annotations and passage-bound conversation.
- Decide whether Feed and Ideas have a distinct surviving role or should be retired/absorbed.

### 90.6 — Cross-lens acceptance
- Mobile and desktop navigation remain coherent.
- No canonical state is duplicated by a lens.
- Context does not bleed across scopes.
- Review/Attention/Project Model provenance remains inspectable.
- Gari can move through ordinary coordination with less navigation and less manual classification than the pre-90 baseline.

## Non-goals

No new agent.
No new memory store.
No Feed/Ideas data deletion in 90.1.
No automatic project-source promotion.
No redesign that weakens exact decision binding, Review Economy, Exposure scope or Project Model provenance.