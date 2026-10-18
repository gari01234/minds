# Build 93.5 — Bernried real-source coverage and extraction-gap disclosure
**Fecha:** 2026-10-18. Investigación iniciada tras [#166](https://github.com/gari01234/minds/issues/166) y criterio de conocimiento [#113](https://github.com/gari01234/minds/issues/113).

## Objetivo / decisión

Priorizar que Isabella utilice plenamente sus fuentes y declare lo que falta **antes de migrar a un runtime externo**. Se conserva `native_minds`. Un Agents SDK que solo cambie el loop no repararía una fuente sin texto ni mejoraría la disciplina de cobertura. El cambio de este PR es pequeño, reversible y no crea infraestructura de agentes.

## Evidencia auténtica comprobada (producción)

Inspección **de lectura** en Supabase de Bernried, sin descargar ni copiar originales a GitHub y sin publicar texto de proyecto. Son observaciones puntuales, sujetas a cambios posteriores:

- 28 originales; 25 con `index_status=indexed`, tres con `waiting_parser`.
- 154 segmentos de texto materializados y **los 154 son de versiones actualmente declaradas** por los archivos. 24 comprobantes actuales: tres `complete_text` y 21 `partial_text`.
- Uno de los 25 `indexed` tiene **cero segmentos vigentes y cero comprobantes de texto**, porque posee una ingesta previa de 20 claims y `knowledge_intake.coverage=claims_only`. No se debe interpretar `indexed` como lectura íntegra. Hay además tres originales sin texto en `waiting_parser`.
- Una invocación controlada a la RPC `minds_find_work_source_occurrences` con contexto `auth.uid` establecido al propietario del proyecto devolvió **35/35** coincidencias de `Caféraum` en nueve documentos: páginas de 12, 12 y 11 entradas, con huella estable, sin duplicados, contra recuento SQL independiente. En la presentación Kick-off, el resultado contiene páginas verificadas **3, 4, 8, 11, 13 y 15**. Una huella deliberadamente errónea devolvió `version_changed`. La RPC dice explícitamente `full_originals_verified:false`.
- **Límite:** la prueba fue SQL con una afirmación de propietario controlada, no una sesión navegador JWT ni una respuesta modelada y entregada por Isabella. No acredita lectura visual, interpretación, cronología ni iPhone.

## Origen y reintento acotado de un vacío

Un PDF de aproximadamente 8 MB, ya procesado mediante 20 claims, tenía cola `docling_enrichment` terminal `failed`, cuatro intentos y error `docling_http_404` del 12/10; cero segmentos. El servicio Docling privado de Railway en Europa se encontraba desplegado y mostró dos conversiones completadas el 15/10 con endpoints de estado y resultado HTTP 200. Los logs históricos también contienen respuestas 404 de polling; **no se ha establecido con certeza la causa**, aunque el estado efímero de tareas entre arranques es una hipótesis plausible.

Se reactivó **solo la fila coincidente** con condiciones de estado, fuente, versión, cobertura y error: `queued`, intentos cero, último error y task ID antiguo vacíos, conservando la ingesta previa. Tras la operación, el recibo todavía era cero y **los 20 claims permanecían intactos**. El trabajo futuro corresponde al runner existente, con sus límites de reintentos, y su éxito **no está aceptado ni garantizado**. No se alteraron valores de Railway, regiones, roles, funciones productivas, ni se migraron originales.

## Ajuste del runtime nativo bajo revisión

La función existente `find_work_occurrences`, al devolver la **primera página válida** (offset cero), consulta automáticamente el catálogo owner-scoped ya implementado en `browse_work_sources` (máximo 50). El helper puro `summarizeWorkExtractionGaps` devuelve un recibo corto que identifica archivos con parser pendiente o sin comprobante actual, y cuantifica los archivos con extracción parcial. No adjunta contenido ni interpreta `complete_text` como comprensión del original. La página del catálogo debe estar realmente completa para declarar `catalog_status:complete`; si hay más de 50 archivos, marca `partial` y `gap_list_truncated`. Fallos del catálogo no invalidan la búsqueda exhaustiva; se devuelve `unavailable` y no se inventa un resultado de cero brechas.

**Costo:** dos lecturas SQL adicionales para la primera página de la herramienta; potencial ahorro de una segunda llamada del modelo al catálogo, todavía **no medido**. Este es un incremento intencionadamente limitado, no un reemplazo de recuperación. Si se aprecia una regresión de latencia o tokens, revertirlo sin cambiar las tablas.

## Aceptación por capas

1. **Verificado ahora:** motor SQL recupera 35/35 segmentos vigentes con páginas tardías; estados de extracción auditados; un reintento de Docling preparado y recibido en la cola.
2. **Verificable en CI del PR:** helper ante catálogo completo/parcial/ausente y límites de salida; `deno check` del chat y suite general, sin acceso a originales.
3. **Pendiente para despliegue:** verificación de una primera página auténtica `find_work_occurrences` desde Isabella autenticada tras publicar una versión nueva; confirmar que el resumen no altera el loop ni degrada latencia.
4. **Pendiente decisivo:** Isabella debe responder al problema multi-documento de Bernried sin que Gari le tenga que enumerar documentos, citar todas las páginas pertinentes, distinguir `Caféraum` de `Luftraum` y `Raumprogramm`, declarar las fuentes sin texto y entregar una respuesta comprobable en navegador y móvil. Una herramienta correcta no sustituye esta prueba.

**Política:** PR merge ≠ deploy ≠ aceptación E2E. Una comparación con Agents SDK solo merece hacerse si existe una brecha de ejecución real que el SDK pueda resolver con **menos complejidad total** que esta arquitectura nativa.
