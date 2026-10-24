Build 100A.4 — One-save canonical task creation

Date: 24 October 2026. During authenticated iPhone acceptance of Build 100, the user found that Guardar in Agregar manualmente only opened Nueva tarea, and a second Crear tarea tap was needed. The first Guardar did not persist.

The shared Calendar and Tareas manual form now uses one Guardar to insert the simple task canonically via Supabase. The user may open the advanced editor afterwards but it is no longer mandatory. The server-side title, date, category, project and owner are verified by a separate client-key readback. Auth is required. A stable UUID key and in-flight lock prevent duplicated tasks on double tap or a lost insert acknowledgement. Unknown taxonomies or failed reads do not show fake success. The event flow is intentionally unchanged.

CI regression suite covers write/readback, identity and taxonomy, retry after lost HTTP acknowledgement, stale/mismatched results, duplicate tap prevention, and cache pins. Manual iPhone acceptance remains required; do not close #138 solely on CI. No schema changes or production task writes by this commit.
