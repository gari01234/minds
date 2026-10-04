# Isabella Presence Protocol v0.2

Build 80.2 corrige la primera implementación de Presence para que la experiencia corresponda al objetivo original: una presencia ambiental mínima, interactiva y periférica, inspirada en el patrón de Coucou pero propia de Isabella.

## Principio

`always available, not always visible`

Presence no es una segunda Isabella. No razona por su cuenta, no mantiene memoria paralela, no posee permisos adicionales y no decide qué merece interrumpir a Gari.

## Forma

La superficie primaria es una pill pequeña, no un panel permanente.

- idle sin apertura manual → invisible;
- apertura manual desde tray → pill;
- trabajo, pregunta o señal ambiental relevante → pill;
- click sobre la pill → panel compacto;
- colapsar → vuelve a pill;
- ocultar → desaparece a tray sin detener ningún trabajo.

La ventana se posiciona cerca del borde superior derecho del monitor activo y nunca ocupa por defecto una región de trabajo equivalente a una aplicación completa.

## Interacción inline

Presence puede conversar brevemente con Isabella directamente.

Esto NO crea otro chat backend. La shell invoca la Edge Function canónica `isabella-chat` con la misma sesión Supabase y, por tanto, atraviesa el mismo router, Relationship Contract, memoria, permisos, tools y Capability Runtime que la PWA.

Presence solamente representa el turno y su respuesta.

## Autoridad

Si Isabella produce una propuesta que requiere confirmación, Presence no la confirma ni la ejecuta inline. Muestra que existe una decisión pendiente y abre MINDS para la revisión canónica.

Los quick replies sí pueden enviarse inline porque son mensajes de conversación, no autorizaciones.

Cancelar un capability run continúa atravesando `isabella-capability-runtime`.

## Attention Economy

Presence sigue observando `minds_attention_events` únicamente después de que Attention Economy haya decidido la ruta.

La shell no re-clasifica urgencia y no crea una política paralela de interrupción.

## Estado de trabajo

`minds_capability_runs` continúa siendo la fuente canónica para queued / in_progress / completed / failed.

Presence puede mostrar varias ejecuciones, pero la pill resume solo el estado focal y un contador secundario.

## Posicionamiento

El posicionamiento de ventana es una affordance local de desktop. No modifica state de MINDS y no se persiste como conocimiento.

La shell puede leer el monitor activo y modificar únicamente su propia posición y tamaño.

## Failure isolation

Presence unavailable ≠ Isabella unavailable.

Presence hidden ≠ capability cancelled.

Presence crashed ≠ mission stopped.

El backend y el trabajo persistente nunca dependen de que la ventana esté visible.
