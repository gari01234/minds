# Seguimientos propios y repaso desde el heartbeat

Fecha: 08.11.2026. Gari, a propósito de un recordatorio que sí recibió: «así es como me gustaría que funcionara Isabella». Isabella dice qué hará, cuándo y por qué, y él puede cancelarlo.

## Seguimientos propios (punto 4f)

Cuando Isabella decide volver a algo más tarde por su cuenta (preguntar cómo fue algo, preparar algo, escribirle otro día), llama a `schedule_follow_up` con `about`, `day` (AAAA-MM-DD, hora local), `time` opcional (HH:MM) y `why`. Después lo dice en una frase y añade que él puede cancelarlo. Un seguimiento no tiene autoridad sobre tareas, calendario ni nada fuera del chat: es una nota suya.

- **Dónde vive:** `isabella_return_queue`, `kind conversation_thread`, `status ready`, con `metadata.kind 'seguimiento_propio'`, `due_at` (UTC calculado en el servidor desde la hora local), `due_local`, `expires_at` (dos días después de la fecha) y `source 'isabella_chat'`. Se escribe con el cliente del propio Gari (RLS `isabella_return_queue_own`). No necesita migración.
- **Límites:** un seguimiento abierto por tema, como máximo cuatro abiertos, nada en el pasado y nada a más de 60 días. Los hilos de la noche no cuentan para ese límite y los seguimientos tampoco ocupan las plazas de hilos del repaso.
- **En el chat:** los que aún no tocan aparecen en `memoria_de_isabella.seguimientos_programados` (para que no los repita ni los anuncie otra vez). Los que ya tocan entran primero en `hilos`, marcados `seguimiento_propio`. Si lo saca en la conversación, lo cierra con `cancel_follow_up` (`done:true`). Si Gari dice que no, lo cancela con `cancel_follow_up`.
- **Por su cuenta:** `isabella-presence` (desde el heartbeat, cada 15 min) ve un seguimiento que ya toca como el momento `seguimiento_programado`. Respeta el ajuste «Isabella puede escribirme primero», una conversación activa y su último mensaje. Su horario es algo más amplio (07:00–22:00) y no gasta el mensaje propio del día: tiene su clave `presence:seguimiento:<id>` y su propio presupuesto de llamadas (3 al día, 90 min entre ellas). Si lo dice o decide que ya no hace falta, el seguimiento queda `returned`. Si decide «más tarde», sigue abierto hasta que caduca.
- **Resumen matinal:** la rutina recibe «lo que le dijiste que harías hoy» y lo menciona en una frase si encaja, sin convertirlo en tarea.
- **Panel:** en «Hilos que quiere retomar» los suyos dicen «Volverá a esto: …» y tienen el botón «Cancelar».
- **Coste:** la regla va como nota de capacidad (549 caracteres) y solo cuando el turno ofrece la herramienta (chat global; ni Work ni rutinas). Las dos herramientas suman unos 1.190 caracteres de definición. Un turno sin seguimientos no hace ninguna llamada extra.

## Repaso nocturno desde el heartbeat

El cron de GitHub llegó con horas de retraso (02:47 → 08:59 el 08.11), después del resumen de las 07:45. Ahora `isabella-heartbeat` (pg_cron, cada 15 min) llama a `isabella-dream` entre las 02:00 y las 06:00, hora local. La llamada usa el secreto del heartbeat y es una invocación propia, así que tiene su propio tiempo. `dreamDue` decide por noche:

- una pasada por llamada; con una conversación larga (`more`) sigue en el siguiente latido;
- como mucho 6 pasadas y 3 intentos fallidos o cortados por noche, y nunca dos a la vez (10 min);
- `isabella_dream.nightly` guarda el día, los intentos, las pasadas y si la noche está hecha.

El workflow `isabella-dream.yml` queda solo para lanzarlo a mano (sin `schedule`). En ese caso corre siempre, sin la ventana de la noche.

## Despliegue y vuelta atrás

Desplegar `isabella-chat`, `isabella-routine-runner`, `isabella-dream`, `isabella-presence` e `isabella-heartbeat`, y publicar la PWA. No hay migraciones. Para volver atrás, restaurar las funciones anteriores y devolver el `schedule` al workflow; los seguimientos ya creados caducan solos.

Pruebas: `tests/isabella-followups-night.test.mjs`.
