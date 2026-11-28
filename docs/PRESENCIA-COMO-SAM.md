# Proactividad «como Sam» (28.11.2026)

Gari, sobre la proactividad de Romy: P1, el «Guten Morgen» a las 7:45; P2, tres disparadores: un plazo a 3 días laborables o menos, una decisión que lleva más de 2 días esperando, una reunión que acaba de terminar («¿Nachbereiten?»). Y preguntó: «¿sería quizá mejor que no sea tan sistemático y que sea más natural? ¿Recuerdas cuando hablamos de Sam de la película?». Respuesta, y su «hazlo»: ocasiones, no alarmas.

## Qué cambia

**En el motor, para Isabella y para Romy**
- **Motivos, no avisos.** La revisión de presencia recibe `motivos`, calculados en el código:
  - los plazos a 3 días laborables o menos (registro de la Projektakte y, en el Office, hitos del Terminplan);
  - las decisiones propuestas que llevan más de 2 días esperando (nuevo en el radar: `esperan`).

  Son razones para hablar en un buen momento, no mensajes propios. El modelo sigue decidiendo «ahora», «más tarde» o «nada».
- **No repite.** El modelo devuelve en `motivos_usados` los motivos que menciona. Quedan en su estado 3 días (`dichos`) y no vuelven a `motivos` mientras no cambien: el id lleva el título y la fecha, así que un plazo movido es un motivo nuevo.
- **Prepara en vez de ofrecer.** En lugar de «¿quieres que…?», trae lo concreto ya pensado. Al acabar una reunión de un proyecto, nombra los puntos abiertos de ese proyecto y pide solo lo que se decidió; ella lo anota. En el Office eso es «Besprechung nachbereiten». La reunión lleva el nombre de su proyecto.

**Solo Romy (perfil `office`, `PRESENCE_RHYTHM.office`)**
- **P1:** «Guten Morgen» en días laborables desde las 7:45 (hasta las 9:30). Se comprueba una vez al día, lleva su propia clave (`presence:manana:<día>`) y se manda también al iPhone. No sale si ya está escribiendo: entonces lo dice allí.
- **P3:** nada antes de las 7:30 ni después de las 19:00, ni el fin de semana; tampoco un seguimiento prometido. La víspera va de 15:00 a 17:00 y el cierre del día de 17:00 a 19:00.
- **Como mucho tres al día:** la mañana y dos más (`ownPerDay: 2`, la segunda con `presence:<día>:2`).
- **Sin «Demnächst: … · Beginnt um …» en el chat ni en el iPhone.** El latido sigue registrando el evento próximo, pero con `silent_requested`. El calendario del escritorio ya lo muestra.

**Isabella** mantiene su ritmo: de 9 a 21 h todos los días, un mensaje propio al día, su resumen matinal y los avisos de eventos próximos como hasta ahora.

## Archivos y pruebas

- `supabase/functions/_shared/isabella-presence.mjs`: ritmo por perfil, `morningGate`, `presenceMotives`, `rememberSaid`, instrucciones y esquema (`motivos_usados`).
- `supabase/functions/_shared/isabella-radar.mjs`: `esperan`.
- `supabase/functions/isabella-heartbeat/index.ts`: evento próximo en silencio para Romy.
- Prueba: `tests/presencia-como-sam.test.mjs`.

Desplegar en Window y en el Office: `isabella-heartbeat`, `isabella-presence`, `isabella-chat`, `isabella-routine-runner` e `isabella-live-session` (las tres últimas leen el radar). No hay migración.
