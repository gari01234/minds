# Build 83 — Operational Reliability & Proactive Coordination v0.1

## Why this build exists

MINDS is supposed to reduce coordination work. Right now the opposite can happen: Gari narrates his day and Isabella returns a plan without capturing the clear commitments; a simple task creation can end in an opaque transport failure; a PDF can appear selectable but never reaches Isabella; Work can show its buckets while the task surface disappears.

Build 83 freezes feature expansion and treats these as one product problem: the coordination loop is not trustworthy enough yet.

The target is not “fewer bugs” in the abstract. The target is that Gari can tell Isabella what is happening, hand over the clerical coordination, and return to his actual work.

## Product contract

A normal coordination turn should converge toward:

**Narrate → Isabella understands → clear commitments become proposed state changes → one human review when authority requires it → canonical state updates → every surface reflects the same state → failures are recoverable and legible.**

Isabella must not require special command syntax such as “create a task” when the intent is already explicit. Proactivity does not grant authority: calendar/task mutations still follow the existing confirmation and contextual-permission rules.

## Workstream A — chat attachment reliability

1. The composer accepts PDF, common Office documents, text/CSV/JSON/email files and images.
2. Selected documents remain visibly attached before sending; unsupported files produce an explicit error instead of disappearing.
3. Upload uses the existing private `isabella-uploads` bucket with the current user namespace.
4. Isabella receives images as image inputs and documents as Responses API `input_file` inputs.
5. Limits remain bounded: maximum 3 files, 12 MiB each, 24 MiB total.
6. User messages preserve attachment provenance and show the sent document in conversation history.

## Workstream B — task mutation reliability

1. Fast task creation receives a client request UUID.
2. A transient network/stream failure gets one automatic retry with the same UUID.
3. The server treats the request idempotently so a retry cannot create a duplicate task.
4. The user never sees the browser-level string “Failed to fetch”.
5. After an ambiguous transport failure, MINDS refreshes canonical task state before telling Gari whether to retry.

## Workstream C — Work planner parity

1. Work continues to read the canonical `isabella_tasks` table; no duplicate Work task store is introduced.
2. Bernried/Schwarz bucket membership remains `work_bucket_id`.
3. The planner uses one reliable scrolling surface rather than nested height-dependent scrolling that can collapse task cards.
4. Unbucketed project tasks remain visible in “Ohne Bucket”.
5. Work must show the same project task rows that exist canonically, including newly created chat tasks.

## Workstream D — proactive coordination

1. When Gari narrates his day and clearly states temporal commitments (“tengo que…”, “debo…”, “quiero terminar hoy…”, meetings with a concrete time), the day-planning Skill prepares the corresponding canonical task/event proposals in the same turn.
2. Isabella must not wait for a second command such as “pásalo al calendario”.
3. Vague wishes and exploratory ideas remain conversation; they are not silently turned into obligations.
4. Multiple clear commitments from one day narrative should be presented as one review bundle whenever the Human Surface supports it.
5. Confirmation remains required unless a previously reviewed contextual permission explicitly authorizes the exact mutation class.

## Workstream E — observability and regression prevention

1. Add regression tests for document attachment selection/transport, idempotent fast requests, proactive day capture, and Work planner visibility.
2. Production acceptance must use real external coordination, not MINDS working on MINDS.
3. Every failure surfaced to Gari must say what failed and what state is known; raw transport errors are not user-facing copy.

## Acceptance scenarios

Build 83 is accepted only when all of the following pass:

- **Day narrative:** Gari describes a realistic workday containing at least one fixed meeting and at least three explicit tasks. Isabella produces the plan and the matching event/task proposals in the same response, without being asked twice.
- **Simple task:** Gari says “agrega a mis tareas de hoy…” and the task is either created under an existing contextual permission or appears as a review proposal. A simulated first transport interruption does not duplicate the task.
- **PDF:** Gari attaches a real PDF, sees it in the composer, sends it, sees it in the conversation, and Isabella can refer to its content.
- **Work:** Bernried Planner shows canonical tasks inside existing buckets plus unbucketed tasks. Reloading/switching project does not make the cards disappear.
- **Cross-surface parity:** a task created from chat appears in Calendar/Tasks and, when it belongs to a Work project, in Work without manual database repair.

## Explicit non-goals

No new agent, no new task store, no desktop redesign, no category naming exercise, no Self-Evaluation layer, and no new abstraction such as Matter/Asunto Vivo in production schema during this build.

Those investigations can resume after the coordination loop is trustworthy.

## Sequence

83.1 Attachment pipeline.
83.2 Idempotent task mutation and transport recovery.
83.3 Work planner parity.
83.4 Proactive day capture.
83.5 Real-life acceptance and cleanup.

The build is complete only after production acceptance, not when the code merely exists.
