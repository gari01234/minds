# Build 79 — Capability Runtime & Ambient Presence v0.1

Fecha: 4 de octubre de 2026.

## Motivo

Build 79 nace de un fallo de producto concreto.

Ante la petición natural de Gari de preparar una Teilnehmerliste para una reunión de Bernried, Isabella respondió con texto y Markdown. ChatGPT entendió que el objetivo real era un objeto de trabajo y produjo un PDF imprimible y un Word editable.

El fallo no era que el modelo desconociera una tabla. MINDS había construido un control plane sólido y había dejado a Isabella con un capability plane demasiado estrecho.

Build 79 corrige esa asimetría.

## Referencias estudiadas

La arquitectura se reconcilió explícitamente con tres familias de referencia.

### OpenAI Dots

Se adopta el principio de un agente persistente que puede seguir trabajando entre conversaciones, utilizar una computadora/runtime y devolver resultados cuando terminan.

No se adopta Dots como segundo cerebro. Isabella/MINDS mantiene identidad, memoria, autoridad, proyectos y provenance.

### OpenClaw

Se adopta conceptualmente la separación:

`Models reason. Tools act. Skills teach. Plugins extend.`

También se adopta el patrón de execution bias: una petición accionable debe intentar completarse hasta un resultado útil o quedar realmente en curso/bloqueada. La política de herramientas y autoridad gobierna el riesgo; el modelo no debe sustituir innecesariamente ejecución por explicación.

No se importa OpenClaw como runtime ni dependencia.

### Coucou

Se adopta el desacoplamiento entre executor y presencia.

Una superficie pequeña puede mostrar que Isabella está preparando, trabajando, terminó o falló sin obligar a abrir el chat. Esa superficie puede además ofrecer intervención mínima, como cancelar un trabajo.

No se reutilizan Mochi, nombre, assets, sonidos ni identidad visual de Coucou.

## Arquitectura

Build 79 divide con mayor precisión MINDS:

```
                        Isabella
                           │
                    reasoning / intent
                           │
          ┌────────────────┴────────────────┐
          │                                 │
     CONTROL PLANE                    CAPABILITY PLANE
          │                                 │
     memory                             web search
     authority                          Work reads
     projects                           image generation
     provenance                         general execution
     permissions                              │
     attention                                ▼
     relationship                    OpenAI container
     knowledge                         code + files
                                             │
                                             ▼
                                   usable deliverables
```

MINDS gobierna.

Las capabilities proporcionan manos.

## Capability Registry

`_shared/capability-registry.ts` introduce un catálogo canónico mínimo.

v0.1 declara:

- `general_execution`
- `image_generation`
- `web_search`
- `project_work`
- `durable_mission`

El registry describe capacidad, autoridad, persistencia y outputs. No es un score y no concede permisos.

## General Execution

`general_execution` utiliza OpenAI Responses + Code Interpreter dentro de un container.

La herramienta es general. No existen funciones separadas `make_table`, `make_excel`, `make_powerpoint`, etc.

El worker puede producir:

- DOCX
- PDF
- XLSX
- PPTX
- CSV
- ZIP
- HTML
- TXT
- JSON

Las imágenes continúan por la lane de image generation existente en v0.1.

La instrucción de ejecución obliga a producir archivos estructurados reales: una tabla debe ser una tabla/celdas reales; un workbook debe ser un workbook; una presentación debe contener slides reales.

## Output intent

Isabella recibe una Completion / Execution Bias explícita.

La herramienta o extensión son detalles internos.

Gari no necesita pedir “un PDF”, “un Excel” o “usa Python”.

Si el resultado se va a imprimir, firmar, rellenar, presentar, editar, calcular, comparar, entregar o reutilizar como archivo, Isabella debe considerar un deliverable material.

Un email para copiar, una explicación o un juicio pueden seguir terminando en chat.

`create_artifact` permanece como fast lane para image generation y documentos textuales simples. Trabajo material estructurado usa `execute_artifact_task`.

## Trabajo que sobrevive al chat

El provider execution se inicia con `background=true`.

`minds_capability_runs` registra durablemente:

- quién pidió el trabajo;
- capability;
- conversación/Thread/proyecto de origen;
- status;
- response/container del provider;
- artifacts;
- summary/error;
- timestamps.

Si el resultado está listo rápidamente, vuelve en el mismo turno.

Si sigue `queued/in_progress`, la petición HTTP puede terminar o el usuario puede cerrar Isabella. El trabajo provider continúa y `isabella-capability-runner` lo reconcilia posteriormente.

Cuando termina, el runner añade un mensaje idempotente a la conversación o Thread original con los artifacts.

## Provenance y autoridad

Un deliverable solicitado por Gari puede persistirse directamente como `minds_artifacts/source_kind=capability` porque su función es ser el archivo que pidió, no afirmar verdad de proyecto.

Sus metadatos fijan:

- `provenance_class=generated_deliverable`
- `accepted_fact=false`
- `promotion_required_for_project_truth=true`

Por tanto:

```
generated file ≠ project knowledge
```

Artifact Intake sigue siendo la frontera obligatoria para outputs de la bounded external Mission lane que pretendan ser promovidos desde ejecución externa al mundo persistente de MINDS.

Build 79 no autoriza write-through a Conocimiento, memoria ni sistemas externos.

## Ambient Presence

`ambient.js` introduce la primera Presence Surface inspirada por el principio de Coucou, no por su personaje.

Estados humanos:

```
queued       → Preparando
in_progress  → Trabajando
completed    → Listo
failed       → Necesito revisar
```

Cuando no hay trabajo relevante, desaparece.

Cuando hay trabajo, aparece como una pequeña presencia flotante sobre MINDS. Puede abrirse para ver jobs, artifacts y cancelar una ejecución activa.

Esta UI es una proyección del ledger de runs; no contiene inteligencia propia.

## Frontera PWA / native overlay

La PWA puede superponer esta presencia dentro de MINDS.

No puede convertirse honestamente en una ventana always-on-top sobre aplicaciones ajenas del sistema operativo.

Por eso Build 79 define el estado/protocolo que una futura `Isabella Presence` nativa podrá consumir. Esa futura shell podrá vivir sobre otras aplicaciones como una superficie mínima y desaparecer cuando no sea necesaria, sin cambiar el runtime ni la fuente de verdad.

No se implementa una app nativa en v0.1.

## Acceptance test principal

Prompt de referencia:

> “¿Puedes prepararme la lista para los asistentes de la reunión de mañana de Bernried? La idea es que cada uno pueda escribir su nombre y firma y quizá también su organización.”

Build 79 falla si Isabella responde únicamente con una tabla Markdown.

Build 79 pasa si infiere el uso físico y produce un entregable utilizable, preferentemente PDF imprimible + DOCX editable, sin exigir que Gari nombre esos formatos.

## Invariantes

- Isabella sigue siendo la única interlocutora.
- Luna/otro modelo no define la identidad de Isabella.
- El runtime no gana autoridad por tener más herramientas.
- General execution no recibe herramientas de email, browser, MCP ni side effects externos.
- Los artifacts generados no son project truth.
- No existe autonomous plugin installation.
- No se adopta swarm ni multi-agent por este build.
- No se adopta consequential Computer Use.
- Attention Economy sigue decidiendo cuándo una finalización merece interrupción.
