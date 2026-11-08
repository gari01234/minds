# Romy = Isabella · Fase 3 · Chat común en Office

Referencia contractual: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, fase 3, sin modificar la experiencia de Window.

## Arquitectura

El navegador Office carga los mismos módulos `ai.js`, `turn-integrity.js`, `chat-stream-recovery.js`, `final-round.js`, `voice-output.js` y `assistant-i18n.js` que Window, todos fijados por hash Git en el manifiesto `docs/sync-window-app-manifest.json` del PR Office. Las diferencias de identidad del navegador están bajo el perfil `window.APP_PROFILE === 'office'`; con perfil Window el contexto conversacional conserva literalmente su formulación anterior.

La función `isabella-chat` escribe las respuestas canónicas en `conversations` y `conversation_messages` del proyecto Supabase desde el que está desplegada, bajo el usuario autenticado. La identidad Office llega del servidor, nunca de un nombre propuesto por el navegador. El cliente Office lee únicamente conversaciones propias y registra como avisos de aplicación las líneas de sistema, sin forjar recibos de ejecución.

La ruta `office-assistant` permanece accesible solo mediante una elección explícita del usuario local. Ante errores del nuevo chat no se cambia automáticamente a otro historial ni se reejecutan mutaciones en la ruta antigua.

## Autorización, costes y pruebas

No se añade una migración ni se despliega ningún endpoint en el repo minds. Continúan vigentes D1 (alta explícita con recibo y Deshacer) y D2 (otras mutaciones con revisión). Las rutas Window mantienen el esquema y las credenciales anteriores, independientes de Office.

`promptComponentSizes()` no cambia por el ajuste de `reply_context` salvo que exista un mensaje citado; en Window es una transformación byte a byte nula. El perfil Office usa el nombre del miembro activo de la sesión y la denominación Romy, y no incluye los nombres fijos del perfil Window.

Las suites Node y Deno de las ramas apiladas verifican regresiones sin contactar con producción. El PR Office incorpora pruebas Chromium sin red para SSE fragmentado, recibos tipados, suplantación de ejecución, aislamiento A/B y contexto de respuesta. Esta evidencia no equivale a un E2E real autenticado contra Office desplegado.

## Pregunta abierta y opción conservadora

No se migran automáticamente conversaciones del motor Office heredado al esquema canónico. Se preservan como historial antiguo y solo se permite elegir su interfaz anterior manualmente, sin mezclar datos ni prometer equivalencia de dos motores. Se requiere revisión de Claude antes de activar el nuevo backend y comprobar la experiencia completa en Safari y escritorio.
