# Isabella «como Claude» · publicación 1 (12.11.2026)

Encargo de Gari (11.11.2026): que Isabella y Romy interpreten el contexto como lo hace Claude y dependan de
menos reglas de control, sin ser menos capaces. Esta primera publicación contiene los tres pasos que no
tocan cómo piensa (idioma, atajos, deshacer). El cambio de enrutado y de instrucciones va en la segunda.

## Qué cambia

1. **El motor escribe sus líneas fijas en el idioma del perfil.** Las frases que la app escribe en su propio
   nombre (qué queda pendiente, qué no se pudo registrar, por qué un turno no tuvo respuesta) salen de
   `_shared/assistant-voice.mjs`: español en Window, idéntico a antes; alemán en Office. Antes Office las
   traducía en pantalla con patrones y la conversación guardada decía otra cosa que la pantalla.
2. **La app ya no decide con listas de palabras a dónde va un mensaje.** Se quita el atajo que mandaba
   «agrega…», «crea…», «pon…» a un modelo aparte de una sola ronda, y los transportes de solo texto que
   adivinaban una pregunta de lectura por su redacción. Un solo camino: Isabella lee el mensaje con todas
   sus herramientas. `isabella-fast-stream` sigue desplegada para pestañas con el script antiguo.
3. **Deshacer en lugar de confirmar.** Crear una tarea o una cita propia con hora es reversible y de bajo
   riesgo: cuando Gari lo pide en el turno (con las palabras que sea, también «sí» a algo que ella ofreció),
   se crea al momento y se puede deshacer durante 10 minutos. El título, el día y la hora pueden venir de un
   adjunto, de la conversación o de su lectura; antes cada uno tenía que estar citado literalmente en el
   mensaje. Si la cita se solapa con otra, se crea igual y ella lo dice.

## Qué sigue pasando por tarjeta

Cambiar, mover, completar, archivar o borrar; eventos recurrentes o de día entero; lo que ella propone por
iniciativa propia; turnos en un Thread de Work o por voz; y cualquier turno en el que haya entrado texto de
fuera de lo suyo (web, Sofía, un especialista). Quien prefiera confirmar siempre lo elige en
Más → Permisos de Isabella.

## Piezas

- `_shared/isabella-tools.mjs`: las definiciones de herramientas, movidas sin cambios desde `isabella-chat`
  (comprobado byte a byte) para que el motor y el banco de pruebas lean lo mismo.
- `_shared/direct-calendar-contract.mjs`: `ownerAsked`, `directCreatable`, `authorizedDirectBatch`.
- Migración `20261111230000_isabella_direct_create_owner_request_v03.sql`: mismas funciones y firmas, nada
  borrado, ningún dato tocado; añade `minds_direct_event_overlap_v01` (solo lectura).
- App: `ai.js?v=60`, `app.js?v=147`, `turn-integrity.js?v=7`, caché `isabella-shell-v192`.

## Orden de publicación

1. Aplicar la migración (acepta la autoridad antigua y la nueva).
2. Desplegar `isabella-chat isabella-dream isabella-heartbeat isabella-live-session isabella-presence isabella-routine-runner`.
3. Office: sincronizar el motor, misma migración, desplegar con el perfil ya puesto.

## Pendiente

- Publicación 2: quitar el paso de enrutado y sustituir los bloques largos de instrucciones por notas cortas
  (rama `engine-like-claude`), con su banco de pruebas.
- Mejora anotada: que el servidor guarde la creación directa durante el turno, para que ella conozca el
  resultado antes de hablar (hoy la app la guarda al recibir la respuesta).
