# Un solo motor: los Threads de Romy en este motor (28.11.2026)

Gari: «supongo que lo mejor es empezar ya a hacer solo un motor». En el Office, el chat de Romy ya corría en este motor. Los Threads de Work, en cambio, usaban todavía el motor anterior del Office (`office-assistant`), con su propia memoria, herramientas y modelos. Desde ahora también los Threads usan `isabella-chat`, como en Window.

## Qué cambia en el motor (solo perfil `office`)

El navegador del Office solo puede insertar los turnos propios de la persona, nunca una respuesta. Por eso, en un turno de Thread de Romy, el servidor:

1. escribe el turno de la persona en la conversación del Thread (`persistCanonicalThreadOwnerTurn`), solo si esa conversación es del que llama (`app_scope` `work_thread`) y el ámbito es el del Thread;
2. escribe al final la respuesta en la misma conversación (`persistServerAssistantTurn` acepta ahora la conversación principal o un Thread propio), igual que en el chat principal.

Las dos escrituras son idempotentes por el UUID de la petición.

En Window no cambia nada: ahí la app sigue escribiendo los turnos del Thread.

## Lo que necesita el Office

- Una migración: el Thread apunta a un `conversations` (`app_scope` `work_thread`) en vez de a `office_assistant_conversations`, y `minds_ensure_work_thread_conversation` crea esa conversación como en Window.
- `app/work.js`: el Thread envía con el mismo cliente que el chat y deja que el servidor guarde.

Prueba: `tests/office-threads-im-motor.test.mjs`. Desplegar `isabella-chat`.

## Modelo de las capacidades (28.11.2026)

Romy hacía sus archivos y evaluaciones con GPT-6.2 Sol en el motor viejo, por la decisión de Gari del 27.11 («no solo conmigo, haz el cambio para todos»). En este motor estaba fijo `gpt-6-astra`. Ahora decide el perfil:

- `office`: `gpt-6.2-sol`;
- `window`: `gpt-6-astra`, como antes.

El secret `OPENAI_CAPABILITY_MODEL` sustituye a los dos. Desplegar `isabella-capability-runner`, `isabella-capability-runtime` e `isabella-mission-runner`.
