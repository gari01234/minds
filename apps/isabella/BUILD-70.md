# Build 70 — Contextual Autonomy / Evidence-Based Permissions v0.1

Fecha: 1 de octubre de 2026. Base comprobada antes de editar: `ab8dfc9e63594c2ff3c5a36f47af064d2c0442fc`, workflow #301 correcto. Supabase coincidía con el handoff de Build 69. Esta entrega no concede ningún permiso al usuario existente ni cambia las políticas generales de confirmación.

## Contrato

Shadow Agency produce evidencia por acción, contexto y alcance. No existe un autonomy score global. La lectura y la evaluación de evidencia no escriben permisos. Isabella puede consultar esa evidencia con `read_contextual_autonomy` y sugerir que el usuario abra `Más → Permisos de Isabella`; el modelo no dispone de herramientas para aprobar o revocar permisos.

La primera clase admitida es `create_task` para una tarea sencilla sin proyecto, sin recurrencia ni recordatorio. La categoría tiene que resolverse de forma única contra la taxonomía del usuario y aparecer literalmente en su petición, junto con el texto de la tarea. El contexto se atestigua en Fast Path y la clase se calcula y fija en la base de datos. Se separan tareas con fecha y sin fecha. Una conversación con fuentes, el contexto Work activo, las peticiones ambiguas o las demás mutaciones conservan revisión. Los datos históricos sin esa atestación se muestran, pero no se reinterpretan como evidencia de una clase nueva.

Para ofrecer una autorización se requieren al menos 12 revisiones sin cambios en 3 días UTC distintos, dentro de una ventana de 30 días; ninguna edición ni rechazo en esa clase; y una revisión en los últimos 7 días. Son umbrales conservadores de producto, no probabilidades calibradas. `insufficient_evidence`, `needs_review`, `stale_evidence` y `excluded` son resultados explícitos y no provocan promoción.

La pantalla presenta alcance, contexto, evidencia y duración antes de la acción explícita `Autorizar durante 30 días`. La RPC vuelve a comprobar evidencia y versión del permiso. La revocación vuelve a `confirm`, conserva las tareas anteriores y queda registrada. Repetir una autorización antigua después de revocarla devuelve el estado actual; no vuelve a habilitarla.

## Persistencia y ejecución

| Componente | Responsabilidad |
|---|---|
| `minds_shadow_decisions` | Propuestas y revisiones; diferencias reales entre candidato y revisión, no solo campos declarados por el cliente |
| `minds_contextual_permissions` | Permiso exacto aprobado por usuario, revisión, evidencia y caducidad |
| `minds_permission_reviews` | Registro inmutable de autorizaciones y revocaciones con clave idempotente |
| `minds_autonomy_executions` | Recibo de tarea guardada con permiso y revisión utilizados |
| `minds_private.contextual_evidence` | Agregación explicable, sin escrituras de permisos |
| `minds_try_contextual_task` | Escritura atómica de una propuesta registrada por el servidor, tras revalidar permiso y evidencia |

Las tablas nuevas exponen lectura propia bajo RLS, sin escrituras directas desde `authenticated` ni `service_role`. Las tres RPC públicas son deliberadamente `SECURITY DEFINER`: requieren identidad autenticada y solo operan sobre esa identidad. Sus funciones auxiliares viven en el esquema privado. La RPC de revisión no tiene `EXECUTE` para `anon`, `PUBLIC` o `service_role`. Los avisos de Supabase sobre estas tres RPC autenticadas son esperados y corresponden a endpoints por usuario comprobados mediante pruebas de aislamiento; no implican acceso anónimo. Referencia del aviso: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

La revisión de evidencia, la autorización, la revocación y la ejecución usan el mismo bloqueo transaccional por usuario. Un permiso caducado, una categoría cambiada, evidencia antigua o contradictoria, una prohibición base o un contexto distinto hacen que la acción vuelva a pedir confirmación. El permiso almacenado no se amplía automáticamente. El recibo y la tarea se crean en una misma transacción. Reintentar una ejecución devuelve su recibo sin crear otra tarea, incluso después de una revocación o de una eliminación manual posterior. Las ejecuciones se registran como `executed`, nunca como `accepted`; no alimentan su propia evidencia de aprobación.

Solo clientes con `permission_protocol=contextual_v1` pueden acceder a esa ruta. Los clientes anteriores siguen recibiendo propuestas. El cliente nuevo solo vuelve al runtime completo cuando el gate rechaza explícitamente la ruta rápida; un error o corte de red no dispara otra operación. Tras recibir un recibo, la interfaz recupera la tarea desde Supabase.

## Infraestructura y verificación

Migración aplicada: `20261001185142_contextual_autonomy_v01`. El archivo se creó con Supabase CLI y se alineó con la versión asignada por la migración remota. No reaplicar migraciones anteriores. Funciones desplegadas: `isabella-chat` v53 e `isabella-fast-stream` v2, ambas con JWT. Las demás funciones y los cron existentes no se modificaron.

Verificación local: 150 tests Node correctos y build de ambas aplicaciones. La suite nueva de comportamiento cubre atestación de petición, compatibilidad con clientes anteriores, confirmación frente a ejecución, errores de base de datos, pérdida de respuesta, SSE incompleto y confirmación explícita en UI. La migración y su suite SQL se probaron primero en Postgres aislado.

Verificación en Supabase: `supabase/tests/contextual_autonomy.sql` y `supabase/tests/cognitive_integrity.sql` completas, ambas con resultado PASS. Incluyen separación de contextos y categorías, escasez de evidencia, correcciones reales sin anotación del navegador, clases excluidas, autorización explícita, evidencia y revisión desactualizadas, aislamiento entre usuarios, denegación al servicio, escritura atómica e idempotente, caducidad, política base restrictiva, evidencia contradictoria, revocación y replay. Todos los fixtures terminan en `ROLLBACK`; se comprobó que no quedó ningún usuario sintético.

Al verificar los datos reales había 16 revisiones: 14 aceptadas y 2 editadas. Las ediciones eran de fecha. Se desglosan en cuatro unidades históricas de contexto y alcance. Ninguna es elegible para autorización en esta v0.1. Había cero permisos contextuales, cero decisiones de autorización y cero ejecuciones bajo estos permisos. Esto es correcto: publicar la capacidad no equivale a concederla.

## Continuidad

El siguiente paso es observar nuevas revisiones reales y comprobar que se clasifican en el contexto correcto. No fabricar tareas personales para completar umbrales. La primera autorización real debe hacerla el usuario desde su pantalla, después de disponer de evidencia elegible. Los tests de ejecución no se presentan como uso real.

Siguen pendientes de observación el briefing del 2 de octubre a las 07:45 Europe/Berlin consumiendo Attention Economy cuando existan eventos pendientes, una Mission real completa y medición de latencia con muestras suficientes. Las notificaciones del sistema operativo con la web cerrada siguen fuera de esta build. Ninguno de estos pendientes autoriza nuevas acciones o permisos por sí mismo.
