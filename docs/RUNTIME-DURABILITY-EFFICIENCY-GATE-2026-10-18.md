# MINDS · Runtime durability efficiency gate
**Fecha:** 2026-10-18 · **Issue:** [#166](https://github.com/gari01234/minds/issues/166) · **PR:** [#177](https://github.com/gari01234/minds/pull/177)

## Decisión de esta puerta: conservar native_minds para continuidad, NO promover SDK

El objetivo rector sigue siendo retirar infraestructura general que no diferencie a Isabella, pero **solo** cuando la alternativa sea realmente más eficiente y no reduzca conocimiento, procedencia, memoria ni autoridad. Una librería adicional no es una mejora por defecto.

**Evidencia de producción revisada en lectura, sin modificar datos:** las funciones SQL existentes \`minds_claim_mission_runs\`, \`minds_apply_mission_step_v2\` y \`minds_fail_mission_step\` forman un ciclo de leases y ejecución persistente. \`minds_claim_mission_runs\` aplica \`FOR UPDATE SKIP LOCKED\`, crea \`lease_token\` UUID y una ventana de cuatro minutos, y reclama ejecuciones vencidas. \`minds_apply_mission_step_v2\` exige run \`running\`, token coincidente y \`lease_until>=now()\`, bloquea fila, registra items/eventos y cierra lease en una operación transaccional. \`minds_fail_mission_step\` aplica límites de reintento (hasta cuatro), backoff y estado terminal. En Supabase de producción, llamadas con UUIDs ficticios inexistentes a apply/fail devolvieron \`{"status":"stale"}\`; no se empleó ningún run real ni se alteró estado. **El test de UUID inexistente no prueba por sí solo todas las carreras o políticas RLS de producción**.

## Comparación nueva realmente ejecutada

El experimento \`experiments/agent-runtime-parity/durable-worker.test.mjs\` emplea dos ejecuciones (\`native\` y \`sdk\`), cada una con workers Node nuevos sobre el mismo esquema temporal SQLite con persistencia en disco. El código está aislado de Supabase; no carga documentos, secretos, memoria ni APIs de pago. El SDK se ejecuta realmente con \`@openai/agents@0.20.0\` y un proveedor ficticio determinista. En \`sdk\` se persiste un \`RunState\` y se reconstruye dentro de otro proceso; en \`native\` solo se reanuda el checkpoint sin snapshot SDK.

Ambas vías verificaron: denegación de aprobación por owner/scope incorrecto, ausencia de efecto antes de aprobación, aceptación única, caída REAL de proceso con código 81 después de confirmar un recibo pero antes de marcar completion, rechazo de reejecución con lease sin vencer, expiración simulada, reanudación en nuevo proceso, y exactamente **un único** efecto canónico tras replay por clave única. El esquema simulado usa \`BEGIN IMMEDIATE\` + clave única, no pretende ser una implementación alternativa de SQL de MINDS. Es una **prueba de persistencia entre procesos del laboratorio**, no un E2E de Supabase.

[GitHub Actions · synthetic SDK parity #39126517986](https://github.com/gari01234/minds/actions/runs/39126517986): 10/10 tests PASS (incluye seis de PRs #174–175 y dos heredados, más los dos nuevos). [Verify MINDS #39126518016](https://github.com/gari01234/minds/actions/runs/39126518016): PASS. En una ejecución por ruta, el tiempo total del test multiproceso fue 6.051 ms (native) y 6.143 ms (SDK). **Es tiempo de arranque de subprocesos y CI con un modelo simulado, no benchmark de latencia inferencial o producto; no extrapolar**.

## Valor incremental observado frente a coste añadido

| Capacidad | Native actual | SDK + capa MINDS |
| --- | --- | --- |
| Claim transaccional, lease y protección de workers concurrentes | Existe en PostgreSQL | Sigue siendo obligatorio y propiedad de MINDS |
| Autorización por usuario, scope y operación | Existe como contrato MINDS; necesita aceptación E2E por rutas | Sigue siendo obligatorio; aprobar en SDK no equivale a aprobar en MINDS |
| Deduplicación y comprobantes | Existen mecanismos canónicos; cobertura real por flujo aún por validar | Deben conservarse; SDK no garantiza atomicidad con escritura SQL |
| Pausar y serializar el contexto de un agente mid-turn | No demostrado como mecanismo genérico del loop nativo | **Sí**: \`RunState\` serializado y reconstruido (demostrado sintéticamente) |
| Trabajos durables, Expectations y dependencias | Mission Runner existente y otros runners | No desaparecen por incorporar SDK |
| Código nuevo necesario para incorporar esta capacidad en producción | Ninguno para el flujo duradero existente | Serialización protegida, versionado de snapshot, lease binding, adaptadores de herramientas, integridad, observabilidad, reanudación y pruebas reales |

**Resultado:** SDK es técnicamente viable, pero **no demuestra una ventaja de eficiencia en la continuidad persistente frente al native actual**. Se mantiene \`native_minds\` sin cambios de producción. La capacidad de reanudar un turno interrumpido a nivel de agente puede ser valiosa en una ruta concreta si surge un caso sin solución nativa equivalente; no justifica instalar un segundo runtime general.

## Qué no se ha demostrado

No hubo prueba E2E autenticada con datos de Bernried, RLS real, varios workers contra Supabase, reconexión iPhone, igualdad de calidad de razonamiento ni costo por pregunta. La autorización en SQLite es una simulación exacta del contrato, no una invocación de las RPC canónicas. Las pruebas no acreditan que la infraestructura nativa cubra todas las rutas ni que Agents SDK sea siempre inferior. La equivalencia de crash/replay de este fixture tampoco certifica durabilidad tras una caída de toda la base.

## Siguiente pregunta de investigación (independiente de la durabilidad)

Queda abierta la posible **delegación del bucle de herramientas de solo lectura** del chat, que tiene otra estructura de costos y puede reducir orquestación sin sustituir Mission Runner. El siguiente estudio debe identificar líneas realmente retirables frente a adaptadores nuevos y comparar mismo modelo/herramientas/fuente con Responses, priorizando evidencia real. Antes de gastar en más benchmarks sintéticos, terminar la aceptación de Build 93.4/93.4.1 en Work real o tener un caso diferencial medible. Si native alcanza igual o mayor cobertura/calidad con menor operación y no necesita nuevo runtime, **native gana y no se migra**.

**Distinciones:** archivo fusionado y CI verde ≠ worker SDK productivo ≠ acceptance end-user. Supabase sigue fuente de verdad; no crear almacenamiento duplicado del estado del agente y no enviar proyectos a managed Agents API sin revisión específica.
