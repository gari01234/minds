# Isabella · Fase 2 · Bloque 1

**Estado:** propuesta de código; no fusionada ni desplegada. Documento de referencia: encargo del 08.11.2026. No se ejecutaron consultas ni pruebas contra producción.

## Propósito

Conservar **una sola Isabella** entre el chat global, los Threads de Work y el resumen de rutina. Reutiliza `ISABELLA_CORE` y `relationshipPolicy`, sin crear un segundo agente, nuevas tablas ni cambiar la autoridad de herramientas. Permite observar dónde se pierde tiempo sin escribir mensajes, datos ni claves en telemetría.

## Qué cambia

La rutina ahora construye sus instrucciones con `isabellaRoutineInstructions({relationship:relationshipPolicy("proactive")})`. No crea ni modifica tareas, eventos o rutinas; mantiene las restricciones de no divulgar jerga interna, distinguir hechos de inferencias y buscar en web solo cuando la rutina lo pida. Su input contiene `memoria_de_isabella`, derivada de las páginas/hilos existentes de dreaming mediante `consolidatedMemoryView`, y `radar_work`, derivado de `workRadar`. Ambos se consultan con `user_id` explícito, porque el runner usa cliente de servicio. Las fuentes ya presentes de agenda siguen sin modificación y los eventos se muestran en la zona horaria local.

Work reutiliza `isabellaCoreInstructions` y añade siempre `CORE_DETAILS.work`. Las frases relevantes se recuperaron **literalmente** del prompt antiguo: segmentos documentales, modo de Thread, consulta a Work y consulta a Sofía. Se conserva `resolvedContext` completo salvo la restricción del índice autobiográfico a páginas centrales `gari`, `relacion` e `isabella`; el historial, las fuentes y el contenido completo de Work conservan el tratamiento anterior. El detalle de Work no sustituye los permisos de las herramientas.

El modo Work usa `context_tier:"work_core"` y reporta `core_version`. **Rollback inmediato de Work:** variable de entorno `ISABELLA_WORK_CORE=off` en la Edge Function devuelve el prompt antiguo, que se conserva completo. En ausencia de `off`, usa el nuevo núcleo.

Se instrumentan `phase_ms.route`, `phase_ms.context`, `phase_ms.rounds[]` y `phase_ms.total` mediante `performance.now()`. Los diagnósticos solo exponen duraciones numéricas saneadas, sin mensajes, transcripciones, contenido de memoria ni instrucciones. El runner guarda únicamente los recuentos de `promptComponentSizes()`.

## Tamaños de prompt: comparación reproducible

Cálculo con la estructura de `promptComponentSizes()` sobre **plantillas públicas y contexto inventado**, no sobre datos reales. Para Work, las dimensiones de contexto, input y tools son idénticas a propósito: las fuentes de Work no se recortan. En el prompt antiguo se mide el cuerpo fuente literal del template, **sin expandir interpolaciones dinámicas**; los números no representan consumo real del proveedor.

| Tipo | Componente | Antes (caracteres) | Después (caracteres) | Motivo |
|---|---|---:|---:|---|
| Work (fixture) | Instrucciones | 44.109 | 19.870 | Mismo núcleo + contrato documental específico |
| Work (fixture) | Contexto | 91 | 91 | Fuentes Work intactas en el fixture |
| Work (fixture) | Input | 79 | 79 | Ninguna modificación al mensaje |
| Work (fixture) | Herramientas | 75 | 75 | Autoridad y catálogo idénticos |
| Rutina (plantilla) | Instrucciones | 8.114 | 13.905 | Se añade el núcleo común, no un prompt de scheduler |
| Rutina (plantilla) | Input, sin datos | 1.759 | 2.018 | Nuevos campos etiquetados de memoria y radar |
| Rutina (fixture) | Contexto separado | 2 | 2 | Sin contexto extra fuera del input |
| Rutina (fixture) | Herramientas | 48 | 48 | web_search sin cambio |

Los tamaños finales variarán con las páginas, la agenda y la evidencia recuperada. Los recuentos efectivos quedan disponibles como `prompt_components` para las rutinas y para los turnos Work; para Work se fija el objetivo observacional de **menos de 32.000 caracteres de instrucciones**, sin recortar evidencia. La rutina aumenta instrucciones y contexto **deliberadamente** para conservar carácter, memoria y radar proactivo. No hay aumento de herramientas.

## Pruebas

`tests/isabella-phase2-block1.test.mjs` comprueba la presencia del núcleo en rutinas, reglas de no mutación, consultas con `user_id`, restauración literal de fragmentos Work, rollback, memoria de tres páginas, tamaño comparado con `promptComponentSizes` y diagnósticos de tiempo sin contenido. Se mantiene toda la suite antigua y el contrato Source-First.

## Revisión y despliegue pendientes

Solo cuando el revisor apruebe y las siete comprobaciones sean verdes: fusionar y desplegar **`isabella-routine-runner`, `isabella-chat`, `window-mcp`** desde un commit verificado. Ninguna migración SQL. El PR no dispara despliegues en producción. Para revertir, establecer `ISABELLA_WORK_CORE=off` (solo Work) o revertir el commit fusionado y desplegar versiones anteriores de las tres funciones.

La aceptación real debe comprobar que el resumen matinal siga siendo útil y que Work no pierde contenido documental ni provenance, y comparar `turn_diagnostics.phase_ms` con registros reales obtenidos por el propietario después del despliegue, no antes.
