# Isabella fase 2 · Bloque 2 — creación literal y Deshacer seguro

**Estado:** PR independiente sin fusiones ni despliegues. Código y migración deben revisarse juntos. Decisiones: D1 sí (creación directa reversible), D2 todavía no (ninguna modificación, movimiento, archivado o borrado general sin aprobación).

## Qué cambia

La creación directa de una tarea/evento solo puede autorizarse cuando la persona ha pedido **crear** algo de forma explícita, `direct_user_excerpt` aparece literalmente en su mensaje original, el **título normalizado** está en ese mismo mensaje y la preferencia del propietario permite `create_mode:'direct'`. Ningún modelo, memoria, precarga o documento autoriza un título nuevo.

La precarga contextual de Work deja de bloquear la instrucción literal del usuario por sí sola, pero se conserva en los metadatos como procedencia. Un segundo campo `direct_owner_source_tainted` permite al SQL distinguir una precarga no autoritativa de una lectura efectiva de documentos, web o Sofía. Las herramientas anteriores del turno solo pueden ser `search_calendar`, `search_routines` y `search_memory`; las creaciones de un mismo lote son admisibles en la ronda actual. Las herramientas restantes deshabilitan la autorización directa. No se modifica la protección `sourceTainted` de memoria autobiográfica.

En eventos con hora válida y duración **ausente** en el candidato, el servidor inserta 60 minutos y marca `duration_defaulted:true`. No se inventa que Gari mencionó una duración. El SQL admite esa opción solo si el propietario proporcionó una cita literal de la hora, la duración resultante es exactamente 60 y existe una decisión canónica registrada. Una duración calculada por el modelo sin cita no abre el modo directo; puede permanecer para revisión. La interfaz muestra **1 h · editable** para esa duración. En el editor la duración puede modificarse.

El botón **Deshacer** aparece únicamente bajo el aviso del sistema con recibos confirmados de creaciones directas. Se invalida al siguiente mensaje de Gari o a los diez minutos, lo que llegue antes. La función SQL `minds_undo_direct_calendar_batch_v01` revierte **todos** los recibos originales o ninguno, dentro de una sola transacción, con `auth.uid()`, recibos con propietario y fecha, autorización original, comparación exacta de estado y registro de actividad. Una tarea se archiva; un evento se elimina y recibe una tombstone de sincronización. No existe una función de borrar/archivar de uso general. No hay reintento automático después de un error ambiguo: la UI lo explica sin decir que se revirtió.

Las respuestas propias de Isabella (`isabella_reply`) siguen mostrándose antes del aviso de sistema, sin convertir una propuesta en ejecución.

## Dependencia de esquema

Nueva migración **obligatoria** y no aplicada:
`supabase/migrations/20261108101000_isabella_direct_calendar_safe_undo_v02.sql`

La migración reemplaza de forma no destructiva la función RPC de creación directa existente y añade dos nuevas funciones de reversión muy acotadas. No elimina políticas ni tablas, no modifica datos actuales, no contiene actualizaciones masivas y no se aplica automáticamente. No ejecutar el frontend nuevo sobre un SQL viejo: `direct_owner_source_tainted` ausente falla en SQL (seguro por defecto), y las peticiones de Undo devolverían función desconocida.

## Medidas de prompt por componente

Medición determinista con `promptComponentSizes()` en `tests/isabella-fase2-bloque2.test.mjs`, input y contexto inventados. La única variación de prompt proviene de la descripción de `create_event`, donde se introduce la regla de duración ausente:

| Componente | Antes | Después | Variación |
|---|---:|---:|---:|
| Instrucciones del ejemplo | 32 | 32 | 0 |
| Contexto | 26 | 26 | 0 |
| Input | 82 | 82 | 0 |
| Herramienta `create_event` JSON | 149 | 356 | +207 |
| Número de herramientas | 1 | 1 | 0 |

Se conserva el resto de instrucciones, herramientas, input y contexto de producción. Estos tamaños son una comparación aislada del campo modificado, no una medida de consumo real de un turno.

## Verificación y aceptación

Tests puros: contrato de cita/título; contenido ajeno bloqueado; rondas de solo lectura; lote de varias creaciones; fecha/hora y duración por defecto; condiciones SQL y existencia del recibo; botón elegible/expirado; lectura canónica tras Undo; error o red ambigua sin éxito falso ni reintento.

`node --test tests/isabella-fase2-bloque2.test.mjs tests/direct-calendar-create.test.mjs tests/direct-calendar-client-receipts.test.mjs`, suite Node completa, Deno check de `isabella-chat`, Chromium, Window y SQL en CI. La nueva migración requiere **revisión humana y prueba aislada de PostgreSQL** antes de aplicarse. No ejecutar tests contra producción.

La aceptación manual, tras aprobación y despliegue, debe usar una **tarea inventada**, confirmar que se creó con recibo, deshacer inmediatamente, verificar que pasó a archivada, y probar error, caducidad, cambio de estado y nuevo mensaje. Comprobar evento con duración ausente y duración «1 h · editable». Verificar que mover/completar/borrar sin revisión siguen bloqueados.

## Despliegue y reversión — solo después de revisión

Orden: revisar y aplicar migración SQL; desplegar `isabella-chat`; publicar PWA. No hay cambios de otras Edge Functions. El usuario puede volver a `create_mode:'review'` inmediatamente si detecta un problema. Para restaurar código anterior, revertir la PR y, si se ha aplicado la migración, aprobar una nueva migración `CREATE OR REPLACE` restaurando la función anterior: no borrar políticas/tablas ni el historial.

**No fusionar o desplegar desde este encargo.**
