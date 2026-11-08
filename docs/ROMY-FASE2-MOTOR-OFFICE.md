# Romy = Isabella · Fase 2 · Motor compartido en Office

Referencia: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, fases 2 y sección 4. Código de Window como fuente única; las especializaciones de Office se resuelven por perfil, sin modificar el resultado del perfil `window`.

## Implementación

Se incorpora `supabase/functions/_shared/office-terminplan.mjs`, lector exclusivamente de hitos de Terminpläne: primero resuelve `office_project_members` para el usuario autenticado, limita los planes y nombres a esa lista y transforma los milestones de manera acotada. `isabella-radar.mjs` añade `terminplan_fristen` solo en perfil `office` y distingue error de ausencia. `isabella-chat/index.ts` lo expone en `search_calendar` sin precargar proyectos completos. Con `window` no se ejecuta ninguna consulta de Office ni se modifica el payload. La atribución de responsables sigue obteniéndose del helper compartido `taskResponsibles`.

La versión exacta de código sincronizada por Office es `30451152a0a59bd9bd0243f35fb164f03147866d`. El manifiesto de Office contiene 95 archivos con hash de blob Git verificado; se excluyen Sofia, Thoughts, Lecturas, Feed, Ideas, generación de código de Window, Window MCP y push móvil. La sincronización posterior será a través de `scripts/sync-window.mjs` y del workflow manual `sync-window-engine.yml`, abriendo un PR desde un commit fijado, sin merge ni despliegue.

## Aceptación y aislamiento

`tests/romy-phase2-terminplan.test.mjs` cubre dos usuarios y dos proyectos inventados, inclusión de hitos asignados y exclusión de los ajenos, fechas y ausencia de fuentes, y el camino Window no modificado. El workflow `Verify Romy stacked phases (isolated)` fue verde en `30451152a0a59bd9bd0243f35fb164f03147866d`. El workflow `Verify Romy synced engine (offline tests + Deno)` en Office verifica 95 hashes, aislamiento del perfil, exclusión de herramientas y las 20 funciones sin errores de tipos. La aceptación es de código con dobles, no de sesión real.

`promptComponentSizes()` con fixture sintético en Office registra, antes (Window): instrucciones 44, contexto 2, input 2, herramientas 170 (2). Después (Office): instrucciones 168, contexto 2, input 2, herramientas 90 (1). No son medidas del tráfico real. El `work_light` existente evita precarga de modelos para turnos ligeros con Work y se conserva.

## Migraciones, permisos y funciones

En Office se añade `20261108213000_office_window_direct_create_default_v1.sql`: D1 deja como valor predeterminado `direct` para crear tareas/eventos expresamente pedidos, solo con verificación de cita del propietario, recibo y Deshacer gobernados por RPC; conserva la opción explícita `review`. D2 continúa exigiendo confirmación. Las migraciones se preparan pero **no se aplican**.

Funciones elegidas para el runtime: `isabella-agent-shadow`, `isabella-artifact`, `isabella-artifact-intake`, `isabella-capability-runner`, `isabella-capability-runtime`, `isabella-chat`, `isabella-chat-runner`, `isabella-delivery-runner`, `isabella-dream`, `isabella-heartbeat`, `isabella-live-session`, `isabella-mission-runner`, `isabella-operating-model`, `isabella-presence`, `isabella-routine-runner`, `isabella-runtime-mcp`, `isabella-self-review`, `isabella-transcribe`, `isabella-work-ingest-runner` y `window-akte-pflege`. Activación real queda pendiente del análisis por fase de endpoints y credenciales.

Secretos/configuración que tendrá que poner el administrador, nunca valores en código: `ASSISTANT_PROFILE=office`, `OPENAI_API_KEY`, variantes `OPENAI_*_MODEL`, `DOCLING_SERVE_URL`, `DOCLING_SERVE_API_KEY`, los secretos de autenticación de runners/heartbeat y `SUPABASE_ACCESS_TOKEN` del workflow de despliegue. No se solicita VAPID para push Office.

## Preguntas abiertas y criterio prudente

El motor anterior `office-assistant` debe mantenerse de respaldo hasta la aceptación E2E del chat. El adapter de hitos es lectura; toda modificación de Terminplan debe integrar las herramientas de propuesta/confirmación de Office, sin introducir escritura directa. Algunos entrypoints de Window (voz, Akte-Pflege, Presence/heartbeat) conservan todavía controles de origen/autorización específicos de Window; no se consideran listos para activar en Office hasta las fases 4–6. Se elige no desplegarlos anticipadamente.

Revertir esta fase significa descartar los commits no fusionados. Ninguna base o servicio de producción fue alterado.
