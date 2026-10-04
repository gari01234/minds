# Isabella Presence Protocol v0.1

Build 80 convierte la Presence de Build 79 en una superficie nativa de desktop sin crear otra Isabella.

## Principio

`always available, not always visible`

Presence no razona, no ejecuta, no decide autoridad y no es source of truth. Es una proyección efímera del estado canónico que ya existe en MINDS.

## Fuentes canónicas

La v0.1 observa dos fuentes existentes:

- `minds_capability_runs`: trabajo material que Isabella está preparando, ejecutando, completó o no pudo completar;
- `minds_attention_events`: señales que Attention Economy ya clasificó como `ambient` o como `interrupt` que requiere a Gari.

Presence no re-clasifica eventos. La ruta de Attention Economy mantiene precedencia sobre cualquier decisión de presentación.

## Proyección humana

Los estados de capability se expresan así:

- `queued` → Preparando;
- `in_progress` → Trabajando;
- `completed` → Listo;
- `failed` → Necesito revisar;
- `cancelled` → desaparece de la superficie activa.

Los eventos `ambient` se muestran como señales discretas. Los `interrupt` solo entran en la Presence v0.1 cuando `requires_user=true`; una notificación temporal ordinaria no se duplica aquí si ya pertenece al Delivery Layer.

## Prioridad de superficie

La presencia prioriza, en este orden conceptual: una decisión necesaria de Gari, un error que requiere revisión, trabajo activo, una señal ambient ya autorizada por Attention Economy y una finalización reciente de un trabajo que la shell observó mientras estaba activo.

Esta prioridad organiza presentación; no cambia el estado de MINDS.

## Visibilidad

Idle es invisible. Un nuevo trabajo activo puede hacer aparecer una Presence compacta sin robar focus. Una señal `ambient` puede hacerla aparecer porque Attention Economy ya autorizó esa superficie. Una pregunta bloqueante puede hacerse visible sin convertir la shell en un modal forzado.

Una finalización no reabre una Presence que Gari ocultó deliberadamente. Si la shell observó el trabajo mientras estaba activo, puede conservar brevemente la confirmación de que terminó antes de desaparecer.

El icono de tray permanece como punto de acceso manual aunque la ventana esté oculta.

## Interacción

La shell puede:

- expandir o contraer su propia presentación;
- abrir Isabella/MINDS en el navegador;
- mostrar el texto humano de una señal ya decidida por MINDS;
- cancelar explícitamente un `minds_capability_runs` activo usando el runtime existente;
- iniciar/cerrar la sesión propia de Gari con Supabase Auth.

La shell no implementa de nuevo el sistema de propuestas, memoria, Planner, permisos o Project Threads. Cuando hace falta conversar, aprobar o responder una pregunta, abre la Isabella principal, que conserva el contrato de autoridad existente.

## Auth y seguridad

Presence utiliza el mismo proyecto Supabase, una publishable key y la sesión autenticada de Gari. Nunca contiene `service_role`, secrets de runtime, credenciales OpenAI ni acceso directo al provider.

Toda lectura continúa sometida a RLS. Cancelar un capability run atraviesa `isabella-capability-runtime`, que vuelve a verificar la identidad y ownership server-side.

## Polling v0.1

Build 80 no añade Realtime artificialmente. En producción, `minds_capability_runs` y `minds_attention_events` no están publicados actualmente en `supabase_realtime`; la shell hace polling ligero mientras está ejecutándose.

Cambiar más adelante de polling a Realtime no debe cambiar este contrato ni la fuente de verdad.

## Failure isolation

Presence unavailable ≠ Isabella unavailable.

Presence closed ≠ capability cancelled.

Presence crashed ≠ mission stopped.

El runtime y la continuidad de MINDS nunca dependen de que la shell esté abierta.
