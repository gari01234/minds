# Isabella · Fase 2 · Bloque 1

Fecha: 08.11.2026. Base de desarrollo: `main b9f9a0930d34d4cac56d75c5d91037b544080ac9`.
Estado: propuesta para revisión; **sin fusionar ni desplegar**.

## Qué cambia y por qué

Las rutinas proactivas incorporan `ISABELLA_CORE` y el contrato de relación, sin sustituir las restricciones de solo lectura. La rutina matinal recibe, bajo filtros de propietario explícitos (cliente de servicio), un índice consolidado de memoria, hilos y el radar de Work. La agenda ya continúa llegando en horario local. Los textos proactivos priorizan lo importante y evitan la plantilla de informe, sin crear, editar, completar ni borrar tareas o eventos.

Los turnos Work, incluidos los Threads persistentes, utilizan el mismo núcleo conversacional con `CORE_DETAILS.work`, extraído **literalmente** del prompt anterior. No se recorta `routed_work_context`, `resolvedContext`, las herramientas ni la procedencia. Solo se añaden páginas de memoria central (identidad, relación, Isabella), sin hilos de terceras personas. Con `ISABELLA_WORK_CORE=off` el turno vuelve a las instrucciones completas antiguas; no se elimina el prompt antiguo.

Se miden `phase_ms.route`, `phase_ms.context` (incluye agenda y memoria central, cuando corresponda), `phase_ms.rounds[]` y `phase_ms.total` en metadatos del run. `turn_diagnostics` expone esos números dentro de su lista blanca, nunca texto de mensajes ni argumentos de herramientas.

## Tamaños antes y después (caracteres)

Medición estática reproducible con `promptComponentSizes()` y una **fixture sintética**, no datos de producción. La instrucción Work antigua se mide como cuerpo de la plantilla conservada en `isabella-chat/index.ts`; la nueva combina núcleo, detalles Work/memoria/ajustes y las mismas capacidades de ejemplo. Los tamaños exactos en ejecución se registran ya en `prompt_components` y dependen de ruta, herramientas y estado.

| Componente | Work antes | Work con núcleo | Variación |
| --- | ---: | ---: | ---: |
| Instrucciones | 42.796 | ≈18.869 | ≈−56 % |
| Contexto de prueba | 171 | 171 | 0 |
| Input de prueba | 96 | 96 | 0 |
| Herramientas de prueba | 86 | 86 | 0 |

La longitud de instrucciones de la rutina anterior era aproximadamente 870 caracteres de plantilla fija, además de su contrato de relación. La nueva incorpora el núcleo de 5.244 caracteres, el contrato de relación y un pequeño bloque de reglas de rutina. Es un aumento deliberado: se sustituye un segundo personaje proactivo por la misma Isabella. La medición operativa `promptFootprint=promptComponentSizes(...)` permite observar el coste real y revisarlo tras la prueba.

El nuevo `context_tier=work_core` y `core_version` permiten distinguir rutas y comparar consumo; la carga de la fuente Work se preserva. No se ha ejecutado ningún turno contra OpenAI ni consultado datos personales para esta tabla.

## Pruebas

`tests/isabella-phase2-block1.test.mjs` verifica la identidad única, la prohibición de escrituras en rutina, la presencia de memoria/radar owner-filtered, la literalidad de todas las líneas largas de Work, el rollback por variable de entorno, el presupuesto Work (<32k en fixture estándar) y la presencia de tiempos en los metadatos y `turn_diagnostics`. La suite existente del repositorio debe seguir verde, incluidos tests de Work y 12 momentos. `deno check` aplica a las tres funciones afectadas.

## Despliegue después de revisión

Requiere desplegar **`isabella-routine-runner`**, **`isabella-chat`** y **`window-mcp`** una vez autorizado por Gari o Claude. Este PR no debe ejecutarlo. No hay migraciones, cambios de tabla, secrets ni modificaciones de proyectos.

## Reversión

Para volver al prompt antiguo de Work, configurar `ISABELLA_WORK_CORE=off` y revisar el comportamiento. Para revertir completamente, revertir esta PR antes de desplegar, o volver a versiones anteriores de las tres funciones tras la aprobación correspondiente. La memoria y los datos existentes permanecen sin modificar.
