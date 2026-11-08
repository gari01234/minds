# Encargo para ChatGPT · Romy con el motor de Isabella (un motor, dos despliegues)

*Preparado por Claude el 08.11.2026 para Gari. Claude revisará cada PR antes de fusionarlo y desplegarlo. Este archivo es la versión de referencia del encargo.*

## 0. Qué te pido
Romy (TBA Office) tiene que funcionar **igual que Isabella** (Window), con el **mismo motor**, desplegado en Office con su propia base de datos. Cada mejora futura de Isabella debe llegar también a Romy sin volver a copiar nada a mano.

- Haz un PR por fase (sección 5), en el repo que corresponda, con tests y documentación.
- No fusiones, no despliegues y no apliques migraciones. Claude revisa, fusiona, aplica las migraciones y despliega.
- La documentación y los textos que ven Gari y sus colegas van en español (Window) o en alemán (Office). Los nombres de código siguen en inglés.

## 1. Decisiones de Gari (08.11.2026)
1. **Mismo motor.** Romy usa el código de Isabella (`gari01234/minds`), configurado por perfil. El motor actual de Romy (`office-assistant`, 20 herramientas) se sustituye y queda solo como respaldo hasta que Gari decida retirarlo.
2. **Lo personal, activo para todos** los que usen Romy:
   - el repaso nocturno;
   - «cómo dijo que estaba» (efímero, con cita, nunca diagnósticos);
   - escribir primero;
   - los seguimientos propios;
   - el resumen matinal y las rutinas.

   Cada dato es **de la persona** (RLS de dueño): ni los colegas ni los administradores lo ven desde la app. El panel «Lo que Romy sabe de mí» permite verlo y borrarlo, y el ajuste «Romy puede escribirme primero» permite apagar la presencia.
3. **La Projektakte en Office, ya.** Romy tiene el mismo expediente de proyectos que Isabella: Themenblatt, decisiones, claims, modelo de proyecto, fragmentos de documentos con página, ingesta con Docling y Akte-Pflege nocturna. Los datos se quedan en la base de datos de Office.
4. **Lo implementa ChatGPT; Claude revisa** cada PR.
5. Siguen vigentes en Office las decisiones de Window:
   - D1 sí: crear directamente lo dictado, con Deshacer.
   - D2 todavía no: mover, completar o borrar sin confirmación. **No lo implementes.**
   - D3 sí: cómo dijo que estaba, efímero.
   - D4 sí: transcripciones de voz.
   - D5 pendiente: `gpt-6-luna` y el modo Fast. **No lo implementes.**

   La regla actual de `AGENTS.md` de Office («cada write de Romy requiere propuesta + confirmación») se actualiza para recoger D1.

## 2. Contexto mínimo
- **Window:** repo `gari01234/minds` (público). PWA en `apps/isabella`, Supabase `lodexwyyynlarkqgkyhy`, funciones en `supabase/functions` (unas 30), 137 migraciones.
  - Isabella: `isabella-chat` (≈4.650 líneas, 56 herramientas) y ~80 módulos en `_shared`.
  - El detalle de lo construido está en `docs/` de minds: `ISABELLA-FASE1-NUCLEO.md`, `ISABELLA-FASE2-BLOQUE1.md` … `BLOQUE5.md`, `ISABELLA-SEGUIMIENTOS-Y-NOCHE.md`, `ISABELLA-12-MOMENTOS.md`.
- **Office:** repo `TBArchitekten/tbarchitekten.github.io` (público). Web en `/` y PWA en `/app` (copia de Window del 04–07.11 con `OFFICE`), Supabase `ynzsbemisjvfgbqcqliq`.
  - Romy está en `supabase/functions/office-assistant` (≈2.000 líneas). Es multiusuario: miembros en `office_members` y equipos en `office_project_members`.
  - Reglas en `AGENTS.md`; estado en `docs/ESTADO.md` y `docs/BITACORA.md` (léelos al empezar y actualízalos en cada PR).
- **Lo que Office ya tiene con los nombres de Window:**
  - tablas `isabella_tasks`, `isabella_events`, `isabella_categories`, `isabella_preferences`, `isabella_deleted_items`, `minds_work_buckets`, `minds_work_files`, `minds_work_folders`, `minds_work_project_people`, `minds_work_task_allocations`, `minds_work_task_assignees`, `minds_work_threads`;
  - las vistas `isabella_projects` y `isabella_people` (sobre `office_projects` y `office_members`);
  - las extensiones `pgcrypto`, `vector`, `pg_net` y `pg_cron`.
- **Lo que falta en Office:** unas 74 tablas que usan las funciones de Window, entre ellas:
  - conversación: `conversations`, `conversation_messages`, `minds_agent_runs`, `minds_ai_usage`, `minds_chat_jobs`, `minds_chat_stream_delivery_receipts`, `minds_shadow_decisions`, `minds_calendar_action_receipts`;
  - memoria: `isabella_entities`, `isabella_model_claims`, `isabella_return_queue`, `isabella_memories`, `isabella_embeddings`, `isabella_activity_log`;
  - compromisos y misiones: `minds_commitments*`, `minds_mission_*`;
  - Projektakte: `minds_work_memory`, `minds_work_claims`, `minds_work_source_segments`, `minds_work_ingest_queue`, `minds_work_docling_page_chunks`, `minds_project_*`;
  - rutinas: `isabella_routines`, `minds_routine_*`;
  - presencia: `isabella_runtime_secrets`, `minds_push_*`;
  - más 52 RPC.
  - La lista exacta sale del propio código (`grep -rhoE "from\(['\"][a-z_]+['\"]\)" supabase/functions`) y del esquema de Window.

## 3. Arquitectura que te pido
**3.1 Una sola fuente de código.** El motor y la PWA viven en `gari01234/minds`. Office no los reescribe: los **sincroniza**.
- En el repo de Office, un workflow manual `sync-window-engine.yml` y un script `scripts/sync-window.mjs`.
- Copian de `gari01234/minds` (público), en un commit o tag que se indica:
  - las funciones del motor y `_shared` → `supabase/functions/`;
  - los archivos de la PWA que se comparten → `app/`.
- Abren un PR con la lista de archivos y el commit de origen.
- Office despliega desde su propio repo con su workflow de deploy. Así el código que corre en la oficina se puede revisar en el repo de la oficina.
- Las diferencias de Office **no** se hacen editando las copias, sino con el perfil (3.2). Lo propio de Office (`office-*.js`, Terminpläne, Mitglieder, Projekte) se queda en Office.

**3.2 Perfil.**
- En minds, `supabase/functions/_shared/assistant-profile.mjs` lee `ASSISTANT_PROFILE` (`window` por defecto, u `office`) y da:
  - `assistant_name`: Isabella / Romy;
  - `app_name`: Window / TBA Office;
  - `multi_user`: false / true;
  - la fuente del nombre de la persona: en Window, "Gari"; en Office, `office_members.display_name` del usuario del turno, solo el nombre de pila;
  - la zona horaria: Europe/Berlin;
  - las capacidades encendidas.
- En el navegador, el equivalente es `window.APP_PROFILE`, que fija `app/index.html` de Office.
- **Window no puede cambiar de comportamiento:** con perfil `window`, las instrucciones y el contexto salen idénticos byte a byte. Ponle un test que lo compare.

**3.3 Persona e idioma.**
- Hoy «Gari» aparece escrito ~160 veces en `_shared` y en `isabella-chat` (núcleo, política de relación, prompts del repaso, presencia, rutinas…). Sustitúyelo por la persona del perfil con una función única, p. ej. `personaText(text,{owner,assistant})`.
- Un solo texto de núcleo, en español, para las dos. El perfil Office añade una línea: «Habla en el idioma en que te escriben (en la oficina, normalmente alemán). Lo que escribes en la Projektakte va en alemán.»
- En Office, los textos de la PWA compartida van con un diccionario `i18n` (es/de), empezando por todo lo del chat:
  - avisos del sistema y tarjetas de propuesta;
  - Deshacer;
  - el panel de memoria;
  - los ajustes de presencia;
  - la voz.
- Los patrones de `system-notice.mjs` y `turn-integrity.js` tienen que reconocer también los avisos en alemán.

**3.4 Multiusuario.**
- Todo lo personal tiene RLS de dueño (`auth.uid() = user_id`): conversaciones, memoria, repaso, presencia, seguimientos, rutinas, compromisos y misiones.
- **Projektakte compartida por proyecto:** la leen los miembros del equipo (`office_project_members`, igual que `minds_work_files`). La escriben el motor y los miembros con las mismas reglas de Window (propuesta → confirmación para lo que sea decisión), con `user_id` del autor.
- Los Threads siguen siendo privados de su dueño, como ya decidió Gari.
- Los procesos nocturnos y de presencia (heartbeat, repaso, presencia, Akte-Pflege) recorren a **cada persona** con conversación en Office, con los mismos límites por persona que en Window.

**3.5 Fuera de Office** (límites entre proyectos de Gari):
- Sofía (teoría), Lecturas, Thoughts, Feed, Ideas, Conocimiento y Orb;
- los trabajos de código de Window (`minds_window_code_jobs`);
- el conector `window-mcp`: Office tiene `office-mcp`, que se alinea en la fase 6.

Con perfil `office` esas herramientas no se ofrecen y sus funciones no se despliegan.

**3.6 Lo que Romy tiene hoy y no se puede perder:**
- Terminpläne y Fristen (`office_terminplan_*`);
- miembros y equipos;
- tareas de colegas con iniciales;
- el calendario de proyectos;
- documentos generados;
- encargos (missions);
- los cinco puntos del 08.11 (`office-assistant/romy-continuity.mjs`): sin silencios, avisos del sistema, streaming robusto, historial, radar;
- `responsable` en las tareas.

Pásalos al motor como capacidades del perfil `office`:
- el radar de Work del núcleo incluye las Fristen de los Terminpläne;
- `search_calendar` incluye los hitos de los Terminpläne;
- las herramientas de Terminplan van detrás del mismo patrón de propuesta y confirmación.

## 4. Reglas que no se negocian
1. **Secretos:** nunca en código, tests, logs, PRs ni chat. Los secretos de Office los pone Claude o Gari; tú solo listas cuáles hacen falta.
2. **Tests sin producción:** nada llama a Supabase real ni a OpenAI. Se usan dobles y PostgreSQL efímero.
3. **Los dos repos son públicos:** ningún dato personal, de colegas ni de clientes en código, tests o docs. Usa fixtures inventados.
4. **Base de datos:**
   - migraciones nuevas en `supabase/migrations/` del repo de Office;
   - nada destructivo (DROP, DELETE masivo, TRUNCATE, quitar políticas);
   - las tablas viejas de Romy (`office_assistant_*`, `office_romy_*`) se conservan.
5. **Window intacto:** con perfil `window` no cambia ninguna salida. Los tests existentes de minds (≈1.200) siguen en verde, sin debilitarlos.
6. **Tokens:** Romy tendrá el mismo perfil de coste que Isabella. Los turnos ligeros con ruta Work no precargan el proyecto (`work_light`, PR #315 de minds). En cada PR, mide con `promptComponentSizes()` los tipos de turno afectados.
7. **No reescribas historia ni hagas force-push** en ninguno de los dos repos.

## 5. Fases (un PR por fase, en este orden)

### Fase 0 · Perfil y persona en minds (sin cambios en Window)
- `assistant-profile.mjs`, `personaText`, la línea de idioma del perfil Office y la lista de capacidades por perfil.
- Sustituye «Gari» por la persona del perfil en todo el motor.
- `i18n` en los archivos compartidos de la PWA (es por defecto, de para Office), empezando por el chat.
- **Aceptación:**
  - con perfil `window`, instrucciones, contexto y textos idénticos a antes (test de igualdad);
  - con perfil `office`, el núcleo dice «Romy» y el nombre de la persona del turno, nunca «Gari»;
  - las herramientas excluidas no aparecen.

### Fase 1 · Esquema de Office
- Reconstruye el esquema de Window en PostgreSQL efímero (como `verify.yml`) y extrae las tablas, funciones y RPC que usa el motor, con `pg_dump --schema-only` limitado a esa lista.
- Escribe migraciones de Office con:
  - las mismas columnas y nombres;
  - RLS multiusuario (3.4);
  - buckets de Storage para artefactos y archivos de Work, con RLS de proyecto;
  - la fila del heartbeat en `isabella_runtime_secrets` como **plantilla sin valor**;
  - el job de `pg_cron` del heartbeat cada 15 min.
- `conversations` y `conversation_messages` nuevas para Romy.
- **Aceptación:**
  - workflow `verify.yml` en Office que aplique todas las migraciones en PostgreSQL efímero;
  - tests SQL de aislamiento: la persona A no lee nada personal de B, y un miembro del proyecto P lee la Akte de P pero no la de Q;
  - `node --test` en verde.

### Fase 2 · Motor en Office
- `sync-window-engine.yml` y `scripts/sync-window.mjs` (3.1).
- Deploy de las funciones del motor en Office con `ASSISTANT_PROFILE=office`:
  - `isabella-chat`, `isabella-chat-runner`, `isabella-delivery-runner`;
  - `isabella-heartbeat`, `isabella-dream`, `isabella-presence`;
  - `isabella-routine-runner`, `isabella-mission-runner`;
  - `isabella-capability-runner`, `isabella-capability-runtime`;
  - `isabella-artifact`, `isabella-artifact-intake`;
  - `isabella-live-session`, `isabella-transcribe`;
  - `isabella-work-ingest-runner`;
  - `window-akte-pflege` (como función programada).
- Usa los mismos nombres de función que en Window, para no divergir. La persona es «Romy» por el perfil.
- Las capacidades de Office de 3.6 dentro del motor (perfil `office`).
- Lista en el PR los secretos que necesita Office:
  - `OPENAI_API_KEY` y los modelos `OPENAI_*`;
  - `DOCLING_SERVE_URL`/`DOCLING_SERVE_API_KEY`;
  - VAPID, si hay push;
  - `ASSISTANT_PROFILE`.
- **Aceptación:**
  - tests del perfil `office` con dobles: un turno que lee tareas de colegas con `responsable`, Fristen en el radar y creación directa con Deshacer;
  - `deno check` sin errores nuevos.

### Fase 3 · El chat de Office es el chat de Window
- La PWA de Office usa el cliente de chat de Window (sincronizado):
  - `ai.js`, `turn-integrity.js`, `chat-stream-recovery.js`, `final-round.js`, `voice-output.js`;
  - las partes del chat de `app.js`;
  - tarjetas, Deshacer, recibos en la conversación, el panel de memoria y los ajustes.
- Usa `conversations`/`conversation_messages` de Office y `sync.js` con el chat activo en perfil `office`.
- Romy (pestaña) y los Threads de Work hablan con `isabella-chat` de Office. `office-assistant` queda desplegado como respaldo, detrás de un ajuste.
- Textos en alemán (`i18n`).
- Actualiza los tests de Office que fijaban «Office solo carga su propio asistente» (decisión nueva de Gari).
- **Aceptación:**
  - tests de navegador (Chromium) del chat en perfil Office: enviar, streaming, una propuesta confirmada que deja recibo, Deshacer y un aviso de fallo como línea de sistema;
  - las versiones de caché subidas.

### Fase 4 · Lo personal en Office (decisión 2)
- Repaso nocturno, «cómo dijo que estaba», «ayer», preguntar cómo fue, seguimientos propios, presencia y resumen matinal o rutinas, por persona.
- El panel «Lo que Romy sabe de mí» y el ajuste para apagar la presencia.
- Sin push en el iPhone para Office (la app nativa solo empuja Persönlich): los mensajes propios aparecen en el chat.
- **Aceptación:** tests de presencia y repaso con dos personas (no se mezclan) y límites por persona.

### Fase 5 · Projektakte en Office (decisión 3)
- Themenblatt, decisiones, claims, modelo de proyecto, fragmentos con página, inventario y comparación de fuentes.
- Ingesta de los archivos del escritorio de Office (PDF, Word, Excel) con Docling y Akte-Pflege nocturna por proyecto.
- Lo que se escribe en la Akte va en alemán.
- **Aceptación:**
  - tests SQL de RLS por proyecto;
  - tests de las herramientas de Work con dobles;
  - la Akte de un proyecto no aparece a quien no es del equipo.

### Fase 6 · Voz y conector
- Voz (`isabella-live-session`) en Office.
- `office-mcp` alineado con las herramientas de `window-mcp` que tengan sentido en Office: Akte, temas, diagnóstico de turnos.
- **Aceptación:** tests de sesión de voz con dobles; el conector solo con el login de cada persona.

## 6. Cómo entregar cada PR
- **Título:** «Romy = Isabella · fase N: …».
- **Descripción:**
  - qué cambia y por qué (citando este encargo);
  - archivos principales;
  - migraciones y secretos que hacen falta;
  - funciones a desplegar;
  - tamaños de prompt antes y después;
  - cómo volver atrás.
- **Calidad:** tests en verde en los dos repos y `deno check` sin errores nuevos.
- **Documentación:** en minds, un doc por fase en `docs/`; en Office, entrada en `docs/BITACORA.md` y `docs/ESTADO.md` actualizado.
- **No fusiones.** Avisa a Gari cuando una fase esté lista para que Claude la revise.
