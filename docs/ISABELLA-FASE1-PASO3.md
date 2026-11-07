# Isabella · Fase 1, paso 3 — los textos fijos dejan de hablar como Isabella

Fecha: 08.11.2026 · Pedido de Gari: «Adelante con los cambios. Ten cuidado con el consumo de tokens».

## Problema
Alrededor de 1/4 de los mensajes firmados como «Isabella» eran textos fijos de la app (recibos,
preguntas de confirmación, errores). Se veían como si ella hablara así, y el modelo los recibía en
el historial como palabras suyas, así que imitaba ese tono.

## Qué cambia
- **App:** los avisos se escriben con `sayEvent()` (rol `assistant`, `metadata.author='system'`),
  así que las tarjetas, la sincronización y los recibos siguen funcionando igual. Se muestran como
  una línea gris centrada, sin burbuja ni reacciones. El botón «Revisar propuesta pendiente» se
  mantiene. Cuando una verificación sustituye la respuesta del modelo (propuesta, acción aplicada
  o fallo), ese mensaje también queda marcado como sistema.
- **Redacción neutra:** «Propuesta: añadir «X» para mañana · pendiente de tu confirmación.»,
  ««X» está en tus tareas para mañana.», «Guardado.», «Sin cambios.», etc.
- **Historial antiguo:** `system-notice.mjs` reconoce los textos fijos de siempre, así que los
  mensajes viejos también se ven como avisos y el modelo también los recibe como «sistema». Hay un
  espejo en el navegador (`turn-integrity.js`) y un test que mantiene las dos listas idénticas.
- **Modelo:** en `boundedScopedTurn` y en el historial rápido de agenda, esos mensajes llevan el rol
  `sistema` en lugar de `assistant`. Es la misma cantidad de mensajes con los mismos límites.
- **Dreaming:** la transcripción de la noche descarta los mensajes de autor sistema, tanto los
  marcados como los antiguos.

## Tokens
Neutro. Solo cambia la etiqueta del rol en el historial que ya se enviaba. No hay llamadas nuevas
ni más contexto.

## Pendiente (pasos siguientes)
- Paso 7: cuando hay una propuesta, hoy se descarta la respuesta del modelo y se muestra solo la
  línea de sistema. Hay que verificarla en vez de sustituirla.
- Algunos avisos poco frecuentes (rutinas, Feed, misiones) siguen redactados en primera persona,
  aunque ya se muestran como línea de sistema.
