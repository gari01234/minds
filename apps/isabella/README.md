# Isabella · staging v0.3

Web: https://gari01234.github.io/minds/isabella/ — aplicación hermana de Theory.

## Ya conectado

- Home ORB + modo Focus.
- Fondo blanco y mensajes de Isabella sin cápsula de color.
- Swipe Isabella ↔ Calendario en página HTTPS real.
- Calendario Día / Semana / Mes.
- Tareas y eventos locales.
- Supabase como persistencia autenticada.
- Tablas propias para categorías, proyectos, tareas, recordatorios, eventos, memoria, preferencias, personas y follow-ups.
- Conversaciones comparten infraestructura con MINDS, aisladas mediante `app_scope = isabella`.
- Edge Function `isabella-chat` desplegada con autenticación JWT.
- Flujo de acciones: propuesta → confirmación → acción.

## IA

La Edge Function usa la Responses API de OpenAI y el modelo por defecto `gpt-5.6-luna`.

Para activarla hay que configurar en Supabase Edge Function Secrets:

`OPENAI_API_KEY`

Opcionalmente:

`OPENAI_MODEL`

No se guarda ninguna API key en GitHub ni en el navegador.

## Datos

Sin sesión, Isabella sigue funcionando localmente. Con una sesión de MINDS/Supabase, sincroniza la agenda, tareas, memoria y conversación entre dispositivos.

Las categorías iniciales son Casa, Trabajo, MINDS, Personal y Architectures. Trabajo incluye Bernried y Schwarz como proyectos iniciales.


## Automatizaciones / rutinas

Las rutinas recurrentes y los recordatorios únicos de Isabella ya se persisten en Supabase y se ejecutan server-side mediante Supabase Cron + pg_net + la Edge Function `isabella-routine-runner`. Isabella puede proponer una rutina o un mensaje futuro en el chat y la interfaz exige confirmación antes de crearlos. El resultado se escribe en la conversación aunque la web esté cerrada. Web Push sigue siendo una capa separada: no es necesario para que Isabella escriba en el chat, pero sí para mostrar un aviso del sistema operativo fuera de MINDS.


### Feed control desde el chat

Desde Build 28, la constelación e intereses del Feed dejan de ser solo ajustes manuales del navegador. Isabella puede proponer cambios explícitos en bloque —por ejemplo seguir una lista de arquitectos, artistas o estudios que acaba de investigar— y la interfaz pide confirmación antes de aplicarlos. Las preferencias del Feed se sincronizan en `isabella_preferences` con `preference_key='feed'`, de modo que el futuro cliente nativo comparte la misma curaduría.


### Build 29 — Feed, curiosidad y auto-mejora

El Feed usa una Edge Function especializada (`isabella-feed`) con un presupuesto de salida suficiente para producir una edición completa con contexto, en vez de reutilizar el presupuesto corto del chat. Cada edición se firma contra la configuración actual del Feed; un cambio en la constelación invalida automáticamente la caché anterior. Refresh muestra estado visible mientras genera una edición nueva.

Isabella puede hacer preguntas ocasionales y no sensibles para reducir huecos útiles de memoria. La cadencia y el opt-in se controlan desde «Proactividad de Isabella». Las respuestas siguen entrando por la conversación normal y solo se conservan si el sistema de memoria las considera útiles.

Ideas puede incluir una autoevaluación de Isabella. Si el usuario acepta una mejora de comportamiento o workflow, Isabella prepara una propuesta confirmable y la regla queda en preferencias compartidas. No se permite que el agente autoedite o despliegue código desde su propio chat.


### Build 30 — Feed progresivo y persistencia en servidor

El Feed ya no espera a terminar una generación completa para mostrar algo: primero recupera y pinta de inmediato cualquier edición válida de Isabella o Sofía y después completa la portada en segundo plano. La actualización de Sofía no bloquea el refresh de noticias.

La función `isabella-feed` persiste la edición directamente en Supabase y devuelve una respuesta mínima al navegador. Esto elimina el punto frágil anterior en el que Safari tenía que recibir una respuesta grande y volver a insertarla desde el cliente. La generación inicial se reduce a 4–6 tarjetas compactas; el contexto largo se investiga al abrir una noticia. La constelación extensa rota por muestras de entidades en lugar de intentar revisar decenas de nombres en cada refresh.


### Build 31 — refresh asíncrono, stale-while-revalidate y prewarm

El Feed deja de usar una petición HTTP larga. `isabella-feed` crea un trabajo en `minds_feed_jobs`, responde de inmediato y continúa la investigación mediante `EdgeRuntime.waitUntil`. El navegador sigue el estado del trabajo y reemplaza la portada cuando la nueva edición ya está materializada en Supabase.

La interfaz conserva y muestra la última edición disponible aunque haya vencido mientras se revalida en segundo plano. MINDS también inicia un prewarm del Feed después de sincronizar, como máximo una vez cada tres horas, para que la generación pueda ocurrir mientras el usuario está usando Chat, Calendario u otra sección.


### Build 32 — Hoy determinista, 10 noticias y profundidad dentro del Feed

`Hoy` deja de ser contenido editorial generado por IA. Se deriva directamente de los eventos y tareas de la fecha actual, de modo que un refresh de noticias no puede borrarlo ni cambiarlo. Las tarjetas externas de Isabella abren `Leer más` dentro del propio Feed; el chat personal de Isabella deja de ser el destino por defecto para noticias, arquitectura, arte y otros contenidos editoriales.

La sección Noticias admite hasta diez tarjetas por edición. `Para mí` queda reservada para señales personalizadas no operativas: proyectos, entidades seguidas, arquitectura, arte, cultura y otras conexiones derivadas del contexto e intereses del usuario.


### Build 33 — modelo personal, feedback explícito y ciclo de vida

Isabella separa memoria explícita de un modelo personal estructurado. El modelo contiene claims confirmados e hipótesis revisables con confianza y procedencia. En «Lo que Isabella sabe de mí» el usuario puede ver hipótesis, confirmarlas, rechazarlas o corregirlas. La decisión del usuario prevalece sobre cualquier inferencia.

Feed incorpora feedback explícito por tarjeta: «Me gusta», «No es relevante» y «Eliminar». Las señales se persisten en `minds_surface_feedback` y sirven a generaciones posteriores sin convertir el historial en un filtro absoluto. Las tarjetas personalizadas pueden desplegar «¿Por qué esto?» con una razón concreta.

Ideas incorpora ciclo de vida: discutir, dormir o descartar. Dormir una idea crea una entrada en `isabella_return_queue`, con retorno por fecha o por futura evidencia. El briefing matinal incluye agenda, tareas, clima y una selección breve de noticias relevantes.


### Build 34 — investigación autónoma y retornos

Isabella mantiene una cola pequeña de investigación autónoma. Como máximo cada doce horas, y solo si encuentra una pregunta externa con valor personal claro, puede abrir una investigación en segundo plano. El trabajo vive en `isabella_research_queue`; al terminar aparece como una cuarta capa del Feed: «Avances de Isabella». No se crea investigación por rellenar espacio.

Las Ideas dormidas con fecha se reactivan automáticamente al cumplirse su periodo y vuelven con estado `changed`. Las Ideas dormidas «hasta nueva evidencia» permanecen en la cola de retorno para una futura reactivación contextual.


### Build 35 — conversación narrativa y respuestas rápidas

Isabella puede ofrecer opciones de respuesta breves directamente debajo de un mensaje cuando una confirmación no merece un párrafo. Estas opciones se usan especialmente para confirmar hipótesis operativas y conexiones entre partes de MINDS.

Las propuestas de Feed admiten ahora `weather_location`. Cuando Isabella aprende explícitamente una localidad útil pero el clima no tiene ubicación configurada, debe señalar la conexión y pedir confirmación; solo después prepara el cambio.

El modelo conversacional trata el relato natural del usuario como entrada principal: hechos biográficos y rutinas durables pueden pasar a memoria explícita; detalles episódicos se dejan fuera por defecto; conclusiones operativas se mantienen como hipótesis hasta que su uso estable sea confirmado.


### Build 36 — saneamiento del contrato de memoria

La sincronización normaliza recuerdos locales heredados antes de enviarlos a Supabase. Los tipos legacy se traducen al contrato persistente (`fact`, `person`, `routine`, `episodic`, `preference`, `context`) y las memorias marcadas localmente como `deleted` dejan de reinsertarse. Así un recuerdo antiguo en localStorage no puede bloquear toda la sincronización con `isabella_memories_kind_check`.


### Build 37 — calendario compacto, tareas sin fecha y fotos

El calendario mensual abre en el día de hoy cada vez que se entra desde otra sección. El día seleccionado usa círculo negro; si se selecciona otro día, hoy permanece marcado en rosa. La cuadrícula mensual es más compacta y las iniciales de los días aparecen inmediatamente bajo el encabezado del mes.

Las tareas pueden existir sin `due_date`. Viven en «Tareas → Sin fecha», no ocupan el calendario y pueden recibir una fecha más adelante. Isabella también puede crearlas desde conversación sin forzar un día artificial.

El chat acepta hasta tres imágenes por mensaje. Las fotos se almacenan en el bucket privado `isabella-uploads`, bajo el directorio del usuario autenticado, y se envían al modelo como entrada visual. Los mensajes conservan únicamente la referencia privada al archivo; la interfaz genera URLs firmadas temporales para mostrarlas.


### Build 38 — listas, estado hecho, Feed profundo y espacios de trabajo

Tareas funciona ahora como un organizador por listas: «Sin fecha» es una lista inteligente transversal y las categorías existentes funcionan como listas con contador. Al abrir una lista aparecen sus pendientes y, separadamente, las tareas hechas.

Las tareas completadas con fecha permanecen visibles en el calendario y se muestran tachadas. Un control circular permite alternar entre pendiente y hecha sin perder el historial visual del día.

«Leer más» usa la función aislada `isabella-feed-story`, especializada en ampliar una tarjeta con contexto y fuentes. El hilo dentro de la tarjeta sigue separado del chat personal de Isabella.

Las Ideas aceptadas pueden convertirse en `minds_idea_workspaces`: espacios persistentes con hilo propio (`minds_idea_messages`) y un entregable Markdown vivo. El worker `minds-idea-worker` trabaja dentro de ese alcance y no contamina el chat general.

### Build 70 — permisos contextuales con revisión explícita

`Más → Permisos de Isabella` permite consultar evidencia por acción, contexto y alcance, revisar una propuesta elegible y revocar un permiso autorizado. No hay score global ni ampliación automática de permisos. La primera clase admitida es crear tareas sencillas sin proyecto en una categoría concreta por una petición directa comprobada. Los datos históricos y las ejecuciones automáticas no se convierten retroactivamente en nuevas aprobaciones. Véase `BUILD-70.md` para el contrato, pruebas y límites.


### Build 71 — presencia y entrega en el dispositivo

`Más → Avisos de Isabella` añade Web Push a la PWA sin convertir Isabella en una app nativa ni mover su cognición al teléfono. Attention Economy sigue decidiendo cuándo una señal merece `interrupt`; Delivery Layer únicamente transporta esa decisión hacia un dispositivo registrado y conserva intents, attempts y receipts separados. La interfaz solicita permiso únicamente por una acción explícita del usuario y, en iOS/iPadOS, exige abrir Isabella como web app instalada. Véase `BUILD-71.md` para contrato, seguridad, pruebas y estado de despliegue.


### Build 72 — Human Surface

Isabella now translates internal MINDS states into a small human-facing vocabulary before showing them in everyday UI. Continuity, durable work, contextual permissions, notification policy and system health tell the user what is happening, who needs to act, how certain the state is and whether anything is required. Technical ontology remains inspectable behind explicit detail disclosure instead of becoming the default interface.

Human Surface is read-only projection, not state. It cannot grant authority, change Attention Economy, modify Missions or replace Supabase as source of truth. Conversation and proactive runtimes receive the same language rule, and Isabella is explicitly forbidden from simulating emotions or personhood as part of this abstraction. See `BUILD-72.md`.


### Build 72.5A — Runtime Adapter

Mission Run now has a provider-neutral execution contract without changing production execution. `native_minds` remains the mandatory fallback and current primary runtime; `openai_agents` is only prepared as a future shadow provider.

A separate runtime ledger records provider/session/turn identity and lifecycle without modifying the authoritative Mission Run. Runtime ownership is derived from the Mission itself, direct authenticated writes are blocked, and snapshots reject credential-shaped data before crossing the execution boundary. See `BUILD-72.5.md`.


### Runtime selection evidence

`RUNTIME-SELECTION-v0.1.md` records the post-72.5B evaluation of `native_minds` versus `openai_agents`. Native remains the production default; Managed Agents remains shadow-only until a benchmark demonstrates a concrete capability advantage rather than generic task difficulty or multi-turn duration.


### Extraordinary Capability Lab

`EXTRAORDINARY-CAPABILITY-LAB-v0.1.md` defines the post-72.5 experimental sequence for capabilities that may be worth renting from OpenAI without moving Isabella's memory, authority or source of truth out of MINDS: persistent environments/artifacts, read-only MCP, justified multi-agent delegation and, only later, Computer Use with a separate approval model.


### Artifact Intake

`ARTIFACT-INTAKE-v0.1.md` defines the quarantine and review boundary for artifacts produced by external runtimes. A provider output remains a candidate until explicitly accepted and promoted; it is not memory, Workspace truth or a permanent MINDS artifact merely because an Agent produced it.


### Capability Integration Pilot

`BUILD-72.7.md` records the first real non-sensitive Mission that used an OpenAI-hosted persistent environment and returned a provider artifact through Artifact Intake. The provider never wrote to Mission Workspace; the resulting Markdown remains a human-reviewed candidate until explicitly kept or rejected.


### Read-only MINDS MCP

`BUILD-72.8.md` records the production-grade read boundary for external execution. OpenAI Agents can receive an execution-scoped, expiring capability token and call only explicitly granted MINDS read tools. Tokens are stored only as hashes, every read is audited, and grants are revoked when the execution ends.


### Runtime Decision Gate

`BUILD-72.9.md` and `RUNTIME-SELECTION-v0.2.md` close the external-execution research line. `native_minds` remains primary for every Mission. OpenAI Agents is allowed only as a bounded material execution lane when a Mission needs durable material state reused across checkpoints and all authority boundaries pass a deterministic fail-closed gate.


### Outcome Learning / Post-Action Feedback

`BUILD-73.md` closes the first post-action learning loop. A later manual edit to an autonomously-created task is only a feedback candidate; it becomes causal learning evidence only after explicit user review. Confirmed corrections can reduce the exact contextual permission from `allow` to `confirm`, never expand autonomy.
