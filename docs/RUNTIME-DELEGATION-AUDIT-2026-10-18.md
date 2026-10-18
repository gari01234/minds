# MINDS — Runtime Delegation Audit · Phase 1
**Fecha:** 2026-10-18 · **Base auditada:** \`a13fa5848373df34c7366daaa1fe0c276937a999\` · **Issue:** [#166](https://github.com/gari01234/minds/issues/166)

## Pregunta y criterio de éxito

**MINDS debe construir lo que hace singular a Isabella y aprovechar infraestructura externa cuando ofrezca capacidades generales mejores, sin transferir autoridad sobre conocimiento, memoria ni decisiones.**

No es una iniciativa para cambiar de marca/modelo. Tampoco basta con demostrar que un SDK llama herramientas. Hay que **identificar código y obligaciones propias que pueden desaparecer** sin perder garantías. La economía de infraestructura no puede convertirse en una pérdida de conocimiento, seguridad o fiabilidad.

Estado de esta fase: **auditoría basada en código + prueba aislada de una frontera de ejecución**, no migración de producción. Ningún original, recuerdo, token personal ni ruta de Work cruza a un servicio nuevo en el spike. CI verde del spike sería evidencia de mecanismo, **no de paridad operativa**.

## Inventario de responsabilidad actual (lectura del código, no cálculo de ahorro)

| Responsabilidad observable y evidencia | Dueño necesario | Candidato a delegar | Qué NO demuestra el experimento del 17/10 |
| --- | --- | --- | --- |
| Llamadas reiteradas a Responses, tool-call/result exchange, límites de rondas, fallos de modelo: \`supabase/functions/isabella-chat/index.ts\`, aprox. líneas 3859–4260 | MINDS debe fijar admisión, política de límites y contrato de resultado, **no necesariamente ejecutar el bucle** | **Agents SDK**, dentro del worker controlado; eventualmente managed API si privacidad lo permite | 21/21 en fixture no mide reducción de líneas, menos fallos ni operaciones largas |
| Enrutamiento a fast agenda, Work, Sofía, contexto y scopes: \`isabella-chat/index.ts\`, aprox. líneas 3020–3120 | **MINDS**, por exposición consentida y frontera autobiográfica | Un SDK puede transportar contexto ya autorizado; nunca elegir a qué datos accede mediante permisos implícitos | Paridad de corpus no mide contaminación entre ámbitos |
| Catálogo/recuperación de fuentes, \`find_work_occurrences\`, versiones y coverage ledger: \`isabella-chat\`, \`_shared/work-occurrence-coverage-ledger.mjs\` | **MINDS determinista** (Source-First, permisos, evidencia, gap de parser) | El agente solo invoca una herramienta de lectura autorizada | Recuperar 21 registros sintéticos no prueba comprensión visual de planos |
| Propuestas, revisión, reloj semántico, decisiones \`allow/confirm\` e idempotencia: \`isabella-chat/index.ts\`, aprox. líneas 3936–4040 | **MINDS**; una pausa del SDK no es autorización para escribir | **SDK interruption/state** puede reemplazar parte del *control flow* de espera y reanudación | No se probó antes una revisión SDK que cruce un proceso ni la exactitud de bindings MINDS |
| Mission Runner, reactivación por tiempo/capability/expectation y estado de Commitment: \`supabase/functions/isabella-mission-runner/index.ts\`, \`apps/isabella/BUILD-82.md\` | **MINDS** (transacciones, wait states, expectativas y wake semántico) | Agente/SDK ejecuta razonamiento de *un checkpoint*, no sustituye la máquina persistente automáticamente | Benchmark de una respuesta no compara horas/días ni retries tras caída |
| Capability Runtime, runner con \`provider_response_id\`, Artifact Intake y entrega: \`supabase/functions/isabella-capability-runner/index.ts\` y \`_shared/capability-runtime.ts\` | **MINDS** para resultado canónico, revisiones, retry e identidad de entrega | Modelo/executor de capacidad pueden externalizarse; reusar el runtime que ya existe | Ni SDK ni managed fueron medidos contra recuperación de artefactos y cambios parciales |
| Observabilidad de fuente admitida/usada/citada; delivery receipts: \`isabella-chat\`, Builds 93.3–93.4.1 | **MINDS** como verdad del run y de entrega | SDK traces son diagnóstico auxiliar, no prueba soberana ni memoria del usuario | Completeness textual no equivale a respuesta visible en iPhone |

**Hallazgo concreto:** la extracción con mejor relación beneficio/riesgo sería **el bucle genérico de modelo/herramientas y sus interrupciones**, manteniendo en MINDS admisiones, adaptadores de tools, registro determinista de cobertura, persistencia, autorización de side effects y delivery. La coincidencia de funciones entre los runtimes hace plausible esa hipótesis; **todavía no demuestra eliminación neta de complejidad**. Habrá trabajo adaptador, instrumentación, mapeo de estado y tests.

## Tres alternativas reales

**A — Responses propio (baseline).** Supabase Edge ejecuta loop de Responses y herramientas. Ventaja: identidad, RLS y aprobaciones ya integradas. Coste observado: orquestación extensa, tratamientos distintos de stream/tool/durable, riesgo de mantener lógica de reintentos. Ya existe; no reimplementar.

**B — Agents SDK hospedado por MINDS (primera candidata a integración).** Delegar al SDK el loop/interrupciones y conservar herramientas con guardias de MINDS. Alojamiento de loop sigue bajo MINDS; el modelo seguirá procesando los datos API que se le envíen. SDK **no** sustituye por sí solo Mission Runner, RLS, SQL, garantías de autoría, Artifact Intake, recuperación del browser ni residencia del modelo. Para tareas largas usar el runtime existente fuera de un request limitado de Edge, no una nueva base.

**C — Agents API gestionada (candidata condicionada).** Puede aportar sesiones y ejecución gestionadas, pero según [documentación consultada el 18/10](https://developers.openai.com/api/docs/guides/agents-api/overview) las sesiones tienen residencia EEUU y no admiten ZDR, incluso con sandbox self-hosted. Corpus Bernried, originales y memoria personal **no** se transfieren a este flujo sin revisión específica del tratamiento. Las smokes sintéticas del #166 no justifican adopción. No confundir SDK autoalojado con sesión gestionada.

## Experimento agregado en este PR: *approval/resume parity*

\`experiments/agent-runtime-parity/sdk-approval-resume.test.mjs\` usa el **Runner real de Agents SDK v0.20.0** y un *Model* determinista ficticio. No necesita clave, modelo remoto ni datos de MINDS. Examina cuatro condiciones: una herramienta sensible interrumpe sin ejecutarse; aprobar su estado en SDK **no** autoriza una escritura en MINDS; solo la coincidencia exacta de identidad, scope, acción, solicitud y argumentos admite una única ejecución simulada; un scope equivocado falla cerrado.

El ledger del experimento es deliberadamente un \`Map\` en memoria: prueba la **separación lógica** entre aprobación de SDK y autorización MINDS, no transaccionalidad, RLS real, persistencia durable ni deduplicación tras caída de proceso. La siguiente fase debe utilizar los recibos y RPCs canónicos **ya existentes**, sin crear un segundo sistema de permisos.

CI de este PR ejecuta el test por defecto junto con las pruebas anteriores de paridad; la ruta de modelos de pago del workflow original continúa **solo con \`workflow_dispatch\`**, nunca por PR.

## Decisión de fase y siguientes puertas de aceptación

**Puerta 1: ejecución aislada:** SDK real debe interrumpir antes de herramienta sensible; no escribir sin autorización canónica; reanudar con consentimiento válido. Sintético, con pruebas sin API de pago. Si falla, se corrige *solo el spike*; no tocar producción.

**Puerta 2: baseline de complejidad:** medir de forma verificable qué bloques de \`isabella-chat\` / Mission Runner / Capability Runtime se reemplazarían, cuántos nuevos adaptadores son necesarios, latencia y número de rutas de error; registrar *net code ownership*, no solo líneas borradas. Verificar que todos los tools existentes conservan policy y provenance.

**Puerta 3: piloto real read-only y reversible:** con un conjunto de documentos ya autorizado por el usuario, cambiar solo una ruta de investigación controlada (no el chat completo), pasar tools *owner-scoped* que produzcan recibos deterministas, emitir \`minds_agent_runs\` y hacer *source-to-answer audit*. Mismo corpus, mismo modelo y mismas herramientas que Responses; evaluar tool calls, token usage, entrega, errores y cobertura. El piloto no se habilita con datos reales hasta pasar las puertas anteriores.

**Puerta 4: continuidad y acciones:** simular suspensión tras lectura, aprobación pendiente, *worker crash*, lease expiry, reanudación tras una nueva instancia, duplicado de solicitudes y entrega desconectada. Comparar A/B con Mission Run y receipts existentes; confirmar que la misma autorización produce como máximo un efecto. Incluye sistema real de RLS y pruebas en dispositivo autenticado.

**Puerta 5: simplificación neta demostrada:** migrar alguna ruta únicamente si la calidad de cobertura/provenance no disminuye, los side effects no se amplían, la entrega sobrevive y el coste operativo/complexity owned disminuye. Si no, conservar Responses. La decisión es por capacidad y reversible; no hay migración de memoria ni fuente de verdad.

### Límites verificados

El PR actual no altera \`isabella-chat\`, misión, migraciones, RLS, prompts de producción, notificaciones, secretos ni configuraciones OpenAI. El éxito del PR no significa que Build 93.4 esté aceptado en Bernried: esa aceptación E2E sigue abierta. Los resultados de bench anteriores constan en [#166](https://github.com/gari01234/minds/issues/166); no repetir pruebas de 21 evidencias solo para elevar números.

La meta operativa sigue siendo **retirar complejidad no diferenciadora a medida que demostramos una Isabella más capaz**. No adoptar un SDK por novedad ni defender el bucle propio por inercia.
