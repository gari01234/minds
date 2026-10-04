# Build 78.1 — Editable Thread Lifecycle

Fecha: 4 de octubre de 2026.

Build 78.1 completa el ciclo de vida manual de los Threads sin cambiar la arquitectura introducida por Build 78.

Gari puede crear nuevos Threads desde Work → Threads, renombrar cualquier Thread activo o archivado y archivar un Thread cuando deja de ser trabajo corriente. Los Threads archivados desaparecen de la lista activa, pero no se eliminan. Su conversación, provenance y relación con el proyecto se conservan y pueden restaurarse posteriormente.

Archivar no equivale a olvidar. Isabella puede seguir recuperando un Thread archivado cuando una búsqueda transversal del proyecto lo haga relevante. El retrieval devuelve también el estado del Thread y prioriza los activos cuando dos resultados tienen relevancia equivalente.

El rename es coherente entre capas. Si el Thread ya tiene una conversación persistente, `minds_rename_work_thread` actualiza en una misma operación lógica el título de `minds_work_threads` y el título/label de su fila `conversations`. La función es SECURITY INVOKER y solo está ejecutable por `authenticated`.

El cambio de estado usa `minds_set_work_thread_status`, también SECURITY INVOKER. Solo acepta `active` o `archived`. Restaurar conserva toda la historia. Si ya existe otro Thread activo con el mismo nombre, la restricción única activa impide una restauración ambigua.

No se añade borrado destructivo en v0.1. El caso de “ya no necesito Controlling” se resuelve mediante archivo, porque el contenido investigado puede seguir siendo útil como contexto histórico. Build 78.1 no archiva automáticamente ningún Thread existente: esa decisión queda en manos de Gari desde la interfaz.

PWA source marker: Build 2026.10.04.78.1.
