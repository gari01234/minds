# Build 78 — Project Threads & Shared Work Context v0.1

Fecha: 4 de octubre de 2026.

## Propósito

Build 78 conecta la forma real de trabajo de Gari —varios chats persistentes por tema dentro de un proyecto— con la arquitectura Work ya existente.

No crea un nuevo Project Space y no duplica Desktop, Planner ni Conocimiento.

La estructura canónica pasa a ser:

```
Project Work
├─ Desktop
├─ Planner
├─ Conocimiento
└─ Threads
```

Isabella permanece por encima de las cuatro superficies como coordinadora.

## Principio

Un Thread mantiene historia conversacional local.

El proyecto mantiene contexto compartido.

Un Thread no es una isla, pero tampoco fusiona indiscriminadamente su historial con los demás.

## Persistencia

Cada Thread vive en `minds_work_threads` y pertenece obligatoriamente a un `project_id`.

Cada Thread obtiene bajo demanda una conversación persistente del sistema existente `conversations / conversation_messages`, usando `app_scope = work_thread`.

Esto evita crear una segunda infraestructura de chat.

La conversación principal de Isabella conserva `app_scope = isabella` y por tanto no se mezcla con los Threads.

## Shared Work Context

Un Thread puede usar el mismo Work compartido del proyecto:

- Desktop: fuentes, archivos, emails y documentos;
- Planner: tareas y estado operativo;
- Conocimiento: claims, decisiones, preguntas, evidencia y provenance;
- Threads: historia de razonamiento y trabajo por tema.

Los mensajes de otro Thread son contexto conversacional con provenance y nunca se convierten automáticamente en verdad del proyecto.

Si una conclusión debe quedar disponible como conocimiento estable del proyecto, sigue pasando por la capa de Conocimiento y sus mecanismos de revisión.

## Isabella

`isabella-chat` acepta un `work_thread_id`.

Cuando existe:

- valida el Thread y su proyecto;
- abre la conversación persistente exacta del Thread;
- fuerza el routing de Work al proyecto correcto;
- precarga contexto compartido relevante;
- expone el Thread actual en `current_work_thread`;
- mantiene a Isabella como única interlocutora visible.

No se crea una personalidad o memoria independiente por Thread.

## Comunicación transversal

Build 78 añade retrieval sobre Threads.

`search_work_threads` puede localizar conversaciones relevantes dentro de un proyecto o transversalmente entre proyectos.

`search_work` incorpora además los Threads relevantes del proyecto junto con archivos, Planner, memoria de Work y claims.

Esto permite que Isabella responda preguntas como “¿dónde hablamos de esto?” o use una discusión de HLS & TWP cuando es relevante para Aufzug, sin cargar todos los chats simultáneamente.

La recuperación es selectiva y mantiene provenance explícito:

`work_thread_conversation / accepted_fact=false`.

## Specialists

Los Threads no son agentes.

Siguen utilizando los especialistas invisibles existentes de MINDS cuando aportan valor: research, work, planning, memory y document.

Un Thread puede guardar un `capability_profile` como preferencia de routing, pero no obtiene identidad, autoridad, memoria autobiográfica ni permisos propios.

## UI

Work incorpora una cuarta pestaña: Threads.

Desde ella Gari puede crear y abrir conversaciones persistentes por tema.

Bernried se inicia con la estructura ya utilizada en la práctica:

- HLS & TWP
- Controlling
- Aufzug
- Garderobe
- Fragen Normen

Los Threads están vacíos inicialmente: Build 78 no inventa ni importa conocimiento de ChatGPT.

## Fronteras

Desktop sigue siendo el lugar de las fuentes.

Conocimiento sigue siendo el lugar de lo que el proyecto sabe.

Planner sigue siendo el lugar de lo que el proyecto debe hacer.

Threads es el lugar donde se piensa y se trabaja conversacionalmente sobre temas específicos.

Isabella coordina las cuatro capas.

## No incluido en v0.1

No hay autonomous agent-to-agent messaging.

No hay swarm.

No hay memoria independiente por Thread.

No se importan automáticamente chats externos.

No se promueven mensajes de Thread a claims confirmados.

No se genera un resumen automático durable de cada Thread todavía; la búsqueda usa historial persistente y contexto compartido directamente.
