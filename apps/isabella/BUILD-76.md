# Build 76 — Expectation Engine v0.1

Fecha: 3 de octubre de 2026.

## Propósito

Build 76 añade a MINDS una representación explícita de hechos futuros que el usuario espera que ocurran.

Una Expectation responde a una pregunta distinta de Tasks, Standing Intents y Commitments:

- **Task**: algo que Gari debe hacer.
- **Standing Intent**: recordar algo cuando vuelva a aparecer una situación.
- **Commitment**: mantener vivo un objetivo entre conversaciones.
- **Expectation**: algo del mundo que debería ocurrir dentro de una ventana temporal.

Ejemplos: recibir una respuesta, una entrega, una decisión o un documento.

La regla epistemológica central es:

> ausencia de confirmación no equivale a confirmación de ausencia.

Por eso una Expectation vencida no pasa automáticamente a `missed`.

## Estado

```
active
  ├─ fulfilled
  ├─ cancelled
  ├─ reschedule → active | due_unconfirmed
  └─ fecha alcanzada
        ↓
   due_unconfirmed
        ├─ fulfilled
        ├─ missed
        ├─ cancelled
        └─ reschedule
```

`due_unconfirmed` significa únicamente:

**la fecha esperada ya llegó y MINDS todavía no sabe qué ocurrió.**

`missed` exige una revisión explícita posterior.

## Datos

### minds_expectations

Conserva:

- título y hecho esperado;
- tipo: reply / delivery / decision / document / external_event / other;
- fecha y, opcionalmente, hora exacta;
- timezone;
- proyecto opcional;
- provenance;
- estado;
- timestamps de detección y resolución.

v0.1 fija `observability='manual'`.

No existe todavía una fuente externa autorizada capaz de declarar automáticamente que una Expectation se cumplió o falló.

### minds_expectation_reviews

Cada resolución o reprogramación conserva un receipt durable:

- decisión;
- estado anterior y posterior;
- fecha esperada anterior;
- nueva fecha cuando existe;
- occurred_at cuando se confirma cumplimiento;
- nota;
- request id idempotente.

Reprogramar no borra la fecha previa.

## Autoridad

El cliente autenticado puede leer sus Expectations y receipts mediante RLS.

No puede insertar, actualizar ni borrar filas directamente.

La mutación sigue el patrón consolidado en Build 74:

```
public SECURITY INVOKER wrapper
        ↓
minds_private SECURITY DEFINER function
        ↓
auth.uid + ownership + explicit confirmation + request id
```

RPCs públicos:

- `minds_create_expectation`
- `minds_review_expectation`

Ninguno es `SECURITY DEFINER`.

Security Advisor no reporta findings nuevos para Build 76.

## Heartbeat + Attention Economy

`minds_heartbeat_users()` incluye ahora usuarios con Expectations abiertas.

El heartbeat consulta únicamente Expectations cuyo `due_at <= now()`.

Cuando encuentra una `active` vencida:

```
active → due_unconfirmed
```

y publica:

```
event_type = expectation_due
route = ambient
```

El mensaje usa lenguaje deliberadamente no concluyente:

> Todavía no tengo confirmación de que haya ocurrido.

El heartbeat **no contiene ningún camino hacia `missed`**.

Si una Expectation se resuelve o se reprograma, el evento anterior deja de estar presente y se resuelve mediante el mecanismo existente del heartbeat.

## Isabella

El chat incorpora `propose_expectation` como acción de confirmación.

Isabella recibe las Expectations abiertas en `active_expectations`, con estado epistemológico explícito.

El system contract distingue:

```
Task            → acción de Gari
Standing Intent → condición contextual
Commitment      → objetivo durable
Expectation     → hecho futuro esperado
```

Mencionar una posibilidad no basta para persistirla. Isabella usa la capability cuando el usuario realmente quiere mantener seguimiento de ese hecho futuro.

## Superficie humana

No se añade navegación principal.

`Más → Memoria futura` contiene ahora dos secciones:

### Expectativas con fecha

Para `active`:

- Ya ocurrió
- Cambiar fecha
- Cancelar

Para `due_unconfirmed`:

- Sí, ocurrió
- No ocurrió
- Nueva fecha
- Cancelar

`No ocurrió` no existe antes del vencimiento.

Las Expectations resueltas permanecen en un historial compacto.

### Recordatorios por situación

Conserva los Standing Intents ya existentes sin cambiar su contrato.

## Validación

Antes de aplicar la migración, el contrato completo pasó en una transacción con rollback.

Después de aplicarla se volvió a probar sobre el esquema real, también con rollback.

Se verificó:

- sin INSERT/UPDATE directo desde authenticated;
- creación explícita;
- idempotencia;
- una Expectation futura no puede marcarse `missed`;
- reprogramar al pasado produce `due_unconfirmed`;
- receipts conservan fecha anterior y nueva;
- cumplimiento explícito;
- `expectation_due` se enruta a `ambient`;
- la cuenta real quedó con 0 Expectations y 0 reviews después de los tests.

## Decisión

Expectation Engine v0.1 entra en MINDS como infraestructura de continuidad temporal.

Su valor no es aumentar notificaciones.

Su valor es representar explícitamente la diferencia entre:

```
algo debía ocurrir
        ↓
la fecha llegó
        ↓
todavía no sé qué ocurrió
```

sin convertir incertidumbre en una conclusión falsa.
