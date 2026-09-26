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
